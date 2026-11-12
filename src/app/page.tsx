"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { DashboardSection } from "@/components/dashboard/DashboardSection";
import { DashboardStat } from "@/components/dashboard/DashboardStat";
import { ErrorState, LoadingState } from "@/components/States";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { formatCurrency, VAI_TRO_LABEL } from "@/lib/format";
import type { DeXuatChiDto, FundSummaryDto, SuKienDto, ThanhVien } from "@/lib/types";

interface DashboardData {
  asOf: number;
  fund: FundSummaryDto | null;
  proposals: DeXuatChiDto[] | null;
  events: SuKienDto[] | null;
  members: ThanhVien[] | null;
}

const EMPTY_VALUE = "Chưa có dữ liệu";

function ResourceStat({
  label,
  value,
  loading,
  detail
}: {
  label: string;
  value: string | number | null;
  loading: boolean;
  detail?: string;
}) {
  return <DashboardStat label={label} value={loading ? "Đang tải…" : value ?? EMPTY_VALUE} detail={detail} />;
}

function ShortcutGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-x-8">{children}</div>;
}

export default function DashboardPage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadDashboard = useCallback(async (signal: AbortSignal) => {
    setIsLoading(true);
    const results = await Promise.allSettled([
      api.get<FundSummaryDto>("/fund/summary", undefined, signal),
      api.get<{ items: DeXuatChiDto[] }>("/proposals", { trangThai: "PENDING" }, signal),
      api.get<{ items: SuKienDto[] }>("/events", undefined, signal),
      api.get<{ items: ThanhVien[] }>("/members", undefined, signal)
    ]);

    if (!signal.aborted) {
      setData({
        asOf: Date.now(),
        fund: results[0].status === "fulfilled" ? results[0].value : null,
        proposals: results[1].status === "fulfilled" ? results[1].value.items : null,
        events: results[2].status === "fulfilled" ? results[2].value.items : null,
        members: results[3].status === "fulfilled" ? results[3].value.items : null
      });
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthLoading && !user) router.replace("/login");
  }, [isAuthLoading, router, user]);

  useEffect(() => {
    if (isAuthLoading || !user || user.vaiTro === "THANH_VIEN") return;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) return loadDashboard(controller.signal);
    });
    return () => controller.abort();
  }, [isAuthLoading, loadDashboard, refreshKey, user]);

  if (isAuthLoading || !user) return <LoadingState label="Đang tải trang tổng quan…" />;

  const roleLabel = VAI_TRO_LABEL[user.vaiTro] ?? user.vaiTro;
  const upcomingEvents = data?.events?.filter((event) => new Date(event.thoiGianBatDau).getTime() > data.asOf) ?? null;
  const activeMembers = data?.members?.filter((member) => member.trangThai === "ACTIVE") ?? null;
  const activeAdmins = data?.members?.filter((member) => member.vaiTro === "ADMIN" && member.trangThai === "ACTIVE") ?? null;
  const pendingCount = data?.proposals?.length ?? null;
  const fundBalance = data?.fund?.capNhatLuc ? formatCurrency(data.fund.soDuHienTai) : null;

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="mt-1 font-display text-3xl text-ink sm:text-4xl">Xin chào, {user.hoTen}</h1>
          <p className="mt-2 text-sm text-ink/60">Tổng quan hoạt động câu lạc bộ theo vai trò {roleLabel}.</p>
        </div>
        {user.vaiTro !== "THANH_VIEN" && (
          <button
            type="button"
            onClick={() => setRefreshKey((key) => key + 1)}
            disabled={isLoading}
            className="w-full rounded-md border border-ink/15 px-4 py-2 text-sm transition hover:bg-ink/5 disabled:opacity-50 sm:w-auto"
          >
            {isLoading ? "Đang cập nhật…" : "Làm mới số liệu"}
          </button>
        )}
      </header>

      {user.vaiTro === "THANH_VIEN" ? (
        <>
          <DashboardSection title="Hồ sơ cá nhân" description="Thông tin tài khoản hiện đang đăng nhập.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <DashboardStat label="Họ tên" value={user.hoTen || EMPTY_VALUE} />
              <DashboardStat label="Vai trò" value={roleLabel || EMPTY_VALUE} />
              <DashboardStat label="Trạng thái" value={user.trangThai || EMPTY_VALUE} />
            </div>
          </DashboardSection>
          <DashboardSection title="Truy cập nhanh" description="Mở các chức năng dành cho thành viên.">
            <ShortcutGrid>
              <DashboardCard title="Quỹ" description="Xem số dư và sao kê đã được bảo vệ dữ liệu cá nhân." href="/fund" />
              <DashboardCard title="Đề xuất" description="Xem đề xuất chi và tham gia biểu quyết." href="/proposals" />
              <DashboardCard title="Sự kiện" description="Xem sự kiện và trạng thái đăng ký của bạn." href="/events" />
              <DashboardCard title="Báo cáo" description="Xem báo cáo quỹ được phép truy cập." href="/reports" />
              <DashboardCard title="Hồ sơ" description="Mở thông tin hồ sơ cá nhân." href="/profile" />
            </ShortcutGrid>
          </DashboardSection>
        </>
      ) : user.vaiTro === "THU_QUY" ? (
        <>
          <DashboardSection title="Tình hình câu lạc bộ">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <ResourceStat label="Số dư quỹ hiện tại" value={fundBalance} loading={isLoading} />
              <ResourceStat label="Đề xuất đang chờ" value={pendingCount} loading={isLoading} />
              <ResourceStat label="Sự kiện sắp tới" value={upcomingEvents?.length ?? null} loading={isLoading} />
              <ResourceStat label="Thành viên đang hoạt động" value={activeMembers?.length ?? null} loading={isLoading} />
            </div>
          </DashboardSection>
          <DashboardSection title="Tác vụ nhanh">
            <ShortcutGrid>
              <DashboardCard title="Quản lý quỹ" description="Xem sao kê, ghi nhận giao dịch và chứng từ." href="/fund" />
              <DashboardCard title="Duyệt đề xuất" description="Xem các đề xuất đang chờ xử lý." href="/dashboard/proposals" />
              <DashboardCard title="Quản lý sự kiện" description="Tạo sự kiện và quản lý đăng ký, điểm danh." href="/events" />
              <DashboardCard title="Báo cáo" description="Xem tổng hợp quỹ và tham dự sự kiện." href="/reports" />
              <DashboardCard title="Thành viên" description="Xem danh sách và trạng thái thành viên." href="/members" />
            </ShortcutGrid>
          </DashboardSection>
        </>
      ) : (
        <>
          <DashboardSection title="Tình hình câu lạc bộ">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <ResourceStat label="Tổng thành viên" value={data?.members?.length ?? null} loading={isLoading} />
              <ResourceStat label="Thành viên đang hoạt động" value={activeMembers?.length ?? null} loading={isLoading} />
              <ResourceStat label="Đề xuất đang chờ" value={pendingCount} loading={isLoading} />
              <ResourceStat label="Sự kiện sắp tới" value={upcomingEvents?.length ?? null} loading={isLoading} />
            </div>
          </DashboardSection>
          {activeAdmins && activeAdmins.length <= 1 && (
            <aside role="alert" className="rounded-lg border border-clay-500/40 bg-clay-500/10 p-4 text-sm text-ink">
              <strong className="block font-medium">Cảnh báo quản trị viên hoạt động cuối cùng</strong>
              <span className="mt-1 block text-ink/70">
                Hệ thống hiện có {activeAdmins.length} tài khoản quản trị viên đang hoạt động. Hãy giữ ít nhất một tài khoản quản trị viên đang hoạt động.
              </span>
            </aside>
          )}
          <DashboardSection title="Tác vụ quản trị">
            <ShortcutGrid>
              <DashboardCard title="Thành viên" description="Xem và quản lý danh sách thành viên." href="/members" />
              <DashboardCard title="Phân quyền" description="Mở trang thành viên để quản lý vai trò." href="/members" />
              <DashboardCard title="Quỹ" description="Theo dõi số dư, sao kê và giao dịch." href="/fund" />
              <DashboardCard title="Đề xuất" description="Xem, biểu quyết hoặc xử lý đề xuất." href="/proposals" />
              <DashboardCard title="Báo cáo" description="Xem báo cáo quỹ và tham dự." href="/reports" />
              <DashboardCard title="Sự kiện" description="Quản lý sự kiện và hoạt động tham dự." href="/events" />
            </ShortcutGrid>
          </DashboardSection>
        </>
      )}

      {user.vaiTro !== "THANH_VIEN" && data && [data.fund, data.proposals, data.events, data.members].every((value) => value === null) && (
        <ErrorState
          message="Chưa có dữ liệu tổng quan từ các dịch vụ hiện tại."
          onRetry={() => setRefreshKey((key) => key + 1)}
        />
      )}
    </div>
  );
}
