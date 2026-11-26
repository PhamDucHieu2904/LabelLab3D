import * as THREE from 'three';
import type { MockupBackdropPainter } from './contracts';

export interface RefractiveBackdropRegion {
  x: number; y: number; width: number; height: number;
  fullWidth: number; fullHeight: number;
}

/** High-fidelity sRGB backdrop input for Enhanced Graphics. Each view owns bounded
 * texture storage; export tiles sample their frozen full-image coordinates.
 * Live preview supports throttled/dirty updates so static or slow-drifting
 * backgrounds do not force 60 Hz 2D canvas repaints and GPU texture uploads. */
export function createRefractiveBackdrop(maximum = 384, minIntervalMs = 0) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: false });
  let texture: THREE.CanvasTexture | null = null;
  let lastPaintAt = -Infinity;
  let lastKey = '';
  let dirty = true;
  return {
    invalidate() { dirty = true; },
    update(width: number, height: number, paint: MockupBackdropPainter, region?: RefractiveBackdropRegion, force = false) {
      if (!context) return null;
      const scale = Math.min(1, maximum / Math.max(width, height));
      const targetWidth = Math.max(1, Math.round(width * scale));
      const targetHeight = Math.max(1, Math.round(height * scale));
      const area = region ?? { x: 0, y: 0, width, height, fullWidth: width, fullHeight: height };
      const key = `${targetWidth}:${targetHeight}:${area.x}:${area.y}:${area.width}:${area.height}:${area.fullWidth}:${area.fullHeight}`;
      const resized = !texture || canvas.width !== targetWidth || canvas.height !== targetHeight;
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (!force && !dirty && !resized && key === lastKey && minIntervalMs > 0 && now - lastPaintAt < minIntervalMs) {
        return texture;
      }
      if (resized) {
        texture?.dispose();
        canvas.width = targetWidth; canvas.height = targetHeight;
        texture = new THREE.CanvasTexture(canvas);
        texture.name = 'Mockup enhanced refraction backdrop';
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.generateMipmaps = false;
        texture.minFilter = texture.magFilter = THREE.LinearFilter;
      }
      context.save();
      try {
        context.setTransform(canvas.width / area.width, 0, 0, canvas.height / area.height,
          -area.x * canvas.width / area.width, -area.y * canvas.height / area.height);
        paint(context, area.fullWidth, area.fullHeight);
      } finally { context.restore(); }
      texture!.needsUpdate = true;
      lastPaintAt = now;
      lastKey = key;
      dirty = false;
      return texture;
    },
    dispose() { texture?.dispose(); texture = null; lastPaintAt = -Infinity; lastKey = ''; dirty = true; canvas.width = canvas.height = 1; },
  };
}
