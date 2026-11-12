import type { ApiErrorBody } from "./types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001/api";

export class ApiError extends Error {
  status: number;
  body?: ApiErrorBody;

  constructor(status: number, message: string, body?: ApiErrorBody) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("mediclub_access_token");
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem("mediclub_access_token", token);
  else window.localStorage.removeItem("mediclub_access_token");
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
}

function buildQuery(query?: RequestOptions["query"]): string {
  if (!query) return "";
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.append(key, String(value));
    }
  });
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/**
 * apiFetch — lớp gọi API duy nhất của Frontend.
 * Mọi màn hình đều đi qua đây để: gắn JWT, chuẩn hoá lỗi 400/401/403/409,
 * và tuyệt đối không tự suy diễn/masking dữ liệu ở phía client (BR02) —
 * Frontend chỉ hiển thị nguyên trạng những gì Backend trả về.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const token = getToken();
  const formDataBody =
    typeof FormData !== "undefined" && options.body instanceof FormData
      ? options.body
      : undefined;
  const headers: Record<string, string> = {};
  if (!formDataBody) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}${buildQuery(options.query)}`, {
      method: options.method ?? "GET",
      headers,
      body: formDataBody ?? (options.body ? JSON.stringify(options.body) : undefined),
      signal: options.signal,
      cache: "no-store"
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error("Không thể kết nối tới máy chủ. Vui lòng thử lại.");
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json().catch(() => undefined) : undefined;

  if (!res.ok) {
    const body = data as ApiErrorBody | undefined;
    const responseMessage = (body as { message?: unknown } | undefined)?.message;
    const message =
      (typeof responseMessage === "string"
        ? responseMessage
        : Array.isArray(responseMessage)
        ? responseMessage.filter((item): item is string => typeof item === "string").join(" ")
        : undefined) ??
      (res.status === 401
        ? "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại."
        : res.status === 403
        ? "Bạn không có quyền thực hiện thao tác này."
        : res.status === 409
        ? "Yêu cầu xung đột với trạng thái hiện tại của dữ liệu."
        : "Đã xảy ra lỗi, vui lòng thử lại.");
    throw new ApiError(res.status, message, body);
  }

  return data as T;
}

export const api = {
  get: <T>(path: string, query?: RequestOptions["query"], signal?: AbortSignal) =>
    apiFetch<T>(path, { method: "GET", query, signal }),
  post: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    apiFetch<T>(path, { method: "POST", body, signal }),
  patch: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    apiFetch<T>(path, { method: "PATCH", body, signal }),
  delete: <T>(path: string, signal?: AbortSignal) =>
    apiFetch<T>(path, { method: "DELETE", signal })
};
