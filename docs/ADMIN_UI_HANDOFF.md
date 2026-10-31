# Labellab Admin — bàn giao giao diện

Ngày: 31/10/2026. Điểm vào: `http://127.0.0.1:3005/admin`.

## Phạm vi hiện tại

Admin là frontend prototype tiếng Việt, dùng dữ liệu mẫu và bộ nhớ trình duyệt. Chưa có tài khoản quản trị được bảo vệ bằng server, database, thanh toán hoặc số liệu truy cập thật. Chip “Dữ liệu mẫu” áp dụng cho toàn khu vực. Metadata `noindex, nofollow` chỉ hạn chế lập chỉ mục, **không phải cơ chế bảo vệ admin**.

Thay đổi trong admin hiện không sửa nội dung, bảng giá, tài khoản hoặc model đang hiển thị trên website public. File thêm vào kho chỉ được ghi nhận cục bộ; chưa upload tới máy chủ.

## Routes và chức năng đã dựng

| Route | Chức năng |
|---|---|
| `/admin` | Tổng quan theo ngày/tháng/năm; lượt truy cập, phiên Studio, render, coin nạp; biểu đồ khách lạ/người dùng/bot; doanh thu VNĐ và USD tách riêng; top đăng nhập/dùng Studio/nạp coin; giao dịch gần đây. |
| `/admin/traffic` | Biểu đồ và bảng số liệu khách lạ/người dùng/bot theo kỳ; xuất CSV. |
| `/admin/users` | Tìm, lọc, sắp xếp, phân trang; xem/thêm/sửa/xóa; tên, email, danh hiệu, quốc gia, avatar, vai trò, trạng thái, coin, thống kê đăng nhập/Studio, tổng nạp, thời điểm và ghi chú; lịch sử; điều chỉnh coin có lý do. Giữ ít nhất một admin hoạt động. |
| `/admin/transactions` | Đơn nạp, sổ coin, bảng giá nội địa/quốc tế; tìm/lọc tháng/khu vực/trạng thái; tạo đơn mẫu; đổi trạng thái và điều chỉnh số dư tương ứng; cộng/trừ coin có lý do; sửa/bật/tắt gói coin; xuất CSV. |
| `/admin/models` | Model 3D, danh mục, nhãn/vật liệu, cấu hình hiển thị; CRUD, xem, lưu trữ/khôi phục, bật/tắt; GLB/poster, UV, material slots JSON, góc trước/orientation XYZ/thứ tự; model–nhãn tương thích; nhám/kim loại/màu; cấu hình 2D có ảnh/alt, 3D có offset/màu nắp/chất lỏng. |
| `/admin/assets` | Kho model GLB, texture, HDRI, thumbnail, template; tìm/lọc, metadata, staging file cục bộ, preview ảnh trong phiên, CRUD/lưu trữ/khôi phục, xuất JSON. Blob preview không persist qua phiên. |
| `/admin/content` | Banner theo vị trí, ảnh/alt/link/thứ tự; thông báo và lịch; các khu vực trang chủ bật/tắt/thứ tự. |
| `/admin/promotions` | Điểm danh, vòng quay, chia sẻ, lượt tải miễn phí; lịch thưởng/giới hạn/điều kiện; chiến dịch theo thời gian; mã giảm giá, giới hạn, khu vực và ngày hết hạn. |
| `/admin/releases` | Kiểm tra trường bắt buộc và liên kết model/nhãn đang bật; tạo phiên bản mẫu kèm snapshot; xem/xóa lịch sử; dùng lại snapshot. Bản đang sử dụng không có thao tác xóa. |
| `/admin/activity` | Nhật ký chung, tìm/lọc nguồn/mức độ/ngày; chi tiết và CSV; cảnh báo an ninh mẫu có xác nhận; màn hình tích hợp chờ chọn nhà cung cấp. |
| `/admin/settings` | Chung, coin/render, tài khoản/bảo mật, theo dõi; cấu hình mẫu có kiểm tra giá trị, lưu/khôi phục. |

Các biểu mẫu dùng dialog tại trang; hỗ trợ Escape, nhãn trường và lỗi nhập. Admin dùng Mona Sans, giao diện trắng/xám với màu berry; không thay header hoặc visual public.

## Dữ liệu và vị trí triển khai

| Nội dung | File chính | Local storage key |
|---|---|---|
| Routes/shell | `app/admin/[[...section]]/page.tsx`, `components/admin/AdminWorkspace.tsx`, `lib/admin/navigation.ts` | — |
| Thống kê mẫu | `components/admin/OverviewPanel.tsx`, `lib/admin/analytics.ts` | Không ghi lượt truy cập thật |
| User | `components/admin/UsersPanel.tsx`, `lib/admin/users-store.ts` | `labellab-admin-users-v1` |
| Đơn/coin/gói | `components/admin/CommercePanel.tsx`, `lib/admin/commerce.ts`, `lib/admin/commerce-store.ts` | `labellab-admin-commerce-v1` |
| Model/nội dung/ưu đãi/phiên bản | `components/admin/ManagementPanel.tsx`, `lib/admin/management-data.ts` | `labellab-admin-management-v1` |
| Nhật ký | `lib/admin/activity-store.ts` | `labellab.admin.demo.activity.v1` |
| Cài đặt/cảnh báo | `components/admin/OperationsPanel.tsx` | `labellab.admin.demo.settings.v1`, `labellab.admin.demo.alert-ack.v1` |

Metadata của ba model lấy từ `lib/labellab/catalog.ts` (`LAB_MODELS`): Basil Strawberry, Mango Juice, Aloe Mango. Giữ geometry đã tối ưu của web Vinut. Không thay model bằng bản Unity nặng. Logo và coin dùng tài nguyên thương hiệu đã cung cấp.

Local storage không phải dữ liệu kinh doanh. Có thể bị xóa/sửa bằng DevTools, khác nhau giữa thiết bị và không có giao dịch nguyên tử giữa các store. Không dùng cơ chế này để ghi nhận tiền hoặc quyền sở hữu coin thật.

## Đối chiếu project mẫu đã đọc

Gốc Vinut: `D:/program project/3d display product website`.

- `components/admin/AdminApp.tsx:32`, `:59`: module/navigation và thao tác catalog; nguồn cho model, tài nguyên, nội dung, xuất bản, vận hành.
- `components/admin/catalog/definitions.ts:62–63`: nhãn tương thích, model GLB/poster, UV, material slots, orientation, hiển thị/thứ tự Mockup.
- `components/admin/resources/ResourceWorkspace.tsx`: phân loại tài nguyên, upload, cấu hình file, lọc, lưu trữ/khôi phục.
- `components/admin/display/DisplayWorkspace.tsx`: preview và tương thích sản phẩm/model/nhãn; màu nắp/nước, offset/finish nhãn; nhánh 2D.
- `components/admin/publishing/PublishingWorkspace.tsx`: nháp, preflight, xuất bản, lịch sử và rollback.
- `components/admin/operations/OperationsWorkspace.tsx`, `lib/operations/contracts.ts`: analytics, an ninh, request log và audit log.
- `components/admin/HomepageLayoutConfig.tsx`: bật/tắt các lớp hiển thị trang chính.
- `lib/server/admin-api.ts`, `lib/server/local-repository.ts`: session owner/editor và SQLite của mẫu. Chưa được nhập làm backend của Labellab.

Vinut không có customer-user CRUD, coin, đơn nạp hoặc doanh thu. Các phần này được dựng mới cho Labellab, không phải chức năng có sẵn trong mẫu. Phân loại nước/hương vị/dinh dưỡng của Vinut không được bê thành menu nghiệp vụ riêng của nền tảng mockup.

Gốc Label Lab desktop: `D:/program project/label-lab-administrator`, đối chiếu với `D:/UnityHubData/Unity_3D_Mockup_Project`.

- `README.md`: xác nhận admin quản lý launcher Unity qua PlayFab và Cloudflare D1/R2.
- `app/api/admin/route.ts:143–320`, `playfab.ts:115–305`: quản lý tài khoản, khóa/mở khóa, hồ sơ và vai trò. Web giữ các luồng quản lý hồ sơ; phần xác thực web sẽ xây riêng.
- `app/api/storage/route.ts:62–268`, `db/schema.ts:96–121`: file/thư mục, metadata và đồng bộ kho tài nguyên.
- `db/schema.ts:125–170`, `app/components/AdminApp.tsx`: telemetry, nhật ký và trạng thái tích hợp; mẫu chưa nhận đủ telemetry launcher để có thống kê thật.
- Unity `Assets/System/Script/IntroManager.cs:35–107` và `LauncherSessionValidator.cs:106–126`: xác minh phiên launcher qua PlayFab. Không mang cơ chế phiên launcher sang web.
- Phát hành ZIP/manifest Stable/Beta và chữ ký RSA của launcher được đối chiếu về luồng quản lý; bản web hiện dùng snapshot catalog. Chưa có coin/payment/reward sẵn trong mẫu desktop để tái sử dụng.

## Hợp đồng backend cần làm tiếp

Các đường dẫn dưới đây là đề xuất, chưa phải API đang chạy.

### 1. Tài khoản, quyền và dữ liệu gốc

- Dùng relational database và migrations: user, admin role, session, profile, package, payment order, coin ledger, asset, model, label/material preset, content, reward rule, release, audit event.
- `POST /api/auth/login`, `/logout`, `/register`, `/forgot-password`, `/reset-password`; `GET /api/auth/session`. Phiên cookie HttpOnly/Secure, expiration/revocation; rate limit và xác minh email.
- `GET/POST /api/admin/users`; `GET/PATCH/DELETE /api/admin/users/:id`; phân trang/lọc/sắp xếp phía server. Không cho đọc mật khẩu hoặc password hash.
- Kiểm tra RBAC tại mọi endpoint và hành động, không chỉ ẩn button. Owner có quyền tài chính/phát hành; giới hạn quyền editor theo nhu cầu thực tế. Audit trước/sau và lý do cho thao tác nhạy cảm.

### 2. Coin và thanh toán

- `GET /api/admin/orders`, `/ledger`, `/coin-packs`; tạo checkout theo khu vực; chọn nhà cung cấp nội địa/quốc tế sau.
- Mỗi đơn lưu currency, amount bằng đơn vị nhỏ nhất, số coin và snapshot giá tại lúc tạo. Báo cáo VNĐ/USD tách riêng; không cộng hai tiền tệ hoặc tự quy đổi.
- Ledger append-only với idempotency key và transaction DB. Số dư được suy ra hoặc cập nhật nguyên tử từ ledger. Điều chỉnh admin tạo bút toán có lý do, không sửa số dư âm thầm.
- Webhook xác minh chữ ký, currency/amount/order, chống replay, có unique provider event/payment ID; nhận lặp không cộng coin lần hai. Checkout redirect phía client không được coi là bằng chứng trả tiền.
- Refund/reversal có bút toán đối ứng, kiểm soát trạng thái, quyền và trường hợp coin đã tiêu. Đối soát định kỳ với nhà cung cấp.
- Coin render cần reservation/commit/release để lỗi/hủy render không mất coin; quota miễn phí mỗi ngày xác định bằng thời gian server.

### 3. Thống kê và nhật ký

- `POST /api/events` hoặc collector; `GET /api/admin/analytics?from=&to=&granularity=`; aggregate theo múi giờ đã chọn.
- Event gợi ý: `page_view`, `login_success`, `studio_open`, `model_select`, `render_started`, `render_completed`, `render_failed`, `download_completed`, `checkout_created`, `payment_succeeded`, `reward_claimed`.
- Tách **hit**, session, unique visitor và authenticated user. Một user có thể tạo nhiều hit/session; guest không được coi là user định danh. Tách bot dựa trên nguồn server/edge và tín hiệu xác thực, có nhóm chưa xác định; không chỉ tin user-agent hoặc nhãn gửi từ client.
- Top login/Studio/payment phải dùng event/order thật theo kỳ, thời điểm đăng ký và trạng thái hợp lệ. Không giữ bộ sinh số liệu mẫu trong môi trường production.
- `GET /api/admin/audit`, `/security`; append-only, retention, pagination/export; không log mật khẩu/token/request chứa dữ liệu nhạy cảm. Cảnh báo gồm hành động xử lý và người xác nhận.

### 4. Tài nguyên, nội dung và xuất bản

- `POST /api/admin/uploads` cấp signed upload; kiểm tra MIME thực, kích thước, extension, checksum và nội dung model/texture. Quarantine/processing/ready/failed; giới hạn quyền và dung lượng.
- Object storage + CDN; quản lý URL/version, thumbnail, GLB processing và lỗi; ngăn tài nguyên đã bị xóa nhưng vẫn được snapshot tham chiếu.
- CRUD model/material/category/display/content với revision hoặc ETag để chặn ghi đè đồng thời. Kiểm tra tương thích UV, mesh slot, nhãn, model và texture ở server.
- `POST /api/admin/releases/preflight`, `/publish`, `/:id/rollback`; snapshot bất biến, publish nguyên tử, public chỉ đọc bản active. Rollback bản active không phá bản nháp đang sửa. Không xóa asset còn được release dùng.

### 5. Ưu đãi và cấu hình

- Rule và claim riêng cho check-in/wheel/share/coupon; lịch bắt đầu/kết thúc, timezone server, quota, campaign budget và xác suất wheel được xác định rõ.
- Claim được kiểm tra server, unique user/rule/day và ghi ledger trong cùng transaction. Kiểm soát tài khoản trùng, rate limit, replay, xác minh share và abuse; client không quyết định số coin thưởng.
- Settings server có schema/version, kiểm tra quyền, audit và secret manager. Không lưu API secret trong local storage hoặc bundle frontend.

## Lộ trình nối backend

1. **Nền tảng:** DB/schema/migrations, admin auth/RBAC, user CRUD, server audit; thay store user bằng API, giữ route/UI đã dựng.
2. **Tài chính:** package/order/ledger, số dư nguyên tử; sandbox gateway, webhook idempotency, refund, render quota/chi phí; đối soát.
3. **Catalog:** storage/upload pipeline, model/material/content CRUD, revision/preflight, release public và rollback.
4. **Đo lường:** collector server/edge, guest/auth/bot, thống kê kỳ và xếp hạng thật, export và retention.
5. **Rewards:** check-in, wheel, share/coupon theo rule đã chốt, ledger/anti-abuse và ngân sách chiến dịch.
6. **Vận hành:** staging/production tách biệt, backup/restore thử nghiệm, monitoring, quyền tối thiểu, kiểm thử thanh toán và kiểm tra truy cập trái phép trước mở thương mại.

Trong mỗi giai đoạn, bỏ fixture đúng phần đã nối; không trộn số liệu mẫu vào báo cáo thật. Kiểm tra lại Home/Studio sau tích hợp để bảo đảm visual, camera và renderer hiện tại được giữ nguyên.

## Kiểm tra đã thực hiện

- Lint, typecheck, production build.
- 46 tests hiện có, gồm 8 tests mới cho kỳ thống kê UTC+7, tổng số liệu, vòng đời user, trạng thái coin/đơn, tiền tệ và CSV.
- Trình duyệt: CRUD user mẫu, tìm kiếm/khóa, giao dịch cộng và thu hồi coin, persistence sau reload, model editor, preflight/phát hành/rollback và nhật ký chung.
- Kích thước đã xem: desktop 1440×900, laptop 1366×768 và mobile 390×844.
