"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import { RoleGuard } from "@/components/RoleGuard";
import { EmptyState, ErrorState, ForbiddenState, LoadingState } from "@/components/States";
import { Pagination } from "@/components/Pagination";
import { vietnameseNativeValidationHandlers } from "@/lib/form-validation";
import { useAuth } from "@/context/AuthContext";
import type {
  FundSummaryDto,
  FundTransactionFilter,
  PagedResult,
  PublicStatementDto
} from "@/lib/types";

const PAGE_SIZE = 10;
const MAX_VOUCHER_SIZE = 10 * 1024 * 1024;

async function getVoucherValidationError(file: File): Promise<string | null> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const allowedTypes: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png"
  };

  if (!file.size) return "Tệp chứng từ không được để trống.";
  if (file.size > MAX_VOUCHER_SIZE) return "Dung lượng chứng từ không được vượt quá 10 MB.";
  if (!extension || !allowedTypes[extension] || file.type !== allowedTypes[extension]) {
    return "Chỉ chấp nhận tệp PDF, JPG, JPEG hoặc PNG đúng định dạng.";
  }

  const displayName = file.name
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  if (!displayName || displayName.length > 255) {
    return "Tên tệp chứng từ không hợp lệ hoặc vượt quá 255 ký tự.";
  }

  const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const hasValidSignature =
    (file.type === "application/pdf" &&
      String.fromCharCode(...header.slice(0, 5)) === "%PDF-") ||
    (file.type === "image/jpeg" &&
      header.length >= 3 &&
      header[0] === 0xff &&
      header[1] === 0xd8 &&
      header[2] === 0xff) ||
    (file.type === "image/png" &&
      header.length >= 8 &&
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
        (byte, index) => header[index] === byte
      ));
  if (!hasValidSignature) {
    return "Nội dung tệp không khớp định dạng PDF, JPEG hoặc PNG.";
  }

  return null;
}

function FundPageContent() {
  const { hasRole } = useAuth();
  const [summary, setSummary] = useState<FundSummaryDto | null>(null);
  const [result, setResult] = useState<PagedResult<PublicStatementDto> | null>(
    null
  );
  const [filter, setFilter] = useState<FundTransactionFilter>({
    page: 1,
    pageSize: PAGE_SIZE,
    loai: "ALL"
  });
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "forbidden">(
    "loading"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transactionError, setTransactionError] = useState<string | null>(null);
  const [transactionMessage, setTransactionMessage] = useState<string | null>(null);
  const [isSubmittingTransaction, setIsSubmittingTransaction] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<PublicStatementDto | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editMessage, setEditMessage] = useState<string | null>(null);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [voucherFile, setVoucherFile] = useState<File | null>(null);
  const [voucherValidationError, setVoucherValidationError] = useState<string | null>(null);
  const [isValidatingVoucher, setIsValidatingVoucher] = useState(false);
  const [pendingVoucherTransactionId, setPendingVoucherTransactionId] = useState<string | null>(null);
  const transactionSubmitLock = useRef(false);
  const editSubmitLock = useRef(false);
  const voucherValidationSequence = useRef(0);

  const load = useCallback(async (f: FundTransactionFilter) => {
    setStatus("loading");
    setErrorMessage(null);
    try {
      const [summaryRes, listRes] = await Promise.all([
        api.get<FundSummaryDto>("/fund/summary"),
        api.get<PagedResult<PublicStatementDto>>("/fund/transactions", {
          page: f.page,
          pageSize: f.pageSize,
          tuNgay: f.tuNgay,
          denNgay: f.denNgay,
          loai: f.loai === "ALL" ? undefined : f.loai,
          keyword: f.keyword
        })
      ]);
      setSummary(summaryRes);
      setResult(listRes);
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
    Promise.resolve().then(() => { if (active) load(filter); });
    return () => { active = false; };
  }, [filter, load]);

  async function handleOpenVoucher(tx: PublicStatementDto) {
    if (!tx.coChungTu) return;
    try {
      // Backend xác nhận quyền rồi mới trả URL tạm thời (signed URL) —
      // Frontend không lưu/hiển thị object storage URL thô ở đâu khác.
      const { url } = await api.get<{ url: string }>(
        `/fund/transactions/${tx.id}/voucher-url`
      );
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      alert(
        err instanceof ApiError
          ? err.message
          : "Không thể mở chứng từ lúc này."
      );
    }
  }

  function handleStartEdit(tx: PublicStatementDto) {
    setEditingTransaction(tx);
    setEditError(null);
    setEditMessage(null);
  }

  async function handleUpdateTransaction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTransaction || editSubmitLock.current) return;

    const data = new FormData(event.currentTarget);
    const rawAmount = String(data.get("soTien") ?? "").trim();
    const amountPattern = /^-?\d+(?:\.\d{1,2})?$/;
    const amount = Number(rawAmount);
    const noiDung = String(data.get("noiDung") ?? "").trim();

    if (!rawAmount) {
      setEditError("Vui lòng nhập số tiền.");
      return;
    }
    if (!amountPattern.test(rawAmount) || !Number.isFinite(amount)) {
      setEditError("Số tiền không đúng định dạng (tối đa 2 chữ số thập phân).");
      return;
    }
    if (amount <= 0) {
      setEditError("Số tiền phải lớn hơn 0.");
      return;
    }
    if (!noiDung) {
      setEditError("Vui lòng nhập nội dung giao dịch.");
      return;
    }

    editSubmitLock.current = true;
    setIsSubmittingEdit(true);
    setEditError(null);
    setEditMessage(null);
    try {
      await api.patch(`/fund/transactions/${editingTransaction.id}`, {
        loai: data.get("loai"),
        soTien: amount,
        noiDung
      });
      setEditingTransaction(null);
      setEditMessage("Đã cập nhật giao dịch.");
      await load(filter);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Không thể cập nhật giao dịch.");
    } finally {
      editSubmitLock.current = false;
      setIsSubmittingEdit(false);
    }
  }

  async function handleCreateTransaction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (transactionSubmitLock.current) return;

    if (isValidatingVoucher) {
      setTransactionError("Vui lòng đợi kiểm tra chứng từ hoàn tất.");
      return;
    }
    if (voucherValidationError) {
      setTransactionError(voucherValidationError);
      return;
    }
    if (pendingVoucherTransactionId && !voucherFile) {
      setTransactionError("Chọn tệp chứng từ để tiếp tục tải lên giao dịch đã ghi nhận.");
      return;
    }

    const form = event.currentTarget;
    const data = new FormData(form);
    const rawAmount = String(data.get("soTien") ?? "").trim();
    const amountPattern = /^-?\d+(?:\.\d{1,2})?$/;
    const amount = Number(rawAmount);
    if (!rawAmount) {
      setTransactionError("Vui lòng nhập số tiền.");
      return;
    }
    if (!amountPattern.test(rawAmount) || !Number.isFinite(amount)) {
      setTransactionError("Số tiền không đúng định dạng (tối đa 2 chữ số thập phân).");
      return;
    }
    if (amount <= 0) {
      setTransactionError("Số tiền phải lớn hơn 0.");
      return;
    }

    transactionSubmitLock.current = true;
    setIsSubmittingTransaction(true);
    setTransactionError(null);
    setTransactionMessage(null);
    let transactionId = pendingVoucherTransactionId;
    let transactionCreatedNow = false;
    try {
      if (!transactionId) {
        const transaction = await api.post<{ id: string }>("/fund/transactions", {
          loai: data.get("loai"),
          soTien: amount,
          noiDung: data.get("noiDung")
        });
        transactionId = transaction.id;
        transactionCreatedNow = true;
      }

      if (voucherFile && transactionId) {
        const upload = new FormData();
        upload.append("file", voucherFile);
        await api.post<{ id: string }>(
          `/fund/transactions/${transactionId}/voucher`,
          upload
        );
      }

      form.reset();
      setVoucherFile(null);
      setVoucherValidationError(null);
      setPendingVoucherTransactionId(null);
      setTransactionMessage(
        voucherFile
          ? "Đã ghi nhận giao dịch và chứng từ."
          : "Đã ghi nhận giao dịch."
      );
      await load(filter);
    } catch (err) {
      const backendMessage = err instanceof Error ? err.message : "Không thể tạo giao dịch.";
      if (transactionCreatedNow && transactionId) {
        setPendingVoucherTransactionId(transactionId);
        setTransactionError(`Giao dịch đã ghi nhận nhưng tải chứng từ gặp lỗi: ${backendMessage}`);
        await load(filter);
      } else {
        setTransactionError(backendMessage);
      }
    } finally {
      transactionSubmitLock.current = false;
      setIsSubmittingTransaction(false);
    }
  }

  if (status === "forbidden") return <ForbiddenState />;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="font-mono text-xs uppercase tracking-wide text-clay-500">
          BR02 · Minh bạch quỹ
        </p>
        <h1 className="mt-1 font-display text-3xl text-ink">Sao kê quỹ công khai</h1>
        <p className="mt-1 max-w-2xl font-body text-sm text-ink/60">
          Thông tin người thực hiện đã được ẩn một phần bởi máy chủ trước khi hiển
          thị. Trang này không tính toán hoặc che dữ liệu thêm ở phía trình duyệt.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Số dư hiện tại"
          value={summary ? formatCurrency(summary.soDuHienTai) : "—"}
          tone="primary"
        />
        <SummaryCard
          label="Tổng thu"
          value={summary ? formatCurrency(summary.tongThu) : "—"}
        />
        <SummaryCard
          label="Tổng chi"
          value={summary ? formatCurrency(summary.tongChi) : "—"}
        />
      </section>

      {hasRole("ADMIN", "THU_QUY") && (
        <section className="rounded-lg border border-ink/10 bg-white p-4">
          <h2 className="font-display text-xl text-ink">Ghi giao dịch thủ công</h2>
          <form {...vietnameseNativeValidationHandlers} className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={handleCreateTransaction}>
            <label className="flex flex-col gap-1 text-sm">
              <span>Loại giao dịch</span>
              <select name="loai" required className="rounded-md border border-ink/15 px-2 py-2">
                <option value="THU">Thu</option>
                <option value="CHI">Chi</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>Số tiền</span>
              <input
                aria-label="Số tiền"
                data-testid="manual-transaction-amount"
                name="soTien"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                className="rounded-md border border-ink/15 px-2 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span>Nội dung</span>
              <input name="noiDung" required maxLength={2000} className="rounded-md border border-ink/15 px-2 py-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span>Chứng từ (tùy chọn)</span>
              <input
                name="chungTu"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                aria-describedby="voucher-help voucher-error"
                disabled={isSubmittingTransaction}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0] ?? null;
                  setVoucherFile(file);
                  const sequence = ++voucherValidationSequence.current;
                  setVoucherValidationError(null);
                  setIsValidatingVoucher(Boolean(file));
                  if (file) {
                    void getVoucherValidationError(file)
                      .then((error) => {
                        if (voucherValidationSequence.current === sequence) {
                          setVoucherValidationError(error);
                        }
                      })
                      .catch(() => {
                        if (voucherValidationSequence.current === sequence) {
                          setVoucherValidationError("Không thể đọc tệp chứng từ. Vui lòng chọn lại.");
                        }
                      })
                      .finally(() => {
                        if (voucherValidationSequence.current === sequence) {
                          setIsValidatingVoucher(false);
                        }
                      });
                  }
                }}
                className="rounded-md border border-ink/15 px-2 py-2 file:mr-3 file:rounded file:border-0 file:bg-moss-50 file:px-3 file:py-1.5"
              />
              <span id="voucher-help" className="text-xs text-ink/60">
                PDF, JPG, JPEG hoặc PNG; tối đa 10 MB.
              </span>
              {voucherFile && <span className="text-xs text-ink/70">Tệp đã chọn: {voucherFile.name}</span>}
              {isValidatingVoucher && (
                <span role="status" className="text-xs text-ink/60">Đang kiểm tra chứng từ…</span>
              )}
              {voucherValidationError && (
                <span id="voucher-error" role="alert" className="text-sm text-red-700">
                  {voucherValidationError}
                </span>
              )}
            </label>
            {transactionError && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{transactionError}</p>}
            {transactionMessage && <p role="status" className="text-sm text-green-700 sm:col-span-2">{transactionMessage}</p>}
            <button
              type="submit"
              disabled={isSubmittingTransaction || isValidatingVoucher || Boolean(voucherValidationError) || Boolean(pendingVoucherTransactionId && !voucherFile)}
              className="rounded-md bg-moss-700 px-4 py-2 text-white disabled:opacity-50 sm:col-span-2 sm:justify-self-start"
            >
              {isSubmittingTransaction
                ? pendingVoucherTransactionId ? "Đang tải chứng từ…" : "Đang lưu…"
                : pendingVoucherTransactionId ? "Thử tải chứng từ lại" : "Ghi giao dịch"}
            </button>
          </form>
        </section>
      )}

      <section className="flex flex-wrap items-end gap-3 rounded-lg border border-ink/10 bg-white p-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-body text-ink/60">Từ ngày</span>
          <input
            type="date"
            className="rounded-md border border-ink/15 px-2 py-1.5 font-body text-sm"
            onChange={(e) =>
              setFilter((f) => ({ ...f, page: 1, tuNgay: e.target.value || undefined }))
            }
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-body text-ink/60">Đến ngày</span>
          <input
            type="date"
            className="rounded-md border border-ink/15 px-2 py-1.5 font-body text-sm"
            onChange={(e) =>
              setFilter((f) => ({ ...f, page: 1, denNgay: e.target.value || undefined }))
            }
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-body text-ink/60">Loại giao dịch</span>
          <select
            className="rounded-md border border-ink/15 px-2 py-1.5 font-body text-sm"
            value={filter.loai}
            onChange={(e) =>
              setFilter((f) => ({ ...f, page: 1, loai: e.target.value as any }))
            }
          >
            <option value="ALL">Tất cả</option>
            <option value="THU">Thu</option>
            <option value="CHI">Chi</option>
          </select>
        </label>
        <label className="flex flex-1 min-w-[180px] flex-col gap-1 text-sm">
          <span className="font-body text-ink/60">Tìm nội dung</span>
          <input
            type="search"
            placeholder="Ví dụ: tiền thuê phòng..."
            className="rounded-md border border-ink/15 px-2 py-1.5 font-body text-sm"
            onChange={(e) =>
              setFilter((f) => ({ ...f, page: 1, keyword: e.target.value || undefined }))
            }
          />
        </label>
      </section>

      {editMessage && (
        <p role="status" className="text-sm text-moss-700">
          {editMessage}
        </p>
      )}

      {status === "loading" && <LoadingState label="Đang tải sao kê quỹ..." />}
      {status === "error" && (
        <ErrorState message={errorMessage ?? undefined} onRetry={() => load(filter)} />
      )}

      {status === "idle" && result && result.items.length === 0 && (
        <EmptyState description="Không có giao dịch nào khớp với bộ lọc hiện tại." />
      )}

      {status === "idle" && result && result.items.length > 0 && (
        <section className="overflow-hidden rounded-lg border border-ink/10 bg-white">
          <table className="w-full border-collapse text-left font-body text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-moss-50/60 text-ink/60">
                <th className="px-4 py-3 font-medium">Ngày</th>
                <th className="px-4 py-3 font-medium">Loại</th>
                <th className="px-4 py-3 font-medium">Nội dung</th>
                <th className="px-4 py-3 text-right font-medium">Số tiền</th>
                <th className="px-4 py-3 font-medium">Người thực hiện</th>
                <th className="px-4 py-3 font-medium">
                  {hasRole("ADMIN", "THU_QUY") ? "Chứng từ / Thao tác" : "Chứng từ"}
                </th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((tx) => (
                <tr key={tx.id} className="border-b border-ink/5 last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-ink/70">
                    {formatDate(tx.ngayTao)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        tx.loai === "THU"
                          ? "font-medium text-moss-600"
                          : "font-medium text-rust-600"
                      }
                    >
                      {tx.loai === "THU" ? "Thu" : "Chi"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink/80">{tx.noiDung}</td>
                  <td
                    className={`whitespace-nowrap px-4 py-3 text-right font-medium ${
                      tx.loai === "THU" ? "text-moss-600" : "text-rust-600"
                    }`}
                  >
                    {tx.loai === "THU" ? "+" : "-"}
                    {formatCurrency(tx.soTien)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-ink/60">
                    {tx.nguoiThucHien}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {hasRole("ADMIN", "THU_QUY") && tx.coChungTu && (
                        <button
                          onClick={() => handleOpenVoucher(tx)}
                          className="rounded-md border border-ink/15 px-2.5 py-1 text-xs transition hover:bg-ink/5"
                          title="Mở chứng từ bằng URL ký có thời hạn"
                        >
                          Xem chứng từ
                        </button>
                      )}
                      {hasRole("ADMIN", "THU_QUY") && !tx.deXuatId && (
                        <button
                          type="button"
                          onClick={() => handleStartEdit(tx)}
                          aria-label={`Sửa giao dịch ${tx.noiDung}`}
                          className="rounded-md border border-ink/15 px-2.5 py-1 text-xs text-ink hover:bg-ink/5"
                        >
                          Sửa
                        </button>
                      )}
                      {(!hasRole("ADMIN", "THU_QUY") || (!tx.coChungTu && Boolean(tx.deXuatId))) && (
                        <span className="text-ink/40">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-3">
            <Pagination
              page={result.page}
              totalPages={result.totalPages}
              onChange={(page) => setFilter((f) => ({ ...f, page }))}
            />
          </div>
        </section>
      )}

      {editingTransaction && hasRole("ADMIN", "THU_QUY") && (
        <section aria-labelledby="edit-transaction-title" className="rounded-lg border border-ink/10 bg-white p-4">
          <h2 id="edit-transaction-title" className="font-display text-xl text-ink">
            Sửa giao dịch
          </h2>
          <p className="mt-2 text-sm text-ink/60">
            Sao kê đã che thông tin liên hệ. Hãy nhập lại đầy đủ nội dung giao dịch trước khi lưu.
          </p>
          <form
            {...vietnameseNativeValidationHandlers}
            className="mt-3 grid gap-3 sm:grid-cols-2"
            onSubmit={handleUpdateTransaction}
          >
            <label className="flex flex-col gap-1 text-sm">
              <span>Loại giao dịch</span>
              <select
                name="loai"
                defaultValue={editingTransaction.loai}
                required
                className="rounded-md border border-ink/15 px-2 py-2"
              >
                <option value="THU">Thu</option>
                <option value="CHI">Chi</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>Số tiền</span>
              <input
                name="soTien"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                defaultValue={String(editingTransaction.soTien)}
                required
                aria-describedby="edit-transaction-help"
                className="rounded-md border border-ink/15 px-2 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span>Nội dung</span>
              <textarea
                name="noiDung"
                maxLength={2000}
                required
                rows={3}
                className="rounded-md border border-ink/15 px-3 py-2"
              />
            </label>
            <p id="edit-transaction-help" className="text-xs text-ink/60 sm:col-span-2">
              Số tiền phải lớn hơn 0, tối đa 2 chữ số thập phân; số dư quỹ không được âm.
            </p>
            {editError && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{editError}</p>}
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <button
                type="submit"
                disabled={isSubmittingEdit}
                className="rounded-md bg-moss-700 px-4 py-2 text-white disabled:opacity-50"
              >
                {isSubmittingEdit ? "Đang lưu…" : "Lưu thay đổi"}
              </button>
              <button
                type="button"
                disabled={isSubmittingEdit}
                onClick={() => {
                  setEditingTransaction(null);
                  setEditError(null);
                }}
                className="rounded-md border border-ink/15 px-4 py-2 text-ink disabled:opacity-50"
              >
                Hủy
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone?: "primary";
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        tone === "primary"
          ? "border-moss-600/30 bg-moss-700 text-moss-50"
          : "border-ink/10 bg-white text-ink"
      }`}
    >
      <p
        className={`font-body text-xs uppercase tracking-wide ${
          tone === "primary" ? "text-moss-200" : "text-ink/50"
        }`}
      >
        {label}
      </p>
      <p className="mt-2 font-display text-2xl">{value}</p>
    </div>
  );
}

export default function FundPage() {
  return (
    <RoleGuard allow={["ADMIN", "THU_QUY", "THANH_VIEN"]}>
      <FundPageContent />
    </RoleGuard>
  );
}
