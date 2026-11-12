"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
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

  return <main className="mx-auto max-w-6xl p-6">
    <h1 className="font-display text-3xl">Quản lý thành viên</h1>
    <p className="mt-2 text-sm text-ink/60">Chỉ quản trị viên được thay đổi vai trò. Backend tiếp tục kiểm tra mọi quyền.</p>
    {error && <p role="alert" className="my-3 text-rust-600">{error}</p>}
    {isAdmin && <form className="my-5 grid gap-2 rounded border p-4 sm:grid-cols-4" onSubmit={async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault(); const formElement = e.currentTarget; const form = new FormData(formElement);
      try { await api.post("/members", { hoTen: form.get("hoTen"), email: form.get("email"), soDienThoai: form.get("soDienThoai") || undefined, matKhau: form.get("matKhau") }); formElement.reset(); await load(); }
      catch (err) { setError(err instanceof ApiError ? err.message : "Không tạo được thành viên."); }
    }}>
      <input required name="hoTen" placeholder="Họ tên" className="rounded border px-3 py-2" />
      <input required type="email" name="email" placeholder="Email" className="rounded border px-3 py-2" />
      <input name="soDienThoai" placeholder="Điện thoại" className="rounded border px-3 py-2" />
      <input required minLength={8} name="matKhau" type="password" placeholder="Mật khẩu tạm (ít nhất 8 ký tự)" className="rounded border px-3 py-2" />
      <button className="rounded bg-moss-600 px-4 py-2 text-white sm:col-span-4">Tạo thành viên</button>
    </form>}
    {loading ? <p>Đang tải…</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Họ tên</th><th>Email</th><th>Điện thoại</th><th>Vai trò</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
      <tbody>{members.map((m) => <tr key={m.id} className="border-t"><td className="p-2">{m.hoTen}</td><td>{m.email}</td><td>{m.soDienThoai ?? "—"}</td><td>{isAdmin ? <select aria-label={`Vai trò ${m.hoTen}`} value={m.vaiTro} onChange={(e) => void updateMember(m.id, { vaiTro: e.target.value as VaiTro })} className="rounded border p-1"><option>ADMIN</option><option>THU_QUY</option><option>THANH_VIEN</option></select> : m.vaiTro}</td><td>{m.trangThai}</td><td><button className="rounded border px-2 py-1" onClick={() => void updateMember(m.id, { trangThai: m.trangThai === "ACTIVE" ? "INACTIVE" : "ACTIVE" })}>{m.trangThai === "ACTIVE" ? "Khóa" : "Kích hoạt"}</button></td></tr>)}</tbody>
    </table></div>}
  </main>;
}

export default function MembersPage() { return <RoleGuard allow={["ADMIN", "THU_QUY"]}><MembersContent /></RoleGuard>; }
