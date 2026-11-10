# Artwork offset

User request: add one slider immediately below Add your artwork, matching Label Lab Unity's horizontal label offset. Keep the existing Properties layout and responsive Studio scaling.

Reuse the existing `ScenePreferences.labelOffset` and live texture transform rather than rotating geometry or rebaking uploaded artwork. Move the Label position control above the part tabs, name it Artwork offset, and retain direct percentage entry. Range -100 to +100 percent maps to Unity's -1 to +1 UV offset; 0 is the original position. Use 0.1 percent steps for fine positioning. Reuse the panel slider styling and keyboard support. Do not duplicate the control in Label finish.

Expand the existing preference, appearance resolver and live renderer bounds consistently. Existing model-specific defaults, browser/project persistence, export, and appearance pooling remain the source of truth. No new settings store or texture reload per slider event. Upload/reset/model-switch policies stay as the web currently defines them; this task changes the control's location and usable range.

Reference: Unity `Assets/System/Script/MaterialPropertyAdapter.cs` sets Base Map offset.x and preserves offset.y; scene slider range is -1..1. Repeat wrapping is already enabled for editable web labels.

Alternative considered: a separate rotation setting would duplicate offset state and rotate geometry rather than artwork, so reuse the existing UV path.
