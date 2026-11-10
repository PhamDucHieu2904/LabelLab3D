# Glass 290 Screw-Cap Neck Design

## Intent
Apply the approved hollow-glass Neck treatment to the three 290 ml screw-cap variants (`basil-strawberry`, `glass-290-chia`, and `glass-290-milk`) so the Neck shows curved reflections/refraction like the corrected pull-cap Basil.

## Scope
- Preserve each model's body, screw cap, label, liquid and seed content.
- Reuse the already closed inner/outer Neck shell in all three screw-cap GLBs; no mesh topology or source geometry is changed.
- Mark all three screw-cap Neck materials with the existing `basilWebNeckWallMetres` metadata so the runtime tracer is selected.
- Keep other glass/PET/can models on their current material paths.

## Approach
Reuse the existing `createGlassNeckMaterialContext` and its actual-geometry BVH. Extend the 290 ml runtime/import metadata so the existing closed Neck geometry selects the tracer with a 1.3 mm optical wall value, write provenance into the manifests, and add a regression test that verifies tracer activation and source geometry preservation. Adding duplicate shell topology was rejected after inspecting the decoded assets: each screw-cap Neck already has zero boundary edges; a separate shader was rejected because the approved tracer already handles cap/label reflections and UVs.

## Success criteria
All three 290 ml screw-cap Neck materials select `pullcap-hollow-glass-neck-v1`; Chia/Milk imports retain their source-specific cap/label/liquid/seed meshes and remain within the existing 512 KB asset budget. The full project test, typecheck, lint, asset verification and production build pass.
