# MED-09 — Hướng dẫn cơ sở dữ liệu

CSDL PostgreSQL chính thức có tên `QuanLyCLBDB`; các bảng ứng dụng nằm trong schema `dbo`. Kiểm thử tự động phải dùng database riêng có tên bắt đầu bằng `med09_test_`; môi trường Compose theo README root dùng database `med09_docker_test`.

## Tệp SQL

| Tệp | Mục đích | Lưu ý |
|---|---|---|
| `01_schema.sql` | Tạo schema, extension và bảng | Có `DROP TABLE`; chỉ dùng khi khởi tạo database/volume rỗng. Không chạy trên DB có dữ liệu. |
| `02_seed.sql` | Dữ liệu mẫu | Chạy sau schema; tạo tài khoản và dữ liệu minh họa. |
| `03_test_account_credentials.sql` | Đồng bộ email/mật khẩu tài khoản local | Có thể chạy lại trên database phát triển đã có schema. |
| `04_transaction_integrity.sql` | Bổ sung chỉ mục unique để một giao dịch gốc chỉ có một giao dịch đảo | Migration không xóa dữ liệu; dừng nếu phát hiện giao dịch đảo trùng. |

Compose mount thư mục `database/` vào PostgreSQL entrypoint. Các script được chạy theo thứ tự tên tệp chỉ khi thư mục dữ liệu PostgreSQL mới/rỗng; lần khởi động lại với volume đã khởi tạo không chạy lại scripts. Không chạy `01_schema.sql` thủ công để “cập nhật” database hiện hữu.

## Truy cập database Compose kiểm thử

Tại PowerShell ở thư mục gốc:

```powershell
docker compose -p med09v5test --env-file .env.docker-test exec postgres_db psql -U med09test -d med09_docker_test
```

Kiểm tra định danh trước khi truy vấn:

```sql
SET search_path TO dbo;
SELECT current_database(), current_schema();
\dn
\dt dbo.*
```

Xem cấu trúc và dữ liệu tổng hợp bằng các bảng/cột có trong schema:

```sql
\d+ dbo.thanh_vien
SELECT count(*) AS so_thanh_vien FROM dbo.thanh_vien;
SELECT loai, count(*) AS so_giao_dich, COALESCE(sum(so_tien), 0) AS tong_tien
FROM dbo.giao_dich_quy
GROUP BY loai
ORDER BY loai;
```

Thoát `psql` bằng `\q`. Môi trường Docker test dùng cổng host PostgreSQL `15432`; PostgreSQL local mặc định thường dùng `5432`. Xem `.env.docker-test` để biết cấu hình cổng hiện hành, không in password hoặc JWT/S3 secret ra terminal.

## Khởi tạo thủ công database mới

Chỉ chạy trên database mới, rỗng, đã xác minh đúng tên và có quyền phù hợp. Ví dụ môi trường phát triển local:

```powershell
psql -U postgres -d QuanLyCLBDB -v ON_ERROR_STOP=1 -f database\01_schema.sql
psql -U postgres -d QuanLyCLBDB -v ON_ERROR_STOP=1 -f database\02_seed.sql
psql -U postgres -d QuanLyCLBDB -v ON_ERROR_STOP=1 -f database\03_test_account_credentials.sql
psql -U postgres -d QuanLyCLBDB -v ON_ERROR_STOP=1 -f database\04_transaction_integrity.sql
```

Lệnh schema phía trên có khả năng xóa bảng; chỉ dùng khi database thực sự rỗng. Không dùng `QuanLyCLBDB` làm database của integration/E2E test.

## Áp dụng migration trên database hiện hữu

`04_transaction_integrity.sql` tạo unique index `dbo.ux_giao_dich_quy_giao_dich_goc` và chủ động báo lỗi nếu có hơn một giao dịch đảo cho cùng giao dịch gốc. Trước khi áp dụng trên database đang chạy:

1. Dừng các API ghi dữ liệu hoặc chuyển sang maintenance; xác minh `SELECT current_database(), current_schema();`.
2. Tạo và kiểm chứng backup có thể khôi phục, ví dụ `pg_dump -Fc -d QuanLyCLBDB -f med09-before-transaction-integrity.dump`.
3. Chỉ đọc để kiểm tra dữ liệu trùng:

   ```sql
   SELECT giao_dich_goc_id, count(*)
   FROM dbo.giao_dich_quy
   WHERE giao_dich_goc_id IS NOT NULL
   GROUP BY giao_dich_goc_id
   HAVING count(*) > 1;
   ```

4. Nếu có bản ghi trùng, dừng để rà soát và lập kế hoạch sửa dữ liệu được duyệt; migration không tự chọn/xóa bản ghi. Nếu không có, áp dụng `04_transaction_integrity.sql` trên đúng database.
5. Xác minh index và chạy lại truy vấn trùng trước khi mở lại ghi dữ liệu. Nếu có lỗi, giữ nguyên trạng thái để điều tra; khôi phục backup theo quy trình vận hành đã duyệt.

Không chạy `01_schema.sql` trên database hiện hữu và không dùng `DROP`, `TRUNCATE`, xóa volume hoặc reset để xử lý lỗi migration.

## Tài khoản và cấu hình kết nối

Tài khoản mẫu local dùng mật khẩu `123456` và được cập nhật bởi `03_test_account_credentials.sql`. Chỉ dùng cho phát triển/kiểm thử; thay thông tin đăng nhập trước triển khai. File `.env.docker-test` cấu hình user/database riêng của Compose; `.env` và `backend/.env` dùng cho cấu hình local khác. Các giá trị `POSTGRES_PASSWORD` và `DATABASE_URL` phải đồng bộ với mật khẩu role thực sự trên PostgreSQL. Sửa env không tự đổi password trong server đang chạy.

Khi kết nối từ host dùng `localhost` và cổng host được cấu hình; từ container backend dùng hostname `postgres_db` và cổng nội bộ `5432`. Cả hai phải chọn đúng database và `search_path=dbo`. Không đưa nội dung `.env*` vào Git hoặc báo cáo. Khi có ký tự đặc biệt trong password, URL-encode thành phần password trong `DATABASE_URL`.

Trước khi chạy lệnh có ghi dữ liệu, kiểm tra database hiện tại và xác nhận đó là môi trường test được phép. Các test integration/E2E có thể tạo/xóa fixture; mã test kiểm tra tiền tố `med09_test_` trước lệnh `TRUNCATE`.
