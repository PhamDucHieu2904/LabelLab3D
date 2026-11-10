# Choose artwork layout design

## Intent

Make the artwork chooser easier to use on both PC and laptop screens. The
chooser grows by 50%, keeps the crop workspace prominent, and exposes the
saved artwork library beside the preview so previously mocked labels can be
reused without returning to the Studio sidebar.

## Goals

- Use a 1440px logical chooser width (50% above the existing 960px width).
- Split the chooser content into a 70% preview pane and a 30% saved-artwork
  pane.
- Apply the existing Studio design scale (`1920 × 960`) to the body-portal
  modal so PC and laptop preserve the same relative geometry.
- Keep upload, crop, keyboard movement, resize handles, saved selection, edit,
  delete, and confirm behavior intact.

## Non-goals and constraints

- Do not change normalized artwork transforms or exported label pixels.
- Do not change the Studio model, material, or camera layout.
- On mobile, stack the two panes for usable touch controls.

## Approach

The editor remains a native modal portaled to `document.body`, but receives the
same total scale derived from `fitDesktopViewport` and the Studio design size.
The modal owns only presentation; `ArtworkLibrary` remains the source of saved
records and persistence callbacks. Pointer deltas use the rendered frame
rectangle so CSS scaling cannot change drag distance.

## Acceptance

At 1920×960 the modal uses the 1440px logical width, the preview and saved panes
measure 70/30, and at 1366×768 the same geometry is uniformly scaled. Existing
artwork tests and the new layout tests pass.
