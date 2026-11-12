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

  const links = LINKS.filter((link) => hasRole(...link.roles));
  const renderLinks = () => links.map((link) => {
    const active = link.href === "/" ? pathname === "/" : pathname?.startsWith(link.href);
    return (
      <Link
        key={link.href}
        href={link.href}
        aria-current={active ? "page" : undefined}
        className={`rounded-md px-3 py-2 font-body text-sm ${
          active
            ? "bg-moss-600 text-white"
            : "text-ink/70 hover:bg-ink/5 hover:text-ink"
        }`}
      >
        {link.label}
      </Link>
    );
  });

  return (
    <header className="sticky top-0 z-10 border-b border-ink/10 bg-paper">
      <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <span className="font-display text-lg tracking-tight text-ink">
            Câu lạc bộ &amp; Quỹ
          </span>
          <div className="flex min-w-0 items-center gap-3 font-body text-sm text-ink/70">
            <span className="max-w-[55vw] truncate sm:max-w-[35vw]" title={`${user.hoTen} · ${VAI_TRO_LABEL[user.vaiTro]}`}>
              {user.hoTen}{" "}
              <span className="text-ink/40">· {VAI_TRO_LABEL[user.vaiTro]}</span>
            </span>
            <button
              onClick={logout}
              className="shrink-0 rounded-md border border-ink/15 px-3 py-1.5 hover:bg-ink/5"
            >
              Đăng xuất
            </button>
          </div>
        </div>
        <details className="mt-3 xl:hidden">
          <summary className="w-fit cursor-pointer rounded-md border border-ink/15 px-3 py-2 font-body text-sm text-ink/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss-600">
            Chức năng
          </summary>
          <nav aria-label="Điều hướng chính" className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">
            {renderLinks()}
          </nav>
        </details>
        <nav aria-label="Điều hướng chính" className="mt-3 hidden flex-wrap gap-1 xl:flex">
          {renderLinks()}
        </nav>
      </div>
    </header>
  );
}
