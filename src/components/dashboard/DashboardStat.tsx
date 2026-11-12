export function DashboardStat({
  label,
  value,
  detail
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <article className="rounded-lg border border-ink/10 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-medium text-ink/60">{label}</h3>
      <p className="mt-3 break-words font-display text-2xl text-ink sm:text-3xl">{value}</p>
      {detail && <p className="mt-2 text-sm text-ink/50">{detail}</p>}
    </article>
  );
}
