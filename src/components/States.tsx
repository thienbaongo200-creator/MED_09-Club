export function LoadingState({ label = "Đang tải dữ liệu..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-moss-700">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-moss-200 border-t-moss-600" />
      <p className="font-body text-sm">{label}</p>
    </div>
  );
}

export function EmptyState({
  title = "Chưa có dữ liệu",
  description
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-moss-200 bg-white/60 py-16 text-center">
      <p className="font-display text-lg text-ink">{title}</p>
      {description && (
        <p className="max-w-sm font-body text-sm text-ink/60">{description}</p>
      )}
    </div>
  );
}

export function ErrorState({
  message = "Đã xảy ra lỗi khi tải dữ liệu.",
  onRetry
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-rust-500/30 bg-rust-500/5 py-14 text-center">
      <p className="font-body text-sm text-rust-600">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-md border border-rust-500/40 px-4 py-1.5 font-body text-sm text-rust-600 transition hover:bg-rust-500/10"
        >
          Thử lại
        </button>
      )}
    </div>
  );
}

export function ForbiddenState({
  message = "Bạn không có quyền xem nội dung này (403)."
}: {
  message?: string;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-2 rounded-lg border border-ink/10 bg-white py-16 text-center">
      <span className="font-mono text-xs uppercase tracking-wide text-clay-500">
        403
      </span>
      <p className="font-display text-lg text-ink">Không đủ quyền truy cập</p>
      <p className="font-body text-sm text-ink/60">{message}</p>
    </div>
  );
}
