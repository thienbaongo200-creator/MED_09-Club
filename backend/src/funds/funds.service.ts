import { ForbiddenException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../common/database/database.module';
import { MaskingPolicy } from './masking.policy';
import { PublicStatementDto } from './dto/public-statement.dto';
import { ObjectStorageService } from '../storage/object-storage.service';
import { AuthUser } from '../common/auth/role';
import { randomUUID } from 'crypto';
import { SearchService } from './search.service';

@Injectable()
export class FundsService {
  constructor(@Inject(PG_POOL) private readonly db: Pool, private readonly storage: ObjectStorageService, private readonly search: SearchService = new SearchService()) {}

  async getStatement(query: { page?: number; pageSize?: number; tuNgay?: string; denNgay?: string; loai?: string; keyword?: string }, actor: AuthUser) {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 10)));
    const where: string[] = [];
    const values: unknown[] = [];
    const add = (sql: string, value: unknown) => { values.push(value); where.push(sql.replace('?', `$${values.length}`)); };
    if (query.tuNgay) add('g.ngay_giao_dich >= ?::date', query.tuNgay);
    if (query.denNgay) add('g.ngay_giao_dich < (?::date + INTERVAL \'1 day\')', query.denNgay);
    if (query.loai && ['THU', 'CHI'].includes(query.loai)) add('g.loai = ?', query.loai);
    if (query.keyword?.trim()) {
      const search = this.search.buildStatementPredicate(query.keyword.trim(), values.length + 1);
      where.push(search.sql);
      values.push(...search.values);
    }
    const filter = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [count, rows] = await Promise.all([
      this.db.query(`SELECT count(*)::int AS total FROM dbo.giao_dich_quy g JOIN dbo.thanh_vien m ON m.id=g.nguoi_thuc_hien_id ${filter}`, values),
      this.db.query(`SELECT g.id, g.ngay_giao_dich, g.loai, g.noi_dung, g.so_tien, g.de_xuat_id, m.ho_ten, m.email, m.so_dien_thoai, EXISTS(SELECT 1 FROM dbo.chung_tu c WHERE c.giao_dich_id=g.id) AS has_voucher, EXISTS(SELECT 1 FROM dbo.chung_tu c WHERE c.giao_dich_id=g.id AND c.nguoi_tai_len_id=$${values.length + 1}) AS own_voucher FROM dbo.giao_dich_quy g JOIN dbo.thanh_vien m ON m.id=g.nguoi_thuc_hien_id ${filter} ORDER BY g.ngay_giao_dich DESC LIMIT $${values.length + 2} OFFSET $${values.length + 3}`, [...values, actor.sub, pageSize, (page - 1) * pageSize]),
    ]);
    const items: PublicStatementDto[] = rows.rows.map((r) => ({
      id: r.id, ngayTao: r.ngay_giao_dich, loai: r.loai, noiDung: MaskingPolicy.maskFreeText(r.noi_dung), soTien: Number(r.so_tien),
      nguoiThucHien: r.ho_ten, email: MaskingPolicy.email(r.email), soDienThoai: MaskingPolicy.phone(r.so_dien_thoai),
      deXuatId: r.de_xuat_id, coChungTu: r.has_voucher && ['ADMIN', 'THU_QUY'].includes(actor.role),
    }));
    const totalItems = Number(count.rows[0].total);
    return { items, page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) };
  }

  async summary() {
    const { rows } = await this.db.query(`SELECT COALESCE(SUM(so_tien) FILTER (WHERE loai='THU'),0) AS thu, COALESCE(SUM(so_tien) FILTER (WHERE loai='CHI'),0) AS chi, MAX(ngay_giao_dich) AS cap_nhat FROM dbo.giao_dich_quy`);
    const thu = Number(rows[0].thu); const chi = Number(rows[0].chi);
    return { soDuHienTai: thu - chi, tongThu: thu, tongChi: chi, capNhatLuc: rows[0].cap_nhat };
  }

  async voucherUrl(transactionId: string, actor: AuthUser) {
    if (!['ADMIN', 'THU_QUY'].includes(actor.role)) throw new ForbiddenException('Chỉ quản trị viên hoặc thủ quỹ được truy cập chứng từ.');
    const { rows } = await this.db.query(`SELECT c.object_key FROM dbo.chung_tu c WHERE c.giao_dich_id=$1 ORDER BY c.ngay_tai_len DESC LIMIT 1`, [transactionId]);
    const voucher = rows[0];
    if (!voucher) throw new NotFoundException('Chứng từ không tồn tại.');
    return { url: await this.storage.signDownload(voucher.object_key, 300) };
  }

  async uploadVoucher(transactionId: string, actorId: string, file: { originalname: string; mimetype: string; size: number; buffer: Buffer }) {
    const exists = await this.db.query('SELECT 1 FROM dbo.giao_dich_quy WHERE id=$1', [transactionId]);
    if (!exists.rowCount) throw new NotFoundException('Không tìm thấy giao dịch.');
    const key = `vouchers/${transactionId}/${randomUUID()}`;
    await this.storage.upload(key, file.buffer, file.mimetype);
    try {
      const result = await this.db.query(`INSERT INTO dbo.chung_tu(giao_dich_id, nguoi_tai_len_id, ten_tep, loai_tep, kich_thuoc, object_key) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [transactionId, actorId, file.originalname, file.mimetype, file.size, key]);
      return { id: result.rows[0].id };
    } catch (error) {
      await this.storage.delete(key);
      throw error;
    }
  }

  async createManualTransaction(input: { loai: 'THU' | 'CHI'; soTien: number; noiDung: string }, actorId: string) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      // Shared with ProposalsService.approve so manual entries and approvals serialize.
      await client.query('SELECT pg_advisory_xact_lock($1, $2)', [0x4d454430, 1]);
      if (input.loai === 'CHI') {
        const { rows } = await client.query(`SELECT COALESCE(SUM(so_tien) FILTER (WHERE loai='THU'),0)-COALESCE(SUM(so_tien) FILTER (WHERE loai='CHI'),0) AS balance FROM dbo.giao_dich_quy`);
        if (Number(rows[0].balance) < input.soTien) throw new UnprocessableEntityException('Quỹ không đủ số dư.');
      }
      const result = await client.query(`INSERT INTO dbo.giao_dich_quy(loai, so_tien, noi_dung, nguoi_thuc_hien_id) VALUES ($1,$2,$3,$4) RETURNING id, ngay_giao_dich`, [input.loai, input.soTien, input.noiDung, actorId]);
      await client.query('COMMIT');
      return { id: result.rows[0].id, ngayTao: result.rows[0].ngay_giao_dich };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async updateManualTransaction(id: string, input: { loai: 'THU' | 'CHI'; soTien: number; noiDung: string }, actorId: string) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1, $2)', [0x4d454430, 1]);
      const { rows } = await client.query('SELECT id,loai,so_tien,de_xuat_id,giao_dich_goc_id FROM dbo.giao_dich_quy WHERE id=$1 FOR UPDATE', [id]);
      const current = rows[0];
      if (!current) throw new NotFoundException('Không tìm thấy giao dịch.');
      if (current.de_xuat_id) throw new ForbiddenException('Không được sửa giao dịch chi đã tạo từ đề xuất được duyệt.');
      if (current.giao_dich_goc_id) throw new ForbiddenException('Không được sửa trực tiếp giao dịch điều chỉnh.');
      const hasReversal = await client.query('SELECT 1 FROM dbo.giao_dich_quy WHERE giao_dich_goc_id=$1 LIMIT 1', [id]);
      if (hasReversal.rowCount) throw new ForbiddenException('Không được sửa giao dịch đã có giao dịch đảo.');

      const balanceResult = await client.query(`SELECT COALESCE(SUM(so_tien) FILTER (WHERE loai='THU'),0)-COALESCE(SUM(so_tien) FILTER (WHERE loai='CHI'),0) AS balance FROM dbo.giao_dich_quy`);
      const currentEffect = current.loai === 'THU' ? Number(current.so_tien) : -Number(current.so_tien);
      const newEffect = input.loai === 'THU' ? input.soTien : -input.soTien;
      if (Number(balanceResult.rows[0].balance) - currentEffect + newEffect < 0) throw new UnprocessableEntityException('Giao dịch sẽ làm quỹ âm.');
      const result = await client.query(`UPDATE dbo.giao_dich_quy SET loai=$2,so_tien=$3,noi_dung=$4,ngay_cap_nhat=NOW(),nguoi_cap_nhat_id=$5 WHERE id=$1 RETURNING id,loai,so_tien,ngay_giao_dich`, [id, input.loai, input.soTien, input.noiDung, actorId]);
      await client.query('COMMIT');
      const row = result.rows[0];
      return { id: row.id, loai: row.loai, soTien: Number(row.so_tien), ngayTao: row.ngay_giao_dich };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async reverseTransaction(id: string, noiDung: string, actorId: string) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1, $2)', [0x4d454430, 1]);
      const { rows } = await client.query('SELECT id,loai,so_tien FROM dbo.giao_dich_quy WHERE id=$1 FOR UPDATE', [id]);
      const original = rows[0];
      if (!original) throw new NotFoundException('Không tìm thấy giao dịch.');
      const reversed = await client.query('SELECT 1 FROM dbo.giao_dich_quy WHERE giao_dich_goc_id=$1 LIMIT 1', [id]);
      if (reversed.rowCount) throw new UnprocessableEntityException('Giao dịch này đã được đảo.');
      const reverseType = original.loai === 'THU' ? 'CHI' : 'THU';
      if (reverseType === 'CHI') {
        const balance = await client.query(`SELECT COALESCE(SUM(so_tien) FILTER (WHERE loai='THU'),0)-COALESCE(SUM(so_tien) FILTER (WHERE loai='CHI'),0) AS balance FROM dbo.giao_dich_quy`);
        if (Number(balance.rows[0].balance) < Number(original.so_tien)) throw new UnprocessableEntityException('Không đủ số dư để đảo giao dịch thu.');
      }
      const result = await client.query(`INSERT INTO dbo.giao_dich_quy(loai,so_tien,noi_dung,nguoi_thuc_hien_id,giao_dich_goc_id) VALUES($1,$2,$3,$4,$5) RETURNING id,loai,so_tien,ngay_giao_dich`, [reverseType, original.so_tien, noiDung, actorId, id]);
      await client.query('UPDATE dbo.giao_dich_quy SET ngay_cap_nhat=NOW(),nguoi_cap_nhat_id=$2 WHERE id=$1', [id, actorId]);
      await client.query('COMMIT');
      const row = result.rows[0];
      return { id: row.id, giaoDichGocId: id, loai: row.loai, soTien: Number(row.so_tien), ngayTao: row.ngay_giao_dich };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
}
