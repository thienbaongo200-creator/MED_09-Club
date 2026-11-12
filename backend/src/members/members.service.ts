import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { hash } from 'bcryptjs';
import { Pool } from 'pg';
import { AuthUser, Role } from '../common/auth/role';
import { PG_POOL } from '../common/database/database.module';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';

@Injectable()
export class MembersService {
  constructor(@Inject(PG_POOL) private readonly db: Pool) {}
  private readonly projection = 'id, ho_ten AS "hoTen", email, so_dien_thoai AS "soDienThoai", vai_tro AS "vaiTro", trang_thai AS "trangThai", ngay_tham_gia AS "ngayThamGia"';

  async list() {
    const { rows } = await this.db.query(`SELECT ${this.projection} FROM dbo.thanh_vien ORDER BY ho_ten`);
    return { items: rows };
  }
  async get(id: string) {
    const { rows } = await this.db.query(`SELECT ${this.projection} FROM dbo.thanh_vien WHERE id=$1`, [id]);
    if (!rows[0]) throw new NotFoundException('Không tìm thấy thành viên.');
    return rows[0];
  }
  async create(input: CreateMemberDto) {
    const passwordHash = await hash(input.matKhau, 10);
    try {
      const { rows } = await this.db.query(`INSERT INTO dbo.thanh_vien(ho_ten,email,so_dien_thoai,mat_khau_hash,vai_tro,trang_thai) VALUES($1,$2,$3,$4,'THANH_VIEN','ACTIVE') RETURNING ${this.projection}`, [input.hoTen, input.email, input.soDienThoai ?? null, passwordHash]);
      return rows[0];
    } catch (error: any) {
      if (error?.code === '23505') throw new ConflictException('Email đã được sử dụng.');
      throw error;
    }
  }
  async update(id: string, input: UpdateMemberDto, actor: AuthUser) {
    const target = await this.get(id);
    if (actor.role === 'THU_QUY' && target.vaiTro === 'ADMIN') throw new ForbiddenException('THU_QUY không được sửa tài khoản ADMIN.');
    const fields: string[] = []; const values: unknown[] = [];
    const set = (column: string, value: unknown) => { values.push(value); fields.push(`${column}=$${values.length}`); };
    if (input.hoTen !== undefined) set('ho_ten', input.hoTen);
    if (input.email !== undefined) set('email', input.email);
    if (input.soDienThoai !== undefined) set('so_dien_thoai', input.soDienThoai);
    if (!fields.length) return target;
    values.push(id, actor.role === 'ADMIN', actor.sub);
    try {
      const { rows } = await this.db.query(`UPDATE dbo.thanh_vien SET ${fields.join(',')},ngay_cap_nhat=NOW(),nguoi_cap_nhat_id=$${values.length} WHERE id=$${values.length - 2} AND ($${values.length - 1}::boolean OR vai_tro <> 'ADMIN') RETURNING ${this.projection}`, values);
      if (!rows[0]) throw new ForbiddenException('THU_QUY không được sửa tài khoản ADMIN.');
      return rows[0];
    } catch (error: any) {
      if (error?.code === '23505') throw new ConflictException('Email đã được sử dụng.');
      throw error;
    }
  }
  async setStatus(id: string, status: 'ACTIVE' | 'INACTIVE', actor: AuthUser) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1,$2)', [0x4d454430, 2]);
      const { rows } = await client.query('SELECT id,vai_tro,trang_thai FROM dbo.thanh_vien WHERE id=$1 FOR UPDATE', [id]);
      const target = rows[0];
      if (!target) throw new NotFoundException('Không tìm thấy thành viên.');
      if (actor.role === 'THU_QUY' && target.vai_tro === 'ADMIN') throw new ForbiddenException('THU_QUY không được khóa tài khoản ADMIN.');
      if (target.vai_tro === 'ADMIN' && target.trang_thai === 'ACTIVE' && status === 'INACTIVE') {
        const admins = await client.query(`SELECT count(*)::int AS count FROM dbo.thanh_vien WHERE vai_tro='ADMIN' AND trang_thai='ACTIVE'`);
        if (Number(admins.rows[0].count) <= 1) throw new ConflictException('Hệ thống phải luôn có ít nhất một ADMIN đang hoạt động.');
      }
      await client.query('UPDATE dbo.thanh_vien SET trang_thai=$2,ngay_cap_nhat=NOW(),nguoi_cap_nhat_id=$3 WHERE id=$1', [id, status, actor.sub]);
      await client.query('COMMIT');
      return this.get(id);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async setRole(id: string, role: Role, actor: AuthUser) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1,$2)', [0x4d454430, 2]);
      const { rows } = await client.query('SELECT id,vai_tro,trang_thai FROM dbo.thanh_vien WHERE id=$1 FOR UPDATE', [id]);
      const target = rows[0];
      if (!target) throw new NotFoundException('Không tìm thấy thành viên.');
      if (target.vai_tro === 'ADMIN' && target.trang_thai === 'ACTIVE' && role !== 'ADMIN') {
        const admins = await client.query(`SELECT count(*)::int AS count FROM dbo.thanh_vien WHERE vai_tro='ADMIN' AND trang_thai='ACTIVE'`);
        if (Number(admins.rows[0].count) <= 1) throw new ConflictException('Hệ thống phải luôn có ít nhất một ADMIN đang hoạt động.');
      }
      await client.query('UPDATE dbo.thanh_vien SET vai_tro=$2,ngay_cap_nhat=NOW(),nguoi_cap_nhat_id=$3 WHERE id=$1', [id, role, actor.sub]);
      await client.query('COMMIT');
      return this.get(id);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
}
