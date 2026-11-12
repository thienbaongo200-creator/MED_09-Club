# MED-09 Backend

Backend viết bằng TypeScript/NestJS, kết nối PostgreSQL `QuanLyCLBDB` qua schema `dbo` và dịch vụ lưu trữ tương thích S3. Compose hiện chạy image `pgsty/silo` làm object storage.

## Chạy local

Tại thư mục gốc, làm theo [README chính](../README.md). Hoặc trong thư mục `backend/`:

```powershell
npm.cmd install
# Cấu hình backend/.env; không đưa giá trị bí mật vào Git.
npm.cmd run start:dev
```

API prefix là `/api`; port mặc định là `3001`. `backend/.env.example` đặt `STORAGE_ENABLED=false` để backend local không phụ thuộc storage. Endpoint chứng từ sẽ trả `503` khi storage tắt. Compose đọc cấu hình từ `.env.docker-test` (hoặc `.env` trong cấu hình mặc định) ở root, không đọc `backend/.env`; trong Compose, storage được bật và backend phụ thuộc health của `object_storage`.

## Module

`Auth`, `Members`, `Funds`, `Proposals`, `Events`, `Reports` và `Storage` được đăng ký trong `backend/src/app.module.ts`.

## API và phân quyền

| Phương thức | Đường dẫn | Quyền |
|---|---|---|
| POST | `/api/auth/login` | Công khai |
| GET | `/api/auth/me` | JWT; hồ sơ tài khoản đang hoạt động |
| GET | `/api/health` | Công khai; 503 nếu PostgreSQL không sẵn sàng |
| GET | `/api/fund/summary`, `/api/fund/transactions` | JWT; mọi vai trò |
| GET | `/api/fund/transactions/:id/voucher-url` | JWT; ADMIN/THU_QUY |
| POST | `/api/fund/transactions` | JWT; ADMIN/THU_QUY |
| PATCH | `/api/fund/transactions/:id` | JWT; ADMIN/THU_QUY; chỉ giao dịch nhập tay, kiểm tra lại số dư dưới khóa quỹ |
| POST | `/api/fund/transactions/:id/reversal` | JWT; ADMIN/THU_QUY; tạo giao dịch ngược có liên kết |
| POST | `/api/fund/transactions/:id/voucher` | JWT; ADMIN/THU_QUY; multipart field `file` |
| GET | `/api/proposals?trangThai=` | JWT; mọi vai trò |
| POST | `/api/proposals`, `/api/proposals/:id/vote` | JWT |
| POST | `/api/proposals/:id/approve`; PATCH `/api/proposals/:id/reject` | JWT; ADMIN/THU_QUY |
| GET | `/api/events` | JWT |
| POST | `/api/events`, GET `/api/events/:id/registrations`, POST `/api/events/:id/attendance` | JWT; ADMIN/THU_QUY |
| POST | `/api/events/:id/register` | JWT |
| PATCH | `/api/events/:id` | JWT; ADMIN/THU_QUY |
| GET | `/api/members`, `/api/members/:id` | JWT; ADMIN/THU_QUY |
| POST | `/api/members`, PATCH `/api/members/:id`, PATCH `/api/members/:id/status`, DELETE `/api/members/:id` | JWT; ADMIN/THU_QUY |
| PATCH | `/api/members/:id/role` | JWT; ADMIN |
| GET | `/api/reports/fund?tuNgay=&denNgay=` | JWT; mọi vai trò |
| GET | `/api/reports/events/:id/attendance` | JWT; ADMIN/THU_QUY |

Quyền máy chủ được kiểm tra qua JWT/`RolesGuard`; ẩn nút ở giao diện không thay thế phân quyền API. Thành viên không được tạo/sửa giao dịch hoặc duyệt đề xuất. THU_QUY không được sửa trạng thái/tắt tài khoản ADMIN hoặc phân quyền; chỉ ADMIN được đổi vai trò. Service ngăn vô hiệu hóa/hạ quyền ADMIN cuối cùng còn hoạt động.

UC04 hỗ trợ tạo/xem/sửa thành viên và khóa/mở khóa; THU_QUY không thể sửa hoặc vô hiệu hóa tài khoản ADMIN. UC12 chỉ ADMIN được gán vai trò. UC13 cho mọi vai trò xem số liệu tổng hợp quỹ theo kỳ và giới hạn báo cáo điểm danh cho ADMIN/THU_QUY. Báo cáo tổng hợp không trả email/điện thoại dạng thô.

## Quy tắc dữ liệu và lưu trữ

- **BR02:** `PublicStatementDto` và `MaskingPolicy` che email, số điện thoại và PII khớp trong nội dung giao dịch tại service Quỹ. `SearchService` tìm trên văn bản đã loại PII bằng SQL và tên thành viên; đây là tìm kiếm PostgreSQL, chưa phải search index ngoài.
- **BR03:** Duyệt đề xuất, nhập/chỉnh giao dịch và đảo giao dịch chia sẻ `pg_advisory_xact_lock` cho quỹ; duyệt đề xuất còn khóa dòng đề xuất. Các thao tác được thực hiện trong transaction PostgreSQL.
- **Chứng từ:** Upload và signed URL chỉ cho ADMIN/THU_QUY. `S3_ENDPOINT` là địa chỉ backend truy cập; `S3_PUBLIC_ENDPOINT` phải truy cập được từ trình duyệt nhận signed URL. Đặt `S3_BUCKET` và credentials trong môi trường local; không đưa secret vào tài liệu.

## Kiểm thử

```powershell
npm.cmd test
npm.cmd run test:integration
```

Integration suite chỉ được phép ghi vào `med09_docker_test` của Compose project `med09v5test`. Trước khi tạo fixture, harness đối chiếu database/schema/PostgreSQL instance của runner với backend Compose đang chạy. Chạy `docker compose -p med09v5test --env-file .env.docker-test up -d` trước, sau đó `npm.cmd run test:integration`. Không đặt `MED09_TEST_DATABASE_URL`, không chạy SQL schema/reset; `01_schema.sql` có lệnh xóa bảng.

Mỗi suite có run ID và fixture được gắn nhãn riêng; cleanup xóa theo email/tên/nội dung thuộc lượt chạy và kiểm tra baseline trước/sau. Một run lock dùng chung với Playwright ngăn hai suite cùng ghi database. Nếu test dừng bất thường hoặc cleanup không khớp baseline, lock được giữ lại để kiểm tra trước lần chạy sau. Không xóa lock thủ công trước khi xác định không còn test process đang hoạt động.

Ma trận test và giới hạn xác minh hiện hành nằm ở [`docs/evidence/TEST_TRACEABILITY.md`](../docs/evidence/TEST_TRACEABILITY.md).
