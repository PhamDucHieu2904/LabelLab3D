# 290 ml Basil pull-cap import

User-authorized import of the supplied pull-cap GLB, preserving its cap, label UVs and silhouette. Reference: Unity `Glass290WebAssetBuilder.cs`, `Glass290HighSeedFitAudit.cs` and `BasilSeedGelAssetBuilder.cs`.

1. Audit source topology, transforms and all 330 seed islands against Unity.
2. Fit source seed ellipsoids and store compact metadata; generate core/gel instances through the existing Basil web renderer. Match the existing physical hydrated offset, 0.832152 mm, with the source-to-metre root scale 0.1.
3. Draco compress retained geometry with position/normal/UV precision 18/14/16; verify decoded surfaces, UVs and winding. Repair demonstrated closure defects without replacing the pull cap or neck.
4. Add a separate 290 ml pull-cap family, native Basil optics, silver cap defaults and independent persisted edits. Use a real render for its poster.
5. Verify importer, generated instances/capture layers, catalog/defaults, browser appearance/export, complete tests, typecheck, lint, assets and build; request independent review.

Original source files remain untouched. No shared-workspace cleanup or branch changes.
