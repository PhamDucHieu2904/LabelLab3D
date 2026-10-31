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
