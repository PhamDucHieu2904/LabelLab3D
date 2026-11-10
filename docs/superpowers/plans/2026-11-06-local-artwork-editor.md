# Local artwork editor implementation

Scope: docs/superpowers/specs/2026-11-06-local-artwork-editor-design.md and the four user images. Execute in current checkout to retain existing uncommitted product features. Preserve unrelated edits. No commit/publish.

1. Add normalized transform and configurable dieline helpers, with tests for fit, pan, eight resize anchors, Shift proportional scaling and safe limits. Add browser canvas crop output using the same transform.
2. Add IndexedDB Blob cache, confirmed metadata and per-model selection. Reject malformed records and handle unavailable/quota storage honestly. Deletion removes stale selections.
3. Build white modal editor matching references: drag/drop and picker, dimmed overflow, bright print rectangle, eight handles, pan, Shift lock, keyboard/numeric controls, confirm/cancel and file validation.
4. Integrate sidebar history beneath Choose artwork, re-edit/select/delete, restore selected crop on reload/model switch, preserve owned local URL lifecycle and remove old direct upload path.
5. Run tests/typecheck/lint/build and browser verification with known artwork; inspect real crop, persistence, cancellation, interaction and 3D result. Independent code review, fix findings, completion audit against every requirement.

## Progress

- Baseline: earlier turn verified 155 tests, typecheck, lint, assets and build. Current artwork only creates session Blob URLs and applies images without crop or history.
- Ruling: actual dieline dimensions are pending by user instruction. Ship configurable provisional 3:2 ratio, visibly identified; changing model-specific dimensions later changes frame and crop together.
- Ruling: no new worktree because the running product depends on many current uncommitted features/assets; preserve the authoritative checkout and isolate edits by files.

## Completion audit

- Implemented the browser-only IndexedDB artwork library with per-model selections, re-edit/delete/apply actions, and restore-on-reload behavior.
- Implemented the modal editor with PNG/JPEG/WebP picker and drop zone, bright configurable dieline, dimmed outside region, pan, eight resize handles, Shift proportional resizing, numeric controls, fit/fill, cancel, and confirm crop export.
- Verified the exported crop through the visible Current label artwork media: 4096 × 2731 PNG at the provisional 3:2 ratio; the red/blue outside stripes were excluded and the green label region remained.
- Verified browser persistence after reload and the selected crop in the 300 ml Milk model; verified the cropped green artwork appears on the 3D label preview.
- Verified the editor at 375 × 568: modal header, workspace, picker, and Confirm remain visible after the responsive overflow/min-height fix.
- Automated verification: `npm test` (168 passed), `npm run typecheck`, `npm run lint`, `npm run build`, and `node scripts/verify-assets.cjs` all pass. Build retains the pre-existing `metadataBase` warning.
- Limitation: exact dieline dimensions are still pending from the user. The current frame is explicitly provisional 3:2 and is configured in `lib/labellab/artwork-transform.ts` so supplied model dimensions can replace it without changing the editor flow.
