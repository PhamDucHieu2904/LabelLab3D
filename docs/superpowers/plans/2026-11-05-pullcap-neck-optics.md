# Pull-cap Neck glass correction

The reference video requires curved reflections and visible distortion of the actual cap/label through a hollow glass neck. The retained inner wall alone cannot achieve this with Three's one-offset transmission sample.

Use a Neck-only bounded triangle integrator over the retained Neck, cap and label, in the bottle's metric frame. Build a compact runtime BVH from shared source geometry, refract across each glass/air interface, accumulate dielectric Fresnel/environment reflection, and terminate rays on the current cap or label materials. Escaped rays project onto the existing scene backdrop with its export crop region. Transparent output retains reflection coverage without a baked matte. Body, liquid, gel, source GLB and other models keep their existing paths.

Considered a backdrop-only screen offset; it cannot bend the actual nắp/nhãn shown in the video. Reusing the old screw-cap data would trace the wrong bottle. The actual pull-cap mesh is therefore the scoped source of truth.

- [x] Write failing tests for transformed/grouped trace geometry and runtime material/backdrop binding.
- [x] Build the triangle BVH and Neck-only material integrator.
- [x] Verify rotating preview and transparent PNG against video frames; retain label, cap and gel.
- [x] Independent review, full test suite, typecheck, lint, asset checks and production build.

The app's authored `Data/3D Model/Materials/Neck.mat` uses preserved metallic specular, BaseColor .3962264, transparent alpha and .85 smoothness. The entry reflection retains that artistic strength while the volume directions follow IOR 1.52; Neck roughness remains .15 relative to the body's .042 slider baseline. A reference HDRI experiment was discarded because it changed the accepted body/label lighting. Studio lighting remains unchanged.

Confirmed mesh diagnostic: all 4,864 Neck triangles have valid outward/inward smooth normals (minimum normal/face dot .9782). A 2,691-ray sweep through actual source Neck/cap/label ended after 2–3 interfaces without exhaustion. Runtime BVH uses 20,406 retained triangles including the cap and label; no extra optical asset is downloaded. The GLB remains 264,368 bytes.

Work stays in the shared dirty checkout so the existing localhost viewer can show the correction. No unrelated changes are reset or committed.
