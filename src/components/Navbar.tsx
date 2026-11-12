"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { VAI_TRO_LABEL } from "@/lib/format";

const LINKS = [
  { href: "/", label: "Tổng quan", roles: ["ADMIN", "THU_QUY", "THANH_VIEN"] },
  { href: "/fund", label: "Sao kê quỹ", roles: ["ADMIN", "THU_QUY", "THANH_VIEN"] },
  { href: "/proposals", label: "Biểu quyết đề xuất", roles: ["ADMIN", "THU_QUY", "THANH_VIEN"] },
  { href: "/dashboard/proposals", label: "Duyệt đề xuất", roles: ["ADMIN", "THU_QUY"] },
  { href: "/events", label: "Sự kiện & điểm danh", roles: ["ADMIN", "THU_QUY", "THANH_VIEN"] },
  { href: "/members", label: "Thành viên", roles: ["ADMIN", "THU_QUY"] },
  { href: "/reports", label: "Báo cáo", roles: ["ADMIN", "THU_QUY", "THANH_VIEN"] },
  { href: "/profile", label: "Hồ sơ", roles: ["ADMIN", "THU_QUY", "THANH_VIEN"] }
] as const;

export function Navbar() {
  const { user, logout, hasRole } = useAuth();
  const pathname = usePathname();

  if (!user) return null;

  return (
    <header className="sticky top-0 z-10 border-b border-ink/10 bg-paper/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-8">
          <span className="font-display text-lg tracking-tight text-ink">
            Câu lạc bộ &amp; Quỹ
          </span>
          <nav className="flex gap-1">
            {LINKS.filter((l) => hasRole(...l.roles)).map((link) => {
              const active = link.href === "/" ? pathname === "/" : pathname?.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-md px-3 py-1.5 font-body text-sm transition ${
                    active
                      ? "bg-moss-600 text-white"
                      : "text-ink/70 hover:bg-ink/5 hover:text-ink"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3 font-body text-sm text-ink/70">
          <span>
            {user.hoTen}{" "}
            <span className="text-ink/40">· {VAI_TRO_LABEL[user.vaiTro]}</span>
          </span>
          <button
            onClick={logout}
            className="rounded-md border border-ink/15 px-3 py-1 transition hover:bg-ink/5"
          >
            Đăng xuất
          </button>
        </div>
      </div>
    </header>
  );
}
