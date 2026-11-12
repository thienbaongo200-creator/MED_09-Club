import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../common/database/database.module';

@Injectable()
export class EventsService {
  constructor(@Inject(PG_POOL) private readonly db: Pool) {}

  private validatePeriod(start: string, end: string) {
    const startTime = Date.parse(start);
    const endTime = Date.parse(end);
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
      throw new BadRequestException('Thời gian kết thúc phải sau thời gian bắt đầu.');
    }
  }

  async list(actorId: string) {
    const { rows } = await this.db.query(`SELECT e.id,e.ten,e.mo_ta,e.dia_diem,e.thoi_gian_bat_dau,e.thoi_gian_ket_thuc,
      count(DISTINCT em.id)::int AS registrations,
      count(DISTINCT em.id) FILTER (WHERE em.trang_thai='ATTENDED')::int AS attended,
      max(em.trang_thai) FILTER (WHERE em.thanh_vien_id=$1) AS my_status
      FROM dbo.su_kien e LEFT JOIN dbo.su_kien_thanh_vien em ON em.su_kien_id=e.id
      GROUP BY e.id ORDER BY e.thoi_gian_bat_dau DESC`, [actorId]);
    return { items: rows.map((r) => ({ id: r.id, tenSuKien: r.ten, moTa: r.mo_ta, diaDiem: r.dia_diem, thoiGianBatDau: r.thoi_gian_bat_dau, thoiGianKetThuc: r.thoi_gian_ket_thuc, soLuongDangKy: Number(r.registrations), soLuongDiemDanh: Number(r.attended), trangThaiCuaToi: r.my_status ?? null })) };
  }

  async create(input: { tenSuKien: string; moTa?: string; diaDiem?: string; thoiGianBatDau: string; thoiGianKetThuc: string }, actorId: string) {
    this.validatePeriod(input.thoiGianBatDau, input.thoiGianKetThuc);
    const { rows } = await this.db.query(`INSERT INTO dbo.su_kien(ten,mo_ta,dia_diem,thoi_gian_bat_dau,thoi_gian_ket_thuc,nguoi_phu_trach_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`, [input.tenSuKien, input.moTa ?? null, input.diaDiem ?? null, input.thoiGianBatDau, input.thoiGianKetThuc, actorId]);
    return (await this.list(actorId)).items.find((event: { id: string }) => event.id === rows[0].id);
  }

  async update(id: string, input: { tenSuKien: string; moTa?: string; diaDiem?: string; thoiGianBatDau: string; thoiGianKetThuc: string }, actorId: string) {
    this.validatePeriod(input.thoiGianBatDau, input.thoiGianKetThuc);
    const { rowCount } = await this.db.query(`UPDATE dbo.su_kien SET ten=$2,mo_ta=$3,dia_diem=$4,thoi_gian_bat_dau=$5,thoi_gian_ket_thuc=$6 WHERE id=$1`, [id, input.tenSuKien, input.moTa ?? null, input.diaDiem ?? null, input.thoiGianBatDau, input.thoiGianKetThuc]);
    if (!rowCount) throw new NotFoundException('Không tìm thấy sự kiện.');
    return (await this.list(actorId)).items.find((event: { id: string }) => event.id === id);
  }

  async register(eventId: string, actorId: string) {
    const event = await this.db.query('SELECT thoi_gian_ket_thuc <= NOW() AS has_ended FROM dbo.su_kien WHERE id=$1', [eventId]);
    if (!event.rowCount) throw new NotFoundException('Không tìm thấy sự kiện.');
    if (event.rows[0].has_ended) throw new BadRequestException('Không thể đăng ký sự kiện đã kết thúc.');
    try { await this.db.query(`INSERT INTO dbo.su_kien_thanh_vien(su_kien_id,thanh_vien_id,trang_thai) VALUES($1,$2,'REGISTERED')`, [eventId, actorId]); }
    catch (error: any) {
      if (error?.code === '23505') throw new ConflictException('Bạn đã đăng ký sự kiện này.');
      if (error?.code === '23503') throw new NotFoundException('Không tìm thấy sự kiện.');
      throw error;
    }
    return (await this.list(actorId)).items.find((event: { id: string }) => event.id === eventId);
  }

  async registrations(eventId: string) {
    const { rows } = await this.db.query(`SELECT em.id,m.id AS member_id,m.ho_ten,m.email,em.trang_thai,em.ngay_dang_ky,em.thoi_gian_diem_danh FROM dbo.su_kien_thanh_vien em JOIN dbo.thanh_vien m ON m.id=em.thanh_vien_id WHERE em.su_kien_id=$1 ORDER BY em.ngay_dang_ky`, [eventId]);
    return { items: rows.map((r) => ({ id: r.id, thanhVien: { id: r.member_id, hoTen: r.ho_ten, email: r.email }, trangThai: r.trang_thai, thoiGianDangKy: r.ngay_dang_ky, thoiGianDiemDanh: r.thoi_gian_diem_danh })) };
  }

  async attend(eventId: string, memberId: string, status: 'ATTENDED' | 'ABSENT', actorId: string) {
    const event = await this.db.query('SELECT thoi_gian_bat_dau > NOW() AS has_not_started FROM dbo.su_kien WHERE id=$1', [eventId]);
    if (!event.rowCount) throw new NotFoundException('Không tìm thấy sự kiện.');
    if (event.rows[0].has_not_started) throw new BadRequestException('Chưa đến thời gian bắt đầu sự kiện.');
    const { rows } = await this.db.query(`UPDATE dbo.su_kien_thanh_vien SET trang_thai=$3,thoi_gian_diem_danh=NOW(),nguoi_diem_danh_id=$4 WHERE su_kien_id=$1 AND thanh_vien_id=$2 RETURNING id`, [eventId, memberId, status, actorId]);
    if (!rows[0]) throw new ConflictException('Không tìm thấy đăng ký của thành viên cho sự kiện này.');
    return { eventId, thanhVienId: memberId, trangThai: status };
  }
}
