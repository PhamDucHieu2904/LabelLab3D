# Artwork Dielines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show the correct rectangular print ratio for each supplied model.

**Architecture:** Use the existing `artwork-transform.ts` registry shared by the chooser and PNG export. Retain existing frame fitting, saved artwork flow, and Studio scaling.

**Tech Stack:** React, Next.js, TypeScript, browser canvas, Node test runner, headless Playwright.

**Spec:** `docs/superpowers/specs/2026-11-10-artwork-dielines-design.md`

- [x] Audit catalog/source mappings for PET and PP variants.
- [x] Write mapping tests and observe failure against the empty registry.
- [x] Populate 23 available dielines and record the two pending dimensions separately.
- [x] Verify real frame bounds at PC/laptop sizes, SVG guide loading/alignment, saved crop reopening, guide exclusion, and confirmed PNG dimensions (`.qa/check-artwork-dielines.cjs`).
- [x] Run regression suite, typecheck, lint, and build. Review the scoped implementation.

Keep all earlier workspace edits intact. Work in this existing checkout, where the user's running preview and uncommitted implementation live. No model asset changes are required.
