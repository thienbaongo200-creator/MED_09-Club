-- MED-09 schema script for database QuanLyCLBDB; all application tables use schema dbo.

-- 1. Tạo Schema dbo (nếu chưa có) và Extension tạo UUID
CREATE SCHEMA IF NOT EXISTS dbo;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Xóa bảng cũ theo thứ tự phụ thuộc (nếu đã tồn tại)
DROP TABLE IF EXISTS dbo.chung_tu CASCADE;
DROP TABLE IF EXISTS dbo.giao_dich_quy CASCADE;
DROP TABLE IF EXISTS dbo.bieu_quyet CASCADE;
DROP TABLE IF EXISTS dbo.de_xuat_chi CASCADE;
DROP TABLE IF EXISTS dbo.su_kien_thanh_vien CASCADE;
DROP TABLE IF EXISTS dbo.su_kien CASCADE;
DROP TABLE IF EXISTS dbo.thanh_vien CASCADE;

-- 3. Tạo các bảng dữ liệu

CREATE TABLE dbo.thanh_vien (
    id UUID NOT NULL CONSTRAINT PK_thanh_vien PRIMARY KEY DEFAULT uuid_generate_v4(),
    ho_ten VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL CONSTRAINT UQ_thanh_vien_email UNIQUE,
    so_dien_thoai VARCHAR(20) NULL,
    mat_khau_hash VARCHAR(255) NOT NULL,
    vai_tro VARCHAR(20) NOT NULL,
    trang_thai VARCHAR(20) NOT NULL,
    ngay_tham_gia DATE NOT NULL CONSTRAINT DF_thanh_vien_ngay DEFAULT CURRENT_DATE,
    ngay_cap_nhat TIMESTAMP NULL,
    nguoi_cap_nhat_id UUID NULL,
    CONSTRAINT CK_thanh_vien_vai_tro CHECK (vai_tro IN ('ADMIN','THU_QUY','THANH_VIEN')),
    CONSTRAINT CK_thanh_vien_trang_thai CHECK (trang_thai IN ('ACTIVE','INACTIVE')),
    CONSTRAINT FK_thanh_vien_nguoi_cap_nhat FOREIGN KEY (nguoi_cap_nhat_id) REFERENCES dbo.thanh_vien(id)
);

CREATE TABLE dbo.su_kien (
    id UUID NOT NULL CONSTRAINT PK_su_kien PRIMARY KEY DEFAULT uuid_generate_v4(),
    ten VARCHAR(200) NOT NULL,
    mo_ta TEXT NULL,
    dia_diem VARCHAR(200) NULL,
    thoi_gian_bat_dau TIMESTAMP NOT NULL,
    thoi_gian_ket_thuc TIMESTAMP NOT NULL,
    nguoi_phu_trach_id UUID NOT NULL,
    ngay_tao TIMESTAMP NOT NULL CONSTRAINT DF_su_kien_ngay_tao DEFAULT NOW(),
    CONSTRAINT CK_su_kien_thoi_gian CHECK (thoi_gian_ket_thuc > thoi_gian_bat_dau),
    CONSTRAINT FK_su_kien_phu_trach FOREIGN KEY (nguoi_phu_trach_id) REFERENCES dbo.thanh_vien(id)
);

CREATE TABLE dbo.su_kien_thanh_vien (
    id UUID NOT NULL CONSTRAINT PK_su_kien_thanh_vien PRIMARY KEY DEFAULT uuid_generate_v4(),
    su_kien_id UUID NOT NULL,
    thanh_vien_id UUID NOT NULL,
    trang_thai VARCHAR(20) NOT NULL,
    ngay_dang_ky TIMESTAMP NOT NULL CONSTRAINT DF_skt_ngay_dang_ky DEFAULT NOW(),
    thoi_gian_diem_danh TIMESTAMP NULL,
    nguoi_diem_danh_id UUID NULL,
    CONSTRAINT UQ_skt_su_kien_thanh_vien UNIQUE (su_kien_id, thanh_vien_id),
    CONSTRAINT CK_skt_trang_thai CHECK (trang_thai IN ('REGISTERED','ATTENDED','ABSENT')),
    CONSTRAINT CK_skt_diem_danh CHECK (trang_thai = 'REGISTERED' OR thoi_gian_diem_danh IS NOT NULL),
    CONSTRAINT FK_skt_su_kien FOREIGN KEY (su_kien_id) REFERENCES dbo.su_kien(id),
    CONSTRAINT FK_skt_thanh_vien FOREIGN KEY (thanh_vien_id) REFERENCES dbo.thanh_vien(id),
    CONSTRAINT FK_skt_nguoi_diem_danh FOREIGN KEY (nguoi_diem_danh_id) REFERENCES dbo.thanh_vien(id)
);

CREATE TABLE dbo.de_xuat_chi (
    id UUID NOT NULL CONSTRAINT PK_de_xuat_chi PRIMARY KEY DEFAULT uuid_generate_v4(),
    nguoi_tao_id UUID NOT NULL,
    tieu_de VARCHAR(200) NOT NULL,
    noi_dung TEXT NULL,
    kinh_phi NUMERIC(18,2) NOT NULL,
    trang_thai VARCHAR(20) NOT NULL,
    ngay_tao TIMESTAMP NOT NULL CONSTRAINT DF_de_xuat_ngay_tao DEFAULT NOW(),
    nguoi_xu_ly_id UUID NULL,
    ngay_xu_ly TIMESTAMP NULL,
    ghi_chu_xu_ly TEXT NULL,
    CONSTRAINT CK_de_xuat_kinh_phi CHECK (kinh_phi > 0),
    CONSTRAINT CK_de_xuat_trang_thai CHECK (trang_thai IN ('PENDING','APPROVED','REJECTED')),
    CONSTRAINT CK_de_xuat_xu_ly CHECK ((trang_thai = 'PENDING' AND nguoi_xu_ly_id IS NULL) OR (trang_thai <> 'PENDING' AND nguoi_xu_ly_id IS NOT NULL)),
    CONSTRAINT CK_de_xuat_khong_tu_duyet CHECK (trang_thai <> 'APPROVED' OR nguoi_xu_ly_id <> nguoi_tao_id),
    CONSTRAINT FK_de_xuat_nguoi_tao FOREIGN KEY (nguoi_tao_id) REFERENCES dbo.thanh_vien(id),
    CONSTRAINT FK_de_xuat_nguoi_xu_ly FOREIGN KEY (nguoi_xu_ly_id) REFERENCES dbo.thanh_vien(id)
);

CREATE TABLE dbo.bieu_quyet (
    id UUID NOT NULL CONSTRAINT PK_bieu_quyet PRIMARY KEY DEFAULT uuid_generate_v4(),
    de_xuat_id UUID NOT NULL,
    thanh_vien_id UUID NOT NULL,
    ket_qua VARCHAR(20) NOT NULL,
    ngay_bieu_quyet TIMESTAMP NOT NULL CONSTRAINT DF_bieu_quyet_ngay DEFAULT NOW(),
    ghi_chu TEXT NULL,
    CONSTRAINT UQ_bieu_quyet_de_xuat_thanh_vien UNIQUE (de_xuat_id, thanh_vien_id),
    CONSTRAINT CK_bieu_quyet_ket_qua CHECK (ket_qua IN ('AGREE','DISAGREE')),
    CONSTRAINT FK_bieu_quyet_de_xuat FOREIGN KEY (de_xuat_id) REFERENCES dbo.de_xuat_chi(id),
    CONSTRAINT FK_bieu_quyet_thanh_vien FOREIGN KEY (thanh_vien_id) REFERENCES dbo.thanh_vien(id)
);

CREATE TABLE dbo.giao_dich_quy (
    id UUID NOT NULL CONSTRAINT PK_giao_dich_quy PRIMARY KEY DEFAULT uuid_generate_v4(),
    loai VARCHAR(10) NOT NULL,
    so_tien NUMERIC(18,2) NOT NULL,
    noi_dung TEXT NULL,
    ngay_giao_dich TIMESTAMP NOT NULL CONSTRAINT DF_giao_dich_ngay DEFAULT NOW(),
    nguoi_thuc_hien_id UUID NOT NULL,
    de_xuat_id UUID NULL,
    giao_dich_goc_id UUID NULL,
    ngay_cap_nhat TIMESTAMP NULL,
    nguoi_cap_nhat_id UUID NULL,
    CONSTRAINT CK_giao_dich_loai CHECK (loai IN ('THU','CHI')),
    CONSTRAINT CK_giao_dich_so_tien CHECK (so_tien > 0),
    CONSTRAINT CK_giao_dich_de_xuat_chi CHECK (de_xuat_id IS NULL OR loai = 'CHI'),
    CONSTRAINT FK_giao_dich_nguoi_thuc_hien FOREIGN KEY (nguoi_thuc_hien_id) REFERENCES dbo.thanh_vien(id),
    CONSTRAINT FK_giao_dich_de_xuat FOREIGN KEY (de_xuat_id) REFERENCES dbo.de_xuat_chi(id),
    CONSTRAINT FK_giao_dich_goc FOREIGN KEY (giao_dich_goc_id) REFERENCES dbo.giao_dich_quy(id),
    CONSTRAINT FK_giao_dich_nguoi_cap_nhat FOREIGN KEY (nguoi_cap_nhat_id) REFERENCES dbo.thanh_vien(id)
);

CREATE UNIQUE INDEX UX_giao_dich_quy_de_xuat ON dbo.giao_dich_quy(de_xuat_id) WHERE de_xuat_id IS NOT NULL;
CREATE UNIQUE INDEX UX_giao_dich_quy_giao_dich_goc ON dbo.giao_dich_quy(giao_dich_goc_id) WHERE giao_dich_goc_id IS NOT NULL;

CREATE TABLE dbo.chung_tu (
    id UUID NOT NULL CONSTRAINT PK_chung_tu PRIMARY KEY DEFAULT uuid_generate_v4(),
    giao_dich_id UUID NOT NULL,
    nguoi_tai_len_id UUID NOT NULL,
    ten_tep VARCHAR(255) NOT NULL,
    loai_tep VARCHAR(100) NOT NULL,
    kich_thuoc BIGINT NOT NULL,
    object_key VARCHAR(255) NOT NULL CONSTRAINT UQ_chung_tu_object_key UNIQUE,
    ngay_tai_len TIMESTAMP NOT NULL CONSTRAINT DF_chung_tu_ngay DEFAULT NOW(),
    CONSTRAINT CK_chung_tu_kich_thuoc CHECK (kich_thuoc > 0),
    CONSTRAINT FK_chung_tu_giao_dich FOREIGN KEY (giao_dich_id) REFERENCES dbo.giao_dich_quy(id),
    CONSTRAINT FK_chung_tu_nguoi_tai_len FOREIGN KEY (nguoi_tai_len_id) REFERENCES dbo.thanh_vien(id)
);
