import Link from "next/link";

export default function NotFound() {
  return (
    <section
      aria-labelledby="not-found-title"
      className="mx-auto flex max-w-xl flex-col items-center gap-3 rounded-lg border border-ink/10 bg-white p-8 text-center"
    >
      <p className="font-mono text-sm text-clay-500">404</p>
      <h1 id="not-found-title" className="font-display text-2xl text-ink">
        Không tìm thấy trang
      </h1>
      <p className="text-sm text-ink/60">
        Địa chỉ bạn truy cập không tồn tại hoặc đã được thay đổi.
      </p>
      <Link
        href="/"
        className="rounded-md bg-moss-600 px-4 py-2 text-sm text-white hover:bg-moss-700"
      >
        Về trang chủ
      </Link>
    </section>
  );
}
