# LabelLab 3D — Multi-Domain Parametric Packaging & Quality Engine Handoff

> **Purpose:** Self-contained technical & strategic continuity document so any fresh Antigravity session (on another machine, with zero prior chat history) can `git pull`, read this file, and immediately continue building **Phase 4–5** without losing a single decision, math convention, or test invariant.

---

## 1. Quick Resume Prompt (For a Brand-New Antigravity Session)

Paste this into a fresh conversation on any machine after `git pull`:

```text
Read docs/PARAMETRIC_PACKAGING_HANDOFF.md first to restore full context of our Multi-Domain Parametric Packaging CAD & Quality Engine campaign, then let's continue from [state the next task you want, e.g. Phase 4: Wave 2 templates / Combo Pack Your Bottles / Cloud Projects / Video Export / Apparel].
```

---

## 2. Strategic Vision & Campaign Status

`LabelLab3D` is evolving from a beverage-only mockup tool into a **Multi-Domain 3D Mockup Platform** competing with Pacdora:

1. **Domain 1 — Bottles & Cans (`beverage`)**: Existing glass, PET, PP bottles and aluminum cans with liquid optics & refraction (100% preserved, zero regressions).
2. **Domain 2 — Boxes & Trays (`packaging`)**: Parametric **millimetre (`mm`) 2D-to-3D CAD Engine** with real board thickness, procedural corrugated flute edges, staged non-colliding folding rig (`0% ↔ 100%`), 3-tier Progressive Inspector (richer parameters than Pacdora while simpler to use), live 3D hover highlighting, Split `2D Dieline | 3D Box` view, Dual-Mode Artwork Studio (`Quick Panels` + `Full Dieline`), and true `1:1 mm` vector export (`SVG / PDF / DXF`).
3. **Domain 3 — Fashion & Apparel (`apparel`, planned)**: Placeholder registered in `lib/domains/registry.ts` to plug into the shared `MockupRuntime` (`ProceduralSubject`), `QualityTier`, and Multi-Zone Artwork Composer without touching beverage or box code.

### Campaign Progress Matrix

| Phase | Scope | Status |
|---|---|---|
| **Phase 0** | Multi-domain architecture refactor: Domain Registry, `ProceduralSubject` runtime bridge, rounded-box Studio floor contact shadow, Studio shell integration | **DONE** |
| **Phase 1** | Parametric CAD Kernel (`lib/packaging-cad/`): 2D polygon/hole ops, 3-group solid extrusion, dynamic crease fillet strips, corrugated flute shader, Forward Kinematics folding rig, 3D mm dimensions, `1:1 mm` SVG/PDF/DXF exporters | **DONE** |
| **Phase 2** | 4 Wave 1 Templates (`FEFCO 0421`, `FEFCO 0201`, `FEFCO 0427`, `ECMA A20/A21`), 3-Tier Progressive Inspector + live 3D hover highlight, Floating Bottom Fold & Camera Dock | **DONE** |
| **Phase 3** | Dual-Mode 2D/3D Artwork Studio (`Quick Panel Designer` + `Full Dieline Pro`), Split `2D | 3D` View, Dual-side (`Outside`/`Inside`) print, shared 4K/8K Tiled PNG export | **DONE** |
| **Perf Upgrade** | 4-Tier Graphics Quality (`Auto | Low | Medium | High | Ultra`) × 3 Scene Weights (`Light | Medium | Heavy`) + 4× hardware MSAA + **Idle Sharpness** refinement + Studio top-bar Quality selector | **DONE** |
| **Phase 4** | Wave 2 Templates (Lid & Base Rigid Box, 4/6-Pack Beverage Carrier, Magnetic Rigid Box, Drawer/Sleeve Box, Grid Divider), Cloud Projects on Cloudflare D1 + R2, Folding Animation Video Export (`.webm`/`.mp4`) | **NEXT** |
| **Phase 5** | Exclusive Combo Feature **"Pack Your Bottles"** (auto-fit & mount user's 3D bottles/cans inside custom trays/cartons) + **Fashion & Apparel Engine (`engines/apparel`)** | **PLANNED** |

---

## 3. Complete Architecture & File Map

### Multi-Domain Core & 4-Tier Quality Engine
- `lib/domains/registry.ts` — Domain registry (`beverage` | `packaging` | `apparel`), capabilities flags, and `localStorage` persistence (`labellab.studio.domain.v1`).
- `lib/mockup/quality-tier.ts` — Pure hardware classifier (`detectHardwareTier`), 3-class workload classifier (`classifySceneWeight`: `light` for boxes/trays & cans, `medium` for PET/PP, `heavy` for dense refractive glass bottles), 4×3 quality budget matrix (`resolveQualityBudget`), and strict persistence (`labellab.graphics.quality.v1`).
- `lib/mockup/contracts.ts` — Defines `ProceduralSubject` adapter contract and extends `MockupRuntime` with `setProceduralSubject`, `refreshProceduralBounds`, `setCameraAngles`, `setQualityPreference`, and `getCanvas`.
- `lib/mockup/runtime.ts` — Shared Three.js WebGL runtime supporting both static GLB bottles/cans and live `ProceduralSubject` models, hardware MSAA targets (`previewTarget` + `idlePreviewTarget`), **Idle Sharpness** timer (`160–260ms` post-interaction crisp 4× MSAA still frame on heavy models), and per-model `adaptiveScale` reset.
- `lib/labellab/studio-ground.ts` — Upgraded contact shadow shader supporting both circular shadows (bottles/cans) and dynamic **rounded-box SDF shadows** (`setContactFootprint(width, depth, 'rounded-box')`) for cartons, trays, and unfolded flat blanks.

### Parametric Packaging CAD Engine (`lib/packaging-cad/`)
Pure TypeScript + Three.js geometry (zero React/DOM coupling in core solver/exporters — fully unit-testable in Node.js):
- `lib/packaging-cad/types.ts` — Core contracts (`PackagingParams`, `PanelNode2D`, `HingeSpec`, `SolvedDieline`, `PackagingTemplateDefinition`, `PackagingArtworkState`).
- `lib/packaging-cad/materials/paper-presets.ts` — 8 board presets (`Kraft E`, `White E`, `Kraft B`, `White B`, `Black E`, `Ivory 350`, `Kraft 350`, `Rigid 2mm`) with thickness `mm`, flute profile/pitch, GSM, colors, roughness, and fiber strength.
- `lib/packaging-cad/materials/corrugated-materials.ts` — Procedural kraft fiber bump texture + custom GLSL `onBeforeCompile` **Corrugated Flute Edge Shader** (renders sinusoidal hollow waves on cross-flute edges vs solid liner on parallel edges, driven by vertex color `R = fluteExposure`).
- `lib/packaging-cad/geometry/polygon-ops.ts` — Pure 2D mm geometry helpers (`rectPoly`, `roundedRectPoly`, `handHolePoly`, `notchedRectPoly`, CCW/CW winding normalization, area `m²`, tree bounds).
- `lib/packaging-cad/geometry/solid-builder.ts` — Thickened 3D `BufferGeometry` builder with 3 material groups (`0: Outside`, `1: Inside`, `2: Cut Edges & Hole Walls`), Earcut triangulation with holes, and transparent PET window film builder.
- `lib/packaging-cad/geometry/crease-hinge.ts` — Dynamic multi-segment rounded cylindrical crease bend strip (`createCreaseFillet`) updating vertices in-place with zero per-frame allocations so 90°/180° corners never show gaps.
- `lib/packaging-cad/geometry/dimension-overlay.ts` — High-DPI (`512×128`, anisotropy 8) 3D CAD dimension callouts (`L`, `W`, `H mm`) with active hover highlighting and wall-height capping on open-lid mailers.
- `lib/packaging-cad/kinematics/rig-builder.ts` — Forward Kinematics `THREE.Group` tree builder with staged cubic-eased folding (`0.0 → 1.0`), live parameter hover highlighting, auto-hiding 3D crease helper lines above 45% fold, and zero-leak `.dispose()`.
- `lib/packaging-cad/exporters/vector-dieline.ts` — Zero-dependency `1:1 mm` vector exporters: **SVG**, **AutoCAD DXF R12 (`$INSUNITS=4`)**, and **PDF 1.4 vector** (`Cut` Red, `Crease` Green dashed, `Bleed` Blue dashed, engineering title block).
- `lib/packaging-cad/artwork-composer.ts` — Dual-surface (`outside` / `inside`) `CanvasTexture` (`flipY = false`) composer supporting Full Dieline uploads, per-panel Quick Designer overlays (auto-rotated upright via `uprightAngleDeg`), and Face Orientation Guides (`FRONT ↑`, `LEFT ↑`, `TOP ↑`).
- `lib/packaging-cad/adapter.ts` — `PackagingSubjectController` implementing `ProceduralSubject`, managing live geometry rebuilds, fold animation playback, rounded-box footprints, and texture rebaking.
- `lib/packaging-cad/preferences.ts` — Isolated, allowlisted, bounded packaging state storage (`labellab.packaging.preferences.v1`).
- `lib/packaging-cad/templates/`:
  - `registry.ts` & `helpers.ts`
  - `fefco-0421-tray.ts` — Flagship Roll End Self-Locking Display Tray (`320×200×60 mm`, 4 base lock slots, double rollover sides, display scoop, hand holes, window, beverage auto-fit presets)
  - `fefco-0201-rsc.ts` — Standard A1 RSC Shipping Carton (rooted on back bottom flap so 0% lies completely flat; flap gap, hand holes, beverage case presets)
  - `fefco-0427-mailer.ts` — Self-Locking E-Commerce Mailer Box (rollover sides + hinged lid + lid dust wings + thumb notch + top window; hero fold `0.76` showcases open lid)
  - `ecma-a20-tuck.ts` — Straight & Reverse Tuck End Retail/Cosmetic Carton (single bottle box preset, thumb notch, front window + PET film)

### Studio UI Components (`components/labellab/`)
- `components/labellab/LabellabApp.tsx` — Multi-domain Studio shell with Domain Switcher (`Bottles & Cans | Boxes & Trays CAD | Apparel SOON`), top-bar Quality selector (`Auto | Low | Medium | High | Ultra`), Split `2D | 3D` viewport, and shared `RenderPanel` 4K/8K PNG export.
- `components/labellab/SceneCanvas.tsx` — Bridges `proceduralSubject`, `subjectName`, `qualityPreference`, and `onQualityChange` into `MockupRuntime`.
- `components/labellab/HomePage.tsx` — Adds direct CTA button to `/studio?domain=packaging#workspace`.
- `components/labellab/packaging/`:
  - `PackagingStudio.module.css`
  - `PackagingLibrary.tsx` — Searchable template catalog with live inline SVG miniature blueprints
  - `PackagingInspector.tsx` — 3-tier Progressive Inspector (Essential `L/W/H mm` + Presets + Materials → Structure & Cutouts → Pro CAD Mode + SVG/PDF/DXF download) with hover-to-highlight
  - `PackagingBottomDock.tsx` — Play/Pause fold, `Open ──●── Close` slider, `3D | Split | 2D`, `mm` toggle, `Faces` toggle, CAD camera presets (`3/4`, `Front`, `Top`, `Side`, `Inside`), zoom/reset
  - `PackagingDielineViewport.tsx` — Live interactive 2D mm SVG blueprint pane (click any panel to select it in Quick Panel Designer)
  - `PackagingArtworkPanel.tsx` — Dual-mode Artwork Designer (`Quick Panels` + `Full Dieline`, `Outside` + `Inside`)

---

## 4. Critical Math Conventions & Engineering Invariants (DO NOT BREAK)

1. **Units & Coordinate Mapping:**
   - All CAD calculations in `lib/packaging-cad/` are strictly in **millimetres (`mm`)**, converted to Three.js metres via `MM_TO_METRE = 0.001` during mesh creation (so `root.scale` remains `(1, 1, 1)`).
   - 2D CAD `(x, y)` (`+X` right, `+Y` back/up) maps to 3D `(x * 0.001, yOffset * 0.001, -y * 0.001)`.
   - **Triangle winding verified:** 2D CCW `(a, b, c)` maps to `+Y` normal (**Inside face**); `(a, c, b)` maps to `-Y` normal (**Outside face**).
2. **UV Projection (`flipY = false`):**
   - `v = (maxY - y) / blankH`
   - `u_inside = (x - minX) / blankW`
   - `u_outside = (maxX - x) / blankW` (horizontal mirror = Print-Side-Up sheet, ensuring every folded wall has right-handed, non-mirrored typography!).
3. **Invariant Hinge Orientation (`rig-builder.ts`):**
   - For every hinged child, compute `cross = edge3D × toCentroid3D`; if `cross.y < 0`, negate `edge3D`. Then `+angle` ALWAYS folds inward (`+Y`), `-angle` ALWAYS folds outward (`-Y`), regardless of panel orientation or nesting depth.
4. **Zero Z-Fighting in Double-Wall Trays/Mailers (`fefco-0421-tray.ts`, `fefco-0427-mailer.ts`):**
   - Corner dust flaps attached to front/back walls MUST inset their hinge X inward by `t + gap` (`flapBaseHalfL = halfL - t - gap`) so after folding `90°` they sit strictly between the outer side wall `[halfL, halfL + t]` and inner rollover wall `[halfL - 2t - 2gap, halfL - t - 2gap]`.
5. **Preserve Legacy Beverage Preferences Schema v1:**
   - NEVER change `lib/labellab/preferences.ts` schema `version: 1` or `DEFAULT_PREFERENCES` shape — `scripts/tests/preferences.test.cjs` enforces strict v1 invariants. Keep packaging, domain, and quality preferences in their own versioned storage keys.
6. **Desktop Studio CSS Layout:**
   - `.workspace-heading` is hidden in Studio desktop mode (`layout="studio"`). Keep active global Studio switches (Domain Switcher, Quality Selector) inside `.stage-top`, and keep packaging toasts top-positioned (`.toastTop`) so they never occlude the bottom fold dock.
   - In Split/2D view, `.splitContainerInset` applies `--pkg-left-inset` / `--pkg-right-inset` so the 2D dieline pane never renders behind floating sidebars.

---

## 5. Verification Commands (Windows PowerShell Note)

If Windows PowerShell blocks `npm.ps1`, use `npm.cmd`:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test          # Currently 232 / 232 tests passing (incl. packaging-cad.test.cjs & quality-tier.test.cjs)
npm.cmd run build
npm.cmd run dev       # http://127.0.0.1:3005/studio?domain=packaging
```

---

## 6. Recommended Next Steps (Phase 4 & Phase 5 Backlog)

1. **Wave 2 Packaging Templates** (each only ~200–350 lines in `lib/packaging-cad/templates/`):
   - `Lid & Base Rigid Box` (2-piece telescoping box with lift-off lid animation)
   - `Beverage 4/6-Pack Carrier Box` (handle + internal bottle dividers — directly serves LabelLab's F&B audience)
   - `Magnetic Closure Rigid Box` & `Drawer / Sleeve Box`
2. **Exclusive Differentiator — "Pack Your Bottles" (Auto-Fit Combo Scene):**
   - Allow users on `FEFCO 0421` / `FEFCO 0201` / `ECMA A20` to pick an existing bottle/can from `LAB_MODELS` + grid count (`4×3`, `6×4`, `1×1`) → auto-compute inner `L×W×H` AND mount instanced/cloned 3D bottles with the user's label right inside the tray!
3. **Folding Animation Video Export (`.webm` / `.mp4`) & Coin Monetization:**
   - Record smooth open → fold + 360° turntable clips from `runtime.getCanvas().captureStream(30)` (with optional coin charge via existing `/api/account/coin/reserve`).
   - Optionally gate 1:1 `PDF / DXF` production dieline downloads behind the existing Coin/Pro wallet (`wallets` + SePay/Polar).
4. **Cloud Projects (Cloudflare D1 + R2):**
   - Add `user_projects` D1 migration storing serialized JSON (`domain`, `packagingParams` or `beverageSettings`, artwork references in R2) so projects sync across office/home machines.
5. **Domain 3 — Fashion & Apparel Plug-in (`lib/apparel/`):**
   - Register `apparel` as `available: true` in `lib/domains/registry.ts`, mount `ApparelSubjectController` implementing `ProceduralSubject`, add PBR fabric micro-shaders (Cotton/Fleece/Denim with sheen + wrinkle AO multiply), and reuse the Multi-Zone Artwork Composer for `front-chest`, `back`, `left-sleeve`, `right-sleeve`, and `all-over-print`.
