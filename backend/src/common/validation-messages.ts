import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

const FIELD_LABELS: Record<string, string> = {
  email: 'Email',
  ghiChu: 'Ghi chú',
  hoTen: 'Họ tên',
  kinhPhi: 'Kinh phí',
  ketQua: 'Kết quả biểu quyết',
  loai: 'Loại giao dịch',
  matKhau: 'Mật khẩu',
  moTa: 'Mô tả',
  noiDung: 'Nội dung',
  soDienThoai: 'Số điện thoại',
  soTien: 'Số tiền',
  tenSuKien: 'Tên sự kiện',
  thanhVienId: 'Thành viên',
  thoiGianBatDau: 'Thời gian bắt đầu',
  thoiGianKetThuc: 'Thời gian kết thúc',
  tieuDe: 'Tiêu đề',
  trangThai: 'Trạng thái',
  tuNgay: 'Từ ngày',
  denNgay: 'Đến ngày',
  diaDiem: 'Địa điểm',
  vaiTro: 'Vai trò',
  password: 'Mật khẩu',
};

function validationMessage(error: ValidationError, constraint: string, value: unknown): string {
  const field = FIELD_LABELS[error.property] ?? 'Giá trị';
  const limit = error.constraints?.[constraint]?.match(/\d+(?:\.\d+)?/)?.[0];

  if (constraint === 'whitelistValidation') return `Trường "${error.property}" không được hỗ trợ.`;
  if (value === undefined || value === null || value === '') return `${field} không được để trống.`;

  switch (constraint) {
    case 'isEmail': return 'Email không hợp lệ.';
    case 'isString': return `${field} phải là văn bản.`;
    case 'isNotEmpty':
    case 'isDefined': return `${field} không được để trống.`;
    case 'minLength': return `${field} phải có ít nhất ${limit ?? 'một số'} ký tự.`;
    case 'maxLength': return `${field} không được vượt quá ${limit ?? 'giới hạn cho phép'} ký tự.`;
    case 'min': return `${field} phải lớn hơn 0.`;
    case 'isNumber': return `${field} phải là số hợp lệ${['soTien', 'kinhPhi'].includes(error.property) ? ' và có tối đa 2 chữ số thập phân' : ''}.`;
    case 'isDateString': return `${field} phải là ngày hợp lệ.`;
    case 'isUUID': return `${field} không hợp lệ.`;
    case 'isIn': return `${field} không hợp lệ.`;
    default: return `${field} không hợp lệ.`;
  }
}

function flattenValidationErrors(errors: ValidationError[]): string[] {
  return errors.flatMap((error) => [
    ...Object.keys(error.constraints ?? {}).map((constraint) =>
      validationMessage(error, constraint, error.value),
    ),
    ...flattenValidationErrors(error.children ?? []),
  ]);
}

export function createLocalizedValidationException(errors: ValidationError[]): BadRequestException {
  return new BadRequestException([...new Set(flattenValidationErrors(errors))]);
}

export const localizedUuidPipe = new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException('Mã định danh không hợp lệ.'),
});
