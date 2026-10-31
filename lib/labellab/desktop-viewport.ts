export const DESKTOP_DESIGN_SIZE = { width: 1920, height: 1080 } as const;
export const STUDIO_DESIGN_SIZE = { width: 1920, height: 960 } as const;
export const SITE_HEADER_HEIGHT = 64;
export const MOBILE_LAYOUT_MAX_WIDTH = 860;

/** One scale for the entire desktop composition; extra aspect-ratio space
 * expands the layout instead of stretching its contents or adding blank bars. */
export function fitDesktopViewport(
  width: number,
  height: number,
  design: { width: number; height: number } = DESKTOP_DESIGN_SIZE,
) {
  if (width <= 0 || height <= 0 || !Number.isFinite(width + height)) return null;
  const desktop = width > MOBILE_LAYOUT_MAX_WIDTH;
  const scale = desktop
    ? Math.min(width / design.width, height / design.height)
    : 1;
  return { desktop, scale, width: width / scale, height: height / scale };
}

/** Restore Studio's native controls at the supplied 1920 × 960 reference while
 * keeping the shared header at exactly the same scale as the approved Home. */
export function fitStudioWorkspace(width: number, height: number) {
  const page = fitDesktopViewport(width, height);
  const studio = fitDesktopViewport(width, height, STUDIO_DESIGN_SIZE);
  if (!page || !studio) return null;
  return {
    relativeScale: studio.scale / page.scale,
    width: studio.width,
    pageHeight: studio.height,
    height: Math.max(0, height - SITE_HEADER_HEIGHT * page.scale) / studio.scale,
  };
}
