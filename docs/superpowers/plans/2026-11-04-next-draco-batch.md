# Next batch — five Draco models and Nata label order

Recorded from the user's inserted requests on 2026-11-04. Finish current PET320 Full + PET1L work first. Treat this list as one following implementation task in the same chat; the user explicitly asked to record it for the next task, not interrupt current work.

- Compress Draco and add `D:/3D model/Model Bottle Can/Blender Model 1/Pet 1500ml model full label web.glb`.
- Compress Draco and add `D:/3D model/325mlModel web.glb`.
- Compress Draco and add `D:/3D model/Model Bottle Can/Blender Model 1/Pet 1L bottle model short web.glb`.
- Compress Draco and add `D:/3D model/Model Bottle Can/Blender Model 1/PP 1.25L Model bottle web.glb`.
- Compress Draco and add `D:/3D model/Model Bottle Can/Blender Model 1/PP 1L model web.glb`.
- Nata de coco 320 ml: existing short-label variant index/order 0, full label index/order 1 (supersedes current initial Full=0 design). Preserve model IDs and saved projects.

Use one batch inspection/import/catalog/QA pass. Preserve original source files and shapes/UVs. Inspect actual semantic slots, units and liquid parts before selecting material profiles, rather than assuming all files use PET350 names. PET1L Short should share the existing 1L family where compatible. PP should be identified accurately in its title/material setup. Liquid defaults for new five-model batch were not specified; resolve after source inspection using existing editable presets.

## Approved implementation plan — 2026-11-04

> For agentic workers: use executing-plans inline. User authorized the recorded batch with “triển khai”.

**Goal:** Add all five Draco models and correct Nata Full to index1 in one pass.
**Architecture:** Extend existing codec for UV1; batch importer writes individually validated GLBs/manifests; catalog/preference adapters use the new manifests and existing runtime.
**Tech:** Node/draco3dgltf/Three.js/TypeScript/Next.js.
**Spec:** ../specs/2026-11-04-draco-batch-design.md

### Global constraints
Preserve source files and all triangles/winding/UV0/UV1. Position<=.01mm, normals<=.1deg, UV<=.5px@4K. No simplification. Target each new asset<1,000,000 bytes. Keep pre-existing dirty changes; no commits/publish.

### Review focus
- Water shares Body in PET1L Short: binding must be independent after material edits.
- PP secondary UV remains decodable with stock GLTFLoader; PP has no liquid controls.
- Saved old320 selection survives default family reorder.
- PET1L Short source has different cross section: preserve shape while grouping capacity.
- Labels and caps are opaque; frame contains all source objects.

### Task1: codec/import
- [x] Add regression fixture with distinct UV1 and mutation rejection; observe RED then extend codec and observe GREEN.
- [x] Add real-asset batch tests (counts 41756/52276/53826/77116/82980, slots/hashes/precision/budgets, UV1) and observe absent-assets RED.
- [x] Implement scripts/import-bottle-batch.cjs with explicit BATCH_BOTTLES and adaptBottle exports; remap shared Water material, preserve buffers, adapt units/materials, compress/validate then write.
- [x] Run batch once and validate all five tests GREEN.

### Task2: integration/QA
- [x] Add catalog regression for corrected320 order,1L grouping,four new families,new5IDs,PP/no-liquid and default persistence; observe RED.
- [x] Add lib/labellab/bottle-batch.ts, catalog adapter and preference IDs/defaults; extend PackagingKind and PP UI/filter labels; verify-assets includes5new assets.
- [x] Browser render5models, artwork/remove, Properties/reset/reload, transparent PNG and actual WebP posters. Verify filter/order/pager and final console.

### Task3: verification/handoff
- [x] Focused fresh review and fix confirmed Important/Critical findings with regression tests.
- [x] Full npm test/typecheck/lint/verify-assets/build/diffcheck; compare source hashes.
- [x] Document actual sizes/errors/QA and report batch result.
