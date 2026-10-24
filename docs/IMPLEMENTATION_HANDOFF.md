# Bàn giao triển khai Labellab — frontend v0.1

Ngày: 23/10/2026. Tài liệu mô tả code hiện tại; chưa thay thế các gate thương mại trong master plan.

## 1. Cách chạy và ranh giới phiên bản

`npm install`, `npm run dev`, mở http://127.0.0.1:3005. `/` là trang editor-first kèm collection/materials; `/studio` ẩn nội dung marketing hỗ trợ. `npm run build` rồi `npm start` cho production local cùng port.

Stack: Next.js App Router 16.2.6, React/React DOM 19.3.0, TypeScript, raw Three.js 0.180.0, Lucide. Không dùng Unity WebGL và không tích hợp backend thương mại ở phase này. Model/material runtime được chọn lọc từ project web mẫu, branding UI là Labellab.

## 2. Cấu trúc chính

| Đường dẫn | Trách nhiệm |
|---|---|
| `app/page.tsx`, `app/studio/page.tsx` | Hai entry route dùng cùng ứng dụng |
| `components/labellab/LabellabApp.tsx` | State scene, thư viện, upload, bản lưu, dialog export và phần giới thiệu |
| `components/labellab/SceneCanvas.tsx` | Lazy-load runtime, đồng bộ model/settings, ResizeObserver, keyboard camera, loading/error/retry |
| `components/labellab/MovingGrid.tsx` | Tile/grid berry, pointer direction và autodrift từ logic website mẫu |
| `lib/labellab/catalog.ts` | Adapter snapshot published catalog; 3 model public hợp lệ |
| `lib/labellab/preferences.ts` | Schema localStorage, allowlist, finite bounds và safe storage |
| `lib/labellab/local-artwork.ts` | Registry Blob URL chỉ thuộc session upload, revoke khi thay/xóa |
| `lib/labellab/studio-ground.ts` | Sàn XZ thật, grid shader, contact shadow, fade, disposal |
| `lib/mockup/runtime.ts` | Lifecycle scene/render, material overrides, selection, camera, capture |
| `lib/viewer/basil-*`, `bottle-*`, `aloe-*` | Material và optics kế thừa, thích ứng texture/bề mặt |

## 3. Hành vi và model

Mặc định chọn `basil-strawberry`: chai 290 ml bản website tối ưu (`glass-290-basil-web.glb`), label dâu thật, cap vàng và liquid hồng. Các mẫu `can-mango`, `pet-aloe` được resolve từ snapshot catalog cùng appearance/label tương ứng. Runtime không nhận arbitrary remote model URL từ query.

Website mode dùng nền `#D53660` tùy chỉnh được, halo và grid động; motion `showcase` nghiêng/xoay mặc định. Idle dừng motion. Studio mode tắt motion, giữ upright, thêm sàn trắng và grid phối cảnh fade về trắng ở 20 m theo contract asset hiện tại; glass dimensionsMeters khoảng 0.18 m và appMetersPerSourceUnit 0.1; cần kiểm tra units cho mỗi model mới. Mỗi mode giữ cùng model/artwork/material settings.

Model và material contract của cả ba mẫu giữ đúng phiên bản website đã publish của project VINUT. Basil dùng web GLB/web slots, không tự override sang High geometry/slots/optical buffers/HDRI; helper High còn trong source chỉ phục vụ tương thích, không phải mặc định. PNG capture sử dụng runtime rồi composite nền/halo và watermark ở canvas 2D. Chưa có bằng chứng trong tài liệu này rằng màu, refraction và alpha hoàn toàn tương đương Unity HDRP; cần visual QA đối chiếu trên nhiều GPU/trình duyệt.

Điều chỉnh có trong UI: màu nước/nắp, label offset -50..50%, label roughness/metalness 0..1, camera preset, zoom/reset, scene mode, màu nền, grid/highlight, frame/resolution. Upload thay baseColorMap của label theo UV có sẵn, chưa có crop editor hay kiểm tra print-safe area đầy đủ.

## 4. Persistence và artwork

- Key scene: `labellab.scene.preferences.v1`; envelope `{version:1, preferences}`. Unknown fields bị bỏ; model/mode/frame/resolution được allowlist; màu `#RRGGBB`; numeric hữu hạn được clamp; storage/JSON lỗi trở về mặc định.
- Key project: `labellab.projects.v1`; tối đa 20 entries; lưu id, tên, ngày và settings; chỉ ở origin/browser hiện tại. Chưa có server versioning, sharing hoặc đồng bộ tài khoản.
- Artwork chấp nhận PNG/JPEG/WebP; 15 MB, 8192 px/cạnh, 32 MP. Decode trên máy và cấp Blob URL qua registry session. Thay ảnh/đổi model/xóa/unmount revoke URL.
- Artwork không được serialize, không upload server và không tồn tại qua refresh. Bản lưu dự án chỉ giữ settings, không giữ file. Người dùng phải tải lại ảnh trong phiên sau.
- Preferences không chứa token balance hoặc quyền download. Local state luôn là dữ liệu không tin cậy khi có backend sau này.

## 5. Export và phạm vi thương mại

PNG preview có watermark `labellab / PREVIEW`, cạnh dài 1024 hoặc 2048, tỷ lệ square 1:1 / portrait 4:5 / landscape 16:9. UI tạo ảnh trước rồi mới cung cấp link Lưu PNG. Không tiêu hao token. Hiện UI không cung cấp transparent export; Website PNG gồm grid, halo và background đang bật; chrome UI không nằm trong file composite.

Chưa triển khai auth, reset password, ledger, payment, webhook, daily free entitlement, spin, referral hoặc campaign engine. Không xem watermark/browser capture là bảo mật: người dùng kiểm soát client, có thể sửa code/canvas. Paid/no-watermark artifact phải do server authoritative tạo/cấp quyền.

## 6. Kiểm tra và rủi ro còn lại

Commands: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Tại thời điểm viết phần này, tác giả đã chạy trực tiếp `node --test scripts/tests/preferences.test.cjs`: 5/5 đạt cho round-trip schema, JSON/version sai, bounds/types, hostile values và blocked storage. Agent chính đã rerun và xác nhận typecheck/lint/test (8 tests)/verify-assets (12 assets)/build đều pass.

Browser QA cần kiểm tra: cả 3 models, mode round-trip, upright/floor contact, perspective fade, custom artwork, material controls, camera keyboard/mouse/touch, reload settings, project restore, PNG kích thước/màu/watermark, 375/768/1024/1440px, reduced-motion, hidden tab, WebGL context loss/retry. Đặc biệt kiểm tra contrast text trên pink glass/halo và CTA sáng. PNG preview hiện là export cục bộ, chưa có job retry server/checksum/download history.

## 7. Bước tiếp theo để thương mại

1. Chốt asset license, packaging/UV/material contracts và pipeline draft → preflight → immutable release.
2. Bổ sung auth/session, email verification/reset, private media storage và upload validation server; chuyển dự án sang PostgreSQL có ownership/versioning.
3. Ledger token append-only + reservation/commit/release idempotent; quote server hiển thị cost/free allowance trước export. Không nhận balance/cost/quyền từ localStorage.
4. Payment adapter và webhook ký/xác minh; grant token sau paid event, replay/reconciliation/refund có audit.
5. Render worker/artifact service nhận manifest/settings đã validate; chỉ signed URL cho entitlement ready, commit token sau render thành công, void/refund khi lỗi. Giữ client capture cho preview có watermark.
6. Triển khai daily free/spin/referral/campaign cùng unique constraints, timezone và anti-abuse; chưa dùng animation client để quyết định reward.
7. Staging, observability, secrets, backup/restore, browser/accessibility/security/load QA và release gates trước commercial beta.

## 8. Bản cuối và bằng chứng QA

UI thực tế: Mona Sans cho UI/body, Changa One cho display heading và Luckiest Guy cho wordmark/accent; editor theo style Vinut cũ với canvas hồng toàn nền, rail công cụ dọc và một panel kính blur theo ngữ cảnh thay cho workbench ba khung. Rail gồm Models, Artwork, Scene, Materials và Export; nhãn scene hiển thị là Scene 1/Scene 2, motion vẫn Website/Idle. Camera front/three-quarter cùng zoom/reset; không có focal-length/speed control. Berry icon trong grid được người dùng cho phép. Studio matte pass riêng giữ white #FFFFFF, grid fade 12–20 m cùng fade ink ở 8% mép viewport; product/contact shadow không bị fade theo mép.

Đợt trước hiệu chỉnh Web-only, agent chính xác nhận Chromium CUA: 3 model, upload WEBP, color picker, refresh preferences, project restore, hai mode, tải Studio PNG 819×1024 và Website PNG 2048×1152. Website export gồm grid/halo/background, không gồm UI chrome. Các chiều rộng 375/390/768/1024/1440 không horizontal overflow. Ảnh chụp: `docs/screenshots/labellab-website.jpg` và `docs/screenshots/labellab-studio.jpg`.

Chưa xác nhận cross-browser/GPU matrix, WebGL context loss, screen reader, hay audit security/commercial. Danh sách QA rộng hơn ở mục 6 là việc cần làm tiếp, không phải các mục đã pass. Client export vẫn chỉ là preview watermark; không cấp quyền paid artifact.

## 9. Hiệu chỉnh model về phiên bản website tối ưu

Quy tắc cho mọi model bổ sung sau này: lấy model và material contract đã tối ưu từ project web VINUT (`D:\program project\3d display product website`), giữ cùng geometry/slots/UV/sampler/appearance. Không thay bằng bản Label Lab PC/Unity High. Đối chiếu asset nguồn và kiểm tra tải/render trên web trước khi đưa vào catalog.

Theo yêu cầu người dùng, cả ba model dùng nguyên asset/material contracts website đã publish. Basil mặc định là `glass-290-basil-web.glb`; bỏ lựa chọn High nhầm ở prototype trước. Bản web-only đã pass typecheck/lint/8 tests (3 catalog/resolver + 5 preferences)/verify-assets (12 assets)/build. Inventory Chromium chỉ có studio-softbox.exr và GLB Web Basil/can/PET; không có High GLB/buffers/HDRI. Cả ba model ready trong Website/Studio, console zero errors/warnings. PNG Basil Web Studio 1024×1024 đã tải và xem kiểm tra sản phẩm/grid/watermark. Audit SHA256 xác nhận cả ba GLB trùng nguyên bản VINUT: Basil 424312 bytes, can 126500 bytes, PET 1128836 bytes. Các kiểm tra upload/responsive rộng hơn ở mục 8 thuộc đợt trước hiệu chỉnh; chưa chạy lại toàn bộ ma trận. Chưa công bố FPS đo được hoặc bảo đảm hiệu năng trên mọi GPU.


Ảnh bản web-only: docs/screenshots/labellab-basil-web.png và docs/screenshots/labellab-basil-web-export.png.


