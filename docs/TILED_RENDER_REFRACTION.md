# Shared refraction for tiled PNG exports

## Confirmed fault

At 8129 px, Story exports are 4573 × 8129. The beauty cores are 1408 px with 64 px guards. Camera rays and integer stitching were correct, but Three r180 generated a separate transmission reservoir and mip pyramid for every guarded tile. Refracted rays could leave that reservoir and clamp at its edge, duplicating or stretching seed images. The partial edge tiles also changed the roughness filtering footprint.

Increasing overlap or feathering the final image does not supply missing optical content.

## Export pipeline

1. Freeze the existing camera crop, pose and background.
2. Project conservative product bounds into the export frame, adding a clear border. Crop only empty canvas; retain one source pixel per export pixel.
3. Generate that entire optical source using bounded native transmission tiles. Existing Vinut water/seed capture hooks remain active. Temporarily retain transmissive meshes in the render list even in empty guard tiles, so Three cannot reuse a stale source.
4. Copy the resolved linear native cores directly into a GPU atlas without tone mapping, resizing or an additional full-frame depth/MSAA buffer. Generate one mip pyramid after the last copy.
5. Render beauty tiles using the same atlas. Transform each tile's projected exit UV into atlas coordinates. Roughness references the full export width.
6. Crop/stitch the beauty cores and encode the requested PNG dimensions. Restore materials, culling, GPU bindings, input and preview state in cleanup, including failures and cancellation.

The main interactive preview keeps its native rendering path. Solid optical backgrounds use one frozen background and global UV mapping during export; output gradients also use global coordinates.

## Verification

- Reproduced the defect in an actual 4573 × 8129 White/Story PNG.
- The corrected White export removes the vertical seed discontinuities in that case. Artifacts are under `artifacts/tile-refraction/`.
- Repeated 8129 transparent export retains a transparent corner and visible product, with no WebGL console errors.
- PET/Scene 2 was also exported at 2304 × 4096 after handling transmissive frustum culling in empty source tiles.
- Regression tests use real Three cameras, matching pixels across horizontal/vertical overlaps, odd dimensions, cached shader reuse, full-frame blur reference and independently sampled/ray-tested projected bounds.
- GPU allocation still has device limits. The exporter checks dimensions/framebuffer completeness and reports failure rather than silently shrinking the requested output or optical atlas.

Full-resolution optical data adds a source pass and GPU texture memory. Cropping the empty canvas and avoiding a full-frame multisampled/depth target keeps this smaller than a monolithic 8K beauty render.
