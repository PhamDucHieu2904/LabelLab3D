# Solid PET ring material

The ring below the lid is a solid molded PET neck finish. All PET models should show the thick transparent part with distinct edges and reflections, following the supplied real bottle photos. Keep its geometry and UVs, and isolate its finish from body, cap, and liquid controls.

Current failures: most imported Ring materials carry alpha 1, which the old haze shader treats as opaque plastic; the generic PET path also disables their physical transmission. Ring is mapped to the Body slot, so later Body overrides flatten its calibrated finish.

Use one dedicated physical ring material with neutral tint, PET IOR 1.57, about 2.4 mm of metric optical thickness, polished roughness, native refraction and small path-dependent haze. Correct the transparent transmission clear color for on-screen and PNG rendering. Derive shader coverage from captured radiance and physical haze rather than imported basemap alpha. Bind Ring as the independent `ring` slot even for older manifests that list it in Body.

PET 1L short has no named Ring material. Partition only its existing whole collar-band triangles into another material group. Reuse positions, normals and UVs unchanged, and preserve triangle winding. The explicit asset rule selects local Y 1.8411–1.8642; this is verified visually against the cap and collar, with no mesh simplification.

Verify all nine current PET geometries, several viewing angles/backgrounds, pooled appearance swaps, Body/Cap/Liquid override isolation, metric thickness under source transforms, and transparent PNG edges. No separate user controls are added in this change.

Rejected approach: the diffuse white haze calibration was judged against before/after renders, not the real photographic reference. The user rejected it because it made PET look cloudy. It is superseded by the photo-grounded correction below.

## Correction from direct photographic reference

The prior diffuse-scattering calibration is rejected. The real uncapped neck is clear PET: thickness appears as sharp alternating reflection/refraction contours and local light-source highlights. The broad off-white band in the capped image is the cap tamper band, not PET pigment.

Implement closed optical-only inner sleeve for the existing flange, trace the actual exterior + sleeve + cap, with PET IOR 1.57 and dielectric Fresnel/TIR. Keep clear bulk; no diffuse white return. Preserve rendered topology, catalog mappings, independent controls, PNG alpha, matte/tiled-export sampling and pooled disposal. Ring-only tracing is invalid until its two boundary loops are closed. Full Body cannot be traced as solid PET because it has no interior bottle wall.

Approaches: further native single-ray/white haze tuning is rejected by reference and user; full-bottle tracing would model a solid cavity incorrectly; closed local flange tracing is selected as the smallest correction that preserves the visible model.


The final web path uses retained exterior triangles with an optical-only inner sleeve. Current cap material colors/roughness/metalness feed the reflected/occluded cap; dense cap and liquid surfaces use bounded radial proxies, while actual water radiance remains the opaque capture. Shared refcounted BVH textures avoid per-preset duplication. Internal paths resolve a bounded number of interfaces; TIR retains its medium and throughput until the next boundary. A ray still inside PET must not be replaced by an opaque environment sample. Primary unresolved throughput uses the backdrop/RGBA escape path after the finite budget.


## Black-band correction

The user rejected the oily/chrome appearance. Metallic was0; the cause was the early TIR shortcut at bounce>=1, which returned dark environment at alpha1 while still inside PET. Branch-colored rendering attributed99.987% of dark pixels to that shortcut. Remove both primary/secondary premature TIR returns. Do not compensate by tinting/diffuse whitening. Review upright and rolled camera views with bright matte, cap/liquid changes, and transparent alpha. Isolated-dot counts are diagnostic only and cannot override transparent PET transport.
