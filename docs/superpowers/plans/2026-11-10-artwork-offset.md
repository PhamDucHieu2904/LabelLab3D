# Artwork Offset Implementation Plan

**Goal:** Expose live horizontal artwork positioning below the upload button.

**Architecture:** Reuse labelOffset, texture RepeatWrapping, existing Properties controls and device-local persistence.

**Tech Stack:** React, CSS Modules, Three.js, Node tests, headless Playwright.

**Spec:** `docs/superpowers/specs/2026-11-10-artwork-offset-design.md`

- [x] Add failing coverage for the full -1..1 texture range, offset.y preservation, source texture isolation and persisted percentage bounds.
- [x] Move and rename the existing control; expand preference/resolver/live bounds to the same range.
- [x] Verify in headless Studio at PC/laptop sizes: placement, keyboard input, live label movement, reload persistence, and no duplicated Label position control.
- [x] Run suite/typecheck/lint and fresh scoped review.

Continue in the user's current checkout and running preview; preserve earlier edits. No commit or new worktree needed for this small continuation.

Verification: RED before implementation for the missing always-visible control and restricted offset range. GREEN: 211/211 tests, typecheck and lint. Headless PC1920/laptop1366 screenshots retain the existing proportional scaling; keyboard and fractional offset persist through reload. At a fixed camera, 25% moves 84,617 model-region pixels, while 100% reproduces the 0% artwork exactly (0 differing pixels). Fresh independent review found no concrete blocker. Evidence in `artifacts/artwork-offset/`.
