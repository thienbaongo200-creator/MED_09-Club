"use client";

import { RoleGuard } from "@/components/RoleGuard";
import { LoadingState, ErrorState } from "@/components/States";
import { useAuth } from "@/context/AuthContext";
import { VAI_TRO_LABEL } from "@/lib/format";

function ProfileContent() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingState label="Đang tải hồ sơ…" />;
  if (!user) return <ErrorState message="Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại." />;
  return <div className="mx-auto max-w-2xl">
    <h1 className="font-display text-3xl">Hồ sơ cá nhân</h1>
    <dl className="mt-5 grid gap-4 rounded-lg border bg-white p-5 sm:grid-cols-2">
      <div><dt className="text-sm text-ink/50">Họ tên</dt><dd>{user.hoTen}</dd></div>
      <div><dt className="text-sm text-ink/50">Email</dt><dd>{user.email}</dd></div>
      <div><dt className="text-sm text-ink/50">Số điện thoại</dt><dd>{user.soDienThoai || "Chưa cập nhật"}</dd></div>
      <div><dt className="text-sm text-ink/50">Vai trò</dt><dd>{VAI_TRO_LABEL[user.vaiTro]}</dd></div>
      <div><dt className="text-sm text-ink/50">Trạng thái</dt><dd>{user.trangThai}</dd></div>
      <div><dt className="text-sm text-ink/50">Ngày tham gia</dt><dd>{new Date(user.ngayThamGia).toLocaleDateString("vi-VN")}</dd></div>
    </dl>
  </div>;
}

export default function ProfilePage() { return <RoleGuard allow={["ADMIN", "THU_QUY", "THANH_VIEN"]}><ProfileContent /></RoleGuard>; }
