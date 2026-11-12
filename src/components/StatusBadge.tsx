const STYLES: Record<string, string> = {
  PENDING: "bg-clay-400/15 text-clay-600 border-clay-400/30",
  APPROVED: "bg-moss-100 text-moss-700 border-moss-300",
  REJECTED: "bg-rust-500/10 text-rust-600 border-rust-500/30",
  REGISTERED: "bg-moss-50 text-moss-600 border-moss-200",
  ATTENDED: "bg-moss-100 text-moss-700 border-moss-300",
  ABSENT: "bg-ink/5 text-ink/50 border-ink/15"
};

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-body text-xs font-medium ${
        STYLES[status] ?? "border-ink/15 bg-ink/5 text-ink/60"
      }`}
    >
      {label}
    </span>
  );
}
