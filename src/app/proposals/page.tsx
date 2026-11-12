"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { formatCurrency, formatDate, TRANG_THAI_DE_XUAT_LABEL } from "@/lib/format";
import { RoleGuard } from "@/components/RoleGuard";
import { EmptyState, ErrorState, ForbiddenState, LoadingState } from "@/components/States";
import { StatusBadge } from "@/components/StatusBadge";
import type { DeXuatChiDto, KetQuaVote, TrangThaiDeXuat } from "@/lib/types";

const TABS: { key: TrangThaiDeXuat; label: string }[] = [
  { key: "PENDING", label: "Đang chờ biểu quyết" },
  { key: "APPROVED", label: "Đã phê duyệt" },
  { key: "REJECTED", label: "Đã từ chối" }
];

function ProposalsPageContent() {
  const [tab, setTab] = useState<TrangThaiDeXuat>("PENDING");
  const [proposals, setProposals] = useState<DeXuatChiDto[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "forbidden">(
    "loading"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async (trangThai: TrangThaiDeXuat) => {
    setStatus("loading");
    setErrorMessage(null);
    try {
      const res = await api.get<{ items: DeXuatChiDto[] }>("/proposals", {
        trangThai
      });
      setProposals(res.items);
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
    Promise.resolve().then(() => { if (active) load(tab); });
    return () => { active = false; };
  }, [tab, load]);

  function handleVoted(updated: DeXuatChiDto) {
    setProposals((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  if (status === "forbidden") return <ForbiddenState />;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-clay-500">
            Đề xuất & Biểu quyết
          </p>
          <h1 className="mt-1 font-display text-3xl text-ink">
            Biểu quyết đề xuất chi
          </h1>
          <p className="mt-1 max-w-2xl font-body text-sm text-ink/60">
            Mỗi thành viên chỉ được bỏ phiếu một lần cho mỗi đề xuất (BR04). Kết quả
            do máy chủ tổng hợp và quyết định — giao diện chỉ hiển thị.
          </p>
        </div>
        <button
          onClick={() => setShowCreate((s) => !s)}
          className="rounded-md bg-moss-600 px-4 py-2 font-body text-sm font-medium text-white transition hover:bg-moss-700"
        >
          {showCreate ? "Đóng" : "+ Tạo đề xuất"}
        </button>
      </header>

      {showCreate && (
        <CreateProposalForm
          onCreated={() => {
            setShowCreate(false);
            if (tab === "PENDING") load("PENDING");
            else setTab("PENDING");
          }}
        />
      )}

      <div className="flex gap-1 border-b border-ink/10">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 font-body text-sm transition ${
              tab === t.key
                ? "border-moss-600 font-medium text-moss-700"
                : "border-transparent text-ink/50 hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {status === "loading" && <LoadingState label="Đang tải danh sách đề xuất..." />}
      {status === "error" && (
        <ErrorState message={errorMessage ?? undefined} onRetry={() => load(tab)} />
      )}
      {status === "idle" && proposals.length === 0 && (
        <EmptyState description="Không có đề xuất nào ở trạng thái này." />
      )}

      <div className="grid gap-4">
        {status === "idle" &&
          proposals.map((p) => (
            <ProposalCard key={p.id} proposal={p} onVoted={handleVoted} />
          ))}
      </div>
    </div>
  );
}

function ProposalCard({
  proposal,
  onVoted
}: {
  proposal: DeXuatChiDto;
  onVoted: (p: DeXuatChiDto) => void;
}) {
  const [isVoting, setIsVoting] = useState<KetQuaVote | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);
  const stats = proposal.voteStats;

  async function handleVote(ketQua: KetQuaVote) {
    setVoteError(null);
    setIsVoting(ketQua);
    try {
      const updated = await api.post<DeXuatChiDto>(
        `/proposals/${proposal.id}/vote`,
        { ketQua }
      );
      onVoted(updated);
    } catch (err) {
      setVoteError(
        err instanceof ApiError
          ? err.message
          : "Không thể gửi phiếu bầu lúc này."
      );
    } finally {
      setIsVoting(null);
    }
  }

  const canVote =
    proposal.trangThai === "PENDING" && !stats.currentUserVoted;

  return (
    <article className="flex flex-col gap-4 rounded-lg border border-ink/10 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-ink">{proposal.tieuDe}</h2>
          <p className="mt-1 font-body text-xs text-ink/50">
            Đề xuất bởi {proposal.nguoiDeXuat.hoTen} · {formatDate(proposal.ngayTao)}
          </p>
        </div>
        <StatusBadge
          status={proposal.trangThai}
          label={TRANG_THAI_DE_XUAT_LABEL[proposal.trangThai]}
        />
      </div>

      <p className="font-body text-sm leading-relaxed text-ink/80">
        {proposal.noiDung}
      </p>

      <div className="flex items-center gap-2 font-body text-sm">
        <span className="text-ink/50">Kinh phí đề xuất</span>
        <span className="font-display text-lg text-clay-600">
          {formatCurrency(proposal.kinhPhi)}
        </span>
      </div>

      <VoteBar stats={stats} />

      {voteError && (
        <p className="font-body text-sm text-rust-600">{voteError}</p>
      )}

      <div className="flex items-center gap-3">
        {stats.currentUserVoted ? (
          <span className="rounded-md border border-ink/15 bg-ink/5 px-3 py-1.5 font-body text-sm text-ink/60">
            Đã bỏ phiếu ·{" "}
            {stats.currentUserVote === "AGREE" ? "Đồng ý" : "Không đồng ý"}
          </span>
        ) : proposal.trangThai !== "PENDING" ? (
          <span className="font-body text-sm text-ink/40">
            Đề xuất đã kết thúc biểu quyết.
          </span>
        ) : (
          <>
            <button
              disabled={!canVote || isVoting !== null}
              onClick={() => handleVote("AGREE")}
              className="rounded-md bg-moss-600 px-4 py-1.5 font-body text-sm font-medium text-white transition hover:bg-moss-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isVoting === "AGREE" ? "Đang gửi..." : "Đồng ý"}
            </button>
            <button
              disabled={!canVote || isVoting !== null}
              onClick={() => handleVote("DISAGREE")}
              className="rounded-md border border-rust-500/40 px-4 py-1.5 font-body text-sm font-medium text-rust-600 transition hover:bg-rust-500/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isVoting === "DISAGREE" ? "Đang gửi..." : "Không đồng ý"}
            </button>
          </>
        )}
      </div>
    </article>
  );
}

function VoteBar({ stats }: { stats: DeXuatChiDto["voteStats"] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-ink/10">
        <div
          className="bg-moss-500"
          style={{ width: `${stats.agreePercent}%` }}
          aria-hidden
        />
        <div
          className="bg-rust-500"
          style={{ width: `${stats.disagreePercent}%` }}
          aria-hidden
        />
      </div>
      <div className="flex justify-between font-body text-xs text-ink/50">
        <span>
          Đồng ý {stats.agreeCount} ({stats.agreePercent.toFixed(0)}%)
        </span>
        <span>{stats.totalValidVotes} phiếu hợp lệ</span>
        <span>
          Không đồng ý {stats.disagreeCount} ({stats.disagreePercent.toFixed(0)}%)
        </span>
      </div>
    </div>
  );
}

function CreateProposalForm({ onCreated }: { onCreated: () => void }) {
  const [tieuDe, setTieuDe] = useState("");
  const [noiDung, setNoiDung] = useState("");
  const [kinhPhi, setKinhPhi] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const amount = Number(kinhPhi);
    if (!tieuDe.trim() || !noiDung.trim() || !(amount > 0)) {
      setError("Vui lòng nhập đầy đủ thông tin; kinh phí phải lớn hơn 0.");
      return;
    }
    setIsSubmitting(true);
    try {
      await api.post("/proposals", { tieuDe, noiDung, kinhPhi: amount });
      onCreated();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Không thể tạo đề xuất lúc này."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-lg border border-moss-300 bg-moss-50/60 p-5"
    >
      <h3 className="font-display text-lg text-ink">Tạo đề xuất chi mới</h3>
      {error && <p className="font-body text-sm text-rust-600">{error}</p>}
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-body text-ink/60">Tiêu đề</span>
        <input
          required
          value={tieuDe}
          onChange={(e) => setTieuDe(e.target.value)}
          className="rounded-md border border-ink/15 px-3 py-2 font-body text-sm"
          placeholder="Ví dụ: Mua dụng cụ cho sự kiện tháng 10"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-body text-ink/60">Nội dung chi tiết</span>
        <textarea
          required
          rows={3}
          value={noiDung}
          onChange={(e) => setNoiDung(e.target.value)}
          className="rounded-md border border-ink/15 px-3 py-2 font-body text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-body text-ink/60">Kinh phí đề xuất (VND)</span>
        <input
          required
          type="number"
          min={1}
          value={kinhPhi}
          onChange={(e) => setKinhPhi(e.target.value)}
          className="w-48 rounded-md border border-ink/15 px-3 py-2 font-body text-sm"
        />
      </label>
      <div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-moss-600 px-4 py-2 font-body text-sm font-medium text-white transition hover:bg-moss-700 disabled:opacity-60"
        >
          {isSubmitting ? "Đang gửi..." : "Gửi đề xuất"}
        </button>
      </div>
    </form>
  );
}

export default function ProposalsPage() {
  return (
    <RoleGuard allow={["ADMIN", "THU_QUY", "THANH_VIEN"]}>
      <ProposalsPageContent />
    </RoleGuard>
  );
}
