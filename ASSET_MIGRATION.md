# Asset migration — Labellab

Migration date: 2026-10-23. Source repository: `D:\program project\3d display product website`. Source remains unchanged.

## Included

- `lib/viewer/` and `lib/mockup/`: real Three.js GLB load/render/capture/resource-pool modules and PET/glass/Basil website material pipeline; retained High helpers are compatibility code, not selected defaults.
- Catalog selector/resolve/compatibility contracts, generic viewer configuration and background grid modules with required dependencies.
- `lib/labellab/catalog.ts`: typed facade `LabModel`, `LAB_MODELS`/`labModels`, `DEFAULT_MODEL`, `DEFAULT_MODEL_ID`, `getLabModel(id)`, `publishedCatalog`.
- Public Draco/Basis decoders, studio environment and published website GLB/material assets for Basil, can330 and PET. Retained High resources, if present on disk, do not imply that they are used.
- Three ready scenes: Basil Strawberry Glass290 Web (default), Mango Juice can330, Aloe Mango PET500. Posters/artwork resolve to actual published source media, not generated substitutes.

## Default Basil provenance

The actual published `current.json` source release ID is `a9c073a1-def6-423b-82d9-c4d99f579be0` (published 2026-10-19). Display `basil-glass290-strawberry-3d` provides label `basil-glass290-strawberry-label`, strawberry artwork `/assets/labels/basil-seed/strawberry-64f1598ff408.webp` and independent liquid tint `#F14E78`.

The current selection follows the original published website contracts for every model. Basil uses lightweight `glass-290-basil-web.glb` and the published web semantic slots, appearance and UV sampler. Labellab must not substitute retained `glass-290-basil.glb` High geometry, High slots, optical buffers or High HDRI in this facade. Can and PET likewise keep their resolved published website assets. This preserves the web-optimized versions supplied by the source project.

An earlier prototype incorrectly overrode Basil with the High model. That override has been removed; the High transfer-size figures from that prototype are not the current default asset budget. Files/helpers retained for source compatibility are not evidence that a selected scene loads them. No measured FPS or mobile performance guarantee is claimed; profile the actual published web scenes on target devices.
## Runtime integration

Dynamically import `createMockupRuntime` from `lib/mockup/runtime`, create with an HTMLDivElement and `onStatus`, set aspect/background/animation, then call `select(model.asset, model.appearance, model.frontYaw)`. Dispose on unmount. `capture` returns an actual PNG Blob from render targets; it does not charge tokens or persist/download automatically.

The collaborating runtime extension adds website/studio scene modes and a bounded studio ground. UI must use the declared runtime contract, not private Three internals.

## Limitations

- This is a local frontend/catalog seed, not production auth/payment/token accounting. No client-side balance can represent a production wallet.
- `source-catalog.json` retains the source public snapshot for audit/resolver compatibility; only the three facade scenes and their media are migrated. Do not expose arbitrary snapshot records as available scenes without copying/preflighting their assets.
- Some source modules retain VINUT-specific names/copy/presets for compatibility. The selected scenes use real VINUT artwork; licensing and commercial publication approval are still required.
- Unity is authoring/source and optics reference. Browser rendering uses GLB + Three.js, not an embedded Unity app.
- Source manifests describe the source asset pipeline and may include local authoring paths; they are provenance, not a live conversion service.
- Session-local artwork and browser-local settings/project saves exist. Server storage/sharing, render queues, entitlements, paid downloads and abuse protection remain later phases.

## Verification

`node scripts/verify-assets.cjs` is the asset verification entry point. It must validate the selected published website model/poster/label and supporting runtime assets, plus strawberry liquid tint; it must not require High buffers as the default Basil dependency. The final web-only correction passed typecheck, lint, all 8 tests (3 actual catalog/resolver tests and 5 preferences tests), verify-assets (12 assets), and production build. Chromium inventory after switching all three models contained studio-softbox.exr, glass-290-basil-web.glb, can-330.glb and pet-500-short-label.glb, with no High GLB/optical buffers/HDRI requests. All three were ready in Website and Studio with zero console errors/warnings. Basil Web Studio PNG was downloaded and visually inspected at 1024×1024, showing product/grid/watermark. All three GLBs are SHA256-identical to VINUT source: Basil 424,312 bytes; can 126,500 bytes; PET 1,128,836 bytes. No FPS benchmark is claimed.


