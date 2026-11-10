# Milk underside diagnostic

This harness is isolated from production code. It serves the workspace modules with a tiny TypeScript transpiling HTTP server and launches hidden Chrome headless with SwiftShader; it never activates a window or uses CUA.

Run the one-off post-fix regression check:

```powershell
node artifacts/milk-base-debug/regression.cjs
```

This checks six cases: direct and pooled handles, each with default, editable live-color/reset, and editable live-optics/reset. It asserts cream underside pixels, similar underside/side brightness, pooled parity, exact reset pixels, and zero browser/compiler errors. It writes initial/edited/reset screenshots and numeric samples into `report.json`.

```powershell
node artifacts/milk-base-debug/run.cjs
```

Pass a JSON object to select experiments. Each entry writes `<name>.png` and the run writes `report.json`.

```powershell
$variants = '{"pbr":{"underside":true},"milk-opaque":{"underside":true,"waterShaderUnlit":true},"base-hidden":{"underside":true,"baseHidden":true},"base-thin":{"underside":true,"baseThickness":0.0035}}'
node artifacts/milk-base-debug/run.cjs $variants
```

The harness loads `glass-290-pullcap-milk.glb`, DRACO, `studio-softbox.exr`, `createAppearanceHandle`, `createPooledAppearanceHandle`, and `renderBottleScene`. `report.json` records every material after appearance application, including mesh/material names, profile metadata, transmission, thickness, shader cache key, and two fixed pixel samples.
