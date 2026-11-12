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
  return <main className="mx-auto max-w-5xl p-6">
    <h1 className="font-display text-3xl">Báo cáo</h1>
    <div className="my-5 flex flex-wrap items-end gap-3 rounded border p-4">
      <label className="grid gap-1 text-sm">Từ ngày<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border px-2 py-1" /></label>
      <label className="grid gap-1 text-sm">Đến ngày<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border px-2 py-1" /></label>
      {canViewAttendance && <label className="grid gap-1 text-sm">Sự kiện<select value={eventId} onChange={(e) => setEventId(e.target.value)} className="rounded border px-2 py-1"><option value="">Chọn sự kiện</option>{events.map((event) => <option key={event.id} value={event.id}>{event.tenSuKien}</option>)}</select></label>}
      <button disabled={loading || !from || !to} onClick={() => void load()} className="rounded bg-moss-600 px-4 py-2 text-white disabled:opacity-50">{loading ? "Đang tải…" : "Xem báo cáo"}</button>
    </div>
    {error && <p role="alert" className="my-3 text-rust-600">{error}</p>}
    {fund && <section className="mb-6 rounded border p-4"><h2 className="mb-3 font-display text-xl">Báo cáo quỹ</h2><dl className="grid gap-3 sm:grid-cols-2"><div>Số dư đầu kỳ: <strong>{money(fund.soDuDauKy)}</strong></div><div>Tổng thu: <strong>{money(fund.tongThu)}</strong></div><div>Tổng chi: <strong>{money(fund.tongChi)}</strong></div><div>Số dư cuối kỳ: <strong>{money(fund.soDuCuoiKy)}</strong></div></dl></section>}
    {attendance && <section className="rounded border p-4"><h2 className="font-display text-xl">Chuyên cần: {attendance.tenSuKien}</h2><p className="mt-2">Đăng ký {attendance.soLuongDangKy} · Có mặt {attendance.soLuongThamDu} · Vắng {attendance.soLuongVang}</p></section>}
  </main>;
}

export default function ReportsPage() { return <RoleGuard allow={["ADMIN", "THU_QUY", "THANH_VIEN"]}><ReportsContent /></RoleGuard>; }
