# Glass 300 ml base and milk optics design

## Intent

Match the supplied reference renders for the 300 ml molded-bead glass bottle. The bottom should read as a clear thick-glass rim with pale milk visible through it and fine radial refraction. Milk seen through the neck should retain a small amount of captured refraction and surface variation instead of becoming a flat, uniformly smooth cream patch.

## Goals

- Keep the imported GLB geometry and its authored winding unchanged.
- Give only `glass-300-v1` Base a measured clear thick-glass treatment that preserves the pale milk radiance behind it.
- Keep Body and Neck glass behavior, bottle framing, and other bottle profiles unchanged.
- Preserve an opaque milk reservoir while allowing its neck trace to retain bounded captured detail.
- Add regression tests for Base-specific material settings and dense-milk captured contribution.

## Non-goals

- Rebuilding the GLB or adding new geometry.
- Changing PET, 280 ml, or 290 ml liquid optics.
- Simulating animated liquid motion.

## Approaches

1. **Material-only tint/roughness tweak:** small diff, but it cannot fix the incorrect base thickness or the neck shader's zero transmission contribution.
2. **Profile-specific optics (chosen):** branch on `glass-300-v1`; derive Base thickness from its measured authored geometry, keep attenuation colorless with a controlled finish, and make the milk neck branch retain a bounded captured contribution independent of user clarity. This keeps the fix local and testable.
3. **Asset re-export:** could reproduce Blender's render more literally, but replaces a validated compressed asset and would make future material edits harder.

## Design

`lib/viewer/basil-web-materials.ts` will recognize `Base` for `glass-300-v1` and configure it with an explicit metric thickness, colorless attenuation, and a dedicated shader cache key while leaving `Body` and `Neck` on their existing paths. `lib/viewer/glass-neck-optics.ts` will preserve a small, bounded fraction of the captured liquid sample for dense milk before applying pigment/haze, so the refracted surface is not perfectly smooth while remaining opaque.

Tests will exercise real decoded `glass-300-milk.glb` geometry for the Base bounds and existing runtime material tests for the profile branch. A shader contract test will verify that dense milk keeps a non-zero capture weight even when clarity is zero. Browser preview at the supplied pink studio background will be used for visual verification.
