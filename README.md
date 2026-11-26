# HyperMockup

Nền tảng web 3D Packaging & Product Mockup Studio (`hypermockup.com`) chạy trực tiếp trên trình duyệt với Three.js, Parametric CAD Boxes/Trays, hệ thống tài khoản Cloudflare D1, nạp Coin nội địa qua SePay VietQR và thanh toán quốc tế qua Polar.sh Merchant of Record.

## Chạy tại máy

Yêu cầu Node.js 20.9 trở lên (khuyên dùng bản LTS) và npm.

```powershell
npm ci
npm run dev
```

Mở `http://127.0.0.1:3005`. Route `/` gồm dashboard trang chủ và các gói Coin; `/studio` hiển thị trình chỉnh sửa 3D và Parametric CAD; `/legal/*` hiển thị bộ điều khoản pháp lý song ngữ Việt – Anh.

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm start
```

## Tính năng chính

- Thư viện mô hình 3D bao bì tối ưu web (chai thủy tinh, lon nhôm, chai PET, chai PP, hộp/khay Parametric CAD mm + xuất Dieline 1:1 SVG/PDF/DXF) thuộc quyền sở hữu của chủ sở hữu HyperMockup.
- Hai chế độ hiển thị: Website mode (showcase động) và Studio mode (sàn trắng thực, bóng tiếp xúc, grid phối cảnh).
- Xử lý artwork nhãn cục bộ trong phiên trình duyệt WebGL (PNG/JPEG/WebP tối đa 15 MB, mỗi cạnh tối đa 8192 px, tối đa 32 MP); không tự động tải file artwork lên máy chủ.
- Hệ thống tài khoản email + OTP, Google OAuth, phiên HttpOnly/Secure/SameSite, ví Coin ledger bất biến trên Cloudflare D1, điểm danh hằng ngày, ghi nhận đồng ý pháp lý (`legal_consents`) và lưu thông tin biên nhận/hóa đơn (`order_receipts`).
- Thanh toán tách vùng theo quy định ngoại hối Việt Nam: SePay VietQR (VND) cho khách hàng tại Việt Nam và Polar.sh Merchant of Record (USD) cho khách hàng ngoài lãnh thổ Việt Nam.

## Cloudflare production & Migrations

Sau khi cập nhật code, chạy migration D1 trước khi deploy Worker:

```powershell
npx wrangler d1 migrations apply labellab3d-production --remote
npm run cf:build
npm run cf:deploy
```

Migration `0010_legal_compliance.sql` bổ sung bảng `legal_consents` (lưu lịch sử đồng ý Điều khoản & Chính sách bảo vệ dữ liệu cá nhân theo Luật 91/2025/QH15) và bảng `order_receipts` (lưu thông tin xuất biên nhận/hóa đơn cho đơn SePay).

## Cấu hình thông tin pháp lý chủ sở hữu cá nhân

Trước khi nộp hồ sơ Thông báo website TMĐT trên `online.gov.vn`, vào mục riêng **`/admin/legal` (Pháp lý & thuế)** trong thanh bên Admin để:
- Cập nhật Họ tên chủ sở hữu cá nhân, Mã số thuế cá nhân (12 số CCCD, mặc định ẩn bớt các số giữa công khai dạng `079•••••6789`), Địa chỉ, SĐT, Email hỗ trợ và link `online.gov.vn`.
- Làm theo danh sách 6 bước thiết lập 1 lần, quy trình đối soát 5 phút mỗi tháng và xuất CSV đối soát thuế khi cần.
