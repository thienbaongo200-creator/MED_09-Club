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
      className="group flex flex-col gap-1 border-b border-ink/10 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss-600 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
    >
      <span className="font-medium text-ink group-hover:text-moss-700">{title}</span>
      <span className="text-sm text-ink/60 sm:flex-1">{description}</span>
      {children && <span className="text-sm text-ink/80">{children}</span>}
    </Link>
  );
}
