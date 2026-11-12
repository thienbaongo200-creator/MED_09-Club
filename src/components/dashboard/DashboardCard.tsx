import Link from "next/link";

export function DashboardCard({
  title,
  description,
  href,
  children
}: {
  title: string;
  description: string;
  href: string;
  children?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex h-full flex-col rounded-lg border border-ink/10 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-moss-500/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss-600"
    >
      <span className="font-display text-lg text-ink group-hover:text-moss-700">{title}</span>
      <span className="mt-1 text-sm text-ink/60">{description}</span>
      {children && <span className="mt-4 text-sm text-ink/80">{children}</span>}
      <span className="mt-auto pt-5 text-sm font-medium text-moss-700">Mở trang <span aria-hidden="true">→</span></span>
    </Link>
  );
}
