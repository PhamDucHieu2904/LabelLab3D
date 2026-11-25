import * as THREE from 'three';
import type { FlatPanelSummary, PackagingArtworkState, PanelDesignOverlay, Point2D, SolvedDieline } from './types';

/** Compute upright physical panel width × height (mm) for 1:1 ArtworkEditor framing. */
export function getPanelUprightSizeMm(
  panel: Pick<FlatPanelSummary, 'bounds' | 'uprightAngleDeg'>,
): { widthMm: number; heightMm: number } {
  const swap = Math.abs(panel.uprightAngleDeg % 180) === 90;
  return {
    widthMm: Math.max(1, Math.round((swap ? panel.bounds.height : panel.bounds.width) * 10) / 10),
    heightMm: Math.max(1, Math.round((swap ? panel.bounds.width : panel.bounds.height) * 10) / 10),
  };
}

/** Whether a 3D panel face can be hovered & clicked to customize its independent artwork. */
export function isInteractivePackagingPanel(
  panel: Pick<FlatPanelSummary, 'printable' | 'faceRole' | 'bounds'>,
): boolean {
  if (panel.printable) return true;
  if (panel.faceRole === 'inner') {
    return panel.bounds.width >= 15 && panel.bounds.height >= 15;
  }
  return false;
}

/** Upright canvas rotation angle (deg) for both outside and horizontally mirrored inside UVs. */
export function getPanelSurfaceRotationDeg(
  uprightAngleDeg: number,
  side: 'outside' | 'inside',
): number {
  const raw = side === 'outside' ? uprightAngleDeg : -uprightAngleDeg;
  return raw === 0 ? 0 : raw;
}

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
  /**
   * Render a linear grayscale Spot UV / Hot Foil / Emboss mask texture (`flipY = false`,
   * `NoColorSpace`) aligned 1:1 with the outside dieline UV space.
   * Returns `null` when `finishMode === 'none'` or `finishTarget === 'full-surface'`.
   */
  composeFinishMask(
    solved: SolvedDieline,
    artwork: PackagingArtworkState,
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
  let finishMaskCanvas: HTMLCanvasElement | null = null;
  let finishMaskTexture: THREE.CanvasTexture | null = null;
  let scratchCanvas: HTMLCanvasElement | null = null;

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

  /**
   * Draw an architectural luxury foil/Spot-UV double hairline border + corner diamonds +
   * central crest emblem on every major printable panel so users can immediately inspect
   * realistic gold foil, silver foil, holographic foil, or raised Spot UV even on blank boards.
   */
  const drawLuxuryBrandFrame = (
    ctx: CanvasRenderingContext2D,
    solved: SolvedDieline,
    width: number,
    height: number,
  ) => {
    for (const panel of solved.flatPanels) {
      if (!panel.printable || panel.bounds.width < 32 || panel.bounds.height < 24) continue;
      if (panel.faceRole === 'base' || panel.faceRole === 'glue' || panel.faceRole === 'flap' || panel.faceRole === 'tab') {
        continue;
      }

      const boundsCenter: Point2D = [
        (panel.bounds.minX + panel.bounds.maxX) * 0.5,
        (panel.bounds.minY + panel.bounds.maxY) * 0.5,
      ];
      const [cx, cy] = map2DToCanvas(boundsCenter, solved, width, height, 'outside');
      const panelWpx = (panel.bounds.width / Math.max(1, solved.blankBounds.width)) * width;
      const panelHpx = (panel.bounds.height / Math.max(1, solved.blankBounds.height)) * height;
      const rotDeg = getPanelSurfaceRotationDeg(panel.uprightAngleDeg, 'outside');
      const rotRad = (rotDeg * Math.PI) / 180;
      const uprightW = Math.abs(rotDeg % 180) === 90 ? panelHpx : panelWpx;
      const uprightH = Math.abs(rotDeg % 180) === 90 ? panelWpx : panelHpx;
      const minSide = Math.min(uprightW, uprightH);
      if (minSide < 28) continue;

      ctx.save();
      ctx.beginPath();
      panel.outline.forEach((pt, idx) => {
        const [x, y] = map2DToCanvas(pt, solved, width, height, 'outside');
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.clip();

      ctx.translate(cx, cy);
      ctx.rotate(rotRad);

      const insetOuter = Math.max(8, minSide * 0.11);
      const insetInner = insetOuter + Math.max(4, minSide * 0.038);
      const outerW = Math.max(10, uprightW - insetOuter * 2);
      const outerH = Math.max(10, uprightH - insetOuter * 2);
      const innerW = Math.max(6, uprightW - insetInner * 2);
      const innerH = Math.max(6, uprightH - insetInner * 2);

      ctx.strokeStyle = '#ffffff';
      ctx.fillStyle = '#ffffff';
      ctx.lineWidth = Math.max(2.2, minSide * 0.015);
      ctx.strokeRect(-outerW * 0.5, -outerH * 0.5, outerW, outerH);

      ctx.lineWidth = Math.max(1.2, minSide * 0.0075);
      ctx.strokeRect(-innerW * 0.5, -innerH * 0.5, innerW, innerH);

      // Corner diamond ornaments
      const d = Math.max(3, minSide * 0.028);
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          const dx = sx * innerW * 0.5;
          const dy = sy * innerH * 0.5;
          ctx.beginPath();
          ctx.moveTo(dx, dy - d);
          ctx.lineTo(dx + d, dy);
          ctx.lineTo(dx, dy + d);
          ctx.lineTo(dx - d, dy);
          ctx.closePath();
          ctx.fill();
        }
      }

      // Centered geometric monogram & typographic emblem on primary faces (front/back/top/left/right)
      if (minSide >= 56) {
        const emblemR = Math.min(outerW * 0.14, outerH * 0.24);
        const hasRoomForWordmark = outerW >= outerH * 1.15;
        if (hasRoomForWordmark) {
          const titlePx = Math.max(14, Math.min(outerH * 0.24, outerW * 0.105));
          const subPx = Math.max(8, titlePx * 0.34);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = `700 ${Math.round(titlePx)}px Georgia, "Times New Roman", serif`;
          ctx.fillText('HYPERMOCKUP', 0, -subPx * 0.55, outerW * 0.78);
          ctx.font = `600 ${Math.round(subPx)}px "Mona Sans", Arial, sans-serif`;
          ctx.fillText('EDITION · STUDIO FINISH', 0, titlePx * 0.52, outerW * 0.72);
          // Delicate horizontal rule flanking diamond
          const ruleW = Math.min(outerW * 0.26, titlePx * 3.2);
          ctx.lineWidth = Math.max(1.2, minSide * 0.007);
          ctx.beginPath();
          ctx.moveTo(-ruleW, titlePx * 0.14);
          ctx.lineTo(-d * 1.4, titlePx * 0.14);
          ctx.moveTo(d * 1.4, titlePx * 0.14);
          ctx.lineTo(ruleW, titlePx * 0.14);
          ctx.stroke();
        } else if (emblemR >= 10) {
          ctx.lineWidth = Math.max(2, emblemR * 0.12);
          ctx.beginPath();
          ctx.moveTo(0, -emblemR);
          ctx.lineTo(emblemR, 0);
          ctx.lineTo(0, emblemR);
          ctx.lineTo(-emblemR, 0);
          ctx.closePath();
          ctx.stroke();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = `700 ${Math.round(emblemR * 0.78)}px Georgia, "Times New Roman", serif`;
          ctx.fillText('HM', 0, emblemR * 0.04);
        }
      }

      ctx.restore();
    }
  };

  /**
   * Extract a crisp anti-aliased grayscale mask from an uploaded artwork image:
   *  - Transparent PNG / SVG logo: uses the alpha channel directly (100% crisp!).
   *  - Opaque full-bleed design: detects the dominant edge background color and isolates
   *    contrasting ink / logos / typography via smooth perceptual color distance!
   */
  const extractImageMaskToScratch = (
    img: HTMLImageElement,
    targetW: number,
    targetH: number,
    threshold: number,
  ): HTMLCanvasElement | null => {
    if (typeof document === 'undefined') return null;
    const sw = Math.max(16, Math.min(1024, Math.round(targetW)));
    const sh = Math.max(16, Math.min(1024, Math.round(targetH)));
    if (!scratchCanvas) scratchCanvas = document.createElement('canvas');
    if (scratchCanvas.width !== sw || scratchCanvas.height !== sh) {
      scratchCanvas.width = sw;
      scratchCanvas.height = sh;
    }
    const sctx = scratchCanvas.getContext('2d', { willReadFrequently: true });
    if (!sctx) return null;
    sctx.clearRect(0, 0, sw, sh);
    sctx.drawImage(img, 0, 0, sw, sh);
    const imgData = sctx.getImageData(0, 0, sw, sh);
    const data = imgData.data;
    const total = sw * sh;

    // 1. Check whether the image has meaningful alpha transparency (logo / emblem PNG)
    let transparentPixels = 0;
    const sampleStep = Math.max(1, Math.floor(total / 4000));
    let sampled = 0;
    for (let i = 0; i < total; i += sampleStep) {
      sampled++;
      if (data[i * 4 + 3] < 235) transparentPixels++;
    }
    const hasAlphaLogo = sampled > 0 && transparentPixels / sampled > 0.04;

    if (hasAlphaLogo) {
      for (let i = 0; i < total; i++) {
        const p = i * 4;
        const a = data[p + 3];
        data[p] = 255;
        data[p + 1] = 255;
        data[p + 2] = 255;
        data[p + 3] = a;
      }
      sctx.putImageData(imgData, 0, 0);
      return scratchCanvas;
    }

    // 2. Opaque design: estimate background color from perimeter border median/average
    let bgR = 0;
    let bgG = 0;
    let bgB = 0;
    let bgCount = 0;
    for (let x = 0; x < sw; x += Math.max(1, Math.floor(sw / 48))) {
      for (const y of [0, sh - 1]) {
        const p = (y * sw + x) * 4;
        bgR += data[p];
        bgG += data[p + 1];
        bgB += data[p + 2];
        bgCount++;
      }
    }
    for (let y = 0; y < sh; y += Math.max(1, Math.floor(sh / 48))) {
      for (const x of [0, sw - 1]) {
        const p = (y * sw + x) * 4;
        bgR += data[p];
        bgG += data[p + 1];
        bgB += data[p + 2];
        bgCount++;
      }
    }
    bgR /= Math.max(1, bgCount);
    bgG /= Math.max(1, bgCount);
    bgB /= Math.max(1, bgCount);

    // Map finishThreshold [0.1..0.9] -> perceptual contrast cutoff
    const low = Math.max(0.04, (1 - threshold) * 0.45);
    const high = Math.min(0.95, low + 0.16);
    const invSpan = 1 / Math.max(0.02, high - low);

    for (let i = 0; i < total; i++) {
      const p = i * 4;
      const dr = (data[p] - bgR) / 255;
      const dg = (data[p + 1] - bgG) / 255;
      const db = (data[p + 2] - bgB) / 255;
      const dist = Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11);
      const t = Math.max(0, Math.min(1, (dist - low) * invSpan));
      const smooth = t * t * (3 - 2 * t);
      const maskByte = Math.round(smooth * 255);
      data[p] = 255;
      data[p + 1] = 255;
      data[p + 2] = 255;
      data[p + 3] = maskByte;
    }
    sctx.putImageData(imgData, 0, 0);
    return scratchCanvas;
  };

  return {
    async compose(solved, artwork, side, options) {
      if (typeof document === 'undefined') return null;

      const fullUrl = side === 'outside' ? artwork.outsideDielineUrl : artwork.insideDielineUrl;
      const panelOverlays: PanelDesignOverlay[] = Object.values(artwork.panelOverlays).filter(
        (ov) => ov.surface === side && Boolean(ov.fillColor || ov.imageUrl || ov.text?.trim()),
      );
      const showLabels = solved.params.showFaceLabels;
      const showCreases = solved.params.showCreaseLines && solved.params.foldProgress < 0.45;

      // If there is no artwork, no panel overlays, and no face labels, still draw subtle crisp
      // kraft grain + orientation watermark only when needed; otherwise return null for pure fast PBR!
      if (!fullUrl && panelOverlays.length === 0 && !showLabels && !showCreases) {
        return null;
      }

      const hasImageOverlay = panelOverlays.some((ov) => Boolean(ov.imageUrl));
      const maxEdge = options?.maxEdge ?? (hasImageOverlay || fullUrl ? 3072 : 2048);
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

        const boundsCenter: Point2D = [
          (panel.bounds.minX + panel.bounds.maxX) * 0.5,
          (panel.bounds.minY + panel.bounds.maxY) * 0.5,
        ];
        const anchorPt = overlay.fitMode === 'crop' ? boundsCenter : panel.centroid;
        const [cx, cy] = map2DToCanvas(anchorPt, solved, width, height, side);
        const panelWpx = (panel.bounds.width / Math.max(1, solved.blankBounds.width)) * width;
        const panelHpx = (panel.bounds.height / Math.max(1, solved.blankBounds.height)) * height;
        const rotDeg = getPanelSurfaceRotationDeg(panel.uprightAngleDeg, side);
        const rotRad = (rotDeg * Math.PI) / 180;
        const uprightW = Math.abs(rotDeg % 180) === 90 ? panelHpx : panelWpx;
        const uprightH = Math.abs(rotDeg % 180) === 90 ? panelWpx : panelHpx;

        if (overlay.imageUrl) {
          try {
            const img = await loadImageCached(overlay.imageUrl, imageCache);
            if (overlay.fitMode === 'crop') {
              ctx.save();
              ctx.translate(cx, cy);
              ctx.rotate(rotRad);
              ctx.drawImage(img, -uprightW * 0.5, -uprightH * 0.5, uprightW, uprightH);
              ctx.restore();
            } else {
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
            }
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
          const rotDeg = getPanelSurfaceRotationDeg(panel.uprightAngleDeg, side);
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
    async composeFinishMask(solved, artwork, options) {
      if (typeof document === 'undefined') return null;
      const { finishMode, finishTarget, finishThreshold, finishInvertMask } = solved.params;
      if (finishMode === 'none') return null;
      if (!artwork.finishMaskUrl && finishTarget === 'full-surface') return null;

      const maxEdge = options?.maxEdge ?? 2048;
      const aspect = Math.max(
        0.2,
        Math.min(5, solved.blankBounds.width / Math.max(1, solved.blankBounds.height)),
      );
      const width = aspect >= 1 ? maxEdge : Math.max(256, Math.round(maxEdge * aspect));
      const height = aspect >= 1 ? Math.max(256, Math.round(maxEdge / aspect)) : maxEdge;

      if (!finishMaskCanvas) finishMaskCanvas = document.createElement('canvas');
      if (finishMaskCanvas.width !== width || finishMaskCanvas.height !== height) {
        finishMaskCanvas.width = width;
        finishMaskCanvas.height = height;
      }
      const ctx = finishMaskCanvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;

      // Start solid black (0.0 = natural matte board, 1.0 = active Spot UV / Hot Foil)
      ctx.save();
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);

      if (artwork.finishMaskUrl) {
        try {
          const maskImg = await loadImageCached(artwork.finishMaskUrl, imageCache);
          ctx.drawImage(maskImg, 0, 0, width, height);
        } catch {
          // Keep clean fallback if custom mask blob expired
        }
      } else {
        const panelOverlays: PanelDesignOverlay[] = Object.values(artwork.panelOverlays).filter(
          (ov) => ov.surface === 'outside' && Boolean(ov.imageUrl || ov.text?.trim()),
        );
        const hasArtworkContent = Boolean(artwork.outsideDielineUrl || panelOverlays.length > 0);

        // Draw luxury frame when explicitly selected OR as graceful instant preview on blank boxes
        if (finishTarget === 'brand-frame' || !hasArtworkContent) {
          drawLuxuryBrandFrame(ctx, solved, width, height);
        }

        if (artwork.outsideDielineUrl && finishTarget === 'auto-artwork') {
          try {
            const img = await loadImageCached(artwork.outsideDielineUrl, imageCache);
            const extracted = extractImageMaskToScratch(img, width * 0.5, height * 0.5, finishThreshold);
            if (extracted) ctx.drawImage(extracted, 0, 0, width, height);
          } catch {
            // Skip invalid URL
          }
        }

        for (const overlay of panelOverlays) {
          const panel = solved.flatPanels.find((p) => p.id === overlay.panelId);
          if (!panel) continue;

          ctx.save();
          ctx.beginPath();
          panel.outline.forEach((pt, idx) => {
            const [x, y] = map2DToCanvas(pt, solved, width, height, 'outside');
            if (idx === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.closePath();
          ctx.clip();

          const boundsCenter: Point2D = [
            (panel.bounds.minX + panel.bounds.maxX) * 0.5,
            (panel.bounds.minY + panel.bounds.maxY) * 0.5,
          ];
          const anchorPt = overlay.fitMode === 'crop' ? boundsCenter : panel.centroid;
          const [cx, cy] = map2DToCanvas(anchorPt, solved, width, height, 'outside');
          const panelWpx = (panel.bounds.width / Math.max(1, solved.blankBounds.width)) * width;
          const panelHpx = (panel.bounds.height / Math.max(1, solved.blankBounds.height)) * height;
          const rotDeg = getPanelSurfaceRotationDeg(panel.uprightAngleDeg, 'outside');
          const rotRad = (rotDeg * Math.PI) / 180;
          const uprightW = Math.abs(rotDeg % 180) === 90 ? panelHpx : panelWpx;
          const uprightH = Math.abs(rotDeg % 180) === 90 ? panelWpx : panelHpx;

          if (overlay.imageUrl) {
            try {
              const img = await loadImageCached(overlay.imageUrl, imageCache);
              const extracted = extractImageMaskToScratch(img, uprightW, uprightH, finishThreshold);
              if (extracted) {
                if (overlay.fitMode === 'crop') {
                  ctx.save();
                  ctx.translate(cx, cy);
                  ctx.rotate(rotRad);
                  ctx.drawImage(extracted, -uprightW * 0.5, -uprightH * 0.5, uprightW, uprightH);
                  ctx.restore();
                } else {
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
                  ctx.drawImage(extracted, -drawW * 0.5, -drawH * 0.5, drawW, drawH);
                  ctx.restore();
                }
              }
            } catch {
              // Skip broken overlay image
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
            ctx.fillStyle = '#ffffff';
            ctx.fillText(overlay.text.trim(), 0, 0, uprightW * 0.9);
            ctx.restore();
          }

          ctx.restore();
        }
      }

      if (finishInvertMask) {
        ctx.globalCompositeOperation = 'difference';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();

      if (!finishMaskTexture || finishMaskTexture.image !== finishMaskCanvas) {
        finishMaskTexture?.dispose();
        finishMaskTexture = new THREE.CanvasTexture(finishMaskCanvas);
        finishMaskTexture.colorSpace = THREE.NoColorSpace;
        finishMaskTexture.flipY = false;
        finishMaskTexture.anisotropy = 8;
        finishMaskTexture.wrapS = THREE.ClampToEdgeWrapping;
        finishMaskTexture.wrapT = THREE.ClampToEdgeWrapping;
      } else {
        finishMaskTexture.needsUpdate = true;
      }
      return finishMaskTexture;
    },
    dispose() {
      textureBySide.outside?.dispose();
      textureBySide.inside?.dispose();
      finishMaskTexture?.dispose();
      finishMaskTexture = null;
      finishMaskCanvas = null;
      scratchCanvas = null;
      delete textureBySide.outside;
      delete textureBySide.inside;
      delete canvasBySide.outside;
      delete canvasBySide.inside;
      imageCache.clear();
    },
  };
}
