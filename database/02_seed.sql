-- MED-09 sample data for QuanLyCLBDB. Apply after 01_schema.sql.
-- 4. Chèn Dữ Liệu Mẫu

INSERT INTO dbo.thanh_vien(id, ho_ten, email, so_dien_thoai, mat_khau_hash, vai_tro, trang_thai) VALUES
('00000000-0000-0000-0000-0000000000a1', N'Quản trị D',   'admin@gmail.com',  '0900000001', '$2a$10$i4J7CDFfFXX9hJjvHxgXpuDHrjfKTmntPO0zh/PFtCYfkoUZWjZ6i', 'ADMIN',      'ACTIVE'),
('00000000-0000-0000-0000-0000000000b1', N'Thủ quỹ C',    'thuquy@gmail.com', '0901234567', '$2a$10$i4J7CDFfFXX9hJjvHxgXpuDHrjfKTmntPO0zh/PFtCYfkoUZWjZ6i', 'THU_QUY',    'ACTIVE'),
('00000000-0000-0000-0000-0000000000c1', N'Thành viên A', 'thanhvien@gmail.com',      '0911000001', '$2a$10$i4J7CDFfFXX9hJjvHxgXpuDHrjfKTmntPO0zh/PFtCYfkoUZWjZ6i', 'THANH_VIEN', 'ACTIVE'),
('00000000-0000-0000-0000-0000000000c2', N'Thành viên B', 'thanhvien2@gmail.com',      '0911000002', '$2a$10$i4J7CDFfFXX9hJjvHxgXpuDHrjfKTmntPO0zh/PFtCYfkoUZWjZ6i', 'THANH_VIEN', 'ACTIVE'),
('00000000-0000-0000-0000-0000000000c3', N'Thành viên E', 'thanhvien3@gmail.com',      NULL,         '$2a$10$i4J7CDFfFXX9hJjvHxgXpuDHrjfKTmntPO0zh/PFtCYfkoUZWjZ6i', 'THANH_VIEN', 'INACTIVE');

INSERT INTO dbo.su_kien(id, ten, mo_ta, dia_diem, thoi_gian_bat_dau, thoi_gian_ket_thuc, nguoi_phu_trach_id) VALUES
('00000000-0000-0000-0000-000000000e01', N'Họp câu lạc bộ (đã diễn ra)', N'Họp tổng kết tháng', N'Phòng A101',
    NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days' + INTERVAL '2 hours', '00000000-0000-0000-0000-0000000000b1'),
('00000000-0000-0000-0000-000000000e02', N'Dã ngoại (sắp diễn ra)', N'Hoạt động ngoài trời', N'Công viên',
    NOW() + INTERVAL '7 days', NOW() + INTERVAL '7 days' + INTERVAL '8 hours', '00000000-0000-0000-0000-0000000000b1');

INSERT INTO dbo.su_kien_thanh_vien(su_kien_id, thanh_vien_id, trang_thai) VALUES
('00000000-0000-0000-0000-000000000e01','00000000-0000-0000-0000-0000000000c1','REGISTERED'),
('00000000-0000-0000-0000-000000000e01','00000000-0000-0000-0000-0000000000c2','REGISTERED');

INSERT INTO dbo.giao_dich_quy(loai, so_tien, noi_dung, ngay_giao_dich, nguoi_thuc_hien_id) VALUES
('THU', 1500000, N'Quỹ đầu kỳ',                            NOW() - INTERVAL '30 days', '00000000-0000-0000-0000-0000000000b1'),
('THU',  800000, N'Đóng góp thành viên, liên hệ 0901234567', NOW() - INTERVAL '20 days', '00000000-0000-0000-0000-0000000000b1'),
('CHI',  400000, N'Thuê địa điểm họp',                   NOW() - INTERVAL '10 days', '00000000-0000-0000-0000-0000000000b1');

INSERT INTO dbo.de_xuat_chi(id, nguoi_tao_id, tieu_de, noi_dung, kinh_phi, trang_thai) VALUES
('00000000-0000-0000-0000-000000000d01','00000000-0000-0000-0000-0000000000c1', N'Mua banner',     N'In banner cho sự kiện', 300000,  'PENDING'),
('00000000-0000-0000-0000-000000000d02','00000000-0000-0000-0000-0000000000c2', N'Thuê địa điểm lớn', N'Thuê hội trường',     2500000, 'PENDING');

INSERT INTO dbo.bieu_quyet(de_xuat_id, thanh_vien_id, ket_qua) VALUES
('00000000-0000-0000-0000-000000000d01','00000000-0000-0000-0000-0000000000c2','AGREE'),
('00000000-0000-0000-0000-000000000d01','00000000-0000-0000-0000-0000000000b1','AGREE'),
('00000000-0000-0000-0000-000000000d01','00000000-0000-0000-0000-0000000000a1','DISAGREE'),
('00000000-0000-0000-0000-000000000d02','00000000-0000-0000-0000-0000000000c1','AGREE'),
('00000000-0000-0000-0000-000000000d02','00000000-0000-0000-0000-0000000000b1','AGREE');
