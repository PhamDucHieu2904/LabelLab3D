# Labellab 3D

Bản frontend đầu tiên của nền tảng mockup bao bì Labellab. Website ưu tiên trình chỉnh sửa 3D; tên miền dự kiến `Labellab3D.com`.

## Chạy tại máy

Yêu cầu Node.js 20.9 trở lên (khuyên dùng bản LTS) và npm. Các phiên bản trực tiếp được pin trong `package.json`; dùng lockfile khi cài đặt lại.

Trên Windows, nhấp đúp `open-labellab.bat`. File sẽ kiểm tra Node.js/npm, tự chạy `npm ci` nếu chưa có thư viện và mở trình duyệt sau khi website sẵn sàng. Lần đầu sau khi clone cần Internet để tải thư viện; Git không lưu `node_modules`. Giữ cửa sổ `Labellab Dev Server` mở khi sử dụng, nhấn `Ctrl+C` trong cửa sổ đó để dừng.

Hoặc chạy thủ công:

```powershell
npm ci
npm run dev
```

Mở http://127.0.0.1:3005. Route `/` gồm editor và nội dung giới thiệu; `/studio` hiển thị editor gọn hơn. `?model=can-mango` hoặc `?model=pet-aloe` chọn model hợp lệ từ catalog, không nhận URL model tùy ý.

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm start
```

`npm start` chạy production build trên port 3005, cần build trước. Đã xác nhận typecheck, lint, 8 tests và production build đều pass trong lần kiểm tra cuối của agent chính.

## Có trong bản hiện tại

- Editor theo style Vinut cũ: canvas 3D phủ nền grid, rail công cụ dọc bên trái và một panel chức năng theo ngữ cảnh; responsive mobile chuyển rail thành hàng cuộn ngang và chỉ mở một panel mỗi lần.
- Ba mẫu: Basil Strawberry thủy tinh 290 ml, lon Mango 330 ml, PET Aloe Mango 500 ml, sử dụng đúng phiên bản model/material website tối ưu từ snapshot catalog công khai của VINUT. Basil mặc định là `glass-290-basil-web.glb`, không override sang bản High.
- Website mode mặc định: nền dâu basil `#D53660`, halo sáng, grid chuyển động và sản phẩm nghiêng/xoay. Studio mode: sản phẩm đứng trên sàn trắng thật, grid phối cảnh mờ dần 12–20 m theo contract asset hiện tại và fade mép viewport 8%. Asset mới phải kiểm tra source units.
- Orbit/zoom/reset, preset camera, điều chỉnh màu nước/nắp, vị trí nhãn, roughness/metalness nhãn, nền và tỷ lệ khung.
- Runtime Three.js với material kính/chất lỏng/basil, texture nhãn và pipeline ánh sáng/hậu kỳ trích từ project mẫu; không tuyên bố tương đương hoàn toàn Unity HDRP.
- Artwork PNG/JPEG/WebP tối đa 15 MB, mỗi cạnh tối đa 8192 px và tối đa 32 megapixel; xử lý cục bộ trong phiên trang.
- PNG preview 1024/2048 px cạnh dài, tỷ lệ 1:1, 4:5, 16:9, có dấu `labellab / PREVIEW`; xuất phía trình duyệt, miễn phí.

## Lưu dữ liệu và giới hạn

Thiết lập scene tự lưu vào `localStorage` với schema version và allowlist. Tối đa 20 bản lưu dự án gồm tên, thời gian và thiết lập trên trình duyệt này. Chưa đồng bộ máy/tài khoản; xóa dữ liệu trình duyệt sẽ mất các bản lưu.

Artwork chỉ là Blob URL thuộc phiên hiện tại: không đưa vào localStorage, không upload lên server, không khôi phục sau refresh. Đổi model hoặc tải lại bản lưu sẽ dùng nhãn mẫu khi artwork bị xóa; bản lưu không chứa file ảnh. Dữ liệu lưu cục bộ không cấp quyền thương mại hay token.

Production foundation hiện đã có đăng ký/đăng nhập email-mật khẩu, session HttpOnly, admin login/bootstrap, D1 wallet ledger, daily check-in, badges và lịch sử coin. Render charge dùng reservation → commit/release idempotent; client không tự chọn giá. Payment provider, webhook ký/xác minh, email verification/reset và server artifact render vẫn là các bước thương mại tiếp theo. Client PNG vẫn là preview và không phải ranh giới bảo vệ artifact trả phí.

## Tài liệu

- [Kế hoạch sản phẩm thương mại](LABELLAB3D_MASTER_PLAN.md)
- [Bàn giao triển khai](docs/IMPLEMENTATION_HANDOFF.md)
- [Định hướng UI và mapping ảnh tham chiếu](docs/LABELLAB_UI_DIRECTION.md)
- [Sàn Studio](docs/STUDIO_GROUND.md)

Bước tiếp theo: payment adapter/webhook idempotent, email verification/reset, server render/artifact entitlement và các migration D1 production theo từng gate.

## Cloudflare production

Worker production đang dùng tên `www`, nên URL chính là [www.labellab3d.workers.dev](https://www.labellab3d.workers.dev/). Cloudflare Dashboard xác nhận GitHub branch `main` đã nối với Worker và deployment production nhận 100% traffic. D1 production là `labellab3d-production`.

Sau khi cập nhật code, chạy migration D1 trước khi deploy worker:

```powershell
npx wrangler d1 migrations apply labellab3d-production --remote
npm run cf:build
npm run cf:deploy
```

Migration `0004_coin_reservation_reference.sql` phải được áp dụng trước bản worker dùng trường `coin_reservations.reference`.

## Giao diện và QA hiện tại

Mona Sans cho UI/body, Changa One cho display heading và Luckiest Guy cho wordmark/điểm nhấn; editor giữ tinh thần Vinut cũ với canvas hồng toàn nền, rail công cụ dọc, panel kính blur theo ngữ cảnh, nhãn Scene 1/Scene 2 và camera front/three-quarter. Berry icon trong grid đã được người dùng cho phép. Studio dùng matte pass riêng để sàn/nền #FFFFFF. Website PNG gồm grid/halo/background đang bật; không gồm chrome UI.

Trong đợt trước hiệu chỉnh Web-only, Chromium CUA đã kiểm tra 3 model, upload WEBP, color picker, refresh preferences, mở dự án lưu, 2 mode và tải PNG Studio 819×1024 / Website 2048×1152. Các chiều rộng 375/390/768/1024/1440 không có horizontal overflow. Ảnh tại `docs/screenshots`. Chưa kiểm tra đủ cross-browser/GPU, context loss, screen reader hoặc audit thương mại.

Hiệu chỉnh asset hiện tại: bỏ Basil High đã chọn nhầm ở prototype, giữ published web contracts cho cả ba model. Agent chính đã xác nhận bản web-only: typecheck/lint/8 tests/verify-assets (12 assets)/build đều pass; cả ba model ready ở hai mode, không request High, console không lỗi/cảnh báo. PNG Basil Web Studio 1024×1024 đã tải và xem kiểm tra sản phẩm/grid/watermark. Chưa có benchmark FPS hay backend thương mại hoàn chỉnh.


Ảnh bản web-only: docs/screenshots/labellab-basil-web.png và docs/screenshots/labellab-basil-web-export.png. Kiểm tra upload/responsive rộng hơn ở trên thuộc đợt trước hiệu chỉnh; không phải toàn bộ đã rerun.


# LabelLab3D
