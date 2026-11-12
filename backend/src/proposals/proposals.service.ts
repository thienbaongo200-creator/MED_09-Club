import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../common/database/database.module';

// All writers that change fund balance (including manual transactions) must acquire this same key.
const FUND_LOCK_NAMESPACE = 0x4d454430; // "MED0"
const FUND_LOCK_ID = 1;

@Injectable()
export class ProposalsService {
  constructor(@Inject(PG_POOL) private readonly db: Pool) {}

  async list(actorId: string, status?: string) {
    const values: unknown[] = [];
    let condition = '';
    if (status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status)) { values.push(status); condition = 'WHERE d.trang_thai=$1'; }
    values.push(actorId);
    const { rows } = await this.db.query(`SELECT d.id,d.tieu_de,d.noi_dung,d.kinh_phi,d.trang_thai,d.ngay_tao,d.nguoi_tao_id,m.ho_ten AS nguoi_tao,
      count(v.id) FILTER (WHERE v.ket_qua='AGREE')::int AS agree_count,
      count(v.id) FILTER (WHERE v.ket_qua='DISAGREE')::int AS disagree_count,
      max(v.ket_qua) FILTER (WHERE v.thanh_vien_id=$${values.length}) AS current_vote
      FROM dbo.de_xuat_chi d JOIN dbo.thanh_vien m ON m.id=d.nguoi_tao_id
      LEFT JOIN dbo.bieu_quyet v ON v.de_xuat_id=d.id ${condition}
      GROUP BY d.id,m.ho_ten ORDER BY d.ngay_tao DESC`, values);
    return { items: rows.map((r) => {
      const agree = Number(r.agree_count); const disagree = Number(r.disagree_count); const total = agree + disagree;
      return { id: r.id, tieuDe: r.tieu_de, noiDung: r.noi_dung ?? '', kinhPhi: Number(r.kinh_phi), nguoiDeXuat: { id: r.nguoi_tao_id, hoTen: r.nguoi_tao }, trangThai: r.trang_thai, ngayTao: r.ngay_tao, voteStats: { agreeCount: agree, disagreeCount: disagree, totalValidVotes: total, agreePercent: total ? agree * 100 / total : 0, disagreePercent: total ? disagree * 100 / total : 0, currentUserVoted: Boolean(r.current_vote), currentUserVote: r.current_vote ?? null }, duDieuKienDuyet: agree > disagree };
    }) };
  }

  async create(input: { tieuDe: string; noiDung: string; kinhPhi: number }, actorId: string) {
    const { rows } = await this.db.query(`INSERT INTO dbo.de_xuat_chi(nguoi_tao_id,tieu_de,noi_dung,kinh_phi,trang_thai) VALUES($1,$2,$3,$4,'PENDING') RETURNING id`, [actorId, input.tieuDe, input.noiDung, input.kinhPhi]);
    const result = await this.list(actorId, 'PENDING');
    return result.items.find((item: { id: string }) => item.id === rows[0].id);
  }

  async vote(id: string, actorId: string, vote: 'AGREE' | 'DISAGREE') {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const proposal = await client.query('SELECT trang_thai FROM dbo.de_xuat_chi WHERE id=$1 FOR UPDATE', [id]);
      if (!proposal.rowCount) throw new NotFoundException('Không tìm thấy đề xuất.');
      if (proposal.rows[0].trang_thai !== 'PENDING') throw new ConflictException('Đề xuất đã kết thúc biểu quyết.');
      await client.query('INSERT INTO dbo.bieu_quyet(de_xuat_id,thanh_vien_id,ket_qua) VALUES($1,$2,$3)', [id, actorId, vote]);
      await client.query('COMMIT');
    } catch (error: any) {
      await client.query('ROLLBACK');
      if (error?.code === '23505') throw new ConflictException('Bạn đã bỏ phiếu cho đề xuất này.');
      throw error;
    } finally { client.release(); }
    const result = await this.list(actorId);
    const updated = result.items.find((item: { id: string }) => item.id === id);
    if (!updated) throw new NotFoundException('Không tìm thấy đề xuất.');
    return updated;
  }

  async reject(id: string, actorId: string) {
    const { rowCount } = await this.db.query(`UPDATE dbo.de_xuat_chi SET trang_thai='REJECTED',nguoi_xu_ly_id=$2,ngay_xu_ly=NOW() WHERE id=$1 AND trang_thai='PENDING'`, [id, actorId]);
    if (!rowCount) throw new ConflictException('Đề xuất không tồn tại hoặc đã được xử lý.');
    return { id, trangThai: 'REJECTED' };
  }

  async approve(id: string, actorId: string, ghiChu?: string) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const proposalResult = await client.query(`SELECT id, nguoi_tao_id, kinh_phi, trang_thai FROM dbo.de_xuat_chi WHERE id=$1 FOR UPDATE`, [id]);
      const proposal = proposalResult.rows[0];
      if (!proposal) throw new NotFoundException('Không tìm thấy đề xuất.');
      if (proposal.trang_thai !== 'PENDING') throw new ConflictException('Đề xuất đã được xử lý.');
      if (proposal.nguoi_tao_id === actorId) throw new ForbiddenException('Người tạo không được tự duyệt đề xuất.');

      // Transaction-scoped advisory lock serializes this approval with every manual fund writer.
      await client.query('SELECT pg_advisory_xact_lock($1, $2)', [FUND_LOCK_NAMESPACE, FUND_LOCK_ID]);
      const votes = await client.query(`SELECT count(*) FILTER (WHERE ket_qua='AGREE')::int AS agree, count(*) FILTER (WHERE ket_qua='DISAGREE')::int AS disagree FROM dbo.bieu_quyet WHERE de_xuat_id=$1`, [id]);
      if (Number(votes.rows[0].agree) <= Number(votes.rows[0].disagree)) throw new UnprocessableEntityException('Đề xuất chưa đạt điều kiện biểu quyết.');
      const balance = await client.query(`SELECT COALESCE(SUM(so_tien) FILTER (WHERE loai='THU'),0)-COALESCE(SUM(so_tien) FILTER (WHERE loai='CHI'),0) AS balance FROM dbo.giao_dich_quy`);
      const amount = Number(proposal.kinh_phi);
      if (Number(balance.rows[0].balance) < amount) throw new UnprocessableEntityException('Quỹ không đủ số dư.');

      await client.query(`UPDATE dbo.de_xuat_chi SET trang_thai='APPROVED', nguoi_xu_ly_id=$2, ngay_xu_ly=NOW(), ghi_chu_xu_ly=$3 WHERE id=$1`, [id, actorId, ghiChu ?? null]);
      const transaction = await client.query(`INSERT INTO dbo.giao_dich_quy(loai, so_tien, noi_dung, nguoi_thuc_hien_id, de_xuat_id) VALUES ('CHI',$1,'Duyệt đề xuất chi', $2, $3) RETURNING id, loai, so_tien, ngay_giao_dich`, [amount, actorId, id]);
      await client.query('COMMIT');
      const row = transaction.rows[0];
      return {
        deXuatId: id,
        trangThai: 'APPROVED' as const,
        giaoDich: { id: row.id, loai: row.loai as 'CHI', soTien: Number(row.so_tien), ngayTao: row.ngay_giao_dich, deXuatId: id },
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
}
