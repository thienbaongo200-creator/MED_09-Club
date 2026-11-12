// Các kiểu dữ liệu dùng chung, bám theo báo cáo phân tích thiết kế MED-09
// (Entity classes: ThanhVien, GiaoDichQuy, DeXuatChi, BieuQuyet, SuKien...)

export type VaiTro = "ADMIN" | "THU_QUY" | "THANH_VIEN";
export type TrangThaiTaiKhoan = "ACTIVE" | "INACTIVE";

export interface ThanhVien {
  id: string;
  hoTen: string;
  email: string;
  soDienThoai?: string | null;
  vaiTro: VaiTro;
  trangThai: TrangThaiTaiKhoan;
  ngayThamGia: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken?: string;
  user: ThanhVien;
}

// --- Quỹ & Giao dịch (BR01, BR02) ---

export type LoaiGiaoDich = "THU" | "CHI";

/**
 * PublicStatementDto — DTO công khai, đã được Backend áp dụng
 * Data Masking (BR02) trước khi trả về Frontend. Frontend KHÔNG được
 * nhận PII nguyên bản và không tự ý masking lại.
 */
export interface PublicStatementDto {
  id: string;
  ngayTao: string;
  loai: LoaiGiaoDich;
  noiDung: string;
  soTien: number;
  // Đã masking sẵn từ Backend, ví dụ: "Nguyễn Văn A (090*****23)"
  nguoiThucHien: string;
  email: string | null;
  soDienThoai: string | null;
  deXuatId?: string | null;
  // Chỉ true khi API xác nhận người dùng hiện tại có quyền xem/tải chứng từ
  coChungTu: boolean;
}

export interface FundSummaryDto {
  soDuHienTai: number;
  tongThu: number;
  tongChi: number;
  capNhatLuc: string;
}

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface FundTransactionFilter {
  page?: number;
  pageSize?: number;
  tuNgay?: string;
  denNgay?: string;
  loai?: LoaiGiaoDich | "ALL";
  keyword?: string;
}

// --- Đề xuất chi & Biểu quyết (BR03, BR04) ---

export type TrangThaiDeXuat = "PENDING" | "APPROVED" | "REJECTED";
export type KetQuaVote = "AGREE" | "DISAGREE";

export interface ProposalVoteStats {
  agreeCount: number;
  disagreeCount: number;
  totalValidVotes: number;
  agreePercent: number;
  disagreePercent: number;
  currentUserVoted: boolean;
  currentUserVote: KetQuaVote | null;
}

export interface DeXuatChiDto {
  id: string;
  tieuDe: string;
  noiDung: string;
  kinhPhi: number;
  nguoiDeXuat: {
    id: string;
    hoTen: string;
  };
  trangThai: TrangThaiDeXuat;
  ngayTao: string;
  chungTuUrl?: string | null;
  voteStats: ProposalVoteStats;
  // Có mặt khi Backend đã đối chiếu điều kiện điều kiện duyệt (dùng cho UI Thủ quỹ)
  duDieuKienDuyet?: boolean;
}

export interface CreateProposalInput {
  tieuDe: string;
  noiDung: string;
  kinhPhi: number;
}

export interface VoteInput {
  ketQua: KetQuaVote;
}

export interface ApproveProposalResult {
  deXuatId: string;
  trangThai: "APPROVED";
  giaoDich: {
    id: string;
    loai: "CHI";
    soTien: number;
    ngayTao: string;
    deXuatId: string;
  };
}

// --- Sự kiện & Điểm danh ---

export type TrangThaiThamGia =
  | "REGISTERED"
  | "ATTENDED"
  | "ABSENT";

export interface SuKienDto {
  id: string;
  tenSuKien: string;
  moTa?: string | null;
  diaDiem?: string | null;
  thoiGianBatDau: string;
  thoiGianKetThuc: string;
  soLuongDangKy: number;
  soLuongDiemDanh: number;
  // Trạng thái đăng ký của người dùng hiện tại, nếu có
  trangThaiCuaToi?: TrangThaiThamGia | null;
}

export interface ThanhVienSuKienDto {
  id: string;
  thanhVien: {
    id: string;
    hoTen: string;
    email: string;
  };
  trangThai: TrangThaiThamGia;
  thoiGianDangKy: string;
  thoiGianDiemDanh?: string | null;
}

// --- Lỗi API dùng chung ---
export interface ApiErrorBody {
  statusCode: number;
  message: string;
  error?: string;
}
