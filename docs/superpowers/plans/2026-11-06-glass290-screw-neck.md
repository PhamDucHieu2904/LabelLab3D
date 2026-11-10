# Glass 290 Screw-Cap Neck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend the approved hollow glass Neck tracer to all 290 ml screw-cap bottles.

**Architecture:** The existing canonical 290 ml glass shell and the closed Neck geometry already shipped by Chia and Milk are retained. Import metadata records the 1.3 mm optical wall value; runtime material metadata activates the existing actual-geometry BVH tracer for Basil, Chia and Milk.

**Tech Stack:** Node.js import scripts/tests, Three.js runtime materials, glTF/Draco assets.

**Spec:** `docs/superpowers/specs/2026-11-06-glass290-screw-neck-design.md`

## Global Constraints

- Preserve source mesh positions and topology for Neck, cap, label, liquid and seeds.
- Keep the 512 KB compressed GLB budget.
- Do not alter non-290 ml glass or PET/can material paths.

## Review Focus

- A screw-cap Neck without metadata must not silently use the legacy transmission path.
- Chia source seed geometry and Milk liquid material must remain unchanged.
- Existing inner/outer Neck shell must stay closed and carry the correct metric thickness after the root scale.
- Cap/label registration must remain available to the tracer.
- Existing pull-cap behavior must remain unchanged.

### Task 1: Import geometry and regression coverage

**Files:**
- Modify: `scripts/import-glass290.cjs`
- Modify: `scripts/tests/glass290-import.test.cjs`
- Modify: `lib/viewer/basil-web-materials.ts` only if runtime activation needs a focused change.
- Regenerate: `public/models/bottles/glass-290-chia.glb`, `.manifest.json`, `glass-290-milk.glb`, `.manifest.json`.

- [ ] Add assertions for Neck tracer metadata and runtime activation; run the targeted test and observe the expected failure.
- [ ] Implement the smallest importer/runtime changes that satisfy those assertions without changing geometry.
- [ ] Re-run the targeted tests and then the full verification suite.
