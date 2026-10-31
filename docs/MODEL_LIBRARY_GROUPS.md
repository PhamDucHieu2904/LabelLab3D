# Model library: packaging families and variants

The Studio library displays one card per packaging family. Clicking a card
selects the first child in its ordered list (array index 0), then opens a compact
variant panel beside the card. Opening/closing this panel never changes the
canvas dimensions. Saved preferences and projects keep the selected **child
model ID**, so opening a saved project preserves its actual variant.

## Verified source and current availability

The PC source is `D:/UnityHubData/Unity_3D_Mockup_Project/Assets`:

- `ProductView.cs` declares `packingGroupName`, `productTypeName`, and
  `productTypeOrder`.
- `CustomizationManager.cs` builds groups, sorts by type order then name, and
  `SelectPackingGroup` calls `SelectProductType(group.variants, 0)`.
- The screw-cap family is `290ml Glass rotate cap`: Basil order 0, Chia order 1,
  Milk order 3. After sorting, their **list indices** are 0, 1, and 2. The gap in
  the source order is intentional; it is not a missing web variant.
- The PC pull-tab lid family is separate. It is not published in this web UI.

The current optimized Vinut web inventory only includes the Basil screw-cap
GLB: `/models/bottles/glass-290-basil-web.glb`. Chia and Milk appear as disabled
`Coming soon` rows with no `modelId`. They do not load Basil's geometry under
another name, and Unity geometry is not copied into the web viewer.

## Adding a web variant

1. Publish the optimized GLB, poster, material slots/samplers, and label in the
   web catalog. Preserve geometry and appearance together through the resolver.
2. Register its actual display in `LAB_MODELS` in `lib/labellab/catalog.ts`.
3. Add/update the child in its family's `variants` list: stable `id`, English
   `label`, source `order`, `available: true`, and the registered `modelId`.
4. Allow the new child ID in `lib/labellab/preferences.ts` so browser saves and
   project restoration accept it.
5. Keep the lowest ordered child usable. The parent always selects sorted list
   index 0; it does not reuse the last selected sibling or skip to another asset.
6. Verify the model-source, family-order, search, and preferences tests. Do not
   add another parent library card for the new child.

The family search includes child labels and registered model descriptions while
returning each parent once. The variant panel follows Pink/White in Scene 1 and
the fixed neutral tone in Scene 2. Esc returns focus to the selected family;
outside clicks dismiss the panel. Unavailable variants use native disabled
buttons. The panel is inert while rendering an image.
