export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0
  }).format(value);
}

export function formatDate(value: string, withTime = false): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {})
  }).format(d);
}

export const VAI_TRO_LABEL: Record<string, string> = {
  ADMIN: "Quản trị viên",
  THU_QUY: "Thủ quỹ",
  THANH_VIEN: "Thành viên"
};

export const TRANG_THAI_DE_XUAT_LABEL: Record<string, string> = {
  PENDING: "Đang chờ biểu quyết",
  APPROVED: "Đã phê duyệt",
  REJECTED: "Đã từ chối"
};

export const TRANG_THAI_THAM_GIA_LABEL: Record<string, string> = {
  REGISTERED: "Đã đăng ký",
  ATTENDED: "Đã điểm danh",
  ABSENT: "Vắng mặt"
};
