import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../common/database/database.module';

@Injectable()
export class ReportsService {
  constructor(@Inject(PG_POOL) private readonly db: Pool) {}

  async fund(tuNgay: string, denNgay: string) {
    if (!Number.isFinite(Date.parse(tuNgay)) || !Number.isFinite(Date.parse(denNgay)) || new Date(denNgay) < new Date(tuNgay)) throw new BadRequestException('Khoảng ngày không hợp lệ.');
    const { rows } = await this.db.query(`SELECT
      COALESCE(SUM(so_tien) FILTER (WHERE ngay_giao_dich < $1::date AND loai='THU'),0)-COALESCE(SUM(so_tien) FILTER (WHERE ngay_giao_dich < $1::date AND loai='CHI'),0) AS opening,
      COALESCE(SUM(so_tien) FILTER (WHERE ngay_giao_dich >= $1::date AND ngay_giao_dich < ($2::date + INTERVAL '1 day') AND loai='THU'),0) AS income,
      COALESCE(SUM(so_tien) FILTER (WHERE ngay_giao_dich >= $1::date AND ngay_giao_dich < ($2::date + INTERVAL '1 day') AND loai='CHI'),0) AS expense
      FROM dbo.giao_dich_quy`, [tuNgay, denNgay]);
    const opening = Number(rows[0].opening); const income = Number(rows[0].income); const expense = Number(rows[0].expense);
    return { tuNgay, denNgay, soDuDauKy: opening, tongThu: income, tongChi: expense, soDuCuoiKy: opening + income - expense };
  }

  async attendance(eventId: string) {
    const { rows } = await this.db.query(`SELECT e.id AS event_id,e.ten,
      count(em.id)::int AS registrations,
      count(em.id) FILTER (WHERE em.trang_thai='ATTENDED')::int AS attended,
      count(em.id) FILTER (WHERE em.trang_thai='ABSENT')::int AS absent
      FROM dbo.su_kien e LEFT JOIN dbo.su_kien_thanh_vien em ON em.su_kien_id=e.id
      WHERE e.id=$1 GROUP BY e.id,e.ten`, [eventId]);
    if (!rows[0]) throw new NotFoundException('Không tìm thấy sự kiện.');
    return { suKienId: rows[0].event_id, tenSuKien: rows[0].ten, soLuongDangKy: Number(rows[0].registrations), soLuongThamDu: Number(rows[0].attended), soLuongVang: Number(rows[0].absent) };
  }
}
