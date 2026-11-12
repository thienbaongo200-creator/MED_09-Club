"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { vietnameseNativeValidationHandlers } from "@/lib/form-validation";
import { TRANG_THAI_TAI_KHOAN_LABEL, VAI_TRO_LABEL } from "@/lib/format";
import type { ThanhVien, VaiTro } from "@/lib/types";

function MembersContent() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("ADMIN");
  const [members, setMembers] = useState<ThanhVien[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try { setMembers((await api.get<{ items: ThanhVien[] }>("/members")).items); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Không tải được danh sách."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => { if (active) void load(); });
    return () => { active = false; };
  }, [load]);

  async function updateMember(id: string, body: object) {
    try { await api.patch(`/members/${id}${"vaiTro" in body ? "/role" : "/status"}`, body); await load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Cập nhật thất bại."); }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="font-display text-3xl">Quản lý thành viên</h1>
        <p className="text-sm text-ink/60">
          Chỉ quản trị viên được thay đổi vai trò. Backend tiếp tục kiểm tra mọi quyền.
        </p>
      </header>
      {error && <p role="alert" className="text-sm text-rust-600">{error}</p>}
      {isAdmin && (
        <section aria-labelledby="create-member-title" className="border-y border-ink/10 py-4">
          <h2 id="create-member-title" className="font-display text-xl">Tạo thành viên</h2>
          <form
            {...vietnameseNativeValidationHandlers}
            className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
            onSubmit={async (e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              const formElement = e.currentTarget;
              const form = new FormData(formElement);
              try {
                await api.post("/members", {
                  hoTen: form.get("hoTen"),
                  email: form.get("email"),
                  soDienThoai: form.get("soDienThoai") || undefined,
                  matKhau: form.get("matKhau")
                });
                formElement.reset();
                await load();
              } catch (err) {
                setError(err instanceof ApiError ? err.message : "Không tạo được thành viên.");
              }
            }}
          >
            <label className="flex flex-col gap-1 text-sm text-ink/70">
              <span>Họ tên</span>
              <input required name="hoTen" className="rounded-md border border-ink/15 px-3 py-2 text-ink" />
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink/70">
              <span>Email</span>
              <input required type="email" name="email" className="rounded-md border border-ink/15 px-3 py-2 text-ink" />
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink/70">
              <span>Điện thoại (không bắt buộc)</span>
              <input name="soDienThoai" className="rounded-md border border-ink/15 px-3 py-2 text-ink" />
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink/70">
              <span>Mật khẩu tạm thời (ít nhất 8 ký tự)</span>
              <input required minLength={8} name="matKhau" type="password" className="rounded-md border border-ink/15 px-3 py-2 text-ink" />
            </label>
            <button className="rounded-md bg-moss-600 px-4 py-2 text-white hover:bg-moss-700 sm:col-span-2 xl:col-span-4 xl:justify-self-start">
              Tạo thành viên
            </button>
          </form>
        </section>
      )}
      <section aria-labelledby="members-list-title" className="space-y-3">
        <h2 id="members-list-title" className="font-display text-xl">Danh sách thành viên</h2>
        {loading ? (
          <p role="status" className="py-4 text-sm text-ink/60">Đang tải danh sách…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-y border-ink/10 bg-ink/5">
                <tr>
                  <th scope="col" className="p-3">Họ tên</th>
                  <th scope="col" className="p-3">Email</th>
                  <th scope="col" className="p-3">Điện thoại</th>
                  <th scope="col" className="p-3">Vai trò</th>
                  <th scope="col" className="p-3">Trạng thái</th>
                  <th scope="col" className="p-3">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-b border-ink/10">
                    <td className="p-3">{m.hoTen}</td>
                    <td className="p-3">{m.email}</td>
                    <td className="p-3">{m.soDienThoai ?? "—"}</td>
                    <td className="p-3">
                      {isAdmin ? (
                        <select
                          aria-label={`Vai trò ${m.hoTen}`}
                          value={m.vaiTro}
                          onChange={(e) => void updateMember(m.id, { vaiTro: e.target.value as VaiTro })}
                          className="rounded-md border border-ink/15 px-2 py-1"
                        >
                          <option value="ADMIN">{VAI_TRO_LABEL.ADMIN}</option>
                          <option value="THU_QUY">{VAI_TRO_LABEL.THU_QUY}</option>
                          <option value="THANH_VIEN">{VAI_TRO_LABEL.THANH_VIEN}</option>
                        </select>
                      ) : VAI_TRO_LABEL[m.vaiTro]}
                    </td>
                    <td className="p-3">{TRANG_THAI_TAI_KHOAN_LABEL[m.trangThai]}</td>
                    <td className="p-3">
                      <button
                        className="rounded-md border border-ink/15 px-2 py-1 hover:bg-ink/5"
                        onClick={() => void updateMember(m.id, { trangThai: m.trangThai === "ACTIVE" ? "INACTIVE" : "ACTIVE" })}
                      >
                        {m.trangThai === "ACTIVE" ? "Khóa" : "Kích hoạt"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default function MembersPage() { return <RoleGuard allow={["ADMIN", "THU_QUY"]}><MembersContent /></RoleGuard>; }
