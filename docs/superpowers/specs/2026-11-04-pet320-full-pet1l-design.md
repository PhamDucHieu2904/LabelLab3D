# PET 320 full label and PET 1L

User intent: compress the supplied full-label PET 320 to approximately the existing 1,240,124-byte PET 320 download, then compress the supplied PET 1L with Draco and add both to the website. Keep source files intact and preserve the smooth silhouette, UVs, jelly, node transforms and material boundaries.

Approaches: reuse Meshopt or encode Draco. Draco is selected for the new assets in response to the user's follow-up; both decoders are already shipped. No mesh simplification. Use high precision and validate decoded face-corner positions/normals/UVs so encoder reordering does not hide geometry changes.

Integration: existing 320 family gains Full label index 0 and existing Nata index 1, without changing the existing model ID/file. The new 320 retains Nata water/jelly and starts with white artwork. PET 1L is a new PET family, 1000 ml; provisional default Juice/Apple and white cap/label follow the existing PET350 material profile. These defaults are implementation choices, editable in Properties.

Bounds: target new 320 <=1,240,124 bytes; PET1L <1,000,000 bytes. Do not sacrifice topology to hit the budget. Keep positions within 0.01 mm, UV within 0.5 pixels at 4K and normals within 0.1 degrees. Record measured errors, triangle counts, source/final hashes and compression settings in per-model manifests.

Verification: test-first codec validation and catalog/persistence coverage; full tests, typecheck, lint, asset verification, build; real browser preview, artwork change/remove, Properties/reset, reload and transparent PNG export for both models. Preserve unrelated pending changes and do not commit/publish.
