# Vinut web can asset migration

The Studio can library uses the optimized geometry exported by the Vinut web
project at `D:\program project\3d display product website\public\models\cans`.
The Unity/Label Lab PC meshes are not loaded by the web runtime.

## Imported geometry

All six files are copied byte-for-byte into `public/models/cans` and are
described by `public/models/cans/assets.manifest.json`. Every asset uses Draco
compression, Y-up meters, a centered origin, the `can-wrap-v1` UV layout, and
the semantic slots `aluminum-body`, `aluminum-tab`, and `printed-label`.

| Library ID | Vinut asset | Size | SHA-256 |
| --- | --- | ---: | --- |
| `can-180` | `can-180.glb` | 115,308 B | `9b3bca8715f2f506cb538359a00220f4c41050f313e6ecb25ce4a9295bf6ab4c` |
| `can-250-short` | `can-250-short.glb` | 125,964 B | `c53d8d2db39467fafc5bf053510d1a722a0c5a03d26807e4b664ee801a96aad2` |
| `can-250-slim` | `can-250.glb` | 132,184 B | `46307936719ba802e35f7015fe7f7ca37d24b1992ba727ae03dfad0276fe93d3` |
| `can-320` | `can-320.glb` | 167,516 B | `43efc229a646bba2f74a44e56183aa80f92f6111b383ba4d4b9ab6357b372f6d` |
| `can-mango` | `can-330.glb` | 126,500 B | `34584a3635d8027497e5fe53c911469a36a493951ced72673d84d24bff7c531a` |
| `can-500` | `can-500.glb` | 127,588 B | `14817c2a509bf5c357462be4ab54fee6f0296aa9c70f7d846110882b26a86c1b` |

The five newly imported entries are geometry-first models with a blank label
slot. They preserve the manifest's printed-label PBR values (metalness 0.18,
roughness 0.28, clearcoat 0.35) and accept user artwork in Studio. The 330 ml
Mango entry remains the published display with its real Vinut artwork and
appearance.

## Catalog and persistence

`lib/labellab/catalog.ts` exposes one packaging family per geometry, with
`can-250-short` and `can-250-slim` intentionally separated. `canAssets` adds a
short SHA query to model URLs so a deployed browser cannot reuse an older GLB.
`lib/labellab/preferences.ts` accepts all native model IDs, while the home
showcase continues to feature the three published sample scenes.

Native posters live in `public/models/cans/posters/<asset-id>.webp`. The five
blank-catalog posters were rendered from their corresponding GLBs at 1024 px
with transparency; the 330 ml poster is the published Vinut poster.

## Verification

Run these checks after changing a can asset or catalog entry:

```powershell
node scripts/verify-assets.cjs
node --test scripts/tests/*.test.cjs
npm run typecheck
npm run build
```

`verify-assets.cjs` checks the six manifest files byte-for-byte, SHA-256,
posters, the three published display provenance records, and the shared Draco
runtime assets.

## User-supplied PET 350 ml — 2026-11-02

The user supplied the refreshed `D:/3D model/Model Bottle Can/Blender Model 1/Pet 350ml bottle model web.glb`, replacing the earlier Old Bottle export. Run `node scripts/import-pet350.cjs <source.glb>` to reproduce `public/models/bottles/pet-350-juice.glb` and its manifest, including final compression. The source remains untouched (2,162,984 bytes); output is 916,940 bytes. Every triangle and vertex is retained; numeric precision is controlled and measured as described below. A parent scale of 0.1 converts the model to metres. Water receives a 0.992 horizontal node scale to avoid near-coplanar shell artifacts without changing fill height.

Semantic material slots are PlasticBody/Ring (body), PlasticCap (cap), Label (artwork), and Water (liquid). The `juice-pet-v1` profile uses the existing PET optical pipeline; the source's large label sleeve remains white until artwork is applied. Default liquid is Fruit juice / Apple (#E8B64F), with editable custom optics. The 360×480 WebP poster was generated from a transparent 1024 px render of this model. Source/output hashes and units are recorded in `pet-350-juice.manifest.json` and verified by the asset check.

## User-supplied PET 330 ml Energy drink — 2026-11-02

Source: `D:/3D model/Model Bottle Can/Blender Model 1/Pet 330ml model Web.glb`, explicitly requested by the user and refreshed with the denser export. `node scripts/import-pet330.cjs <source.glb>` creates the web material/unit adaptation, final compression, manifest and SHA records. Source is 1,710,892 bytes; output is 698,276 bytes. Mesh density, UV seams and triangle topology stay intact, with measured high-precision numeric compression. A 0.1 parent scale converts to metres without modifying authored nodes. Explicit slots preserve the source names: Plastic Body / ThinRefraction / Ring, Cap, Lable, Water. The model starts with white cap/print and Energy drink / Orange (#FFD600), matching the app's Orange linear RGB (1, .6703185, 0).

Reference files read from `D:/UnityHubData/Unity_3D_Mockup_Project/Assets/`: `Data/Prefab bottle and can/Pet 330ml model.prefab`, `System/Script/EnergyDrinkBubbleParticleSystem.cs`, `System/Shader graph/EnergyDrinkBubbleParticle.shader`, and Energy drink material presets. The app exposes `_SparklingAmount` from 0–1; enabled example presets use .516. Web defaults to .516 (135 particles). The count curve, 300-particle cap, diameter range (.22–.9% of liquid height), rise-speed range (2.5–11% height/sec), wall inset, HSV tint and Fresnel/glint shell follow that reference. Instanced spheres avoid inheriting Water's nonuniform scale and render after PET, excluding the label band.

`lib/viewer/energy-bubbles.ts` adds actual geometry only for the calibrated `asset.sparkling` model. Convex hull clearance mirrors the app collider, with cached vertical paths constrained to source triangles to avoid bubbles bridging the concave shoulder. Web trajectories rise vertically; they do not reproduce the app's small lateral drift or HDRP spectral render pipeline. Preview respects reduced motion; capture freezes the particle state across tiles. The poster is a 360×480 WebP from this model's transparent 1024 px PNG export.

## User-supplied Glass 280 ml Milk coffee — 2026-11-02

Source: `D:/3D model/Model Bottle Can/Ai edit/Glass 280ml model - Web.glb`, explicitly supplied by the user and refreshed with the denser export. Run `node scripts/import-glass280.cjs <source.glb>` to reproduce `public/models/bottles/glass-280-latte.glb` and its manifest, including final compression. The source remains untouched (1,427,620 bytes); output is 646,608 bytes. Every triangle and vertex remains, with measured high-precision numeric compression. A new parent scale of 0.1 converts to metres. Water receives a 0.992 horizontal node scale to keep it inside the label at the rounded heel; fill height stays unchanged.

The `glass-280-v1` material profile maps Body / Glass Refraction to glass, Cap to the silver editable lid, Label to artwork and Water to liquid. White layer stays a fixed white cap liner. Cap and liner are opaque, double-sided and depth-writing, including underside views. Print is full alpha in the final transparent queue so nearly coincident glass cannot refract coffee over it; removing artwork restores a white label. The standard source's full sleeve deliberately extends over the cap rim, while the Short sleeve ends below it. Native glass transmission samples milk coffee with the solid print/lid/liner excluded from its reservoir. IOR is 1.52; wall/neck/base optical thickness is 2/2.5/4 mm, corrected for retained nonuniform Blender transforms. Clear-capture alpha correction preserves PNG transparency and glass highlights. Glass depth writes are disabled to keep the source's nearly coincident print surface clean. GLB and poster URLs include the manifest hash to invalidate older cached assets.

Defaults are Coffee / Latte (#B88C69) with editable custom optics and no sparkling. The model has its own Glass library family and persistent model ID. Its 360×480 WebP poster was generated from an actual transparent 1024 px PNG export. Asset verification checks the output hash and poster; regression tests cover decoded geometry digests, slots, defaults, persistence, print visibility and the unchanged white liner.

## User-supplied Glass 280 ml Short Milk coffee — 2026-11-02

Source: `D:/3D model/Model Bottle Can/Ai edit/Glass 280ml model_Short Web.glb`, explicitly requested as another bottle and refreshed with the denser export. Run `node scripts/import-glass280.cjs <source.glb> short` to reproduce the separate compressed `glass-280-short-latte` GLB and manifest. Source is 1,406,476 bytes; output is 646,860 bytes. Every triangle and vertex stays intact beneath a new 0.1 metre-scale parent, with measured high-precision numeric compression, the same 0.992 horizontal water inset and unchanged fill height.

This asset uses Body / Neck / GlassBase as editable glass slots, with Cap, Label and Water retaining their roles and White layer staying fixed white. It shares the explicit `glass-280-v1` optical profile and Coffee / Latte defaults with the standard 280 ml model. The distinct supplied geometry, label envelope and UVs are retained. Both belong to one 280 ml Bottle family: Full label at index/order 0 (default) and Short label at index/order 1. The family card uses the full-label poster; both underlying model IDs, GLBs and individual posters remain available. The Short poster comes from a transparent 1024 px PNG export of this asset. Tests verify family grouping/order alongside independent geometry/poster paths, hashes, all three transmission slots and default/persisted materials.

## Subdivision geometry refresh — 2026-11-02

All four supplied exports replace their existing catalog entries. Geometry is already tessellated in these GLBs; the web does not apply subdivision or simplify it. Model IDs, material defaults, label surfaces, cap/liner fixes, metric glass optics and PET330 sparkling remain in place. All four model/poster URLs now include the GLB manifest SHA to invalidate prior cached assets. Posters were regenerated from actual Scene 2 / View 4 transparent PNGs: PET330 at 4096 px and the other three at 1024 px. Source files are read-only; pre-refresh web assets are retained in the ignored `.qa/subdivision-refresh-20261102/` folder.

| Model | Previous total triangles | Refreshed total triangles |
| --- | ---: | ---: |
| Glass 280 ml | 21,672 | 50,204 |
| Glass 280 ml Short | 21,816 | 51,164 |
| PET 330 ml | 9,260 | 52,036 |
| PET 350 ml | 18,234 | 59,556 |

Before final compression, byte comparisons confirmed the refreshed source geometry/index/normal/UV binary chunks matched the material/unit adaptations. The final compressed binary differs by design; decoded geometry is validated as described next. Regression checks use the compressed GLBs, including water containment, metric neck thickness and sparkling paths.

## Bottle download compression — 2026-11-02

The 500 ml reference is 1,128,836 bytes despite 246,960 triangles because its geometry already uses Draco compression. The four refreshed bottles had only 50–60k triangles but were still raw float32/index buffers. Lossless Meshopt alone produced 962,564 / 961,060 / 1,055,300 / 1,443,012 bytes, so it did not meet the user's budget for the PET models.

All four now use `EXT_meshopt_compression` with exponential attribute filters (POSITION 20, NORMAL 14, TEXCOORD_0 18 bits, SharedComponent). There is no subdivision change, decimation, welding, vertex reorder or removed UV seam. The triangle codec may cyclically rotate each triangle's three indices; face order and winding are checked against the source. All nodes, transforms, materials, extensions, attributes and animation channels are retained; accessor bounds are recomputed from decoded values. Animation buffers are compressed losslessly. These are high-precision lossy numeric encodings, not byte-identical geometry. Blender originals and supplied GLBs are untouched; the current approved smooth GLBs are the input, so another Blender export is unnecessary.

| Model | Raw web bytes | Compressed bytes | Reduction | Triangles retained | Max position error (mm) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Glass 280 ml | 1,428,416 | 646,608 | 54.73% | 50,204 | 0.000160 |
| Glass 280 ml Short | 1,407,428 | 646,860 | 54.04% | 51,164 | 0.000165 |
| PET 330 ml | 1,711,900 | 698,276 | 59.21% | 52,036 | 0.000111 |
| PET 350 ml | 2,163,840 | 916,940 | 57.62% | 59,556 | 0.000336 |

All errors are measured after decompression by Three's bundled Meshopt decoder and conversion through the retained world transforms. Maximum transformed normal error is 0.0425 degrees; maximum UV error is 0.0000076294, or 0.03125 pixels on a 4096 px texture. The packer refuses output at or above 1,000,000 bytes, position error at or above 0.5 micrometres, normal error at or above 0.05 degrees, UV error at or above 0.00001, changed scene metadata or changed topology.

`scripts/lib/bottle-compression.cjs` is shared by all import scripts; `npm run optimize:bottles` can compress existing raw web assets and skips already compressed assets to avoid repeated precision loss. Each import decodes and compares against its raw input before writing. Manifests store raw/final binary hashes, per-view source/decoded hashes, scene metadata digest, counts and measured errors. Raw smooth web backups are in ignored `.qa/lossless-compression-20261102/`. `bottle-compression.test.cjs` independently decodes the published assets, checks hashes, exact bounds and budgets, and exercises retained UV seams and rejected changes to face winding/transforms. Glass material and energy bubble tests now load through the runtime GLTFLoader/Meshopt decoder.

Validation: 89 tests, typecheck, lint, verify-assets, production build and diff whitespace check pass. Re-running all four imports reproduces the same compressed sizes. Chromium loads all four compressed assets and exports/downloads transparent 1024 px PNGs without console errors. Both Glass models and PET350 have exactly the same pixel bounds as their previous raw 1024 px renders; normalized RGB mean absolute differences are below 0.01 on a 0–255 channel scale. PET330's older reference is 4096 px with different framing and animated particles, so no pixel-equality claim is made for it. Its vertex/triangle proof and real water/bubble containment checks pass. Actual exported images appear in `artifacts/screenshots/compressed-models-preview.jpg`; surrounding Studio screenshots use the `compressed-studio.jpg` suffix. This pass does not measure FPS or GPU-memory savings: decompression retains the original mesh density.

## Draco PET320 Full and PET1L — 2026-11-04

Added the user-supplied `Pet 320ml Model Full Label - Web.glb` and `Pet 1L Bottle Model_web.glb` using KHR_draco_mesh_compression, official draco3dgltf 1.5.7 Edgebreaker, POSITION/NORMAL/UV precision 18/14/16. Originals remain untouched. Every oriented triangle, material boundary and UV seam is retained; no simplification. Draco reorders vertices and faces, so validation matches oriented triangle corners through world transforms rather than comparing vertex indices. Decode uses the exact public Draco wrapper/WASM shipped to the browser.

| Model | Source bytes | Final bytes | Triangles | Max position error (mm) | UV error (pixels @4K) | Normal error (degrees) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| PET320 Full | 11,430,844 | 1,114,788 | 214,240 | 0.000337192 | 0.031616 | 0.020832 |
| PET1L | 2,565,128 | 445,064 | 86,548 | 0.000561393 | 0.031494 | 0.029702 |

The new 320 is lighter than existing Nata320 (1,240,124 bytes). Its dense cap alone retains 127,200 triangles. Import scripts keep source nodes beneath a 0.1 metre parent and explicitly adapt PET body/cap/label/liquid/Nata slots. New320 uses Nata water and jelly, white cap and full white print. PET1L uses provisional editable Juice/Apple and white cap/print, with PET350 optical material profile. Per-model manifests store source/final SHA, decoded geometry digests, precision and measured errors. Asset/poster URLs are versioned by GLB SHA; the runtime already supports Draco.

Both new assets opt into bounds-based camera framing: retain authored View 1–4 angles/FOV, center the measured bottle and increase distance where required to contain it. This prevents PET1L's cap clipping and PET320 Full's heel clipping without changing other assets' legacy framing. New regression projects the measured-size envelopes in all views and four aspect ratios.

QA: 99 tests, typecheck, lint (zero warnings), verify-assets, production build and diff whitespace check pass. Build retains the pre-existing metadataBase warning. Browser loads both via shipped decoder, replaces/removes artwork, resets native Nata/Juice optics, edits/resets cap color, retains PET1L after navigation without model query, and still selects old Nata320. Actual transparent 1024 PNGs have alpha-zero corners and contained bottle bounds; 360x480 WebP posters were cropped from these exports. Console error log empty on final check. Evidence: `artifacts/screenshots/pet-320-full-draco.png`, `pet-1000-draco.png`, `pet-320-full-draco-artwork.png`, `pet-1000-draco-artwork.jpg`, `pet-1000-draco-studio.png`. No cross-GPU/FPS/RAM benchmark claimed; decompressed triangle density is unchanged.

The initial catalog integration has Full320 order 0 and old Nata order 1. The user's later steering explicitly queues a single NEXT task containing five new models and the corrected order Full320 index1; see `docs/superpowers/plans/2026-11-04-next-draco-batch.md`. No part of those five new imports has been implemented in this pass.

## 21. Batch năm model Draco + thứ tự Nata — 04/11/2026

Đã triển khai chung một lượt năm GLB người dùng cung cấp: PET 1.5 L full label, PET 325 ml, PET 1 L short label, PP 1.25 L và PP 1 L. Script `scripts/import-bottle-batch.cjs` giữ toàn bộ tam giác, winding và các bộ UV; PET1L Short tách material Water dùng chung thành bản độc lập trước khi cho phép chỉnh nước. PP giữ TEXCOORD_1, thân/nắp/nhãn opaque và không tạo slot Liquid.

| Model | GLB sau Draco | Triangles | Sai số vị trí tối đa (mm) | UV tối đa (px @4K) |
| --- | ---: | ---: | ---: | ---: |
| PET 1.5 L | 206,112 B | 41,756 | 0.000641 | 0.03125 |
| PET 325 ml | 287,252 B | 52,276 | 0.000382 | 0.03125 |
| PET 1 L Short | 272,928 B | 53,826 | 0.000467 | 0.03149 |
| PP 1.25 L | 310,932 B | 77,116 | 0.000591 | 0.03149 |
| PP 1 L | 309,916 B | 82,980 | 0.000447 | 0.03149 |

Các model mới nằm trong catalog và preferences; PP có filter riêng, Properties chỉ hiện Bottle/Cap/Label, nhóm 1 L chứa Full label index 0 và Short label index 1. Family Nata 320 giữ Nata cũ index 0 và Full label mới index 1. Poster 360×480 WebP được dựng từ PNG transparent export thực của từng model.

QA: `npm test` 112/112, typecheck, lint, `scripts/verify-assets.cjs`, production build và diff check đều pass. Browser đã render cả năm model, lọc PP, kiểm tra Properties, upload/xóa artwork, reload giữ màu nắp/độ nhám và kiểm tra thứ tự Nata/1 L; console cuối không có lỗi. Ảnh bằng chứng: `artifacts/screenshots/draco-batch-preview.jpg`, `pet-1500-batch-artwork.png`, `draco-batch-pp-library.png`, `nata-index-1-batch.png`.
## Glass 290 ml Basil / Chia / Milk parity — 2026-11-05

Chia and Milk now share the original `glass-290-basil-web.glb` shell, neck and closed Water geometry. The supplied exports had a malformed separate Base and an open central Water bottom; Draco preserved those source defects. The importer aligns canonical Basil geometry to the source (10 source units per metre, Y offset 0.9023135900497437) and retains source cap, label UVs and all Chia seed positions. Original source files are untouched. Geometry provenance is recorded in each manifest.

The three 290 ml screw-cap variants now use the actual-geometry hollow-Neck tracer. Their decoded Neck meshes were already closed (zero boundary edges), so the fix adds no duplicate topology: Chia and Milk carry `basilWebNeckWallMetres: 0.0013` in the imported material metadata, and the shared runtime activates the same cap/label-aware `pullcap-hollow-glass-neck-v1` path used by the corrected pull-cap Basil.

The `glass-290-v1` runtime now uses Basil web glass, native captured water and capture-only Chia seeds; cap and label remain beauty-only depth blockers. Chia shares Basil water optics and color defaults and differs in seed geometry. Milk uses the same shell/capture with an opaque editable milk reservoir. Native defaults leave the generic liquid customization disabled; explicit saved edits and later slider changes remain available.

Final Draco downloads: Chia **435,516 bytes** (118,045 triangles), Milk **245,500 bytes** (62,725 triangles). Dedicated posters were rebuilt from actual transparent 1024px portrait exports. Regressions verify canonical positions, a closed Water bottom, unchanged Chia seed positions, pooled capture/beauty separation and aborted-draw restoration. Fresh verification: 123 tests, typecheck, lint, asset verification and production build pass. Browser QA covered both undersides, label occlusion and transparent PNGs. Evidence: `artifacts/screenshots/glass-290-bottom-comparison-fixed.jpg`.

## Glass 290 ml Basil pull cap — 2026-11-05

Added the supplied `Glass 290ml napkeo model (Basil) web.glb` as its own pull-cap family. The source cap, pull ring, neck, label UVs and bottle silhouette remain distinct from the screw-cap 290 ml family. The source Water bottom had a 64-edge opening; the importer closes that existing bottom ring with a downward fan and records the repair in the manifest. Original source geometry remains untouched.

The 330 connected seed islands are fitted with the same PCA ellipsoids and hydrated envelope used by Label Lab Unity's `Glass290WebAssetBuilder`. The web renderer creates one instanced gel/core layer at runtime, using the Unity shell offset converted through the source `.1` metre root (`gelThicknessNative=0.008321520913910748`, 0.832152 mm in the rendered bottle). The authored seed draw is removed from the GLB so the analytic core is not rendered twice; the visible dark core and translucent membrane are composited in the Basil capture pass.

| Model | Source bytes | Final Draco bytes | Triangles | Max position error (mm) | UV error (pixels @4K) | Normal error (degrees) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Glass 290 ml Basil pull cap | 1,595,216 | 251,976 | 30,262 | 0.000381 | 0.03149 | 0.02358 |

Draco uses Edgebreaker precision 18/14/16 with no simplification. The model has a silver cap default, Basil seed liquid defaults, independent persisted material edits, a dedicated library family, and a poster rendered from the live Studio model. Evidence: `public/models/bottles/glass-290-pullcap-basil-poster.webp` and `scripts/tests/glass290-pullcap-runtime.test.cjs`.

Neck refraction follow-up: the supplied Neck was a single outward surface. The importer now appends a 1.3 mm metric inner wall, reverses its winding/normals and closes both annular rims while retaining the original outer surface. Explicit wall metadata enables double-sided glass refraction at IOR 1.52 and a 2.6 mm optical path through the two walls; existing models keep their calibrated fallback. The revised Draco asset is 264,368 bytes / 32,822 triangles. Tests verify inward radial normals, welded manifold edges and pooled runtime optics. Updated real transparent render and detail: `artifacts/screenshots/glass-290-pullcap-neck-refraction.png`, `glass-290-pullcap-neck-detail.png`.

Video-reference Neck correction supersedes the native single-offset transmission described above. A FrontSide whole-shell shader now traces the retained inner/outer Neck, silver cap and label triangles through a runtime stackless BVH. Rays refract across glass/air interfaces and include bounded cap/label reflection paths; escaped rays sample the existing backdrop with its export crop region. Transparent PNG keeps reflection coverage without a baked background. Depth belongs to the nearest entry so the far inner face cannot blend duplicate radiance.

The app's authored `Data/3D Model/Materials/Neck.mat` uses preserved metallic specular, BaseColor .3962264 and .85 smoothness. Its stronger entry reflection is retained as an artistic calibration; the volume directions use glass IOR 1.52. Neck roughness follows `.15 + bodyRoughness - .042`, clamped to 0–1. The accepted body/seed/label/studio lighting remains on its existing path. No source GLB edits or extra downloadable optical data are needed; the model stays 264,368 bytes. Updated poster and evidence: `artifacts/screenshots/glass-290-pullcap-hollow-neck.png`, `glass-290-pullcap-hollow-neck-detail.png`, `glass-290-pullcap-hollow-neck-ui.png`. The detail image composites the actual transparent export over the reference gray for inspection.
