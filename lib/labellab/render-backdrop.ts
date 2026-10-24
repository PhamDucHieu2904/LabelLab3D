import { backgroundConfig, labellabWhiteIconUrl } from '../background-config';
import { loadBackgroundTile } from '../background-image-tile';
import { centeredMockupCrop } from '../mockup/capture';
import type { ScenePreferences } from './preferences';

let gridImage: HTMLImageElement | undefined;
let gridReady: Promise<void> | undefined;
const gridScale = 8;
export function prepareRenderBackdrop(): Promise<void> {
  gridReady ??= new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { gridImage = image; resolve(); };
    image.onerror = () => { gridReady = undefined; reject(new Error('Unable to load the grid for rendering.')); };
    void loadBackgroundTile(
      { id: 'labellab', color: '#ffffff', icon: 'berry', iconUrl: labellabWhiteIconUrl },
      { ...backgroundConfig, lineOpacity: 0.2, iconOpacity: 0.42 },
      gridScale,
    ).then((url) => { image.src = url; }).catch(() => {
      gridReady = undefined;
      reject(new Error('Unable to load the grid for rendering.'));
    });
  });
  return gridReady;
}

/** Freeze scene decoration coordinates once; UI panels never enter the image. */
export function snapshotRenderBackdrop(host: HTMLElement, settings: ScenePreferences, aspect: number) {
  const view = host.getBoundingClientRect();
  const crop = centeredMockupCrop(view.width, view.height, aspect);
  const surface = host.closest('.creative-space');
  const track = surface?.querySelector('.moving-grid > div')?.getBoundingClientRect();
  const glow = surface?.querySelector('.product-highlight')?.getBoundingClientRect();
  return {
    ...settings, crop,
    gridX: track ? track.left - view.left : 0,
    gridY: track ? track.top - view.top : 0,
    glow: glow ? { x: glow.left - view.left, y: glow.top - view.top, width: glow.width, height: glow.height } : undefined,
  };
}

export function paintRenderBackdrop(context: CanvasRenderingContext2D, width: number, height: number, state: ReturnType<typeof snapshotRenderBackdrop>) {
  if (state.transparent) return;
  context.save();
  context.fillStyle = state.sceneMode === 'studio' ? '#ffffff' : state.background;
  context.fillRect(0, 0, width, height);
  if (state.sceneMode === 'studio') { context.restore(); return; }
  context.scale(width / state.crop.width, height / state.crop.height);
  context.translate(-state.crop.x, -state.crop.y);
  if (state.grid && gridImage) {
    const pattern = context.createPattern(gridImage, 'repeat');
    if (pattern) {
      pattern.setTransform(new DOMMatrix().translate(state.gridX, state.gridY).scale(1 / gridScale));
      context.fillStyle = pattern;
      context.fillRect(state.crop.x, state.crop.y, state.crop.width, state.crop.height);
    }
  }
  if (state.highlight && state.glow) {
    const glow = state.glow;
    context.globalCompositeOperation = 'overlay';
    context.globalAlpha = 0.72;
    context.translate(glow.x + glow.width / 2, glow.y + glow.height / 2);
    context.scale(glow.width / 2, glow.height / 2);
    const gradient = context.createRadialGradient(0, 0, 0, 0, 0, 1);
    gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(0.29, '#ffffffe0');
    gradient.addColorStop(0.55, '#ffffff5c'); gradient.addColorStop(0.75, '#ffffff00');
    context.fillStyle = gradient; context.fillRect(-1, -1, 2, 2);
  }
  context.restore();
}
