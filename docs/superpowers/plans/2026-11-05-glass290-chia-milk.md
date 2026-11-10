# Glass290 Chia/Milk implementation

Spec: ../specs/2026-11-05-glass290-chia-milk-design.md

Global: in-place on existing dirty checkout; no commit/publish/reset. Source GLBs read-only, no simplification. Shared codec precision 18/14/16. Max position .01mm, normal .1deg, UV .5px@4K; each output <=512000 bytes.

- [x] Test and import real Chia/Milk assets with all nodes/triangles/UVs and exact roles. Preserve source seed mesh. Validate decoded source match, budgets and opaque lids/print.
- [x] Test then enable existing 290 family placeholders and persistent defaults; real Chia seed render path, milk native glass profile. Keep Basil default and Milk authored order 3.
- [x] Browser render both, verify Properties and variant selection, create own PNG/posters. Focused fresh review; focused tests, typecheck/lint/assets/diffcheck complete. Production build remains blocked by unavailable Google Fonts network fetch in the current sandbox.
