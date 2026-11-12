"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import type { VaiTro } from "@/lib/types";
import { ForbiddenState, LoadingState } from "@/components/States";

/**
 * Bảo vệ trang theo vai trò ở phía Frontend (UX). Đây chỉ là lớp tiện lợi —
 * quyền quyết định thật sự (BR05) luôn thuộc về Backend Guard; mọi request
 * vẫn phải được API xác thực/ phân quyền lại, Frontend không thay thế.
 */
export function RoleGuard({
  allow,
  children
}: {
  allow: VaiTro[];
  children: React.ReactNode;
}) {
  const { user, isLoading, hasRole } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, user, router]);

  if (isLoading) return <LoadingState label="Đang xác thực phiên đăng nhập..." />;
  if (!user) return <LoadingState label="Đang chuyển đến trang đăng nhập..." />;
  if (!hasRole(...allow)) {
    return (
      <ForbiddenState message="Tài khoản của bạn không có quyền truy cập trang này." />
    );
  }
  return <>{children}</>;
}
