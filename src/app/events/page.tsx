"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { formatDate, TRANG_THAI_THAM_GIA_LABEL } from "@/lib/format";
import { RoleGuard } from "@/components/RoleGuard";
import { EmptyState, ErrorState, ForbiddenState, LoadingState } from "@/components/States";
import { StatusBadge } from "@/components/StatusBadge";
import { useAuth } from "@/context/AuthContext";
import type { SuKienDto, ThanhVienSuKienDto } from "@/lib/types";

function EventsPageContent() {
  const { hasRole } = useAuth();
  const canManage = hasRole("THU_QUY", "ADMIN");

  const [events, setEvents] = useState<SuKienDto[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "forbidden">(
    "loading"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    setErrorMessage(null);
    try {
      const res = await api.get<{ items: SuKienDto[] }>("/events");
      setEvents(res.items);
      setStatus("idle");
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setStatus("forbidden");
        return;
      }
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Lỗi không xác định.");
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => { if (active) load(); });
    return () => { active = false; };
  }, [load]);

  if (status === "forbidden") return <ForbiddenState />;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-clay-500">
            Quản lý sự kiện
          </p>
          <h1 className="mt-1 font-display text-3xl text-ink">
            Sự kiện &amp; điểm danh
          </h1>
          <p className="mt-1 max-w-2xl font-body text-sm text-ink/60">
            Thành viên đăng ký tham gia; thủ quỹ/quản trị viên ghi nhận điểm danh.
            Mỗi thành viên chỉ đăng ký được một lần cho mỗi sự kiện.
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowCreate((s) => !s)}
            className="rounded-md bg-moss-600 px-4 py-2 font-body text-sm font-medium text-white transition hover:bg-moss-700"
          >
            {showCreate ? "Đóng" : "+ Tạo sự kiện"}
          </button>
        )}
      </header>

      {showCreate && canManage && (
        <CreateEventForm
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}

      {status === "loading" && <LoadingState label="Đang tải danh sách sự kiện..." />}
      {status === "error" && (
        <ErrorState message={errorMessage ?? undefined} onRetry={load} />
      )}
      {status === "idle" && events.length === 0 && (
        <EmptyState description="Chưa có sự kiện nào được tạo." />
      )}

      <div className="grid gap-4">
        {status === "idle" &&
          events.map((ev) => (
            <EventCard
              key={ev.id}
              event={ev}
              canManage={canManage}
              expanded={expandedId === ev.id}
              onToggleExpand={() =>
                setExpandedId((id) => (id === ev.id ? null : ev.id))
              }
              onRegistered={(updated) =>
                setEvents((prev) => prev.map((e) => (e.id === ev.id ? updated : e)))
              }
              onUpdated={(updated) => setEvents((prev) => prev.map((e) => (e.id === ev.id ? updated : e)))}
            />
          ))}
      </div>
    </div>
  );
}

function EventCard({
  event,
  canManage,
  expanded,
  onToggleExpand,
  onRegistered,
  onUpdated
}: {
  event: SuKienDto;
  canManage: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onRegistered: (event: SuKienDto) => void;
  onUpdated: (event: SuKienDto) => void;
}) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);

  async function handleRegister() {
    setIsRegistering(true);
    setRegisterError(null);
    try {
      const updated = await api.post<SuKienDto>(`/events/${event.id}/register`);
      onRegistered(updated);
    } catch (err) {
      setRegisterError(
        err instanceof ApiError
          ? err.status === 409
            ? "Bạn đã đăng ký sự kiện này rồi."
            : err.message
          : "Không thể đăng ký lúc này."
      );
    } finally {
      setIsRegistering(false);
    }
  }

  return (
    <article className="rounded-lg border border-ink/10 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-ink">{event.tenSuKien}</h2>
          <p className="mt-1 font-body text-xs text-ink/50">
            {formatDate(event.thoiGianBatDau, true)} —{" "}
            {formatDate(event.thoiGianKetThuc, true)}
            {event.diaDiem ? ` · ${event.diaDiem}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3 font-body text-xs text-ink/50">
          <span>{event.soLuongDangKy} đăng ký</span>
          <span>{event.soLuongDiemDanh} đã điểm danh</span>
        </div>
      </div>

      {event.moTa && (
        <p className="mt-3 font-body text-sm leading-relaxed text-ink/80">
          {event.moTa}
        </p>
      )}

      {registerError && (
        <p className="mt-2 font-body text-sm text-rust-600">{registerError}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {canManage && (
          <button onClick={() => setShowEdit((current) => !current)} className="rounded-md border border-ink/15 px-4 py-1.5 font-body text-sm text-ink/70">
            {showEdit ? "Đóng chỉnh sửa" : "Chỉnh sửa sự kiện"}
          </button>
        )}
        {event.trangThaiCuaToi ? (
          <StatusBadge
            status={event.trangThaiCuaToi}
            label={TRANG_THAI_THAM_GIA_LABEL[event.trangThaiCuaToi]}
          />
        ) : (
          <button
            onClick={handleRegister}
            disabled={isRegistering}
            className="rounded-md bg-moss-600 px-4 py-1.5 font-body text-sm font-medium text-white transition hover:bg-moss-700 disabled:opacity-60"
          >
            {isRegistering ? "Đang đăng ký..." : "Đăng ký tham gia"}
          </button>
        )}

        {canManage && (
          <button
            onClick={onToggleExpand}
            className="rounded-md border border-ink/15 px-4 py-1.5 font-body text-sm text-ink/70 transition hover:bg-ink/5"
          >
            {expanded ? "Ẩn danh sách điểm danh" : "Quản lý điểm danh"}
          </button>
        )}
      </div>

      {showEdit && canManage && <CreateEventForm initialEvent={event} onCreated={(updated) => { setShowEdit(false); onUpdated(updated); }} />}

      {expanded && canManage && <AttendanceRoster eventId={event.id} />}
    </article>
  );
}

function AttendanceRoster({ eventId }: { eventId: string }) {
  const [roster, setRoster] = useState<ThanhVienSuKienDto[] | null>(null);
  const [status, setStatus] = useState<"loading" | "idle" | "error">("loading");
  const [markingId, setMarkingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await api.get<{ items: ThanhVienSuKienDto[] }>(
        `/events/${eventId}/registrations`
      );
      setRoster(res.items);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }, [eventId]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => { if (active) load(); });
    return () => { active = false; };
  }, [load]);

  async function handleMarkAttendance(registration: ThanhVienSuKienDto, trangThai: "ATTENDED" | "ABSENT") {
    setMarkingId(registration.id);
    try {
      await api.post(`/events/${eventId}/attendance`, {
        thanhVienId: registration.thanhVien.id,
        trangThai
      });
      setRoster(
        (prev) =>
          prev?.map((r) =>
            r.id === registration.id
              ? { ...r, trangThai, thoiGianDiemDanh: new Date().toISOString() }
              : r
          ) ?? null
      );
    } catch (err) {
      alert(
        err instanceof ApiError
          ? err.message
          : "Không thể ghi nhận điểm danh lúc này."
      );
    } finally {
      setMarkingId(null);
    }
  }

  return (
    <div className="mt-4 rounded-md border border-ink/10 bg-moss-50/40 p-3">
      {status === "loading" && <LoadingState label="Đang tải danh sách đăng ký..." />}
      {status === "error" && (
        <ErrorState message="Không thể tải danh sách đăng ký." onRetry={load} />
      )}
      {status === "idle" && roster && roster.length === 0 && (
        <EmptyState description="Chưa có thành viên nào đăng ký sự kiện này." />
      )}
      {status === "idle" && roster && roster.length > 0 && (
        <table className="w-full border-collapse text-left font-body text-sm">
          <thead>
            <tr className="text-ink/50">
              <th className="px-2 py-1.5 font-medium">Thành viên</th>
              <th className="px-2 py-1.5 font-medium">Trạng thái</th>
              <th className="px-2 py-1.5 font-medium">Thời điểm điểm danh</th>
              <th className="px-2 py-1.5 font-medium">Hành động</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((r) => (
              <tr key={r.id} className="border-t border-ink/5">
                <td className="px-2 py-2 text-ink/80">{r.thanhVien.hoTen}</td>
                <td className="px-2 py-2">
                  <StatusBadge
                    status={r.trangThai}
                    label={TRANG_THAI_THAM_GIA_LABEL[r.trangThai]}
                  />
                </td>
                <td className="px-2 py-2 text-ink/50">
                  {r.thoiGianDiemDanh ? formatDate(r.thoiGianDiemDanh, true) : "—"}
                </td>
                <td className="px-2 py-2">
                  <div className="flex gap-2">
                    {(["ATTENDED", "ABSENT"] as const).map((trangThai) => (
                      <button
                        key={trangThai}
                        disabled={r.trangThai === trangThai || markingId === r.id}
                        onClick={() => handleMarkAttendance(r, trangThai)}
                        className="rounded-md bg-moss-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-moss-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {markingId === r.id ? "Đang lưu..." : trangThai === "ATTENDED" ? "Có mặt" : "Vắng"}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CreateEventForm({ onCreated, initialEvent }: { onCreated: (event: SuKienDto) => void; initialEvent?: SuKienDto }) {
  const localDateTime = (value?: string) => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
  const [tenSuKien, setTenSuKien] = useState(initialEvent?.tenSuKien ?? "");
  const [moTa, setMoTa] = useState(initialEvent?.moTa ?? "");
  const [diaDiem, setDiaDiem] = useState(initialEvent?.diaDiem ?? "");
  const [batDau, setBatDau] = useState(localDateTime(initialEvent?.thoiGianBatDau));
  const [ketThuc, setKetThuc] = useState(localDateTime(initialEvent?.thoiGianKetThuc));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!tenSuKien.trim() || !batDau || !ketThuc) {
      setError("Vui lòng nhập tên sự kiện và thời gian bắt đầu/kết thúc.");
      return;
    }
    if (new Date(ketThuc) <= new Date(batDau)) {
      setError("Thời gian kết thúc phải sau thời gian bắt đầu.");
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = {
        tenSuKien,
        moTa: moTa || undefined,
        diaDiem: diaDiem || undefined,
        // PostgreSQL schema uses TIMESTAMP WITHOUT TIME ZONE; preserve the
        // user's local wall time instead of converting it to a UTC instant.
        thoiGianBatDau: batDau,
        thoiGianKetThuc: ketThuc
      };
      const saved = initialEvent
        ? await api.patch<SuKienDto>(`/events/${initialEvent.id}`, payload)
        : await api.post<SuKienDto>("/events", payload);
      onCreated(saved);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Không thể tạo sự kiện lúc này."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-3 rounded-lg border border-moss-300 bg-moss-50/60 p-5 sm:grid-cols-2"
    >
      <h3 className="font-display text-lg text-ink sm:col-span-2">{initialEvent ? "Chỉnh sửa sự kiện" : "Tạo sự kiện mới"}</h3>
      {error && (
        <p className="font-body text-sm text-rust-600 sm:col-span-2">{error}</p>
      )}
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        <span className="font-body text-ink/60">Tên sự kiện</span>
        <input
          required
          value={tenSuKien}
          onChange={(e) => setTenSuKien(e.target.value)}
          className="rounded-md border border-ink/15 px-3 py-2 font-body text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        <span className="font-body text-ink/60">Mô tả</span>
        <textarea
          rows={2}
          value={moTa}
          onChange={(e) => setMoTa(e.target.value)}
          className="rounded-md border border-ink/15 px-3 py-2 font-body text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-body text-ink/60">Địa điểm</span>
        <input
          value={diaDiem}
          onChange={(e) => setDiaDiem(e.target.value)}
          className="rounded-md border border-ink/15 px-3 py-2 font-body text-sm"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-body text-ink/60">Bắt đầu</span>
          <input
            required
            type="datetime-local"
            value={batDau}
            onChange={(e) => setBatDau(e.target.value)}
            className="rounded-md border border-ink/15 px-3 py-2 font-body text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-body text-ink/60">Kết thúc</span>
          <input
            required
            type="datetime-local"
            value={ketThuc}
            onChange={(e) => setKetThuc(e.target.value)}
            className="rounded-md border border-ink/15 px-3 py-2 font-body text-sm"
          />
        </label>
      </div>
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-moss-600 px-4 py-2 font-body text-sm font-medium text-white transition hover:bg-moss-700 disabled:opacity-60"
        >
          {isSubmitting ? "Đang lưu..." : initialEvent ? "Lưu thay đổi" : "Tạo sự kiện"}
        </button>
      </div>
    </form>
  );
}

export default function EventsPage() {
  return (
    <RoleGuard allow={["ADMIN", "THU_QUY", "THANH_VIEN"]}>
      <EventsPageContent />
    </RoleGuard>
  );
}
