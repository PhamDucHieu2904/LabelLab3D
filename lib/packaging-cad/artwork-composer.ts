import * as THREE from 'three';
import type { PackagingArtworkState, PanelDesignOverlay, Point2D, SolvedDieline } from './types';

function loadImageCached(url: string, cache: Map<string, Promise<HTMLImageElement>>): Promise<HTMLImageElement> {
  const existing = cache.get(url);
  if (existing) return existing;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => {
      cache.delete(url);
      reject(new Error(`Unable to decode packaging artwork: ${url}`));
    };
    img.src = url;
  });
  cache.set(url, promise);
  return promise;
}

function map2DToCanvas(
  pt: Point2D,
  solved: SolvedDieline,
  width: number,
  height: number,
  side: 'outside' | 'inside',
): [number, number] {
  const b = solved.blankBounds;
  const w = Math.max(b.width, 1e-4);
  const h = Math.max(b.height, 1e-4);
  const u = side === 'inside' ? (pt[0] - b.minX) / w : (b.maxX - pt[0]) / w;
  const v = (b.maxY - pt[1]) / h;
  return [u * width, v * height];
}

export interface PackagingTextureComposer {
  /**
   * Render either the outside or inside full-blank texture to a Three.js CanvasTexture
   * (`flipY = false`, sRGB) matching the exact global UV projection of `solid-builder.ts`.
   */
  compose(
    solved: SolvedDieline,
    artwork: PackagingArtworkState,
    side: 'outside' | 'inside',
    options?: { maxEdge?: number },
  ): Promise<THREE.CanvasTexture | null>;
  dispose(): void;
}

/**
 * Dual-Surface 2D Texture Composer for Parametric Packaging:
 *  - Base board color + subtle natural kraft speckle/grain
 *  - Full-dieline uploaded artwork (Pro mode)
 *  - Per-panel overlays (Quick Panel Designer: fill color, logo image, upright typography)
 *  - Optional Face Orientation Guides (`FRONT ↑`, `LEFT ↑`, `TOP ↑`) so users never print upside-down
 */
export function createPackagingTextureComposer(): PackagingTextureComposer {
  const imageCache = new Map<string, Promise<HTMLImageElement>>();
  const canvasBySide: Partial<Record<'outside' | 'inside', HTMLCanvasElement>> = {};
  const textureBySide: Partial<Record<'outside' | 'inside', THREE.CanvasTexture>> = {};

  const ensureCanvas = (side: 'outside' | 'inside', width: number, height: number) => {
    if (typeof document === 'undefined') return null;
    let canvas = canvasBySide[side];
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvasBySide[side] = canvas;
    }
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    return canvas;
  };

  return {
    async compose(solved, artwork, side, options) {
      if (typeof document === 'undefined') return null;

      const fullUrl = side === 'outside' ? artwork.outsideDielineUrl : artwork.insideDielineUrl;
      const panelOverlays: PanelDesignOverlay[] = Object.values(artwork.panelOverlays).filter(
        (ov) => ov.surface === side && Boolean(ov.fillColor || ov.imageUrl || ov.text?.trim()),
      );
      const showLabels = solved.params.showFaceLabels;
      const showCreases = solved.params.showCreaseLines && solved.params.foldProgress < 0.98;

      // If there is no artwork, no panel overlays, and no face labels, still draw subtle crisp
      // kraft grain + orientation watermark only when needed; otherwise return null for pure fast PBR!
      if (!fullUrl && panelOverlays.length === 0 && !showLabels && !showCreases) {
        return null;
      }

      const maxEdge = options?.maxEdge ?? 2048;
      const aspect = Math.max(0.2, Math.min(5, solved.blankBounds.width / Math.max(1, solved.blankBounds.height)));
      const width = aspect >= 1 ? maxEdge : Math.max(256, Math.round(maxEdge * aspect));
      const height = aspect >= 1 ? Math.max(256, Math.round(maxEdge / aspect)) : maxEdge;

      const canvas = ensureCanvas(side, width, height);
      if (!canvas) return null;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // 1. Base board color fill
      ctx.save();
      ctx.fillStyle = side === 'outside' ? solved.params.outsideColor : solved.params.insideColor;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();

      // 2. Full Dieline Artwork (Pro Mode)
      if (fullUrl) {
        try {
          const img = await loadImageCached(fullUrl, imageCache);
          ctx.drawImage(img, 0, 0, width, height);
        } catch {
          // Preserve base color if blob URL expired.
        }
      }

      // 3. Per-Panel Overlays (Quick Panel Designer — clipped to each panel polygon, upright oriented!)
      for (const overlay of panelOverlays) {
        const panel = solved.flatPanels.find((p) => p.id === overlay.panelId);
        if (!panel) continue;

        ctx.save();
        ctx.beginPath();
        panel.outline.forEach((pt, idx) => {
          const [x, y] = map2DToCanvas(pt, solved, width, height, side);
          if (idx === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.clip();

        if (overlay.fillColor) {
          ctx.fillStyle = overlay.fillColor;
          ctx.fillRect(0, 0, width, height);
        }

        const [cx, cy] = map2DToCanvas(panel.centroid, solved, width, height, side);
        const panelWpx = (panel.bounds.width / Math.max(1, solved.blankBounds.width)) * width;
        const panelHpx = (panel.bounds.height / Math.max(1, solved.blankBounds.height)) * height;
        const rotDeg = side === 'outside' ? panel.uprightAngleDeg : 0;
        const rotRad = (rotDeg * Math.PI) / 180;
        const uprightW = Math.abs(rotDeg % 180) === 90 ? panelHpx : panelWpx;
        const uprightH = Math.abs(rotDeg % 180) === 90 ? panelWpx : panelHpx;

        if (overlay.imageUrl) {
          try {
            const img = await loadImageCached(overlay.imageUrl, imageCache);
            const imgAspect = img.naturalWidth / Math.max(1, img.naturalHeight);
            const boxAspect = uprightW / Math.max(1, uprightH);
            let drawW = uprightW;
            let drawH = uprightH;
            if (imgAspect > boxAspect) drawH = drawW / imgAspect;
            else drawW = drawH * imgAspect;
            drawW *= overlay.imageScale;
            drawH *= overlay.imageScale;

            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(rotRad);
            ctx.translate(overlay.imageOffsetX * uprightW, overlay.imageOffsetY * uprightH);
            ctx.rotate(((overlay.imageRotationDeg || 0) * Math.PI) / 180);
            ctx.drawImage(img, -drawW * 0.5, -drawH * 0.5, drawW, drawH);
            ctx.restore();
          } catch {
            // Skip broken overlay image gracefully.
          }
        }

        if (overlay.text?.trim()) {
          const fontPx = Math.max(14, Math.min(uprightW, uprightH) * ((overlay.textSizePct ?? 26) / 100));
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(rotRad);
          ctx.font = `700 ${Math.round(fontPx)}px "Mona Sans", Arial, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = overlay.textColor ?? '#1e293b';
          ctx.fillText(overlay.text.trim(), 0, 0, uprightW * 0.9);
          ctx.restore();
        }

        ctx.restore();
      }

      // 4. Subtle crease guide lines on flat/opening board
      if (showCreases && !fullUrl) {
        ctx.save();
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.16)';
        ctx.lineWidth = Math.max(1.5, width / 1100);
        ctx.setLineDash([width / 160, width / 220]);
        for (const seg of solved.creaseSegments) {
          const [x1, y1] = map2DToCanvas(seg.p1, solved, width, height, side);
          const [x2, y2] = map2DToCanvas(seg.p2, solved, width, height, side);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 5. Smart Face Orientation Overlay (`FRONT ↑`, `LEFT ↑`, `TOP ↑`)
      if (showLabels) {
        ctx.save();
        for (const panel of solved.flatPanels) {
          if (panel.bounds.width < 18 || panel.bounds.height < 14) continue;
          const [cx, cy] = map2DToCanvas(panel.centroid, solved, width, height, side);
          const panelWpx = (panel.bounds.width / Math.max(1, solved.blankBounds.width)) * width;
          const panelHpx = (panel.bounds.height / Math.max(1, solved.blankBounds.height)) * height;
          const rotDeg = side === 'outside' ? panel.uprightAngleDeg : 0;
          const fontSize = Math.max(14, Math.min(46, Math.min(panelWpx, panelHpx) * 0.22));

          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate((rotDeg * Math.PI) / 180);
          ctx.font = `700 ${Math.round(fontSize)}px "Mona Sans", Arial, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const text = panel.printable ? `${panel.shortCode} ↑` : panel.shortCode;
          const metrics = ctx.measureText(text);
          const padX = fontSize * 0.45;
          const padY = fontSize * 0.28;
          ctx.fillStyle = panel.printable ? 'rgba(15, 23, 42, 0.72)' : 'rgba(15, 23, 42, 0.42)';
          ctx.beginPath();
          ctx.roundRect(
            -metrics.width * 0.5 - padX,
            -fontSize * 0.5 - padY,
            metrics.width + padX * 2,
            fontSize + padY * 2,
            fontSize * 0.35,
          );
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.fillText(text, 0, 1);
          ctx.restore();
        }
        ctx.restore();
      }

      let tex = textureBySide[side];
      if (!tex || tex.image !== canvas) {
        tex?.dispose();
        tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.flipY = false;
        tex.anisotropy = 8;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        textureBySide[side] = tex;
      } else {
        tex.needsUpdate = true;
      }
      return tex;
    },
    dispose() {
      textureBySide.outside?.dispose();
      textureBySide.inside?.dispose();
      delete textureBySide.outside;
      delete textureBySide.inside;
      delete canvasBySide.outside;
      delete canvasBySide.inside;
      imageCache.clear();
    },
  };
}
