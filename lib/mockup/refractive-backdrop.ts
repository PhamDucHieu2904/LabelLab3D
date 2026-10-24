import * as THREE from 'three';
import type { MockupBackdropPainter } from './contracts';

export interface RefractiveBackdropRegion {
  x: number; y: number; width: number; height: number;
  fullWidth: number; fullHeight: number;
}

/** Same sRGB backdrop input as Vinut Enhanced Graphics. Each view owns bounded
 * texture storage; export tiles sample their frozen full-image coordinates. */
export function createRefractiveBackdrop(maximum = 768) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: false });
  let texture: THREE.CanvasTexture | null = null;
  return {
    update(width: number, height: number, paint: MockupBackdropPainter, region?: RefractiveBackdropRegion) {
      if (!context) return null;
      const scale = Math.min(1, maximum / Math.max(width, height));
      const targetWidth = Math.max(1, Math.round(width * scale));
      const targetHeight = Math.max(1, Math.round(height * scale));
      if (!texture || canvas.width !== targetWidth || canvas.height !== targetHeight) {
        texture?.dispose();
        canvas.width = targetWidth; canvas.height = targetHeight;
        texture = new THREE.CanvasTexture(canvas);
        texture.name = 'Mockup enhanced refraction backdrop';
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.generateMipmaps = false;
        texture.minFilter = texture.magFilter = THREE.LinearFilter;
      }
      const area = region ?? { x: 0, y: 0, width, height, fullWidth: width, fullHeight: height };
      context.save();
      try {
        context.setTransform(canvas.width / area.width, 0, 0, canvas.height / area.height,
          -area.x * canvas.width / area.width, -area.y * canvas.height / area.height);
        paint(context, area.fullWidth, area.fullHeight);
      } finally { context.restore(); }
      texture.needsUpdate = true;
      return texture;
    },
    dispose() { texture?.dispose(); texture = null; canvas.width = canvas.height = 1; },
  };
}
