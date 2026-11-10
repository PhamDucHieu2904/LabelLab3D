# Artwork Chooser Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or subagent-driven-development) to implement this plan task-by-task.

**Goal:** Expand Choose artwork by 50%, split preview/saved artwork 70/30, and keep its geometry aligned with the Studio scale on PC and laptop.

**Architecture:** Keep the body-portal modal and normalized artwork model. Add a small pure layout helper for the Studio scale contract, pass the existing saved-artwork records into the editor, and use a two-pane modal CSS layout with a mobile stack.

**Tech Stack:** Next.js, React, TypeScript, CSS Modules, Node test runner.

**Spec:** `docs/superpowers/specs/2026-11-10-artwork-chooser-layout-design.md`

## Global Constraints

- Logical chooser width is 1440px (`960 × 1.5`).
- Preview/saved panes are 70%/30% on desktop.
- Studio scale is derived from the existing `1920 × 960` design size.
- Normalized artwork transforms and saved-artwork persistence remain unchanged.

## Review Focus

- A laptop modal must scale with the Studio instead of staying at 960 physical pixels.
- A scaled modal must keep pointer drag movement proportional to the rendered frame.
- Saved artwork actions must continue to select, edit, and delete persisted records.
- Mobile must remain usable without horizontal overflow.

### Task 1: Layout contract and regression tests

**Files:**
- Create: `lib/labellab/artwork-editor-layout.ts`
- Test: `scripts/tests/artwork-editor-layout.test.cjs`

- [x] Write failing tests for 70/30 constants and Studio-scale values at PC and laptop sizes.
- [x] Run the focused test and confirm it fails because the helper does not exist.
- [x] Implement the pure constants/helper using the existing desktop/workspace fit functions.
- [x] Run the focused test and confirm it passes.

### Task 2: Two-pane editor and scaled pointer math

**Files:**
- Modify: `components/labellab/ArtworkEditor.tsx`
- Modify: `components/labellab/ArtworkEditor.module.css`
- Modify: `components/labellab/ArtworkLibrary.tsx`
- Modify: `components/labellab/ArtworkLibrary.module.css`

- [x] Add saved-record props and callbacks to the editor.
- [x] Add a failing regression assertion for the pointer conversion helper/behavior.
- [x] Implement rendered-frame delta normalization, 1440px scaled modal, 70/30 panes, and saved list actions.
- [x] Remove the duplicate saved-history block from the sidebar while retaining current artwork removal.
- [x] Run focused tests, typecheck, and lint.

### Task 3: Browser verification and review

**Files:**
- Modify: none unless verification finds a defect.

- [x] Run the full test suite and production build.
- [x] Capture desktop, laptop, small-laptop, and mobile screenshots in a separate headless browser without controlling the user's mouse.
- [x] Dispatch a focused code review and resolve critical/important findings.

## Verification results

- `npm test`: 189 tests passed.
- `npm run typecheck`: passed.
- `npm run lint -- --no-cache`: passed.
- `npm run build`: passed (existing `metadataBase` warning remains).
- Headless UI checks: PC/laptop/small-laptop fit, 70/30 measured split, mobile
  stack, scaled drag, save/reopen, same-record reset, active-record delete,
  and focus restoration passed.
- Evidence: `artifacts/artwork-chooser-layout/metrics.json` and screenshots.
