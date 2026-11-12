export function DashboardSection({
  title,
  description,
  children
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4" aria-labelledby={`section-${title}`}>
      <div>
        <h2 id={`section-${title}`} className="font-display text-xl text-ink">{title}</h2>
        {description && <p className="mt-1 text-sm text-ink/60">{description}</p>}
      </div>
      {children}
    </section>
  );
}
