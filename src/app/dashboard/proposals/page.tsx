"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import { RoleGuard } from "@/components/RoleGuard";
import { EmptyState, ErrorState, ForbiddenState, LoadingState } from "@/components/States";
import type { ApproveProposalResult, DeXuatChiDto, FundSummaryDto } from "@/lib/types";

function TreasurerProposalsContent() {
  const [proposals, setProposals] = useState<DeXuatChiDto[]>([]);
  const [summary, setSummary] = useState<FundSummaryDto | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "forbidden">(
    "loading"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setStatus("loading");
    setErrorMessage(null);
    try {
      const [proposalsRes, summaryRes] = await Promise.all([
        api.get<{ items: DeXuatChiDto[] }>("/proposals", { trangThai: "PENDING" }),
        api.get<FundSummaryDto>("/fund/summary")
      ]);
      setProposals(proposalsRes.items);
      setSummary(summaryRes);
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
    load();
  }, [load]);

  async function handleApprove(p: DeXuatChiDto) {
    setActioningId(p.id);
    setRowError((r) => ({ ...r, [p.id]: "" }));
    try {
      // Backend mở Database Transaction (QueryRunner), khoá luồng cập nhật quỹ,
      // kiểm tra lại trạng thái/điều kiện vote/số dư rồi Commit hoặc Rollback
      // toàn bộ (BR03). UI chỉ phản ánh kết quả cuối cùng do Backend trả về.
      await api.post<ApproveProposalResult>(
        `/proposals/${p.id}/approve`
      );
      setProposals((prev) => prev.filter((item) => item.id !== p.id));
      const newSummary = await api.get<FundSummaryDto>("/fund/summary");
      setSummary(newSummary);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.status === 409
            ? "Đề xuất đã được xử lý bởi yêu cầu khác hoặc không còn ở trạng thái PENDING."
            : err.status === 422
            ? err.message || "Đề xuất chưa đủ điều kiện duyệt hoặc quỹ không đủ số dư; trạng thái chưa thay đổi."
            : err.message
          : "Không thể phê duyệt lúc này.";
      setRowError((r) => ({ ...r, [p.id]: message }));
    } finally {
      setActioningId(null);
    }
  }

  async function handleReject(p: DeXuatChiDto) {
    setActioningId(p.id);
    setRowError((r) => ({ ...r, [p.id]: "" }));
    try {
      await api.patch(`/proposals/${p.id}/reject`);
      setProposals((prev) => prev.filter((item) => item.id !== p.id));
    } catch (err) {
      setRowError((r) => ({
        ...r,
        [p.id]:
          err instanceof ApiError ? err.message : "Không thể từ chối đề xuất lúc này."
      }));
    } finally {
      setActioningId(null);
    }
  }

  if (status === "forbidden") return <ForbiddenState />;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-clay-500">
            BR03 · BR05 · Thủ quỹ
          </p>
          <h1 className="mt-1 font-display text-3xl text-ink">
            Quản lý &amp; duyệt đề xuất chi
          </h1>
          <p className="mt-1 max-w-2xl font-body text-sm text-ink/60">
            Nút &quot;Phê duyệt&quot; chỉ khả dụng khi đề xuất còn PENDING, biểu quyết
            đạt AGREE &gt; DISAGREE và số dư quỹ đủ. Máy chủ kiểm tra lại toàn bộ điều
            kiện trong một transaction trước khi ghi nhận.
          </p>
        </div>
        {summary && (
          <div className="rounded-lg border border-moss-600/30 bg-moss-700 px-5 py-3 text-moss-50">
            <p className="font-body text-xs uppercase tracking-wide text-moss-200">
              Số dư quỹ hiện tại
            </p>
            <p className="font-display text-xl">{formatCurrency(summary.soDuHienTai)}</p>
          </div>
        )}
      </header>

      {status === "loading" && <LoadingState label="Đang tải danh sách đề xuất chờ duyệt..." />}
      {status === "error" && (
        <ErrorState message={errorMessage ?? undefined} onRetry={load} />
      )}
      {status === "idle" && proposals.length === 0 && (
        <EmptyState
          title="Không có đề xuất nào đang chờ duyệt"
          description="Mọi đề xuất PENDING sẽ xuất hiện tại đây để thủ quỹ xử lý."
        />
      )}

      {status === "idle" && proposals.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-ink/10 bg-white">
          <table className="w-full border-collapse text-left font-body text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-moss-50/60 text-ink/60">
                <th className="px-4 py-3 font-medium">Đề xuất</th>
                <th className="px-4 py-3 font-medium">Người đề xuất</th>
                <th className="px-4 py-3 text-right font-medium">Kinh phí</th>
                <th className="px-4 py-3 font-medium">Biểu quyết</th>
                <th className="px-4 py-3 font-medium">Điều kiện duyệt</th>
                <th className="px-4 py-3 font-medium">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {proposals.map((p) => {
                const passesVote = p.voteStats.agreeCount > p.voteStats.disagreeCount;
                const hasEnoughBalance = summary
                  ? summary.soDuHienTai >= p.kinhPhi
                  : true;
                const canApprove =
                  p.trangThai === "PENDING" && passesVote && hasEnoughBalance;
                return (
                  <tr key={p.id} className="border-b border-ink/5 align-top last:border-0">
                    <td className="max-w-xs px-4 py-3">
                      <p className="font-medium text-ink">{p.tieuDe}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-ink/50">
                        {p.noiDung}
                      </p>
                      <p className="mt-1 text-xs text-ink/40">
                        {formatDate(p.ngayTao)}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-ink/70">{p.nguoiDeXuat.hoTen}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-clay-600">
                      {formatCurrency(p.kinhPhi)}
                    </td>
                    <td className="px-4 py-3">
                      <p>
                        <span className="text-moss-600">{p.voteStats.agreeCount} đồng ý</span>
                        {" · "}
                        <span className="text-rust-600">
                          {p.voteStats.disagreeCount} không đồng ý
                        </span>
                      </p>
                      <p className="text-xs text-ink/40">
                        {p.voteStats.totalValidVotes} phiếu hợp lệ
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <ul className="flex flex-col gap-1 text-xs">
                        <li className={passesVote ? "text-moss-600" : "text-ink/40"}>
                          {passesVote ? "✓" : "✕"} AGREE &gt; DISAGREE
                        </li>
                        <li className={hasEnoughBalance ? "text-moss-600" : "text-rust-600"}>
                          {hasEnoughBalance ? "✓" : "✕"} Đủ số dư quỹ
                        </li>
                      </ul>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-2">
                          <button
                            disabled={!canApprove || actioningId === p.id}
                            onClick={() => handleApprove(p)}
                            className="rounded-md bg-moss-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-moss-700 disabled:cursor-not-allowed disabled:opacity-40"
                            title={
                              !canApprove
                                ? "Chưa đủ điều kiện phê duyệt"
                                : "Phê duyệt đề xuất"
                            }
                          >
                            {actioningId === p.id ? "Đang xử lý..." : "Phê duyệt"}
                          </button>
                          <button
                            disabled={actioningId === p.id}
                            onClick={() => handleReject(p)}
                            className="rounded-md border border-rust-500/40 px-3 py-1.5 text-xs font-medium text-rust-600 transition hover:bg-rust-500/10 disabled:opacity-40"
                          >
                            Từ chối
                          </button>
                        </div>
                        {rowError[p.id] && (
                          <p className="max-w-[220px] text-xs text-rust-600">
                            {rowError[p.id]}
                          </p>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function TreasurerProposalsPage() {
  return (
    <RoleGuard allow={["ADMIN", "THU_QUY"]}>
      <TreasurerProposalsContent />
    </RoleGuard>
  );
}
