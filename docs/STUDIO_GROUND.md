# Tích hợp sàn Studio

`lib/labellab/studio-ground.ts` xuất `createStudioGround(scene)` với `setEnabled`, `setFloorY`, `setRadius`, `setVisible`, `dispose`. Sàn XZ trắng kích thước 200×200, grid shader chống răng cưa và contact shadow procedural không cần texture tải ngoài.

## Units và vị trí

Giữ actual-metre units của catalog hiện tại, không normalize model về radius 1. Glass manifest có dimensionsMeters khoảng 0.18 m và appMetersPerSourceUnit 0.1. Khi thêm model, phải kiểm tra source units, conversion factor và dimensions manifest trước khi đưa vào cùng scene. Quy ước fade 20 m phục vụ trình bày catalog, không phải cam kết đo lường kỹ thuật.

Tạo controller một lần cho mỗi runtime. Sau khi model upright và world matrix cập nhật, đo bounds của product root, truyền min.y vào `setFloorY` và bounding-sphere radius vào `setRadius`. Không đo cả scene vì bounds sẽ gồm sàn. Product được center X/Z. Contact patch scale theo radius; đây là bóng grounding xấp xỉ, không phải physically accurate shadow simulation.

## Render và chuyển mode

Studio bật sàn/grid, tắt showcase tilt và dựng camera three-quarter nâng cao. Runtime lưu/restores background/fog khi đổi Website/Studio; HDRI environment vẫn phục vụ ánh sáng sản phẩm. Studio có matte pass riêng giữ sàn/nền #FFFFFF, không để tone mapping làm nền trắng chuyển xám. Website không hiển thị sàn.

Grid dùng world X/Z: minor 0.1 m, major 1 m. Camera-distance fade 12–20 m, thêm fade grid ink tại 8% mép viewport. Product, matte và contact shadow vẫn giữ full coverage ở mép. Shader premultiplied alpha, depthWrite false; offset nhỏ chống z-fighting. Không tự cài animation loop hay controls. Dispose geometry/material đúng một lần khi teardown.

`setVisible` phục vụ matte/capture composition. Mode change trong capture bị bỏ qua theo runtime contract. Studio PNG giữ sàn trắng/grid. Website preview PNG được frontend composite selected background, halo/grid đang bật và watermark, không gồm UI chrome. UI hiện chưa có transparent export.

## Xác minh hiện tại

Trong đợt trước hiệu chỉnh Web-only, agent chính đã chạy Chromium CUA với cả 3 model, hai mode và download PNG Studio 819×1024 / Website 2048×1152. Ảnh tại `docs/screenshots/labellab-studio.jpg` và `docs/screenshots/labellab-website.jpg`. Typecheck/lint/8 tests/verify-assets (12 assets)/build pass theo lần kiểm tra cuối của agent chính. Responsive 375/390/768/1024/1440 không horizontal overflow.

Cần kiểm tra thêm orbit grazing-angle/depth fade ở nhiều camera, resource disposal/memory profiling, cross-browser/GPU và WebGL context-loss. Không coi bằng chứng Chromium hiện tại là đầy đủ các kiểm tra này.


### Xác nhận sau hiệu chỉnh Web-only

Agent chính xác nhận typecheck/lint/8 tests (3 catalog/resolver + 5 preferences)/verify-assets (12 assets)/build đều pass. Chromium switch cả ba model cho thấy chỉ studio-softbox.exr và glass-290-basil-web.glb/can-330.glb/pet-500-short-label.glb; không tải High GLB/buffers/HDRI. Cả ba ready ở Website/Studio, console không lỗi/cảnh báo. PNG Basil Web Studio 1024×1024 đã tải và kiểm tra trực quan sản phẩm/grid/watermark. SHA256 cả ba GLB trùng source VINUT (Basil 424312 bytes, can 126500 bytes, PET 1128836 bytes).

Bằng chứng mới: `docs/screenshots/labellab-basil-web.png`, `docs/screenshots/labellab-basil-web-export.png`. Các kiểm tra upload WEBP/color picker/preferences/project restore/responsive và PNG portrait/landscape ghi phía trên là đợt kiểm tra rộng hơn trước hiệu chỉnh, không được hiểu là toàn bộ đã rerun. Không có benchmark FPS hoặc audit cross-browser/GPU/context loss/screen reader/commercial.

