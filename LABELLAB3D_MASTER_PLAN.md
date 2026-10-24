# LABELLAB3D MASTER PLAN

**Dự án:** Labellab — Labellab3D.com  
**Phiên bản kế hoạch:** 1.0 · **Ngày:** 20/10/2026  
**Trạng thái:** Đã triển khai frontend prototype v0.1 (23/10/2026); backend thương mại, payment provider và hosting production chưa triển khai/chọn chính thức.

## 1. Tầm nhìn và nguyên tắc

Labellab là nền tảng web thương mại cho phép nhà thiết kế, brand owner và agency chọn chai/lon/hộp/túi/thùng 3D, đưa artwork nhãn vào đúng bề mặt, chỉnh vật liệu/camera/nền và tải ảnh hoặc video mockup chất lượng cao. Website phải có thể mở rộng loại bao bì, tài khoản, token và dịch vụ render mà không phải xây lại runtime.

Nguyên tắc: client WebGL chỉ preview; quyền tải và token do server quyết định; mọi giao dịch token là ledger bất biến; catalog phát hành có version; asset nguồn được bảo vệ; Unity là nguồn authoring/quality reference, web dùng GLB/glTF + Three.js; accessibility, performance và observability là yêu cầu từ đầu.

## 2. Phạm vi

### MVP thương mại

- Landing/home với thư viện mẫu, lợi ích, pricing token, campaign/promotion, daily reward và referral.
- Đăng ký, đăng nhập, đăng xuất, email verification, quên/đặt lại mật khẩu, session an toàn.
- Catalog bao bì, model GLB, label/artwork, preset vật liệu/nền/camera.
- Mockup Studio: chọn model/label tương thích, upload artwork cá nhân, crop/scale/position theo UV profile, camera orbit/zoom/reset, ánh sáng/nền, preview realtime, PNG download.
- Mỗi ngày một lượt tải miễn phí theo timezone account; lượt trả phí tạo reservation trước, chỉ commit spend sau khi artifact export thành công và hoàn reservation khi thất bại.
- Wallet token, nạp token online, lịch sử giao dịch, giá theo độ phân giải/định dạng.
- Daily spin random token server-side, referral link nhận token, promotion/event code.
- Lưu project và version, rename/duplicate/delete, share link read-only có expiry.
- Admin catalog/resource, upload/validation, compatibility, draft → preflight → publish, pricing/promotion, user/wallet/audit và moderation.

### Để sau MVP

Video/GIF/turntable, server render 4K/8K và batch; nhiều sản phẩm trong một scene; chỉnh shader nâng cao; team workspace; API khách hàng; marketplace asset; mobile native; AI artwork assist.

## 3. Findings từ hai project mẫu

### Unity (`D:\UnityHubData\Unity_3D_Mockup_Project`)

Unity 6000.0.44f1/HDRP 17, Addressables, Recorder, Timeline, UGUI; khoảng 40 FBX/prefab gồm PET, lon, chai thủy tinh, tray/carton/pack 6 và podium. ProductView/CustomizationManager đã có metadata, material/liquid/label/tray roles, label crop, camera orbit, capture PNG/MP4, HDRI và shader glass/liquid. Nhưng đây là desktop/standalone: HDRP/DXR/compute, native file dialog, Windows Addressables và PlayFab launcher không chuyển thẳng sang browser. Không có auth/token/payment web.

Unity giữ vai trò authoring, kiểm thử hình học/UV/material và nguồn để export. Cần convert GLB/glTF (Draco/KTX2 khi phù hợp), LOD, poster, manifest; không chạy Unity project trong web. Unity HDRP batch/headless vẫn thường cần GPU/graphics device, driver, license activation và scene bundle deterministic; custom pass/DXR/compute khó scale serverless. Nếu dùng Unity worker phải có PoC riêng trên GPU VM/container, queue isolation, timeout/memory watchdog và fallback khi GPU không phù hợp. Lựa chọn server render MVP nên so sánh Blender Cycles/Eevee hoặc Three/Babylon/WebGPU worker với render Unity reference về màu, kính, refraction và alpha.

### Web (`D:\program project\3d display product website`)

Next.js App Router, React 19, TS, Three.js 0.180, Sharp; routes `/`, `/products`, `/mockup`, `/admin`, `/admin/live`. Đã có MockupStudio responsive, runtime loading/cancel/dispose, appearance pool, compatibility selector, PNG capture render target, i18n/RTL, catalog immutable release, SQLite draft/publish, hashed media và asset validation. Public có 10 GLB (6 cans, 4 bottles). Đây là nền để trích runtime/catalog contracts; không bê VINUT branding/flavor assumptions/static data.

## 4. Kiến trúc mục tiêu

### Các lớp

1. **Web app:** Next.js App Router, server components cho SEO/catalog, client components cho WebGL/editor.
2. **API BFF:** `/api/v1`, kiểm tra auth, rate limit, schema validation, idempotency; không để client gọi DB/provider trực tiếp.
3. **Domain services:** Auth, Users, Catalog, Mockup Projects, Wallet, Payments, Rewards, Referrals, Promotions, Downloads, Admin.
4. **Persistence:** PostgreSQL; Redis cho rate-limit, idempotency, session/cache/job state; object storage cho originals/derivatives; CDN cho public assets.
5. **Workers:** media optimization, GLB inspection, poster generation (nếu cho phép), high-res render/export, email, webhook reconciliation.
6. **Observability:** structured logs, metrics, traces, error tracking, audit events, alerting.

Catalog dùng `draftRevision → preflight → immutable release → currentRelease pointer`; rollback chỉ đổi pointer, không sửa release cũ. Runtime Three.js nhận manifest đã validate.

## 5. Information architecture và routes

### Public

- `/` Home: hero CTA “Tạo mockup”, featured models, use cases, token offer, daily reward, event/promotion, referral, FAQ.
- `/mockups` thư viện model/preset với search/filter theo packaging, capacity, material, style.
- `/mockup/[modelId]` Studio; query giữ project/model/label/frame.
- `/templates` template/preset theo ngành; `/pricing` token packages và policy.
- `/rewards` daily free/spin/referral; `/blog` hoặc `/guides` SEO sau MVP.
- `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`.
- `/legal/terms`, `/legal/privacy`, `/legal/refund`, `/status`.

### Authenticated app

- `/app` dashboard project gần đây, balance, daily claim, campaign.
- `/app/projects`, `/app/projects/[id]`, `/app/projects/[id]/edit`.
- `/app/wallet`, `/app/wallet/history`, `/app/billing`.
- `/app/rewards`, `/app/referrals`, `/app/settings/profile`, `/app/settings/security`.

### Admin

`/admin`, `/admin/catalog/models`, `/admin/catalog/labels`, `/admin/catalog/packaging`, `/admin/catalog/releases`, `/admin/media`, `/admin/pricing`, `/admin/promotions`, `/admin/users`, `/admin/wallet`, `/admin/payments`, `/admin/rewards`, `/admin/audit`, `/admin/operations`.

## 6. Auth và account

- Password hash Argon2id/bcrypt, secure HttpOnly SameSite cookies, rotation refresh/session, CSRF strategy, email verification token một lần có expiry.
- Register cần email, password policy, consent terms; login có rate limit, generic error tránh account enumeration; reset password revoke session.
- OAuth chỉ thêm sau khi email flow ổn định; RBAC `user`, `moderator`, `editor`, `finance`, `admin`, `owner`.
- Session/device list, revoke all, change email/password, optional 2FA cho admin.
- User timezone lưu rõ để daily rewards; locale/currency ưu tiên account nhưng không tin timezone client khi ghi ledger.

## 7. Mockup Studio

### Luồng

1. Guest xem catalog và preview hạn chế; khi download mở auth/entitlement gate.
2. Chọn packaging/model → compatibility resolver lọc label theo UV profile, surface role, material và capacity.
3. Upload artwork (private) hoặc chọn label public; validate MIME/magic bytes, dimensions, alpha, virus scan; crop/scale/offset trong UV-safe editor.
4. Chỉnh camera preset/orbit/zoom/FOV, background white/gray/dark/solid/gradient/transparent, material/liquid preset, frame 1:1/4:5/16:9, quality 1024/2048 (MVP).
5. Autosave draft project (debounced), show save/error state; duplicate/version/share.
6. Preview render client; nút hiển thị cost token, free allowance và confirmation nếu sẽ trừ token.
7. Server tạo entitlement/idempotency key; preview có thể render client, còn paid/high-res export đi qua worker; chỉ commit spend khi artifact thành công theo policy.
8. Signed download URL expiry, download history và retry không trừ thêm khi cùng idempotency key.

### Runtime contract

Tách `viewer` generic khỏi `mockup` adapter. Asset manifest gồm model URL, bounds, orientation/frontYaw, semantic material slots, UV/layout profile, LOD/size/hash. Cache giới hạn theo DPR/device/Save-Data; dispose và context-loss recovery bắt buộc. Client không nhận arbitrary GLB/image URL từ query.

Mọi material override, camera range, background, frame và resolution phải được validate lại ở server theo model/release contract trước khi enqueue render. Project lưu `catalogReleaseId` và media hashes để artifact tái lập được dù catalog hiện tại đã đổi.

### Render policy

Preview render chạy client để feedback nhanh. Client-side PNG không phải ranh giới bảo mật vì người dùng có thể đọc canvas hoặc gọi lại renderer; do đó download có giá trị thương mại (paid token hoặc file không watermark) phải đi qua server render/worker hoặc một artifact service đáng tin ngay từ commercial beta. Client export chỉ dùng cho preview độ phân giải thấp, có watermark hoặc bản nháp miễn phí theo policy. Worker trả job status, signed artifact và checksum; nếu render thất bại, refund/void reservation tự động và giữ project.

### Acceptance criteria theo chức năng

| Mã | Chức năng | Điều kiện đạt |
|---|---|---|
| ST-01 | Chọn model | Chỉ hiển thị model thuộc release hiện tại, có poster, media ready và layout profile hợp lệ. |
| ST-02 | Chọn label | Label chỉ xuất hiện khi compatibility resolver xác nhận đúng packaging và UV/layout profile. |
| ST-03 | Upload artwork | File sai MIME, quá dung lượng, sai kích thước hoặc scan thất bại bị từ chối với lỗi gắn đúng field. |
| ST-04 | Preview | Poster xuất hiện trước GLB; canvas giữ aspect ratio; loading/context-loss có trạng thái và thao tác retry. |
| ST-05 | Orbit/zoom | Chuột, touch và keyboard đều điều khiển được; reset trả đúng camera preset; không khóa scroll trang. |
| ST-06 | Material/background | Chỉ cho phép override nằm trong whitelist của model; giá trị bất hợp lệ bị clamp ở server và client. |
| ST-07 | Save project | Autosave có debounce, version tăng tuần tự, refresh không mất scene state; conflict có thông báo rõ. |
| ST-08 | Quote | Hiển thị free allowance, token cost, frame, resolution và policy trước nút xác nhận. |
| ST-09 | Export | Double click/retry cùng idempotency key không tạo hai lượt spend hoặc hai entitlement. |
| ST-10 | Failure/refund | Export lỗi, timeout hoặc checksum lỗi không làm mất token; entitlement chuyển failed/refunded và có thông báo. |
| ST-11 | Download | Signed URL chỉ cho user có entitlement ready, hết hạn đúng thời gian và không lộ object storage key. |
| ST-12 | Share | Share link không mở được artwork/private source, có expiry/revoke và chỉ đọc đúng scope. |

## 8. Project và sharing

`Project` gồm owner, name, selected model/label IDs + releaseId, artwork media IDs, material overrides, camera/background/frame/quality, schemaVersion, created/updated, thumbnail. Version append-only; current pointer dễ sửa. Share token random, scope read-only, expiry/revoke, không nhúng private source URL. Xóa project soft-delete với retention; export history giữ artifact metadata.

## 9. Token economy và ledger

Bảng `wallet_ledger` append-only: `id`, `userId`, `type` (purchase/grant/spend/refund/expire/adjust), signed integer amount, balanceAfter (optional read model), currency/package/campaign, referenceType/referenceId, idempotencyKey, metadata, createdAt. Không update/delete transaction đã posted; adjustment cần admin reason + audit.

- Balance = tổng ledger hoặc read model được kiểm chứng định kỳ.
- Spend reservation: `pending → committed|released`; lock/idempotency chống double click/race.
- Pricing table versioned theo operation (`png_1024`, `png_2048`, future video), currency/tax tách khỏi token.
- UI luôn hiện balance trước/sau và link history; không tin balance từ local state.
- Grant có source, expiry (nếu campaign), max per user và anti-abuse.

## 10. Daily free, spin, referral

### Free download

Mỗi user một claim theo account timezone (UTC instant + `claimDate` local), server unique constraint `(userId, localDate, rewardType)`. Preview không tốn token; download đầu tiên eligible tạo grant/entitlement rồi mark consumed atomically. Guest policy cần quyết định (MVP nên yêu cầu account).

### Spin

`reward_campaign`, `spin_claim` unique theo user/date/campaign; random dùng server CSPRNG và weighted outcomes lưu version. Client chỉ gửi claim intent, không gửi kết quả. Cooldown, device/IP velocity, CAPTCHA/risk flag; admin chỉnh odds nhưng lịch sử giữ snapshot.

### Referral

Invite code/user code, signed attribution cookie, first qualifying action (verified signup + download/payment tuỳ policy), pending → approved → granted. Giới hạn self-referral, cùng payment instrument/device/IP, max monthly; dashboard hiển thị trạng thái và link copy/share.

## 11. Payment và webhook

Payment adapter interface: `createCheckout`, `getPayment`, `refund`, `verifyWebhook`. Checkout tạo `payment_intent` pending với package price/version/currency; token chỉ grant sau webhook verified `paid/succeeded`, không grant theo redirect. Webhook lưu raw event hash, signature result, provider event ID unique, process status, retry count; handler idempotent và reconciliation job đối soát provider.

Hỗ trợ Stripe/local gateway sau khi chọn quốc gia; không lưu PAN/CVV. Refund/chargeback tạo ledger reversal, khóa reward gian lận nếu cần. Invoice/tax/refund policy và Terms phải hoàn thiện trước production.

## 12. Promotion/event engine

Campaign có start/end UTC, audience, priority, rule JSON đã schema-validate, reward type, max uses, stackability, budget. Rule examples: nạp token bonus %, first purchase, event code, referral multiplier. Server resolve campaign và ghi campaign snapshot vào ledger/payment; admin preview/schedule/pause; timezone hiển thị rõ. Homepage lấy published campaign API/cache, không hard-code.

## 13. Admin/catalog/asset pipeline

Asset lifecycle: upload quarantine → inspect/virus scan → optimize derivative → metadata review → compatibility review → draft → preflight → publish. Roles: model GLB, label artwork, poster, thumbnail, icon, environment/HDRI, 2D render.

Model schema cần `packagingType`, `packagingVariantId`, dimensions/capacity, geometry URL/hash, LODs, semantic slots, UV profile, frontYaw/orientation, material presets, supported quality, mockupVisible. Label schema cần artwork URL/hash, UV profile, print bounds, packaging compatibility, optional flavor/category. Packaging variants cho bottle/can/box/pouch/carton/tray/pack; không hard-code chỉ can/bottle.

GLB validation: self-contained, bounded size/triangles, no unsupported animation/external texture; image validation magic bytes/dimensions/alpha; output hashed and immutable. Unity FBX/prefab/Addressables remain private authoring archive; export approved GLB + poster + manifest. License/provenance check required.

## 14. Data contracts/API

JSON schema/Zod contracts dùng chung client/server; mọi response có `requestId`, `schemaVersion`, typed error `{code,message,details?}`.

- `POST /api/v1/auth/register|login|logout|forgot|reset|verify`
- `GET/PATCH /api/v1/me`, `GET /api/v1/me/sessions`
- `GET /api/v1/catalog/releases/current`, `GET /models`, `GET /labels`, `GET /compatibility`
- `POST/PATCH /api/v1/projects`, `GET/DELETE /projects/:id`, `POST /projects/:id/versions`, `POST /projects/:id/share`
- `POST /api/v1/uploads/init`, `POST /uploads/:id/complete`
- `POST /api/v1/exports/quote`, `POST /exports` (idempotency), `GET /exports/:id`, `GET /exports/:id/download`
- `GET /api/v1/wallet`, `GET /wallet/ledger`, `POST /wallet/checkout`
- `POST /api/v1/rewards/daily/claim`, `POST /rewards/spin/claim`, `GET /rewards/status`
- `GET/POST /api/v1/referrals`, `GET /promotions/active`
- `POST /api/v1/payments/webhook/:provider` (signature verified, no browser auth)
- Admin endpoints protected RBAC, revision/ETag conflict checks, publish/preflight/rollback.

## 15. UI/UX ProMax design system
### Cập nhật theo lựa chọn người dùng — 23/10/2026

Lựa chọn này thay thế palette neutral/indigo đề xuất ban đầu cho frontend hiện tại. Giao diện editor-first kế thừa tinh thần strawberry basil từ project web mẫu: nền **#D53660**, halo sáng trắng sau sản phẩm, panel pink glass, active pill cream và CTA cam ấm. Không giữ VINUT branding/copy. Palette baseline bên dưới là lịch sử định hướng trước khi người dùng chọn màu; khi có xung đột ưu tiên override này.

Có hai môi trường scene rõ ràng: **Website** mặc định dùng motion **showcase**, sản phẩm nghiêng/xoay và grid nền chuyển động theo logic website cũ; **Studio** dùng sàn trắng 3D thật, sản phẩm đứng upright, contact shadow và grid phối cảnh mờ dần đến 20 scene units. Cả hai giữ cùng dữ liệu model/artwork; Studio tắt motion. Reduced-motion cần dừng animation tự động. Thiết lập lưu cục bộ; artwork chỉ tồn tại trong phiên hiện tại.

Frontend v0.1 cung cấp thư viện ba model, điều chỉnh material/camera/artwork và PNG preview có watermark phía client. Chưa triển khai auth/token/payment/rewards; commercial server-authoritative ledger/render vẫn là các giai đoạn tiếp theo, không được xem client preview là paid download security boundary. Xem `README.md` và `docs/IMPLEMENTATION_HANDOFF.md` để phân biệt hiện trạng với kế hoạch.

Brand direction: premium creative tool; SaaS sạch với preview 3D là điểm nhấn. Kết quả design-system search của UI/UX Pro Max xác định pattern Hero + Features + CTA, Glassmorphism có điều kiện, Trust & Authority/Conversion và Plus Jakarta Sans. Labellab áp dụng nền neutral sáng, workspace dark-safe và accent indigo/emerald; không dùng gradient hoặc glow mạnh làm giảm readability. Typography sans hiện đại, type scale rõ; radius/spacing/elevation tokens; Lucide icons với labels.

### Token hình ảnh baseline

Palette ban đầu lấy từ kết quả verified search và được khóa thành semantic tokens để có thể tinh chỉnh sau visual exploration:

| Vai trò | Màu baseline | Sử dụng |
|---|---|---|
| Primary | `#6366F1` | CTA chính, active state, link quan trọng |
| Primary soft | `#818CF8` | hover, selected surface, focus accent |
| Success/earn | `#059669` | token nhận, export thành công, daily reward |
| Campaign accent | `#EA580C` | promotion, bonus, urgency có kiểm soát |
| Background | `#F8FAFC` | public shell và trang nội dung |
| Workspace background | `#0F172A` | tùy chọn studio dark surface |
| Surface | `#FFFFFF` / `#192134` | card, panel, dialog |
| Foreground | `#1E293B` / `#F8FAFC` | text chính light/dark |
| Muted | `#475569` / `#94A3B8` | helper text, metadata |
| Border | `#E2E8F0` | divider, input, card edge |
| Destructive | `#DC2626` | lỗi, refund, revoke |

Text thường phải đạt contrast tối thiểu 4.5:1. `#EA580C` chỉ dùng với nền/foreground đã kiểm chứng; không dùng màu campaign làm text nhỏ trên nền trắng nếu không đạt contrast. Bất kỳ palette điều chỉnh nào phải cập nhật token và visual regression cùng lúc.

### Typography, spacing, component states

- Plus Jakarta Sans: 400 body, 500 metadata, 600 labels, 700 heading; body 16 px, line-height khoảng 1.5.
- Heading line-height 1.1–1.2, mỗi màn hình chỉ một heading cấp 1.
- Spacing scale 8/16/24/32/48/64 px; control group cách nhau ít nhất 8 px.
- Radius 10–14 px cho card/control; pill chỉ dành cho filter/status/CTA ngắn.
- Mọi button/input/card có default, hover, pressed, disabled, loading, focus-visible và error state.
- Glass surface dùng blur 10–20 px, border mảnh và nền dự phòng đặc; không đặt text trắng trực tiếp trên nền sáng.

Core patterns: top nav with balance + primary CTA; catalog cards with visible packaging/capacity/compatibility; Studio two-panel desktop (preview 3:4 : controls 4:3), mobile canvas-first + bottom sheet; sticky export bar; onboarding checklist; token cost tooltip and confirmation; toast for ledger/download; modal for auth/payment; skeleton/error/empty states; keyboard shortcut help.

ProMax acceptance: WCAG 2.2 AA contrast/focus, touch targets >=44px, visible focus, reduced-motion, keyboard orbit/preset/reset, screen-reader labels/live regions, no color-only status, RTL-ready text/layout. Responsive QA 375/390/768/1024/1280/1440 and landscape; no nested scroll traps.

## 16. Security, privacy, performance

- OWASP validation, CSP, HSTS, secure headers, CSRF, SSRF-safe media fetch, upload quota and virus scan.
- Signed object URLs, private originals, no token/payment secrets in `NEXT_PUBLIC_*`; encrypt sensitive data and rotate keys.
- Rate limit auth/upload/export/spin/referral/webhook; bot detection and abuse review.
- GDPR-style export/delete/retention, consent logging, privacy/terms/refund documents.
- CDN immutable GLB/image assets, compression/Draco/KTX2 after compatibility test, LOD and lazy loading; preload only selected model.
- WebGL DPR cap, cache budget, abort/dispose, worker offload; Core Web Vitals for marketing pages; queue backpressure for render.

## 17. QA và acceptance gates

### Automated

Typecheck, lint, unit contracts, compatibility, runtime disposal/capture, catalog preflight, wallet ledger invariants, idempotency, payment webhook replay, daily timezone, spin distribution bounds, referral fraud, signed URLs, authorization/RBAC, migrations.

### Browser/device

Chrome/Edge/Safari desktop; iOS/Android current; WebGL unavailable/context lost; 375×812 through 1440×900; RTL/locales; keyboard/screen reader; Save-Data/slow network; touch orbit/zoom; real PNG dimensions/alpha/color; payment sandbox and webhook retries.

### Release gates

1. Domain/data contracts approved.
2. Asset license + GLB/UV preflight passes.
3. Auth/security threat review passes.
4. Ledger/payment reconciliation tests pass in staging.
5. UX accessibility/visual regression passes.
6. Backup/restore and incident runbook tested.
7. Canary release + monitoring + rollback pointer proven.

## 18. Deployment/operations

Recommended production: managed Next.js runtime, PostgreSQL, Redis, S3-compatible object storage/CDN, queue worker, email provider, payment provider, error/metrics service. Environments dev/staging/production; secrets via vault. CI runs migrations check, tests, build, asset manifest validation, deploy preview; production publish requires approval. Static public catalog can be CDN-cached, authenticated API remains dynamic. Daily DB/media backup, PITR where available, release retention and restore drill.

## 19. Roadmap và gates

### Phase 0 — Discovery (1–2 tuần)

Chốt target user, countries/currency, token pricing, free/spin/referral policy, payment provider, legal, asset licenses, packaging taxonomy, UX direction. Gate: signed product brief and threat/data classification.

### Phase 1 — Foundation (2–3 tuần)

Repo/monorepo boundaries, design tokens, Next app shell, Postgres migrations, object storage, API contracts, CI, observability, catalog adapter. Gate: staging deploy + health checks.

### Phase 2 — Catalog/3D (3–5 tuần)

Unity export PoC, GLB validation/LOD, Three runtime extraction, compatibility, Studio preview/capture, admin draft/publish. Gate: 3 representative package types with QA renders.

### Phase 3 — Auth/projects (2–3 tuần)

Registration/session/reset, project autosave/version/share, upload moderation. Gate: security review and data deletion test.

### Phase 4 — Wallet/commerce (3–5 tuần)

Ledger, quote/entitlement, daily free, payment checkout/webhooks/refund, wallet UI và server render artifact cho paid download. Gate: reconciliation/idempotency, sandbox payment và chứng minh client không thể nhận artifact paid nếu chưa có entitlement.

### Phase 5 — Rewards/growth (2–3 tuần)

Spin, referral, promotions, homepage campaigns, anti-abuse. Gate: campaign simulation and fraud limits.

### Phase 6 — Beta hardening (2–4 tuần)

Performance/device/accessibility, load test, backups, support/admin, staged beta. Gate: launch checklist and rollback rehearsal.

### Phase 7 — Production launch

Canary, monitor, publish initial catalog, support response, post-launch metrics; expand render/video/team features only after token/payment stability.

## 20. Open decisions cần chốt

- Payment provider, countries, currency, tax/invoice responsibility.
- Token package amounts, token expiry, refunds, pricing per output and whether reserve-before-render.
- Guest preview/download policy and daily free timezone definition.
- Client PNG vs server render trust model for premium/high-resolution output.
- Initial packaging set and which Unity assets are licensed/production-ready.
- Public label upload moderation, storage retention and copyright takedown process.
- OAuth/2FA scope, supported locales/RTL priority.
- Hosting/provider choices, RPO/RTO, team/admin roles.
- Brand palette, typography, domain/email sender, analytics consent.

## 21. Kickoff checklist

- [ ] Confirm Labellab product brief, personas and launch countries.
- [ ] Audit license/provenance Unity/Web assets and select 3 MVP package types.
- [ ] Approve packaging/UV/material/label contracts and sample fixtures.
- [ ] Choose hosting, Postgres, Redis, object storage, email and payment providers.
- [ ] Create repo structure, environments, secrets policy and branch/CI rules.
- [ ] Extract viewer/mockup runtime into adapter package; remove VINUT-specific copy/data.
- [ ] Establish design tokens and ProMax accessibility checklist.
- [ ] Write migrations and API schemas for users, projects, catalog, ledger, payments, rewards.
- [ ] Build GLB conversion/preflight manifest from Unity source; publish first release to staging.
- [ ] Define token economics, free/spin/referral campaign rules and abuse limits.
- [ ] Prepare legal pages, support contact, privacy/retention and incident runbooks.
- [ ] Schedule gates for asset QA, security, payment reconciliation, accessibility and beta.

## 22. Source documents

- `project2-audit.md` — audit project web mẫu 2.
- `UNITY_PROJECT_ANALYSIS.md` — phân tích Unity authoring project.
- Project web `docs/MASTER_PLAN_3D_MOCKUP.md`, `docs/MOCKUP_STUDIO.md`, `docs/model-pipeline.md` — runtime, UX, asset constraints.
- UI/UX Pro Max skill — dùng để định hướng design tokens, interaction, accessibility và responsive acceptance; cần thực hiện visual exploration trước khi khóa palette.

