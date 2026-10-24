# Audit project mẫu 2 — 3d display product website

> Phạm vi: đọc mã nguồn, tài liệu, cấu hình, scripts và asset inventory tại `D:\program project\3d display product website`. Không chỉnh sửa project gốc. Ngày audit: 2026-10-20.

## Kết luận nhanh

Đây là prototype/storefront 3D đã có nền tảng rất gần với Labellab: Next.js App Router + TypeScript + Three.js, typed catalog contracts, Mockup Studio ghép model/label, pipeline GLB và admin draft/publish. Phần cần xây mới cho Labellab chủ yếu là SaaS commerce (account, token ledger, payment, quota/free download, daily spin/referral, billing/audit) và mở rộng domain packaging. Không nên bê nguyên dữ liệu/branding VINUT; nên tách runtime 3D/catalog khỏi commerce.

Inventory: `app` 23 files, `components` 79, `lib` 117, `scripts` 112, `docs` 214, `public/catalog` 273 media/catalog files, 10 GLB trong `public/models`.

## Stack và cấu hình

- Next.js `16.2.6`, React `19.3.0`, TypeScript `5.9.3`, App Router.
- Three.js `0.180.0`; `lucide-react`; Sharp xử lý media.
- ESLint 9, `tsc --noEmit`, `next build`/`next start`.
- Static export GitHub Pages khi `GITHUB_PAGES=true`, output `.next-pages`, base path qua `NEXT_PUBLIC_BASE_PATH`.
- Local rewrite `/api/admin/*`, `/api/public/*` tới API mặc định `127.0.0.1:3010`; admin web mặc định 3100.
- SQLite/WAL/SHM + media ở `data/admin`; storefront đọc `public/catalog/current.json` và có thể chạy độc lập khi API tắt.
- CI chạy build, lint và viewer/background/catalog/framing/mockup/accents/environment/water tests.

## Routes/pages hiện có

| Route | Mục đích | Labellab |
|---|---|---|
| `/` | Storefront hero, search, collection, favorites, categories, contact | Base marketing homepage; đổi thành mockup discovery + CTA đăng ký |
| `/products/` | Catalog/product page | Chuyển thành thư viện mockup/filter |
| `/mockup/` | 3D Mockup Studio | Hạt nhân editor; thêm auth/token guard/project save |
| `/admin/` | Admin catalog/resource/display workspace | Quản lý model, label, pricing, release |
| `/admin/live/` | Preview published state | Preview release/model/label |

Deep link mockup hỗ trợ `?display=<id>` hoặc `?model=<id>&label=<id>`, validate theo immutable release; không nhận URL GLB/ảnh tùy ý.

## Module quan trọng

- `components/mockup/MockupStudio.tsx`: orchestration catalog, selection, background, camera, motion, frame, resolution, capture, URL state, loading/error.
- `MockupCanvas.tsx`: host Three runtime và status lifecycle; `MockupLibrary.tsx`: tabs Models/Presets/Labels + filter/pagination; `MockupMaterials.tsx`: live material overrides.
- `lib/viewer/runtime.ts`: GLB loading/normalization/bounds/environment/appearance pool/prefetch/context-loss/dispose.
- `lib/mockup/runtime.ts`: Studio controller riêng (OrbitControls, camera fit/focal, motion, pointer orbit/zoom, capture gate).
- `lib/mockup/capture.ts`: render target riêng, async pixel readback, Y flip, PNG encode; không cần `preserveDrawingBuffer`.
- `lib/viewer/pooled-appearance.ts`, `appearance.ts`: ghép texture label vào semantic material slots và cache.
- `lib/catalog/mockup.ts`, `compatibility.ts`, `contracts.ts`: resolve selection và enforce packaging/UV/drink/flavor compatibility.
- `components/admin/*` + `lib/server/*`: resource upload, SQLite repository, draft/publish/preflight/audit/operations.

## Asset/model pipeline

- Source Blender nằm ngoài repo; repo giữ source sample và GLB web tối ưu.
- Public models: 6 cans (180, 250, 250-short, 320, 330, 500) và 4 bottles (glass-290 basil web/full, pet-320 nata, pet-500 short-label).
- Offline scripts export/audit/validate normals/materials/import catalog; UI không convert `.blend`/OBJ.
- GLB self-contained, mesh tĩnh; upload giới hạn 30 MB, 250k triangles, JSON 4 MB. Ảnh nguồn tối đa 20 MB/8192 px/32 MP; role output label 2048, thumbnail 512, poster/2D 1600.
- Geometry và label artwork tách độc lập. Model khai báo semantic slots, orientation/front yaw, UV/layout profile. Label chỉ tương thích khi đúng packaging + UV profile; cùng dung tích chưa đủ.
- Poster/thumbnail cần preflight; hash-named media hỗ trợ cache/invalidation; public release chỉ chứa media reachable.

**Áp dụng Labellab:** chuẩn hóa `PackagingType`, `GeometryAsset`, `Surface/UVProfile`, `LabelArtwork`, `MaterialPreset`, `RenderPreset`; tách private originals khỏi optimized derivatives/object storage.

## UX/UI đáng kế thừa

Tài liệu `docs/MASTER_PLAN_3D_MOCKUP.md` ghi nhận: desktop preview trái : controls phải tỷ lệ 3:4; mobile canvas trước, controls dưới; touch target >=44px; camera presets + drag orbit + zoom/reset; animation mặc định off và reduced-motion; nền white/gray/dark/color/gradient/transparent; frame 1:1/4:5/16:9; export 1024/2048; status loading/ready/export/error; keyboard/RTL/responsive QA; Lucide/SVG + CSS tokens.

Định hướng ProMax cho Labellab: onboarding stepper; token balance/cost preview cạnh CTA; ledger feedback; accessible dialogs; optimistic/autosave states; mobile bottom-sheet controls; phân biệt rõ preview miễn phí và download trừ token.

## Test/quality baseline và khoảng trống

Đã có các suite `test:mockup`, `test:viewer`, `test:catalog`, `test:admin`, `test:background`, `test:water`, `test:framing`, `test:i18n`, `typecheck`, `lint`, `build`; docs ghi 34/34 mockup tests và QA desktop/mobile/RTL. Chưa benchmark thiết bị vật lý/GPU/FPS thật.

Labellab cần thêm auth/session/security, token ledger invariants/idempotency, payment webhook replay/signature, daily quota theo timezone, spin anti-abuse, referral attribution/fraud, download entitlement/signed URL, rate limit, payment sandbox e2e, object storage và accessibility/visual regression.

## Tái sử dụng vs phải viết mới

### Tái sử dụng

1. Three renderer/runtime lifecycle, GLB load/cancel/dispose, bounds/framing, environment, appearance pool, async capture.
2. Mockup Studio interaction model và responsive layout.
3. Catalog compatibility selector + immutable release/public snapshot.
4. Media role validation/checksum/hash URL.
5. Admin resource workspace + draft/publish/preflight/audit.
6. i18n/RTL, public URL/base path, telemetry hooks, CI test organization.

### Viết mới/refactor lớn

1. Auth: register/login/password reset/email verification/session/RBAC.
2. User/project: saved scenes, label upload, versioning, sharing permissions, quota.
3. Token wallet: append-only ledger, grant/spend/refund/expiry, idempotency, balance read model.
4. Download entitlement: one free daily export, paid export pricing, signed URL + audit.
5. Payment adapter, checkout, verified/replayed webhooks, invoice/refund/tax.
6. Daily reward: timezone-safe claim, server-side randomized spin, anti-abuse/campaign rules.
7. Referral/share: invite code, attribution window, reward state machine, fraud limits.
8. PostgreSQL + object storage/CDN + queue/worker for heavy/high-res render later.
9. Observability, rate limit, backup/restore/migrations, multi-tenant plans/pricing/admin moderation.

## Kiến trúc Labellab đề xuất

- Frontend Next.js/TypeScript; isolate runtime as reusable package/module.
- Versioned `/api/v1`; services Auth, Catalog, Mockup, Wallet, Payments, Rewards, Referrals, Downloads.
- PostgreSQL entities: users, sessions, projects, catalog, wallet_ledger, payment_intents, rewards, referrals, audit_events; Redis for rate limits/idempotency/jobs.
- Object storage: private originals + public/versioned derivatives; CDN signed downloads.
- Client WebGL preview + initial client PNG export gated by server entitlement; optional server render worker for high-res/batch.
- Catalog: draft -> preflight -> immutable release -> CDN manifest; current pointer + rollback.
- Secure cookies/CSRF, password hashing, email token expiry, webhook signatures, OWASP validation, signed URLs, server-authoritative token balance.

## Migration order

1. Copy only generic viewer/mockup/catalog contracts; bỏ VINUT copy/flavor assumptions/static catalog.
2. Define Labellab packaging/UV compatibility matrix and asset contract.
3. Extract `lib/viewer` + `lib/mockup` behind adapters for future package types.
4. Replace local SQLite admin with Postgres repository while giữ draft/publish.
5. Add auth + wallet ledger trước download CTA; wire export to entitlement service.
6. Retain static public catalog for SEO/cache; private labels/projects qua auth API.
7. Build payment sandbox, token ledger, daily reward and referral tests.
8. Build ProMax design system/onboarding and port Studio interactions.
9. Import Unity project only as asset conversion/validation source; browser consumes approved GLB derivatives, không chạy Unity project trực tiếp.
