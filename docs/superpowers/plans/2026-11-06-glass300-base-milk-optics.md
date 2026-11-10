# Glass 300 base and milk optics implementation plan

> **For agentic workers:** Use test-driven-development and verification-before-completion for the two scoped corrections below.

**Goal:** Match the supplied pale milk-filled Base and refracted milk-surface references.
**Architecture:** Keep GLB untouched; only glass-300-v1 opts into measured clear Base refraction and captured milk-surface shading in the existing Neck tracer.
**Tech Stack:** TypeScript, Three.js 0.180, Node tests, Next.js preview.
**Spec:** `docs/superpowers/specs/2026-11-06-glass300-base-milk-optics-design.md`.

## Constraints

- Preserve all source meshes, transforms, winding and UVs.
- Preserve 280/290/PET behavior and all existing controls/export atlas hooks.
- Work in the existing dirty preview checkout; preserve unrelated edits and do not commit them.

## Review focus

- Canonical metric transform must include the source .1 scale once.
- Base must preserve captured milk radiance during native preview and transparent export.
- Milk stays opaque; retained capture is surface radiance, not background transparency.
- Neck and Base defaults remain editable through existing appearance overrides.
- Existing bottle profiles remain on their prior shader paths.

## Task 1: Profile-specific Base

- [x] Add failing real-GLB test asserting separate Base material key, measured ~4.86mm path, clear attenuation, no geometry changes, and unmodified Body behavior.
- [x] Run targeted test and observe failure.
- [x] Add `glass-300-v1` Base branch to the shared glass configurator; measure axial extent in canonical metric space, retain clear attenuation and native transmission/export helper.
- [x] Run targeted tests, then inspect underside in the browser.

## Task 2: Preserve refracted milk surface

- [x] Add runtime tests for bounded dense milk surface capture at zero clarity.
- [x] Add optional `surfaceCapture` argument to the existing Neck context; sample surface capture with glass roughness and retain normal-dependent diffuse/specular radiance at zero liquid clarity.
- [x] Run tests and compare front/top/underside with supplied references.
- [x] Run complete test suite, typecheck, lint and asset validation; get a focused independent review.
- [x] Save final preview evidence and report the change and remaining limits.

## Verification — corrected clear Base, 2026-11-06

- `npm test`: 155 passed, 0 failed.
- `npm run typecheck`, `npm run lint`, `node scripts/verify-assets.cjs`, `npm run build`: exit 0. Build retains the existing metadataBase warning.
- Root cause: the prior `#b8b8b8` Base attenuation multiplied captured milk radiance by ~0.479 over the measured chord. White attenuation plus Infinity removes that artificial gray disk. Roughness is the authored .042, IOR stays 1.52, and the measured thickness still follows the actual draw object's world scale.
- Shared milk rendering was updated concurrently to `basil-web-milk-reservoir-v2`. It writes opaque liquid pigment into the transmission reservoir, avoiding the dark downward-facing PBR milk surface. It applies to the profiled 290/300 Milk branch; existing color and explicit optics controls still wrap that output. This shared change was preserved and independently reviewed for shader, alpha, and live-reset compatibility.
- Focused review found no actionable issue in the clear Base correction or the shared milk reservoir. Existing surface capture retains the density/turbidity/scattering baseline.
- Earlier geometry audit: Base axial extent ~4.86 mm; 696 Water/Base clearance rays measured 0.188–0.332 mm with no intersections. This correction changes no geometry.
- Fresh CUA verification reloaded the actual 300 ml Studio model, inspected near-front and underside views, then rendered and downloaded a transparent 1024 px PNG. Both show pale cream milk behind clear glass with radial creases instead of the former dark gray disk.
- Current evidence: `artifacts/screenshots/glass-300-milk-clear-near-front.png`, `artifacts/screenshots/glass-300-milk-clear-underside.png`, and `artifacts/screenshots/glass-300-milk-clear-transparent.png`. Earlier `*-optics-fixed.jpg` images predate this correction and are not final evidence.
- Limits: the current pigment is warmer than the reference and the reference's creases have greater contrast. Camera/crop and environment also differ. Native Base capture remains screen-space and the Neck uses the existing hollow-neck trace; this is not an offline multiple-scattering simulation. No pixel-exact reference match is claimed. No GLB changes or commits were made.
