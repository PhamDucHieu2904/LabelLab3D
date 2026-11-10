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
| `lib/labellab/catalog.ts` | Adapter snapshot published catalog plus five native blank can geometries; 8 model entries and 8 packaging families |
| `lib/labellab/preferences.ts` | Schema localStorage, allowlist, finite bounds và safe storage |
| `lib/labellab/local-artwork.ts` | Registry Blob URL chỉ thuộc session upload, revoke khi thay/xóa |
| `lib/labellab/studio-ground.ts` | Sàn XZ thật, grid shader, contact shadow, fade, disposal |
| `lib/mockup/runtime.ts` | Lifecycle scene/render, material overrides, selection, camera, capture |
| `lib/viewer/basil-*`, `bottle-*`, `aloe-*` | Material và optics kế thừa, thích ứng texture/bề mặt |

## 3. Hành vi và model

Mặc định chọn `basil-strawberry`: chai 290 ml bản website tối ưu (`glass-290-basil-web.glb`), label dâu thật, cap vàng và liquid hồng. Các mẫu `can-mango`, `pet-aloe` được resolve từ snapshot catalog cùng appearance/label tương ứng; năm hình dáng lon còn lại dùng GLB web Vinut nguyên trạng với label trống để người dùng upload artwork. Runtime không nhận arbitrary remote model URL từ query.

Website mode dùng nền `#D53660` tùy chỉnh được, halo và grid động; motion `showcase` nghiêng/xoay mặc định. Idle dừng motion. Studio mode tắt motion, giữ upright, thêm sàn trắng và grid phối cảnh fade về trắng ở 20 m theo contract asset hiện tại; glass dimensionsMeters khoảng 0.18 m và appMetersPerSourceUnit 0.1; cần kiểm tra units cho mỗi model mới. Mỗi mode giữ cùng model/artwork/material settings.

Model và material contract của ba display đã publish cùng sáu hình học lon giữ đúng phiên bản website của project VINUT. Basil dùng web GLB/web slots, không tự override sang High geometry/slots/optical buffers/HDRI; helper High còn trong source chỉ phục vụ tương thích, không phải mặc định. PNG capture sử dụng runtime rồi composite nền/halo và watermark ở canvas 2D. Chưa có bằng chứng trong tài liệu này rằng màu, refraction và alpha hoàn toàn tương đương Unity HDRP; cần visual QA đối chiếu trên nhiều GPU/trình duyệt.

Điều chỉnh có trong UI: màu nước/nắp, label offset -50..50%, label roughness/metalness 0..1, camera preset, zoom/reset, scene mode, màu nền, grid/highlight, frame/resolution. Upload thay baseColorMap của label theo UV có sẵn, chưa có crop editor hay kiểm tra print-safe area đầy đủ.

## 4. Persistence và artwork

- Key scene: `labellab.scene.preferences.v1`; envelope `{version:1, preferences}`. Unknown fields bị bỏ; model/mode/frame/resolution được allowlist; màu `#RRGGBB`; numeric hữu hạn được clamp; storage/JSON lỗi trở về mặc định.
- Key project: `labellab.projects.v1`; tối đa 20 entries; lưu id, tên, ngày và settings; chỉ ở origin/browser hiện tại. Chưa có server versioning, sharing hoặc đồng bộ tài khoản.
- Artwork chấp nhận PNG/JPEG/WebP; 15 MB, 8192 px/cạnh, 32 MP. Decode trên máy và cấp Blob URL qua registry session. Thay ảnh/đổi model/xóa/unmount revoke URL.
- Artwork không được serialize, không upload server và không tồn tại qua refresh. Bản lưu dự án chỉ giữ settings, không giữ file. Người dùng phải tải lại ảnh trong phiên sau.
- Preferences không chứa token balance hoặc quyền download. Local state luôn là dữ liệu không tin cậy khi có backend sau này.

## 5. Export và phạm vi thương mại

PNG preview có watermark `labellab / PREVIEW`, cạnh dài 1024 hoặc 2048, tỷ lệ square 1:1 / portrait 4:5 / landscape 16:9. UI tạo ảnh trước rồi mới cung cấp link Lưu PNG. Không tiêu hao token. Hiện UI không cung cấp transparent export; Website PNG gồm grid, halo và background đang bật; chrome UI không nằm trong file composite.

Google OAuth được bổ sung tại mục 19; đăng nhập/đăng ký email và reset password chưa nối dịch vụ tài khoản. Chưa triển khai ledger, payment, webhook, daily free entitlement, spin, referral hoặc campaign engine. Không xem watermark/browser capture là bảo mật: người dùng kiểm soát client, có thể sửa code/canvas. Paid/no-watermark artifact phải do server authoritative tạo/cấp quyền.

## 6. Kiểm tra và rủi ro còn lại

Commands: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Tại thời điểm viết phần này, tác giả đã chạy trực tiếp `node --test scripts/tests/preferences.test.cjs`: 5/5 đạt cho round-trip schema, JSON/version sai, bounds/types, hostile values và blocked storage. Agent chính đã rerun và xác nhận typecheck/lint/test (8 tests)/verify-assets (12 assets)/build đều pass.

Browser QA cần kiểm tra: cả 3 display scenes và 6 hình học lon, mode round-trip, upright/floor contact, perspective fade, custom artwork, material controls, camera keyboard/mouse/touch, reload settings, project restore, PNG kích thước/màu/watermark, 375/768/1024/1440px, reduced-motion, hidden tab, WebGL context loss/retry. Đặc biệt kiểm tra contrast text trên pink glass/halo và CTA sáng. PNG preview hiện là export cục bộ, chưa có job retry server/checksum/download history.

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

Theo yêu cầu người dùng, ba display mẫu và sáu hình học lon dùng nguyên asset/material contracts website đã publish hoặc export từ VINUT. Basil mặc định là `glass-290-basil-web.glb`; bỏ lựa chọn High nhầm ở prototype trước. Năm lon mới có label trống, poster riêng và được cho phép upload artwork. Bản web-only đã pass typecheck/lint/tests/verify-assets/build. Inventory Chromium chỉ có các GLB web và runtime decoder; không có High GLB/buffers/HDRI. Các kiểm tra upload/responsive rộng hơn ở mục 8 thuộc đợt trước hiệu chỉnh; chưa chạy lại toàn bộ ma trận. Chưa công bố FPS đo được hoặc bảo đảm hiệu năng trên mọi GPU. Chi tiết hash và poster nằm trong `docs/ASSET_MIGRATION.md`.


Ảnh bản web-only: docs/screenshots/labellab-basil-web.png và docs/screenshots/labellab-basil-web-export.png.

## 10. Properties mở rộng — 02/11/2026

Nhãn Materials trên rail và tiêu đề Settings đổi thành **Properties**. `components/labellab/PropertiesPanel.tsx` chia inspector thành bốn nhóm gọn: Liquid, Cap/Top, Bottle/Body và Label; chỉ hiện nhóm có semantic material slot tương ứng. Mỗi lần mở một nhóm, có reset riêng. Numeric input nhập trực tiếp và slider dùng chung giá trị; màu có picker cùng trường hex. Panel giữ theme kính hồng/white và neutral Studio, xếp dưới canvas ở chiều rộng từ 1000 px trở xuống.

Nắp chỉnh màu, metallic và roughness; thân chai/lon chỉnh metallic và roughness. Label giữ chỉnh vị trí, metallic và roughness. Liquid có **24 loại nước, 120 preset màu có tên**, cùng màu tùy chỉnh, clarity, optical density, turbidity và brightness. Fine-tune hiện IOR, light scattering hoặc liquid roughness theo loại nước. Thư viện khai báo trong `lib/labellab/liquid-presets.ts`, có thể mở rộng bằng dữ liệu.

Các trường mới được validate/clamp và lưu cùng preferences/project hiện có, tương thích envelope version 1. Trong phiên hiện tại, chuyển model giữ riêng toàn bộ material properties cho từng model; refresh/bản lưu giữ settings của model đang chọn. Mở project xóa cache material trong phiên để tránh khôi phục nhầm chỉnh sửa cũ. Artwork vẫn theo giới hạn persistence đã ghi ở mục 4.

`liquidCustomized: false` giữ optical shader gốc của model; đổi màu đơn thuần tiếp tục dùng optics gốc. Chọn loại/preset hoặc chỉnh thông số quang học bật custom optics; reset Liquid trả về optics gốc. `lib/labellab/material-overrides.ts` chỉ gửi các slot được hỗ trợ; `lib/viewer/liquid-adjustments.ts` bổ sung live uniforms trên material hiện có để preview và PNG dùng cùng trạng thái. Finish chưa chỉnh giữ PBR riêng của các mesh.

Loại nước/preset mô tả diện mạo quang học của chất lỏng tĩnh: không tự thêm geometry hạt, thạch, bọt, pulp, không thay hình học model và không mô phỏng fluid dynamics/độ nhớt vật lý. Hạt/thạch có sẵn trong model được giữ lại. Density là độ đậm quang học, không phải khối lượng riêng đo được.

QA phần Properties ngày 02/11/2026: typecheck, lint, 75 tests, verify-assets và production build pass. Chromium CUA xác nhận chọn Milk/Still water/Berry presets trên Nata và Basil thay đổi preview, chỉnh IOR và nhập trực tiếp số/hex, reset từng nhóm, chuyển Nata → lon → Nata giữ metallic 35%/roughness 20%, lon chỉ hiện Top/Body/Label. Đã kiểm tra theme hồng, white Scene 1 và neutral Scene 2. Viewport điện thoại 390×844 có vùng nội dung 375 px, scrollWidth 375 px, panel 351 px; các ô nhập và nhóm nâng cao dùng được khi cuộn tới. PNG Basil 1024×1024 transparent được render, tải và kiểm tra trực quan; không có console error trong những thao tác trên. Ảnh bằng chứng: `artifacts/screenshots/properties-studio.jpg`. Chưa lặp lại ma trận cross-browser/GPU, screen reader và toàn bộ độ phân giải cao cho đợt Properties này.


## 11. PET 350 ml Juice — 02/11/2026

Đã thêm model người dùng cung cấp vào Model Library > PET với id `pet-350-juice`, nắp trắng và nhãn trống. Nước mặc định Fruit juice / Apple; Reset Liquid giữ đúng mặc định Juice và custom optics. Giữ binary geometry/UV nguồn, thêm scale về mét và inset ngang nước 0.8% để tránh giao bề mặt. Script import, manifest provenance và poster riêng nằm trong `scripts/import-pet350.cjs` và `public/models/bottles/`.

QA: lint, typecheck, 76 tests, verify-assets và production build pass. Chromium xác nhận thumbnail tải được sau reload, chọn preset rồi reset về Apple, upload artwork khớp bề mặt nhãn, xóa artwork về nhãn trắng; PNG transparent 1024 px render/tải thành công. Không có console error trong kiểm tra cuối. Ảnh: `artifacts/screenshots/pet-350-juice-studio.jpg`. Nhãn nguồn phủ phần lớn thân/shoulder nên Juice chỉ lộ ở cổ và đáy khi để nhãn trắng.

## 12. PET 330 ml Energy drink + Sparkling — 02/11/2026

Model `pet-330-energy` dùng GLB Web do người dùng cung cấp, giữ geometry/UV nguồn và thêm root scale về mét. Library > PET có 330 ml Bottle, mặc định Energy drink / Orange màu #FFD600, nắp/nhãn trắng, optics tùy chỉnh. Properties > Liquid thêm Sparkling 0–100% trên model có volume được hiệu chỉnh; mặc định 51.6%, reset cùng nhóm Liquid. Giá trị được validate, lưu preferences/project và bộ nhớ riêng từng model. Energy có thêm preset Orange; tổng thư viện 121 màu.

Đã đối chiếu prefab PET330, script hạt bọt, shader và preset tăng lực của Label Lab Unity. Bọt sphere instance giữ tỉ lệ cầu, có viền Fresnel và glint, màu theo nước; số lượng tối đa 300 theo đường cong gốc. Bọt nổi trong nước, chừa khoảng cách vách/mặt nước, loại vùng nhãn. Ràng buộc đường nổi từ tam giác nguồn tránh lọt ra ngoài cổ/vai lõm; không sử dụng các hạt trắng phẳng dán lên vỏ. Reduced motion giữ bọt tĩnh, xuất PNG đóng băng cùng trạng thái cho mọi tile. Web dùng đường nổi thẳng đứng và PET optics hiện có, không phải bản port pixel-identical của HDRP.

QA: lint, typecheck, 79 tests, verify-assets và production build pass. Test dùng tam giác Water thật của GLB để kiểm tra containment, kích thước cầu, chuyển động nổi và 0%/100%; catalog test xác nhận buffer/hash/slots/UV và persistence. Chromium kiểm tra Sparkling 0% = 0 hạt, reset 51.6% = 135 hạt, 100% = 300 hạt, đổi model giữ giá trị 73%, upload/xóa artwork, xuất/tải PNG transparent 1024 px. Poster lấy từ ảnh export thực. Ảnh: `artifacts/screenshots/pet-330-energy-studio.jpg`. Chưa chạy ma trận GPU/cross-browser hoặc benchmark FPS.

## 13. Glass 280 ml Milk coffee — 02/11/2026

Model `glass-280-latte` dùng file Glass 280ml model - Web.glb do người dùng cung cấp, giữ nguyên binary geometry/normal/UV và thêm root scale 0.1 về mét. Model Library > Glass có 280 ml Bottle, mặc định Coffee / Latte (#B88C69), nắp kim loại bạc và custom optics. Reset Liquid trả về Latte; lựa chọn và thuộc tính được lưu theo cơ chế preferences/project hiện có. Thư viện hiện có 12 packaging families.

Profile riêng `glass-280-v1` dùng native glass transmission để thấy cà phê sữa bên trong. Cap chỉnh độc lập với lớp lót White layer. Vùng Label nguồn phủ gần toàn chai và kéo lên viền nắp; nhãn trống màu trắng, upload thay artwork và xóa artwork trả về nhãn trắng. Poster WebP riêng lấy từ PNG transparent 1024 px render thực; source không bị ghi đè.

QA: lint, typecheck, 81 tests, verify-assets và production build pass. Catalog test xác nhận buffer/hash/slots/UV và mặc định Latte/persistence; material test xác nhận nhãn trống, upload/xóa và lớp lót nắp trắng khi đổi màu nắp. Chromium xác nhận chọn Glass280, đổi Espresso rồi reset về Latte, upload/xóa artwork, render/tải PNG transparent 1024 px, reload giữ model và Latte, thumbnail tải thành công; không có console error trong kiểm tra cuối. Ảnh: `artifacts/screenshots/glass-280-latte-library.jpg` và `artifacts/screenshots/glass-280-latte-studio.jpg`. Chưa chạy ma trận cross-browser/GPU cho model này.

## 14. Glass 280 ml Short Milk coffee — 02/11/2026

Đã thêm riêng file Glass 280ml model_Short Web.glb người dùng cung cấp vào Model Library > Glass với tên **280 ml Short Bottle**, id `glass-280-short-latte`. Giữ geometry/UV nguồn cùng root scale về mét. Body / Neck / GlassBase được nối đầy đủ vào nhóm Bottle; nắp bạc, lớp lót trắng cố định, nhãn trống trắng và Coffee / Latte mặc định dùng profile Glass280 hiện có. Script import nhận thêm đối số `short`; bản 280 ml trước giữ asset và lựa chọn riêng. Thư viện hiện có 13 packaging families.

Cập nhật sửa lỗi vật liệu cho cả hai mẫu: Cap/White layer opaque, double-sided và ghi depth nên không lộ nền ở mặt dưới nắp. Label giữ alpha 1 kể cả sau xóa artwork, vẽ sau transmission để tránh vệt tam giác cà phê ở chân nhãn. Kính IOR 1.52, độ dày vật lý wall/neck/base 2/2.5/4 mm không bị thu nhỏ theo scale Blender; bỏ depth write của kính và sửa alpha clear của transmission để xuất PNG đúng. Water inset ngang 0.8% tránh giao nhãn ở gót chai, không đổi fill height/binary geometry/UV. URL GLB/poster có version theo SHA manifest. Bản tiêu chuẩn giữ nguyên màng co phủ viền nắp; bản Short chừa cổ kính và có thể nhìn thấy mặt cà phê qua cổ ở góc từ trên xuống.

QA sau sửa: typecheck, lint, 84 tests, verify-assets và production build pass. Hai regression test đọc GLB thật qua pooled appearance, kiểm tra lớp nắp/liner/nhãn, phục hồi drawRange cả khi render lỗi, độ dày cổ kính theo mét và containment nước tại gót nhãn. Chromium kiểm tra thay/xóa artwork trên cả hai mẫu, nhãn trắng, mặt dưới nắp trên nền hồng và Scene 2; tải và kiểm tra PNG transparent 1024 px bản tiêu chuẩn, 4096 px bản Short. Poster đã tạo lại từ hai PNG này. Không có console error; driver có một cảnh báo biên dịch hàm transmission của Three, ảnh vẫn render thành công. Chưa chạy ma trận GPU/cross-browser. Ảnh bằng chứng: `artifacts/screenshots/glass-280-fixed-artwork.jpg`, `artifacts/screenshots/glass-280-short-fixed-artwork.jpg`, `artifacts/screenshots/glass-280-fixed-studio.jpg`.

QA: lint, typecheck, 82 tests, verify-assets và production build pass. Test xác nhận asset/poster riêng, binary/hash/UV, ba slot kính truyền sáng và Latte defaults/persistence. Chromium xác nhận chọn bản Short, đổi Espresso/reset Latte, upload rồi xóa artwork theo vùng nhãn nguồn, render/tải PNG transparent 1024 px, reload giữ model và Latte; thumbnail riêng tải thành công, không có console error trong kiểm tra cuối. Poster lấy từ PNG render thực. Ảnh: `artifacts/screenshots/glass-280-short-latte-library.jpg` và `artifacts/screenshots/glass-280-short-latte-studio.jpg`. Chưa kiểm tra ma trận cross-browser/GPU cho model này.

## 15. Thay bốn GLB đã subdivision — 02/11/2026

Đã thay hai Glass 280 ml, PET330 và PET350 bằng bốn GLB mới người dùng gửi. PET350 dùng nguồn mới `Pet 350ml bottle model web.glb`. Tổng tam giác lần lượt là 50.204 / 51.164 / 52.036 / 59.556; riêng thân PET330 tăng 200 → 3.200 và Water tăng 956 → 15.040, đáy tròn hơn khi xem cận. Giữ model ID và toàn bộ thiết lập Properties, mặc định Latte/Energy/Juice, nhãn trắng, nắp/liner kín, kính theo mét và sparkling. Không chạy giảm poly hay subdivision ở runtime; geometry/normal/UV binary của từng GLB mới được giữ nguyên qua bước chuyển vật liệu/đơn vị. Cả PET330/PET350 cũng có URL model/poster version theo SHA, cùng cơ chế hai chai Glass.

QA: typecheck, lint, 84 tests, verify-assets và production build pass. Các test containment nước/nhãn, độ dày cổ kính và đường nổi sparkling chạy trên mesh mới. Chromium xác nhận chọn và hiển thị cả bốn model, render/tải PNG transparent PET330 4096 px và ba model còn lại 1024 px; không có console error. Poster của cả bốn model đã tạo lại từ các PNG này. Ảnh tổng hợp `artifacts/screenshots/refreshed-models-preview.jpg`; ảnh studio riêng có hậu tố `subdivision-studio.jpg`. Chưa chạy ma trận GPU/cross-browser hoặc benchmark FPS cho mesh mới.

## 16. Nén bốn GLB dưới 1 MB — 02/11/2026

Chai 500 ml chỉ 1.128.836 byte dù có 246.960 tam giác vì đã nén Draco. Bốn GLB subdivision mới chưa nén nên nặng hơn dù chỉ có 50–60 nghìn tam giác. Đã bổ sung `scripts/lib/bottle-compression.cjs` dùng Meshopt, giữ mọi tam giác/đỉnh/UV seam cùng node, transform, vật liệu, nhãn và animation. Không giảm poly hoặc làm lại subdivision. Mã hóa số độ chính xác cao với exponential filter 20/14/18 bit cho position/normal/UV; đây là nén có sai số rất nhỏ, không phải binary byte-identical. Sai lệch vị trí sau transform tối đa 0,000336 mm, normal 0,0425 độ, UV 0,03125 pixel trên ảnh 4096 px. Số tam giác vẫn là 50.204 / 51.164 / 52.036 / 59.556.

Dung lượng trước → sau: Glass 280 1.428.416 → 646.608 B; Glass Short 1.407.428 → 646.860 B; PET330 1.711.900 → 698.276 B; PET350 2.163.840 → 916.940 B. Tất cả dưới 1.000.000 B và nhỏ hơn GLB 500 ml tham chiếu. Nén lossless đã thử nhưng PET330/PET350 vẫn trên ngân sách, nên không dùng kết quả đó. File Blender/GLB nguồn không bị ghi đè; đầu vào là bốn GLB smooth người dùng đã duyệt, không cần xuất Blender lại. Backup GLB web thô tại `.qa/lossless-compression-20261102/`.

Các script import tự nén, giải mã bằng decoder Three thực tế và so sánh topology/position/normal/UV trước khi ghi. Chặn xuất nếu vượt ngưỡng sai số hoặc dung lượng. `npm run optimize:bottles` cho các web GLB thô hiện có, bỏ qua GLB đã nén để tránh mất độ chính xác nhiều lần. Manifest có hash nguồn/final, hash từng bufferView sau giải mã, scene digest, số tam giác/đỉnh và sai số đo được. URL tự đổi cache version theo manifest SHA. Decoder Meshopt đã có sẵn ở preview/render/thumbnail nên không cần thêm pipeline runtime.

QA: 89 tests, typecheck, lint, verify-assets, build và diff whitespace check pass; chạy lại bốn import cho cùng dung lượng. Các test Glass thật và sparkling đọc GLB qua GLTFLoader + MeshoptDecoder. Chromium tải đủ bốn GLB và render/tải bốn PNG transparent 1024 px, không có console error. Ba bản Glass/Glass Short/PET350 có pixel bounds trùng ảnh thô trước nén và sai khác RGB trung bình dưới 0,01 trên thang 0–255 khi chuẩn hóa crop; PET330 có ảnh tham chiếu 4096 px/khung khác và hạt động nên không khẳng định pixel-identical. Ảnh xuất thực: `artifacts/screenshots/compressed-models-preview.jpg`; ảnh Studio từng chai có hậu tố `compressed-studio.jpg`. Đợt này giảm dung lượng tải/lưu, chưa đo FPS hoặc RAM/GPU; mật độ lưới sau giải nén giữ nguyên.

## 17. Gộp hai type nhãn Glass 280 ml — 02/11/2026

Theo yêu cầu người dùng, hai GLB 280 ml cùng một family `glass-280-latte`, thẻ **280 ml Bottle**. Type **Full label** có order/index 0, model `glass-280-latte`, được chọn mặc định khi bấm thẻ; **Short label** có order/index 1, model `glass-280-short-latte`. Thẻ dùng poster nhãn full và mở bảng type hiện có. Tên model con đổi thành 280 ml Bottle · Full label / Short label để mô tả kiểu nhãn, không gọi thành chai thấp riêng. Giữ ID, GLB, UV, vật liệu, mặc định Latte và preferences của từng model. Library còn 12 packaging families; tìm Full label, Short label hoặc Latte trả cùng một family.

QA: 89 tests hiện có, typecheck, lint, build và whitespace check pass. Chromium xác nhận Glass chỉ còn hai thẻ 290/280 ml; bấm 280 chọn Full label, chọn Short label đổi đúng GLB, reload giữ nhãn lửng, bấm lại thẻ quay về mặc định Full label. Ảnh bằng chứng: `artifacts/screenshots/glass-280-label-types.jpg`.

## 18. Model library phân trang bốn hàng — 02/11/2026

Library hiển thị tối đa 8 packaging families mỗi trang, 2 cột × 4 hàng. Cuối bảng có nút Previous/Next và Page X / Y; nút ở biên bị vô hiệu hóa, nhóm chỉ có một trang không hiện pager. Đổi tìm kiếm/bộ lọc hoặc Clear filters trả về trang đầu. Đổi trang đóng bảng type và giữ nguyên model đang xem. Bốn hàng desktop co theo chiều cao panel để luôn thấy pager mà không cần thanh cuộn; mobile giữ kích thước thẻ tự nhiên và hai cột. Ba theme pink/white/neutral dùng cùng hành vi với màu điều khiển tương ứng.

QA: typecheck, lint, build và diff whitespace check pass. Chromium desktop 1280×720 xác nhận 8 thẻ/4 hàng, scrollHeight bằng clientHeight và pager nằm trong panel; trang 2 có 4 family còn lại, mở được hai type của 280 ml. Kiểm tra Previous/Next bằng click và Enter, tìm Latte từ trang 2, kết quả rỗng/Clear filters, đổi PET từ trang 2 rồi về All hoạt động đúng. Không có console error. Ảnh bằng chứng: `artifacts/screenshots/model-library-pagination-pink.jpg`. Chưa kiểm tra lại viewport mobile cho đợt phân trang này.

## 19. Google OAuth là lựa chọn bổ sung trong form tài khoản — 02/11/2026

Form Login và Create account có nút **Continue with Google** ở trên, ngăn với các trường email bằng dòng “or continue with email”. Giữ đăng nhập/đăng ký bằng email và mật khẩu, tên khi đăng ký, cùng luồng quên mật khẩu. Nút Google không yêu cầu điền hoặc validate các trường email/mật khẩu; không xuất hiện trong form reset.

NextAuth 4.24.15 xử lý Google OpenID Connect phía máy chủ qua `/api/auth/[...nextauth]`, kiểm tra PKCE/state/CSRF và email verified, lưu session mã hóa trong cookie HttpOnly trong tối đa bảy ngày. Google cung cấp tên/email/avatar và subject định danh; header/Home profile dùng session thật, có Log out. Không đưa access/refresh token vào client, không tự liên kết tài khoản trùng email. Thống kê coin/ngày đăng nhập mẫu không được gán cho Google user. Chưa có database account/ledger hay đồng bộ project; form email và reset vẫn cần dịch vụ riêng.

Chưa có OAuth credentials thật trong workspace. `.env.example` và `docs/GOOGLE_AUTH.md` mô tả cấu hình Google Cloud, callback URI và session secret. Khi thiếu cấu hình, public session/providers trả rỗng, đăng nhập bị chặn trước redirect và UI hiển thị chưa khả dụng, không giả lập thành công. OAuth trả lỗi/hủy mở lại Login với thông báo retry và không hiển thị raw provider error.

QA: typecheck, lint, 93 tests và production build pass. Bốn test mới kiểm tra cấu hình thiếu/secret yếu/origin, profile verified, subject/name và hostile callback URL. Kiểm tra HTTP trên production server tách biệt dùng credentials fixture xác nhận provider discovery, CSRF, authorization URL Google, cookie PKCE/state HttpOnly, chặn callback ngoài origin, state/session giả và POST thiếu CSRF; server chưa cấu hình trả session/providers rỗng và signin 503. Không tạo tài khoản hoặc Google session giả. Chromium xác nhận hai form có Google, form reset không có, validation email/mật khẩu còn hoạt động và email được giữ khi đổi form. Nút Google dùng được bằng Enter, Tab/Shift+Tab giữ focus trong dialog, Escape đóng và trả focus về nút Login. Form đăng ký tại 390×844 không tràn ngang và thấy đủ nội dung. OAuth error query được consume, Login mở và focus tới alert. Không có console error trong kiểm tra. Ảnh: `artifacts/screenshots/google-login-dialog.jpg`, `artifacts/screenshots/google-register-mobile.jpg`. Chưa kiểm tra đăng nhập/đăng xuất bằng tài khoản Google thật vì cần cấu hình OAuth của người dùng.

## 20. PET320 Full + PET1L Draco — 04/11/2026

Đã thêm hai GLB: PET320 Full `pet-320-full-nata` giữ Nata/nước/thạch, PET1L `pet-1000-juice` tạm dùng Juice/Apple có thể sửa trong Properties. Nén Draco Edgebreaker 18/14/16 bit, không giảm tam giác: 320 Full 11.430.844 → 1.114.788 byte (214.240 tam giác), 1L 2.565.128 → 445.064 byte (86.548 tam giác). Sai lệch tối đa dưới 0,0006 mm; UV dưới 0,032 pixel/4K; normal dưới 0,03°. File nguồn nguyên vẹn. Script import/manifest kiểm tra winding, UV seam và topology bằng decoder Draco public. Tên file và hash model cũ giữ nguyên.

Hai model mới dùng căn camera theo bounds để không cắt nắp/đáy; giữ góc và FOV các View. Poster riêng 360×480 từ PNG xuất thực 1024 transparent. 99 tests, typecheck, lint, verify-assets, production build và diff whitespace check qua; build chỉ có cảnh báo metadataBase có sẵn. Browser xác nhận artwork thay/xóa, nắp đổi màu/reset, Liquid reset đúng Nata/Juice, chọn model cũ, reload lựa chọn1L và PNG alpha. Console cuối không có lỗi. Chưa đo FPS/RAM hay ma trận GPU.

Đã ghi nhận đợt tiếp theo, theo yêu cầu không ngắt việc đang làm: 5 GLB mới (PET1500 Full,325ml,PET1L Short,PP1.25L,PP1L) + sửa Nata320 Full sang index1, gom thành một task duy nhất ở `docs/superpowers/plans/2026-11-04-next-draco-batch.md`. Các model mới này chưa import. Chưa commit/publish vì workspace còn nhiều thay đổi được ủy quyền từ các lượt trước.

## Draco batch 2026-11-04

Five source GLBs are now imported and catalogued in one pass. See `docs/ASSET_MIGRATION.md` section 21 and `docs/superpowers/plans/2026-11-04-next-draco-batch.md` for measured sizes, UV/geometry budgets, PP category migration, Nata order, and browser QA evidence. Originals remain untouched; no commit or publication was made.
