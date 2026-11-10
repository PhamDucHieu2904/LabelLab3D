# Artwork dieline dimensions

The Choose artwork white frame uses the supplied rectangular label width × height in millimetres. Existing frame fitting keeps it centred within the preview pane and scales the whole chooser consistently on PC and laptop. The mm dimensions also determine the confirmed PNG aspect ratio; they do not rescale the 3D model or alter its UVs.

## Approach

Populate the existing model-id dieline registry consumed by ArtworkLibrary. This uses the editor's current aspect-aware frame and export, avoiding a second source of layout ratios. Saved source images remain intact; reopening an older 3:2 draft fits the source into the new frame, while an already confirmed selection stays applied until the user confirms a new crop.

## Mapping and constraints

- PET 320 index 0 is `pet-nata-watermelon`; full label index 1 is `pet-320-full-nata`.
- Glass 280 full label index 0 is `glass-280-latte`; short label index 1 is `glass-280-short-latte`.
- PET 1L tall is `pet-1000-juice`; short bottle is `pet-1000-short-juice`.
- PP Standard is `pp-500`. PP 1L square is `pp-1000`; round is `pp-1000-2`.
- `pp-500-2` has a different label shape and no supplied dimensions. Keep its provisional frame.
- Glass 290 screw cap uses 164 × 108 mm, Glass 290 pull cap uses 169 × 97.5 mm, and Glass 485 uses 166 × 83 mm. Their supplied SVGs are shown as magenta, non-exported alignment guides over the rectangular frames. The guide is shared across the screw-cap and pull-cap liquid variants.
- Record PET 500 full label (220 × 153) and PET 1.5L short label (296 × 97) separately as pending dimensions. No unavailable 3D models are added to the catalog.

The 30 available models are recorded in `ARTWORK_DIELINES`. The two future models are recorded in `PENDING_ARTWORK_DIELINES`; they require a catalog mapping when their 3D assets arrive.

## Verification

Test all supplied dimensions, model variant separation, fallback behavior, pending records, and image fitting. Check the actual frame bounds and exported PNG ratio in a separate headless browser on PC and laptop. Also reopen a saved provisional crop and confirm that the source refits without being stretched.
