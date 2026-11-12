"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ApiError } from "@/lib/api";
import { vietnameseNativeValidationHandlers } from "@/lib/form-validation";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
      router.replace("/");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          err.status === 400 || err.status === 401
            ? "Email hoặc mật khẩu không đúng."
            : err.message
        );
      } else {
        setError("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-6">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-lg border border-ink/10 bg-white shadow-sm md:grid-cols-5">
        <div className="hidden flex-col justify-between bg-moss-800 p-8 text-moss-50 md:col-span-2 md:flex">
          <div>
            <p className="font-mono text-xs uppercase tracking-wide text-moss-300">
              MED-09
            </p>
            <h1 className="mt-3 font-display text-3xl leading-tight">
              Câu lạc bộ &amp; Quỹ hoạt động
            </h1>
          </div>
          <p className="font-body text-sm text-moss-200">
            Minh bạch từng khoản thu chi, bảo vệ dữ liệu cá nhân thành viên.
          </p>
        </div>

        <form {...vietnameseNativeValidationHandlers} onSubmit={handleSubmit} className="col-span-3 flex flex-col gap-5 p-8 md:p-10">
          <div>
            <h2 className="font-display text-2xl text-ink">Đăng nhập</h2>
            <p className="mt-1 font-body text-sm text-ink/60">
              Sử dụng tài khoản thành viên câu lạc bộ để tiếp tục.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-md border border-rust-500/30 bg-rust-500/5 px-3 py-2 font-body text-sm text-rust-600"
            >
              {error}
            </div>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="font-body text-sm font-medium text-ink/80">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ten@clb.edu.vn"
              className="rounded-md border border-ink/15 px-3 py-2 font-body text-sm text-ink outline-none transition focus:border-moss-500 focus:ring-2 focus:ring-moss-500/20"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="font-body text-sm font-medium text-ink/80">Mật khẩu</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="rounded-md border border-ink/15 px-3 py-2 font-body text-sm text-ink outline-none transition focus:border-moss-500 focus:ring-2 focus:ring-moss-500/20"
            />
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 rounded-md bg-moss-600 px-4 py-2.5 font-body text-sm font-medium text-white transition hover:bg-moss-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>

          <p className="text-center font-body text-xs text-ink/40">
            Hệ thống phân quyền theo 3 vai trò: Thành viên, Thủ quỹ, Quản trị viên.
          </p>
        </form>
      </div>
    </div>
  );
}
