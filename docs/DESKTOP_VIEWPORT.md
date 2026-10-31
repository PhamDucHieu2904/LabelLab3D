# Home / Studio: shared desktop scaling

Both public routes use `DesktopViewport`. Admin and the account dialog are outside this surface.

- Home and shared header reference: **1920 × 1080**, including the 64 px site header.
- Above **860 px** viewport width, Home's scale remains `min(viewportWidth / 1920, viewportHeight / 1080)`.
- Studio's working UI uses the supplied **1920 × 960** PC reference: `min(viewportWidth / 1920, viewportHeight / 960)`. Its entire workspace shares this scale, including both sidebars, rail, scene controls, camera dock, type and spacing. At 1920 × 960 the original 278 px sidebars and 68 px rail are restored.
- Studio's header keeps exactly the same scale as Home. The workspace's logical height uses the physical viewport height remaining after that header; fullscreen uses the full logical Studio page height. `fitStudioWorkspace` calculates the relative zoom and these dimensions together.
- The logical surface is `viewportWidth / scale` by `viewportHeight / scale`. It fills the screen; extra space from a different aspect ratio expands the canvas/grid without distorting text, controls or images.
- At **860 px or less**, the existing mobile composition runs at scale 1 and can scroll vertically.

## Extending the UI

Use `@container labellab-page (...)` for layout width breakpoints in public-page components. A laptop still has a desktop logical surface; using physical `@media (max-width: ...)` here would reintroduce hidden labels, shrinking panels and mobile layout on laptops. Physical media queries remain appropriate for motion preferences and input devices.

Home design units remain `--home-unit: 1px`; do not add a second independent scale. Use `--labellab-page-width` / `--labellab-page-height` for viewport-bound layout inside the surface. The account dialog is a sibling outside the surface and keeps physical viewport limits.

The 3D canvas fills the scene beneath floating UI. Its drawing buffer follows displayed dimensions and capped device pixel ratio, while camera aspect and exported image framing use the scene's logical dimensions. Opening panels does not resize the scene. Scale-only changes do not reset camera pose, pan or FOV. Keep Studio's geometry correction at the workspace level; do not enlarge individual cards or change the approved Home layout.

## Verified 2026-10-31

Chromium checks on Home and Studio: 1920 × 1080, 1366 × 768, 1440 × 900 and 1108 × 552. All six Home cards fit their contents; desktop document dimensions match the viewport. Studio's render sidebar has no vertical overflow, including the Story frame. Also checked 900 × 600 desktop layout, 390 × 844 mobile layout, Material panel, fullscreen enter/exit, centered project/account dialogs and a successful local 1024 px transparent render. After restoring the original Studio size, rechecked its full workspace at 1920 × 960 (sidebars 278 px, rail 68 px), the four PC/laptop sizes, Artwork/Materials sizes, Story rendering panel and fullscreen coverage.

`npm test`: 61 passed. ESLint, TypeScript and production build passed. Build retains the existing `metadataBase` warning.

Current Studio reference screenshot: `artifacts/screenshots/studio-original-scale-pc.jpg`. The approved Home screenshot remains `artifacts/screenshots/scale-home-laptop.jpg`.
