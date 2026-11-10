# Local artwork library and dieline editor

Implement the user's four reference images: Choose artwork opens a centered white panel, a gray workspace surrounds a bright rectangular print area, and imported artwork remains visible but dimmed outside that area. Only the bright region becomes the label texture. Artwork can be panned, resized with eight corner/edge handles, and resized proportionally with Shift. Keyboard/numeric alternatives keep placement usable without a mouse.

Original files and confirmed crops stay in browser IndexedDB. The Artwork sidebar lists previously confirmed artworks below Choose artwork, with re-edit/apply and removal. No uploads, cloud storage, or data URLs in scene preferences. Per-model selected artwork is restored locally after reload. Confirmation commits a crop; cancellation leaves the live label unchanged.

Keep the current Next/React/Three runtime, existing owned Blob URL contract, and dirty checkout. No commits, deployment or asset changes. Dielines are configurable by model in a dedicated module; use an explicitly provisional 3:2 frame until actual sizes are provided. Do not invent millimetres. Transform coordinates are normalized to the frame, so stage resizing does not alter the crop.

Choose a small DOM editor plus Canvas crop over a new graphics dependency. It matches the reference, provides inspectable handles and keyboard focus, and generates the same normalized rectangle for rendering. Use IndexedDB rather than localStorage because original image Blobs are large. Keep source image, crop preview, transform and frame data for reversible edits.

Verification must cover literal transform fixtures, all eight handles, proportional locking, canvas crop dimensions/pixels, persistence across reload, select/delete/re-edit, cancel, invalid files, no image network upload, actual label preview/export, keyboard focus and responsive UI.
