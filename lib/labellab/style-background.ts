import { backgroundConfig, labellabWhiteIconUrl } from '../background-config';
import { loadBackgroundTile } from '../background-image-tile';
import type { ScenePreferences } from './preferences';

/**
 * Curated Mockup Studio themes: each entry pairs a backdrop color with its full
 * Studio UI palette. Add new themes here when designing additional UI palettes.
 */
export const SCENE_THEME_BACKGROUNDS: Readonly<Record<ScenePreferences['style'], string>> = Object.freeze({
  white: '#ffffff',
  pink: '#d53660',
  dark: '#111215',
});

export const SCENE_THEME_OPTIONS: ReadonlyArray<{
  readonly id: ScenePreferences['style'];
  readonly color: string;
}> = Object.freeze([
  { id: 'white', color: SCENE_THEME_BACKGROUNDS.white },
  { id: 'pink', color: SCENE_THEME_BACKGROUNDS.pink },
  { id: 'dark', color: SCENE_THEME_BACKGROUNDS.dark },
]);

const tiles = new Map<string, Promise<string>>();

/** Shared raster for the live grid, glass refraction, previews and exports. */
export function loadStyleGridTile(style: ScenePreferences['style'], rasterScale = 1): Promise<string> {
  const scale = Math.min(8, Math.max(1, Number.isFinite(rasterScale) ? rasterScale : 1));
  const key = `${style}:${scale}`;
  const cached = tiles.get(key);
  if (cached) return cached;
  const lineOpacity = style === 'white' ? 1 : style === 'dark' ? 0.34 : 0.2;
  const iconOpacity = style === 'white' ? 1 : style === 'dark' ? 0.38 : 0.42;
  const pending = loadBackgroundTile(
    { id: 'labellab', color: '#ffffff', icon: 'berry', iconUrl: labellabWhiteIconUrl },
    { ...backgroundConfig, lineOpacity, iconOpacity },
    scale,
  ).then(async (url) => {
    if (style !== 'white' && style !== 'dark') return url;
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
    context.fillStyle = style === 'dark' ? '#7a7e87' : '#b6bac0';
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  }).catch((error: unknown) => { tiles.delete(key); throw error; });
  tiles.set(key, pending);
  return pending;
}
