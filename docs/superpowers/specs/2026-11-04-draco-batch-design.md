# Draco batch design — 2026-11-04

Authorized by the user's “triển khai” after the recorded five-model + index task. Reuse the established Draco Edgebreaker pipeline, retain every source triangle, normal, UV0 and UV1, and leave source GLBs untouched. Existing checkout is required because it contains all approved but uncommitted runtime/catalog/material changes; continue in place without commits or publication.

Approach: one batch importer with explicit per-source semantic mappings, rather than five independent scripts. Extend the codec to retain and validate every TEXCOORD set. Use 18/14/16 position/normal/UV precision and the existing .01mm/.1degree/.5pixel4K validation. Target each new asset below 1MB; never simplify geometry to meet a byte target.

Assets: PET1500 Full, PET325, PET1L Short, PP1250, PP1000. Sources and exact paths are recorded in the next-draco-batch plan. All use source-to-metres .1 and bounds camera framing. PET1L Short has a Water node sharing Body material: assign a cloned liquid material to that node, without changing its mesh. PET liquid defaults are provisional editable Juice/Apple; caps/labels white. PP sources have no liquid geometry: keep opaque white PP body, cap and label, expose only supported Properties and label artwork. PP is a separate accurate packaging/filter category, not PET.

Catalog: existing PET1L full model and source shape stay at order0; append the differently shaped 1L Short at order1. Add four new families: PET1500, PET325, PP1250, PP1000. Nata320 old model index0, Full index1, keep IDs/preferences/GLB hashes. Poster for family follows its default variant. Four-row library pagination remains.

Validation: regression first for UV1 corruption/multi-UV output; actual five model counts/hashes/semantics/budgets, PP material opacity/no fictitious liquid, water/body slot separation, family ordering and persistent defaults. Render all five in browser, try artwork and remove, actual PNG exports/posters, inspect cap/body/label, final console, filter/order and reload. One focused fresh review then full tests/typecheck/lint/assets/build/whitespace. No FPS/GPU-memory claims.
