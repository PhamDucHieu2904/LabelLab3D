import { backgroundConfig, labellabWhiteIconUrl } from '../background-config';
import { loadBackgroundTile } from '../background-image-tile';
import type { ScenePreferences } from './preferences';

const tiles = new Map<string, Promise<string>>();

/** Shared raster for the live grid, glass refraction, previews and exports. */
export function loadStyleGridTile(style: ScenePreferences['style'], rasterScale = 1): Promise<string> {
  const scale = Math.min(8, Math.max(1, Number.isFinite(rasterScale) ? rasterScale : 1));
  const key = `${style}:${scale}`;
  const cached = tiles.get(key);
  if (cached) return cached;
  const pending = loadBackgroundTile(
    { id: 'labellab', color: '#ffffff', icon: 'berry', iconUrl: labellabWhiteIconUrl },
    { ...backgroundConfig, lineOpacity: style === 'white' ? 1 : 0.2, iconOpacity: style === 'white' ? 1 : 0.42 },
    scale,
  ).then(async (url) => {
    if (style !== 'white') return url;
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const source = new Image();
      source.onload = () => resolve(source);
      source.onerror = () => reject(new Error('Unable to load the style grid.'));
      source.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to tint the style grid.');
    context.drawImage(image, 0, 0);
    context.globalCompositeOperation = 'source-in';
    context.fillStyle = '#b6bac0';
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  }).catch((error: unknown) => { tiles.delete(key); throw error; });
  tiles.set(key, pending);
  return pending;
}
