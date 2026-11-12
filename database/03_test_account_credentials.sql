-- Local-only test credentials for QuanLyCLBDB. Safe to re-run for existing development databases.
UPDATE dbo.thanh_vien
SET email = CASE email
  WHEN 'admin@clb.vn' THEN 'admin@gmail.com'
  WHEN 'thuquy@clb.vn' THEN 'thuquy@gmail.com'
  WHEN 'a@clb.vn' THEN 'thanhvien@gmail.com'
  WHEN 'b@clb.vn' THEN 'thanhvien2@gmail.com'
  WHEN 'e@clb.vn' THEN 'thanhvien3@gmail.com'
  ELSE email
END,
mat_khau_hash = '$2a$10$i4J7CDFfFXX9hJjvHxgXpuDHrjfKTmntPO0zh/PFtCYfkoUZWjZ6i'
WHERE email IN (
  'admin@clb.vn', 'thuquy@clb.vn', 'a@clb.vn', 'b@clb.vn', 'e@clb.vn',
  'admin@gmail.com', 'thuquy@gmail.com', 'thanhvien@gmail.com',
  'thanhvien2@gmail.com', 'thanhvien3@gmail.com'
);
