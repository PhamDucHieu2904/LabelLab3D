import { fitDesktopViewport, fitStudioWorkspace } from "./desktop-viewport";

export const ARTWORK_EDITOR_BASE_WIDTH = 960;
export const ARTWORK_EDITOR_SCALE_UP = 1.5;
export const ARTWORK_EDITOR_WIDTH = ARTWORK_EDITOR_BASE_WIDTH * ARTWORK_EDITOR_SCALE_UP;
export const ARTWORK_EDITOR_PREVIEW_RATIO = 0.7;
export const ARTWORK_EDITOR_SAVED_RATIO = 0.3;
export const ARTWORK_EDITOR_HEIGHT = 840;

/**
 * The editor is portaled to document.body, so it cannot inherit the Studio
 * surface zoom. Reuse the same physical scale that the Studio composition
 * applies to its 1920 × 960 design surface.
 */
export function getArtworkEditorScale(width: number, height: number): number {
  const page = fitDesktopViewport(width, height);
  const workspace = fitStudioWorkspace(width, height);
  if (!page || !workspace) return 1;
  return page.scale * workspace.relativeScale;
}

export function getArtworkEditorViewport(width: number, height: number) {
  const scale = getArtworkEditorScale(width, height);
  return { scale, width: width / scale, height: height / scale };
}

/** Pointer events and bounding rectangles both use rendered CSS pixels. */
export function normalizeArtworkPointerDelta(dx: number, dy: number, width: number, height: number) {
  return { x: dx / Math.max(width, 1), y: dy / Math.max(height, 1) };
}
