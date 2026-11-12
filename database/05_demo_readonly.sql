-- MED-09 demo workbook: READ-ONLY queries for the disposable test DB.
-- Connect only to med09_docker_test in Compose project med09v5test.
-- Every statement below is SELECT-only; it never changes database state.

-- 1. Confirm database/schema and current seed counts.
SELECT current_database() AS database_name,
       EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'dbo') AS dbo_schema_exists;

SELECT
  (SELECT count(*) FROM dbo.thanh_vien) AS members,
  (SELECT count(*) FROM dbo.su_kien) AS events,
  (SELECT count(*) FROM dbo.su_kien_thanh_vien) AS registrations,
  (SELECT count(*) FROM dbo.de_xuat_chi) AS proposals,
  (SELECT count(*) FROM dbo.bieu_quyet) AS votes,
  (SELECT count(*) FROM dbo.giao_dich_quy) AS transactions,
  (SELECT count(*) FROM dbo.chung_tu) AS receipts;

-- 2. Seed accounts without contact data or password hashes.
SELECT id, ho_ten, vai_tro, trang_thai, ngay_tham_gia
FROM dbo.thanh_vien
ORDER BY vai_tro, ho_ten;

-- 3. Ledger totals and running balance. Use the masked API for public descriptions;
-- do not select noi_dung here because seed descriptions can contain PII.
SELECT id, loai, so_tien, ngay_giao_dich,
       sum(CASE WHEN loai = 'THU' THEN so_tien ELSE -so_tien END)
         OVER (ORDER BY ngay_giao_dich, id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS balance_after
FROM dbo.giao_dich_quy
ORDER BY ngay_giao_dich, id;

SELECT
  COALESCE(sum(so_tien) FILTER (WHERE loai = 'THU'), 0) AS total_income,
  COALESCE(sum(so_tien) FILTER (WHERE loai = 'CHI'), 0) AS total_expense,
  COALESCE(sum(CASE WHEN loai = 'THU' THEN so_tien ELSE -so_tien END), 0) AS balance
FROM dbo.giao_dich_quy;

-- 4. Proposal, creator, vote totals and linked fund transaction count.
SELECT p.id, p.tieu_de, p.kinh_phi, p.trang_thai,
       creator.ho_ten AS creator,
       count(DISTINCT v.id) FILTER (WHERE v.ket_qua = 'AGREE') AS agree_votes,
       count(DISTINCT v.id) FILTER (WHERE v.ket_qua = 'DISAGREE') AS disagree_votes,
       count(DISTINCT t.id) FILTER (WHERE t.loai = 'CHI') AS linked_expense_rows
FROM dbo.de_xuat_chi p
JOIN dbo.thanh_vien creator ON creator.id = p.nguoi_tao_id
LEFT JOIN dbo.bieu_quyet v ON v.de_xuat_id = p.id
LEFT JOIN dbo.giao_dich_quy t ON t.de_xuat_id = p.id
GROUP BY p.id, creator.ho_ten
ORDER BY p.ngay_tao, p.id;

-- 5. Event attendance rollup.
SELECT e.id, e.ten, e.thoi_gian_bat_dau, e.thoi_gian_ket_thuc,
       count(em.id) AS registered,
       count(em.id) FILTER (WHERE em.trang_thai = 'ATTENDED') AS attended,
       count(em.id) FILTER (WHERE em.trang_thai = 'ABSENT') AS absent
FROM dbo.su_kien e
LEFT JOIN dbo.su_kien_thanh_vien em ON em.su_kien_id = e.id
GROUP BY e.id
ORDER BY e.thoi_gian_bat_dau, e.id;

-- 6. Integrity checks: each query should return zero rows (or zero count).
-- Approved proposal must have exactly one linked CHI; pending/rejected must have none.
SELECT p.id, p.tieu_de, p.trang_thai, count(t.id) AS linked_transactions
FROM dbo.de_xuat_chi p
LEFT JOIN dbo.giao_dich_quy t ON t.de_xuat_id = p.id
GROUP BY p.id
HAVING (p.trang_thai = 'APPROVED' AND count(t.id) <> 1)
    OR (p.trang_thai <> 'APPROVED' AND count(t.id) <> 0);

-- No self-approval.
SELECT id, tieu_de, nguoi_tao_id, nguoi_xu_ly_id
FROM dbo.de_xuat_chi
WHERE trang_thai = 'APPROVED' AND nguoi_tao_id = nguoi_xu_ly_id;

-- No duplicate vote or event registration (database constraints should enforce this).
SELECT de_xuat_id, thanh_vien_id, count(*)
FROM dbo.bieu_quyet
GROUP BY de_xuat_id, thanh_vien_id
HAVING count(*) > 1;

SELECT su_kien_id, thanh_vien_id, count(*)
FROM dbo.su_kien_thanh_vien
GROUP BY su_kien_id, thanh_vien_id
HAVING count(*) > 1;

-- No fixture left from a completed E2E run.
SELECT 'member' AS fixture_type, count(*) AS remaining
FROM dbo.thanh_vien WHERE ho_ten LIKE '[MED09E2E:%'
UNION ALL
SELECT 'event', count(*) FROM dbo.su_kien WHERE ten LIKE '[MED09E2E:%'
UNION ALL
SELECT 'proposal', count(*) FROM dbo.de_xuat_chi WHERE tieu_de LIKE '[MED09E2E:%';
