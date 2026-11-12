"use client";

import { useEffect, useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { api, ApiError } from "@/lib/api";
import type { SuKienDto } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";

interface FundReport { tuNgay: string; denNgay: string; soDuDauKy: number; tongThu: number; tongChi: number; soDuCuoiKy: number }
interface AttendanceReport { suKienId: string; tenSuKien: string; soLuongDangKy: number; soLuongThamDu: number; soLuongVang: number }

function ReportsContent() {
  const { hasRole } = useAuth();
  const canViewAttendance = hasRole("ADMIN", "THU_QUY");
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [fund, setFund] = useState<FundReport | null>(null);
  const [events, setEvents] = useState<SuKienDto[]>([]);
  const [eventId, setEventId] = useState("");
  const [attendance, setAttendance] = useState<AttendanceReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => { api.get<{ items: SuKienDto[] }>("/events").then((r) => { setEvents(r.items); setEventId(r.items[0]?.id ?? ""); }).catch(() => {}); }, []);

  async function load() {
    setError(""); setLoading(true);
    try {
      const report = await api.get<FundReport>("/reports/fund", { tuNgay: from, denNgay: to });
      setFund(report);
      if (canViewAttendance && eventId) setAttendance(await api.get<AttendanceReport>(`/reports/events/${eventId}/attendance`));
      else setAttendance(null);
    } catch (err) { setError(err instanceof ApiError ? err.message : "Không tải được báo cáo."); }
    finally { setLoading(false); }
  }

  const money = (value: number) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(value);
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="font-display text-3xl">Báo cáo</h1>
        <p className="text-sm text-ink/60">Tra cứu tổng hợp quỹ và tình hình tham dự sự kiện.</p>
      </header>
      <section aria-labelledby="report-filters-title" className="border-y border-ink/10 py-4">
        <h2 id="report-filters-title" className="font-display text-xl">Điều kiện báo cáo</h2>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className="grid gap-1 text-sm text-ink/70">
            <span>Từ ngày</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-ink/15 px-2 py-2 text-ink" />
          </label>
          <label className="grid gap-1 text-sm text-ink/70">
            <span>Đến ngày</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-ink/15 px-2 py-2 text-ink" />
          </label>
          {canViewAttendance && (
            <label className="grid gap-1 text-sm text-ink/70">
              <span>Sự kiện</span>
              <select value={eventId} onChange={(e) => setEventId(e.target.value)} className="max-w-full rounded-md border border-ink/15 px-2 py-2 text-ink">
                <option value="">Chọn sự kiện</option>
                {events.map((event) => <option key={event.id} value={event.id}>{event.tenSuKien}</option>)}
              </select>
            </label>
          )}
          <button
            disabled={loading || !from || !to}
            onClick={() => void load()}
            className="rounded-md bg-moss-600 px-4 py-2 text-white hover:bg-moss-700 disabled:opacity-50"
          >
            {loading ? "Đang tải…" : "Xem báo cáo"}
          </button>
        </div>
      </section>
      {error && <p role="alert" className="text-sm text-rust-600">{error}</p>}
      {fund && (
        <section aria-labelledby="fund-report-title" className="border-b border-ink/10 pb-5">
          <h2 id="fund-report-title" className="font-display text-xl">Báo cáo quỹ</h2>
          <p className="mt-1 text-sm text-ink/60">Từ {fund.tuNgay} đến {fund.denNgay}</p>
          <dl className="mt-4 grid gap-x-8 sm:grid-cols-2 xl:grid-cols-4">
            <div className="border-t border-ink/10 py-3">
              <dt className="text-sm text-ink/60">Số dư đầu kỳ</dt>
              <dd className="mt-1 text-lg font-medium">{money(fund.soDuDauKy)}</dd>
            </div>
            <div className="border-t border-ink/10 py-3">
              <dt className="text-sm text-ink/60">Tổng thu</dt>
              <dd className="mt-1 text-lg font-medium">{money(fund.tongThu)}</dd>
            </div>
            <div className="border-t border-ink/10 py-3">
              <dt className="text-sm text-ink/60">Tổng chi</dt>
              <dd className="mt-1 text-lg font-medium">{money(fund.tongChi)}</dd>
            </div>
            <div className="border-t border-ink/10 py-3">
              <dt className="text-sm font-medium text-ink/70">Số dư cuối kỳ</dt>
              <dd className="mt-1 font-display text-xl">{money(fund.soDuCuoiKy)}</dd>
            </div>
          </dl>
        </section>
      )}
      {attendance && (
        <section aria-labelledby="attendance-report-title" className="space-y-3">
          <h2 id="attendance-report-title" className="font-display text-xl">Chuyên cần: {attendance.tenSuKien}</h2>
          <dl className="grid gap-x-8 sm:grid-cols-3">
            <div className="border-t border-ink/10 py-3">
              <dt className="text-sm text-ink/60">Đăng ký</dt>
              <dd className="mt-1 text-lg font-medium">{attendance.soLuongDangKy}</dd>
            </div>
            <div className="border-t border-ink/10 py-3">
              <dt className="text-sm text-ink/60">Có mặt</dt>
              <dd className="mt-1 text-lg font-medium">{attendance.soLuongThamDu}</dd>
            </div>
            <div className="border-t border-ink/10 py-3">
              <dt className="text-sm text-ink/60">Vắng</dt>
              <dd className="mt-1 text-lg font-medium">{attendance.soLuongVang}</dd>
            </div>
          </dl>
        </section>
      )}
    </div>
  );
}

export default function ReportsPage() { return <RoleGuard allow={["ADMIN", "THU_QUY", "THANH_VIEN"]}><ReportsContent /></RoleGuard>; }
