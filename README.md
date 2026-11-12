# MED-09

Ứng dụng quản lý câu lạc bộ, thành viên, quỹ, đề xuất chi, biểu quyết và sự kiện. README này mô tả trạng thái source hiện tại; khi có khác biệt, source code, schema và cấu hình đang chạy được ưu tiên để mô tả hành vi thực tế.

## Tổng quan

MED-09 cung cấp đăng nhập theo vai trò, quản lý thành viên, ghi nhận giao dịch quỹ và chứng từ, lập và biểu quyết đề xuất chi, quản lý sự kiện/đăng ký/điểm danh, cùng các báo cáo hiện có. Hệ thống gồm Next.js frontend, NestJS API, PostgreSQL và object storage tương thích S3.

## Kiến trúc

- **Frontend:** Next.js App Router và React; route/page nằm trong `src/app`, UI dùng component trong `src/components`, xác thực và phiên người dùng ở `src/context`, gọi API qua `src/lib`.
- **Backend:** NestJS theo module; controller nhận HTTP, guard kiểm tra JWT/vai trò, service chứa nghiệp vụ. Các service dùng PostgreSQL qua `pg` pool và SQL trực tiếp. Source hiện không có Repository layer riêng.
- **Database:** PostgreSQL 16, schema `dbo`; schema khởi tạo ở `database/01_schema.sql`, dữ liệu mẫu ở `database/02_seed.sql` và các script database liên quan.
- **Storage:** dịch vụ object storage tương thích S3 (Compose dùng `pgsty/silo`) lưu chứng từ; API cấp URL có thời hạn cho người dùng được phép.
- **Docker:** `docker-compose.yml` khởi chạy PostgreSQL, object storage, backend và frontend.

```text
Trình duyệt
    │ HTTP
    ▼
Next.js frontend ── REST /api ──► NestJS controllers/guards/services
                                      │                 │
                                      ▼                 ▼
                                  PostgreSQL       S3-compatible storage
```

## Dashboard

Dashboard là route `/` và là trang đích sau đăng nhập. Widget thay đổi theo vai trò, lấy dữ liệu từ các API hiện có; khi API không có dữ liệu, giao diện hiển thị trạng thái rỗng thay vì số liệu dựng sẵn.

| Vai trò | Nội dung hiện có |
|---|---|
| `THANH_VIEN` | Thẻ hồ sơ cá nhân (tên, vai trò, trạng thái) và liên kết đến Quỹ, Đề xuất, Sự kiện, Báo cáo. Thành viên chỉ xem dữ liệu quỹ theo phạm vi API/UI hiện tại. |
| `THU_QUY` | Số dư quỹ, đề xuất `PENDING`, sự kiện sắp tới, thành viên `ACTIVE`; shortcut đến Quỹ, Đề xuất, Sự kiện, Báo cáo. |
| `ADMIN` | Tổng thành viên, thành viên `ACTIVE`, đề xuất `PENDING`, sự kiện sắp tới; shortcut đến Thành viên/Phân quyền, Quỹ, Đề xuất và Báo cáo. Hiển thị cảnh báo nếu dữ liệu cho thấy còn không quá một ADMIN hoạt động. |

## Phân quyền

Quyền dưới đây phản ánh các route và guard hiện có. Vai trò được kiểm tra ở backend; một số trang cho phép đọc nhưng giới hạn thao tác ghi.

| Chức năng | `THANH_VIEN` | `THU_QUY` | `ADMIN` |
|---|:---:|:---:|:---:|
| Đăng nhập, Dashboard, Hồ sơ | ✓ | ✓ | ✓ |
| Thành viên | — | Xem/quản lý | Quản lý, phân vai trò |
| Quỹ | Xem | Xem/ghi, chứng từ | Xem/ghi, chứng từ |
| Đề xuất và biểu quyết | Tạo/biểu quyết | Tạo/biểu quyết | Tạo/biểu quyết |
| Duyệt/từ chối đề xuất | — | ✓ | ✓ |
| Sự kiện, đăng ký | Xem/đăng ký | Quản lý/đăng ký | Quản lý/đăng ký |
| Danh sách đăng ký, điểm danh | — | ✓ | ✓ |
| Báo cáo quỹ | ✓ (dữ liệu tổng hợp theo quyền) | ✓ | ✓ |
| Báo cáo điểm danh | — | ✓ | ✓ |

## Cấu trúc hệ thống

```text
src/                 Next.js frontend: app routes, components, context, API client
backend/src/         NestJS modules, controllers, services, DTO, guards
backend/test/        Unit và integration test của backend
database/            Schema, seed, integrity và tài khoản test/demo
e2e/                 Playwright flows và cấu hình môi trường E2E
scripts/             Script hỗ trợ chạy và phát triển
docs/                Đặc tả, audit, UML và test traceability
docker-compose.yml   Các service chạy bằng Docker Compose
```

## Chức năng và route giao diện

| Route | Nội dung |
|---|---|
| `/login` | Đăng nhập |
| `/` | Dashboard theo vai trò |
| `/profile` | Hồ sơ người dùng |
| `/members` | Danh sách/quản lý thành viên và thao tác vai trò dành cho ADMIN |
| `/fund` | Giao dịch quỹ, chứng từ và thao tác quỹ theo quyền |
| `/proposals` | Danh sách đề xuất và biểu quyết |
| `/dashboard/proposals` | Rà soát/duyệt đề xuất dành cho người có quyền |
| `/events` | Sự kiện, đăng ký và thao tác quản lý/điểm danh được tích hợp trong trang |
| `/reports` | Báo cáo hiện có |

Source hiện không có route trang riêng cho đăng ký sự kiện, điểm danh hoặc phân quyền; các thao tác này nằm trong những màn hình nêu trên. Trang Báo cáo hiện chưa có chức năng xuất báo cáo.

### Nhóm chức năng

- **Đăng nhập:** xác thực tài khoản và tải thông tin người dùng hiện tại.
- **Quản lý thành viên:** xem, tạo, cập nhật, thay đổi trạng thái; ADMIN có thể đổi vai trò.
- **Quản lý quỹ:** xem tổng quan và giao dịch, tạo/cập nhật giao dịch, ghi nhận giao dịch đảo và tải chứng từ theo quyền.
- **Đề xuất chi:** tạo đề xuất, biểu quyết, duyệt hoặc từ chối theo vai trò.
- **Sự kiện:** tạo/cập nhật sự kiện, đăng ký, xem danh sách đăng ký và ghi nhận điểm danh theo quyền.
- **Báo cáo:** báo cáo quỹ và báo cáo điểm danh theo sự kiện cho vai trò được phép.
- **Chứng từ:** tải lên và truy cập bằng URL ký có thời hạn; quyền quản lý chứng từ giới hạn cho ADMIN/THU_QUY.

### API hiện có

Các endpoint dưới đây có prefix `/api`. Tất cả đường dẫn được suy ra từ controller hiện có.

| Nhóm | Endpoint |
|---|---|
| Health | `GET /api/health` |
| Auth | `POST /api/auth/login`, `GET /api/auth/me` |
| Members | `GET /api/members`, `GET /api/members/:id`, `POST /api/members`, `PATCH /api/members/:id`, `PATCH /api/members/:id/status`, `DELETE /api/members/:id` (thực tế vô hiệu hóa), `PATCH /api/members/:id/role` |
| Fund | `GET /api/fund/transactions`, `GET /api/fund/summary`, `GET /api/fund/transactions/:id/voucher-url`, `POST /api/fund/transactions`, `PATCH /api/fund/transactions/:id`, `POST /api/fund/transactions/:id/reversal`, `POST /api/fund/transactions/:id/voucher` |
| Proposals | `GET /api/proposals`, `POST /api/proposals`, `POST /api/proposals/:id/vote`, `POST /api/proposals/:id/approve`, `PATCH /api/proposals/:id/reject` |
| Events | `GET /api/events`, `POST /api/events`, `PATCH /api/events/:id`, `POST /api/events/:id/register`, `GET /api/events/:id/registrations`, `POST /api/events/:id/attendance` |
| Reports | `GET /api/reports/fund`, `GET /api/reports/events/:id/attendance` |

## Business Rules BR01–BR08

Các tóm tắt dưới đây mô tả quy tắc nghiệp vụ trong source hiện tại; chi tiết và các khác biệt với đặc tả nằm trong `docs/MED09_FINAL.docx` và tài liệu audit.

| Rule | Tóm tắt hiện thực |
|---|---|
| BR01 | Giao dịch thu/chi phải có số tiền dương; service khóa và kiểm tra số dư trước khi ghi để ngăn chi làm quỹ âm. |
| BR02 | Dữ liệu công khai dùng DTO/masking cho nội dung giao dịch; chứng từ được truy cập qua URL ký có thời hạn và giới hạn vai trò. |
| BR03 | Luồng duyệt đề xuất và ghi giao dịch chi dùng transaction, khóa đề xuất và khóa quỹ dùng chung để kiểm tra lại trước khi commit. |
| BR04 | Mỗi thành viên chỉ có một phiếu biểu quyết cho mỗi đề xuất; có unique constraint ở database. |
| BR05 | Các thao tác quản lý quỹ/duyệt và phân vai trò được giới hạn theo role; service bảo vệ ADMIN hoạt động cuối cùng. |
| BR06 | Tự động duyệt chỉ khi số phiếu đồng ý nhiều hơn không đồng ý và số dư đủ; nếu không đủ điều kiện thì không ghi chi. Source không triển khai quorum/deadline biểu quyết. |
| BR07 | Người tạo đề xuất không được tự duyệt; kiểm tra ở service và database. |
| BR08 | Không có luồng xóa giao dịch quỹ; điều chỉnh được thực hiện bằng giao dịch đảo. Source hiện giới hạn mỗi giao dịch gốc có tối đa một giao dịch đảo. |

## Chạy bằng Docker

Yêu cầu Docker Desktop/Engine đang chạy và tệp `.env.docker-test` có sẵn. Các lệnh dưới đây dùng project/database kiểm thử riêng.

```powershell
docker compose -p med09v5test --env-file .env.docker-test up -d --build
docker compose -p med09v5test --env-file .env.docker-test down
```

Với cấu hình test hiện tại, frontend ở `http://localhost:13000`, API health ở `http://localhost:13001/api/health`, PostgreSQL mở host port `15432`; storage API/console lần lượt dùng `19000`/`19002`. Kiểm tra `.env.docker-test` nếu các port đã được thay đổi. Lệnh `down` không xóa volume; không thêm `-v` nếu cần giữ dữ liệu.

## Build, lint và test

Chạy từ thư mục gốc. Root scripts điều phối frontend/backend:

```bash
npm run build
npm run lint
npm test
```

`npm run build` build frontend Next.js; backend có script riêng `npm run build:backend`, hoặc build cả hai với `npm run build:all`. `npm test` chạy các backend unit test được khai báo trong root script. Integration test và E2E có script riêng (`npm run test:integration`, `npm run test:e2e`) và cần các dịch vụ/môi trường tương ứng.

## Tài khoản demo

Các email dưới đây được seed trong bộ dữ liệu test/demo. Mật khẩu mẫu hiện được khai báo trong `database/03_test_account_credentials.sql`; chỉ dùng môi trường local/test:

| Vai trò | Email |
|---|---|
| ADMIN | `admin@gmail.com` |
| THU_QUY | `thuquy@gmail.com` |
| THANH_VIEN | `thanhvien@gmail.com` |

Mật khẩu test mẫu: `123456`. Không dùng các tài khoản/mật khẩu này trên môi trường triển khai thật.

## Trạng thái hiện tại

### Đã hoàn thành trong source

- Các route giao diện liệt kê ở trên và dashboard thay đổi widget theo ba vai trò.
- API xác thực, thành viên, quỹ/chứng từ, đề xuất/biểu quyết, sự kiện/điểm danh và báo cáo.
- PostgreSQL, các ràng buộc dữ liệu chính và lưu chứng từ qua object storage trong Docker Compose.
- Unit, integration và E2E test source hiện diện trong repository.

### Giới hạn còn lại

- Không có trang riêng cho đăng ký sự kiện, điểm danh hoặc phân quyền; thao tác được tích hợp vào trang hiện có.
- Chưa có API/UI xuất báo cáo.
- Business rule BR08 trong source chỉ cho phép tối đa một giao dịch đảo cho giao dịch gốc; cần đối chiếu với cách diễn đạt đầy đủ trong đặc tả nếu yêu cầu nhiều lần điều chỉnh.
- Source không có Repository layer riêng; service truy vấn PostgreSQL trực tiếp.
- Bộ test integration/E2E phụ thuộc môi trường dịch vụ; việc có test source không đồng nghĩa mọi test đã chạy thành công trong mọi môi trường.

Chi tiết sai khác README cũ và phạm vi rà soát được ghi trong [`README_AUDIT.md`](./docs/evidence/README_AUDIT.md) và [`README_UPDATE_REPORT.md`](./docs/implementation/README_UPDATE_REPORT.md).

### Lệnh truy vấn database
`docker exec -it med09v5test-postgres_db-1 psql -U med09test -d med09_docker_test`