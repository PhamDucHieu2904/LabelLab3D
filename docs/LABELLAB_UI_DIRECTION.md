# Labellab — UI direction and reference mapping

Date: 23/10/2026. Scope: visual implementation direction for the first editor-first prototype. This document supersedes the earlier neutral/indigo visual exploration for this prototype; commercial product requirements remain in `LABELLAB3D_MASTER_PLAN.md`.

## 1. Reference evidence

The three supplied screenshots were inspected directly:

1. `codex-clipboard-e671bcb0-81d6-48b0-929f-5e4af5b05bb0.png`: original VINUT website. Pink full-bleed background, animated orthogonal decorative grid, luminous white halo behind the product, floating tilted bottle, rounded translucent panels, white typography, cream active pills and warm orange CTA in the source reference.
2. `codex-clipboard-93cffd3d-9967-4517-942d-09f9d1815273.png`: original Mockup Studio. Three columns: model library, large product viewport, controls/export. Left focal-length rail; right motion rail; top background chooser; lower zoom/reset bar. Pink background and glass surfaces carry through the whole composition.
3. `codex-clipboard-37a91c0f-96e6-412e-a644-ab58e5926235.png`: Unity-style spatial studio. Upright product stands on an actual horizontal floor; perspective grid converges in depth, product has a contact shadow. This is scene geometry, not a flat CSS grid.

References reside in the Windows clipboard Temp directory. They are evidence, not production assets. Do not retain VINUT wordmark, beverage marketing copy or certifications in the Labellab interface.

## 2. Exact mapping to Labellab

| Reference feature | Labellab implementation | Verification |
|---|---|---|
| Strawberry Basil pink | Website scene baseline `#D53660`, editable color picker | Selecting/resetting Website mode restores baseline; user color changes are visible |
| White glowing halo | Radial white halo behind canvas/product; decorative and pointer-transparent | Silhouette separates from pink, controls remain legible |
| Orthogonal moving grid | Reuse established old website grid motion/background behavior | Grid moves behind panels, never captures pointer input |
| Tilted floating bottle | Website mode starts with tilt and idle rotation enabled | First loaded product animates; Idle stops it; drag takes immediate precedence |
| Vinut-style studio | Floating library / flexible canvas / inspector | At desktop no overlap; canvas remains dominant on one continuous background |
| Contextual tool rail | Models, Artwork, Scene, Materials and Export open one floating panel at a time | Active tool has text + selected semantics; closing the active tool returns space to the canvas |
| Motion rail | Website (tilt/rotate) and Idle (still) | Buttons reflect actual runtime state, mode switch preserves selected model |
| Focal rail | Front / three-quarter camera views plus zoom/reset | Preset changes visibly update camera, not just selected CSS |
| Export panel | Format, frame, quality, download action | Real output matches dimensions and selected background |
| Unity floor | Studio mode uses actual XZ white plane and perspective grid | Orbit low to confirm lines converge and product bottom touches floor |
| Depth fade | Studio grid/fog fade through 12–20 m under current asset unit contracts, fully faded at 20 m | No harsh end-of-floor edge or CSS-grid illusion |
| Contact shadow | Soft procedural grounding shadow under product | Shadow follows floor/model position; no hovering |

Terminology: the visible scene switch is **Scene 1** and **Scene 2**. Internally these map to Website and Studio respectively; keep those runtime names inside the implementation. Scene 2 is upright and static by default. Scene 1 is tilted and animated by default. Never apply the Scene 1 tilt to a grounded Scene 2 product.

## 3. Layout and visual tokens

- Page background: `#D53660`; brighter decorative glow may sit behind product only.
- Primary text: white; secondary text must use a verified contrast pair. Avoid lowering white opacity indiscriminately.
- Panels: floating translucent glass drawers with blur and thin white borders; cream active pills and warm CTA. The editor background remains continuous instead of three framed columns.
- Active pill: warm cream `#FFFDEB`, dark burgundy text. Primary CTA: solid burgundy with cream text.
- Studio scene: white floor/background, cool gray grid, black low-opacity soft shadow; the application chrome may retain pink identity.
- Fonts: Mona Sans for UI/body, Changa One for display headings and Luckiest Guy for wordmark/accent, falling back to Arial/sans-serif; body 16px/1.5, labels 12–14px with sufficient contrast, headings 600–700.
- Spacing: 8px base; page padding 24–32px desktop, 16px mobile; drawer gaps 20–24px.
- Desktop tool rail: 68px at left with 44px+ touch targets; contextual drawer 246–300px beside it, viewport remains the visual focus, and the camera rail stays inside the scene. Only one drawer is open at a time.
- Radius: 18–20px floating drawers, 12px toolbar, 12–16px cards and inputs, full pill for compact toggles.
- Controls: minimum 44px touch area; at least 8px between adjacent independent controls.
- 1000px and below: canvas first after a horizontally scrollable tool rail; the selected drawer stacks below the preview, keeping every function reachable without three narrow columns or horizontal scrolling.
- Never fix the renderer dimensions to `window.innerWidth`: use canvas container dimensions and ResizeObserver.

## 4. Interaction states

| Area | Required states and behavior |
|---|---|
| Model | initial poster/loading, selected, ready, failed + retry; selection announced accessibly |
| Upload | idle, drag-over, validating, accepted, unsupported/error; preserve current artwork on failure |
| Website/Studio | mutually exclusive, persistent visible selection; switch immediately; do not reload model unnecessarily |
| Motion | selected motion, playing/paused, user-dragging; user pause must not be silently undone |
| Export | idle, capturing, success, failure; disabled while no renderable model; repeated clicks cannot start duplicate captures |
| Color | swatch + text value, picker keyboard accessible; reset yields exact baseline |
| Library | filtered count, no matches + clear filter, selected card, disabled incompatible option |
| Zoom/reset | native button semantics and labels; keyboard alternative to drag/pinch |

Website animation must respect reduced-motion. With reduced-motion enabled, show static tilt, stop grid travel/auto-rotation, and allow deliberate manual motion. Pause when tab is hidden. Maintain one render loop; dispose replaced textures/materials/geometry and cancel observers/listeners on teardown.

## 5. Accessibility and visual risks

1. White small text over a bright halo can fail 4.5:1. Measure actual composited backgrounds; keep controls on stable cream surfaces. Halo must not move behind form labels.
2. White text on pale orange gradients can fail. Use burgundy text or a darker CTA stop and verify every state.
3. Perpetual grid/tilt/rotation requires a visible pause control and prefers-reduced-motion support. No auto-restart after explicit pause.
4. Icon rails need accessible names, tooltips available on keyboard focus, visible focus rings and no reliance on hover.
5. Canvas needs meaningful label plus external keyboard-operable camera actions. Describing the canvas alone does not make dragging accessible.
6. Model selection, modes and errors must not rely on color alone. Use aria-pressed or tab semantics and visible text/checkmark.
7. Do not trap scrolling on the whole page for orbit. Scope touch-action to viewport and keep page scrolling possible outside it.
8. Mobile drawers must manage focus, Escape, background inertness and focus restoration. Avoid nested scroll traps.
9. Loading/export status should use polite live regions and aria-busy; do not announce every animation frame.
10. The existing assets retain actual-metre dimensions (glass manifest approximately 0.18 m, appMetersPerSourceUnit 0.1). The 20 m floor fade is a catalog visual convention; every new model requires source-unit/manifest verification, and this is not engineering measurement software.

## 6. Current integration review

At initial review, `lib/labellab/studio-ground.ts` exists and matches the floor direction: 200-unit XZ plane; world-coordinate grid; camera-distance fade at 12–20; contact patch; background/fog restore; explicit disposal. It assumes a product centered on X/Z, keeping actual-metre asset units; contact radius follows current bounds. `setFloorY` must receive the current upright product bounding-box minimum in model metres. This is a procedural grounding approximation, not a physically simulated shadow.

Final integration was exercised in Chromium CUA. See the verified QA section below.

## 7. QA acceptance

- Website first load: pink #D53660 baseline, white halo, visible animated grid, tilted rotating product.
- Website Idle: stops model motion; interaction responds without fighting auto-rotation.
- Studio switch: white spatial floor, upright grounded product, perspective grid fading by 20 m under current catalog contract; selected model/artwork preserved.
- Mode round trip: background/fog/grid/tilt restore consistently; no model or GPU-resource duplication.
- Camera presets, zoom/reset, color and frame controls produce visible runtime effects.
- PNG dimensions/background match selection; transparent export does not bake decorative page chrome into the image.
- 375/768/1024/1440 widths: controls reachable, no unwanted horizontal overflow or panel overlap.
- Keyboard-only, reduced-motion, slow model loading/error, WebGL failure/context loss and hidden-tab resume verified.

## 8. UI/UX Pro Max evidence

Verified `search.py` queries on 23/10/2026: `glassmorphism creative tool --domain style`, `reduced motion pause animation --domain ux`, `glassmorphism text contrast --domain ux`, `shadows plane grid --stack threejs`.

Matched guidance: translucent surfaces + 10–20px blur + thin light border; 4.5:1 normal text contrast; reduced-motion and restrained animation; selective shadows; size renderer to canvas container. Three.js database rows reference 0.185.1, so adapt API guidance to the pinned project version and test rather than upgrading automatically.

## Final implementation and verified QA — 23/10/2026

The implemented interpretation uses a continuous pink canvas with a translucent blurred tool rail and one contextual drawer at a time, cream active pills, Mona Sans, Changa One and Luckiest Guy. Models, Artwork, Scene, Materials and Export are rail tools; Scene 1/Scene 2 remain the visible scene choices, while Website/Idle remain motion choices. Camera actions provide front/three-quarter views and zoom/reset, without a focal-length or speed control. The user explicitly permits the berry icon in the moving grid.

Studio keeps metre-based model contracts (glass dimensionsMeters about 0.18 m, appMetersPerSourceUnit 0.1), a dedicated matte pass for #FFFFFF floor/background, perspective grid fade at 12–20 m and an additional fade of grid ink within the outer 8% of viewport. Product and contact shadow retain coverage at the frame edge. Website PNG now composites enabled grid, halo and selected background; application chrome is excluded. Studio PNG retains the white floor/grid.

Verified by the main agent: typecheck, lint, 8 tests and production build pass. Earlier Chromium CUA covered all 3 models, WEBP upload, color picker, preference refresh, saved-project restore, both modes, and downloaded Studio PNG 819×1024 plus Website PNG 2048×1152. Responsive widths 375/390/768/1024/1440 showed no horizontal overflow. Screenshots: `docs/screenshots/labellab-website.jpg`, `docs/screenshots/labellab-studio.jpg`.

These checks do not constitute cross-browser/GPU validation, context-loss testing, screen-reader audit, or commercial security/payment audit. Earlier reference descriptions explain source imagery; this final section defines the shipped UI where they differ.




### Xác nhận sau hiệu chỉnh Web-only

Agent chính xác nhận typecheck/lint/8 tests (3 catalog/resolver + 5 preferences)/verify-assets (12 assets)/build đều pass. Chromium switch cả ba model cho thấy chỉ studio-softbox.exr và glass-290-basil-web.glb/can-330.glb/pet-500-short-label.glb; không tải High GLB/buffers/HDRI. Cả ba ready ở Website/Studio, console không lỗi/cảnh báo. PNG Basil Web Studio 1024×1024 đã tải và kiểm tra trực quan sản phẩm/grid/watermark. SHA256 cả ba GLB trùng source VINUT (Basil 424312 bytes, can 126500 bytes, PET 1128836 bytes).

Bằng chứng mới: `docs/screenshots/labellab-basil-web.png`, `docs/screenshots/labellab-basil-web-export.png`. Các kiểm tra upload WEBP/color picker/preferences/project restore/responsive và PNG portrait/landscape ghi phía trên là đợt kiểm tra rộng hơn trước hiệu chỉnh, không được hiểu là toàn bộ đã rerun. Không có benchmark FPS hoặc audit cross-browser/GPU/context loss/screen reader/commercial.

