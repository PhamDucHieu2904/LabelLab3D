# Properties Artwork Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or subagent-driven-development) to implement this plan task-by-task.

**Goal:** Replace the standalone Artwork tool with an `Add your artwork` CTA in Properties while preserving the existing chooser and saved-artwork behavior.

**Architecture:** Keep `ArtworkLibrary` as the persistence/modal owner and pass it through a new React slot on `PropertiesPanel`. Remove only the old rail/sidebar entry and visible preview UI; artwork state and modal remain mounted with the controls panel.

**Spec:** `docs/superpowers/specs/2026-11-10-properties-artwork-entry-design.md`

## Tasks

- [x] Add a failing browser regression check for the removed rail button and Properties CTA.
- [x] Add the Properties artwork slot and compact CTA markup.
- [x] Remove the Artwork rail button and old library-panel branch.
- [x] Run typecheck, lint, focused browser check, full tests, and build.

## Verification results

- `npm run typecheck`: passed.
- `npm run lint -- --no-cache`: passed.
- `npm test`: 189 tests passed.
- `npm run build`: passed (existing `metadataBase` warning remains).
- Headless browser check: Artwork rail/sidebar absent; CTA is between the
  Properties heading and part tabs on PC, laptop, and mobile; chooser opens,
  closes, restores focus, persists saved artwork across tool changes and reload.
