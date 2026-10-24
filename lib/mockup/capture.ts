import { normalizeMockupAspect } from './camera';

export interface MockupImageSize { width: number; height: number; longEdge: number }

/** Export dimensions are explicit: an unavailable size fails instead of silently shrinking. */
export function mockupCaptureSize(longEdge: number, aspect: number, maximumDimension = 8192, pixelBudget = 8192 * 8192): MockupImageSize {
  const ratio = normalizeMockupAspect(aspect);
  if (!Number.isSafeInteger(longEdge) || longEdge < 1 || longEdge > 8192 ||
    !Number.isFinite(maximumDimension) || maximumDimension < longEdge ||
    !Number.isFinite(pixelBudget) || pixelBudget < 1) throw new Error('Invalid export dimensions');
  const width = ratio >= 1 ? longEdge : Math.max(1, Math.round(longEdge * ratio));
  const height = ratio >= 1 ? Math.max(1, Math.round(longEdge / ratio)) : longEdge;
  if (width * height > Math.min(pixelBudget, 8192 * 8192)) throw new Error('Export exceeds pixel budget');
  return { width, height, longEdge: Math.max(width, height) };
}

function validateDimensions(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 ||
    width > 8192 || height > 8192) throw new Error('Invalid image dimensions');
}

/** Floating point crop preserves the preview projection exactly, including odd dimensions. */
export function centeredMockupCrop(width: number, height: number, aspect: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 ||
    !Number.isFinite(aspect) || aspect <= 0) throw new Error('Invalid crop dimensions');
  const cropWidth = Math.min(width, height * aspect);
  const cropHeight = Math.min(height, width / aspect);
  return { x: (width - cropWidth) / 2, y: (height - cropHeight) / 2, width: cropWidth, height: cropHeight };
}

export interface MockupCaptureTile {
  x: number; y: number; width: number; height: number;
  renderX: number; renderY: number; renderWidth: number; renderHeight: number;
  cropX: number; cropY: number;
}

/** tileSize bounds the GPU target including overlap; only the nonoverlapping core is stitched. */
export function createMockupTiles(width: number, height: number, tileSize = 1536, guard = 64): MockupCaptureTile[] {
  validateDimensions(width, height);
  if (!Number.isSafeInteger(tileSize) || tileSize < 1 || tileSize > 8192 ||
    !Number.isSafeInteger(guard) || guard < 0 || guard * 2 >= tileSize) throw new Error('Invalid tile dimensions');
  const coreSize = tileSize - 2 * guard;
  if (Math.ceil(width / coreSize) * Math.ceil(height / coreSize) > 65536) throw new Error('Too many export tiles');
  const tiles: MockupCaptureTile[] = [];
  for (let y = 0; y < height; y += coreSize) for (let x = 0; x < width; x += coreSize) {
    const coreWidth = Math.min(coreSize, width - x), coreHeight = Math.min(coreSize, height - y);
    const renderX = Math.max(0, x - guard), renderY = Math.max(0, y - guard);
    tiles.push({ x, y, width: coreWidth, height: coreHeight, renderX, renderY,
      renderWidth: Math.min(width, x + coreWidth + guard) - renderX,
      renderHeight: Math.min(height, y + coreHeight + guard) - renderY,
      cropX: x - renderX, cropY: y - renderY });
  }
  return tiles;
}

/** WebGL reads bottom-to-top; ImageData and PNG use top-to-bottom. */
export function flipMockupPixels(pixels: Uint8Array, width: number, height: number): Uint8ClampedArray<ArrayBuffer> {
  validateDimensions(width, height);
  if (pixels.length !== width * height * 4) throw new Error('Invalid PNG pixel buffer');
  const flipped = new Uint8ClampedArray(new ArrayBuffer(pixels.length));
  const rowSize = width * 4;
  for (let row = 0; row < height; row++) flipped.set(pixels.subarray(row * rowSize, (row + 1) * rowSize), (height - row - 1) * rowSize);
  return flipped;
}

export function mockupAbortError(): DOMException { return new DOMException('Image export cancelled', 'AbortError'); }

export async function encodeMockupPng(pixels: Uint8Array, width: number, height: number, signal?: AbortSignal): Promise<Blob> {
  if (signal?.aborted) throw mockupAbortError();
  validateDimensions(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('PNG encoder unavailable');
    context.putImageData(new ImageData(flipMockupPixels(pixels, width, height), width, height), 0, 0);
    return await encodeMockupCanvasPng(canvas, signal);
  } finally {
    canvas.width = 1; canvas.height = 1;
  }
}

/** Encodes the existing stitched canvas without allocating another full-resolution pixel buffer. */
export async function encodeMockupCanvasPng(canvas: HTMLCanvasElement, signal?: AbortSignal): Promise<Blob> {
  if (signal?.aborted) throw mockupAbortError();
  validateDimensions(canvas.width, canvas.height);
  return await new Promise<Blob>((resolve, reject) => {
      let finished = false;
      const settle = (blob: Blob | null, error?: unknown) => {
        if (finished) return;
        finished = true; clearTimeout(timeout); signal?.removeEventListener('abort', aborted);
        if (error) reject(error); else if (blob && blob.size > 0 && blob.type === 'image/png') resolve(blob);
        else reject(new Error('PNG encoder returned an empty or invalid image'));
      };
      const aborted = () => settle(null, mockupAbortError());
      const timeout = setTimeout(() => settle(null, new Error('PNG encoder timed out')), 30000);
      signal?.addEventListener('abort', aborted, { once: true });
      if (signal?.aborted) { aborted(); return; }
      try { canvas.toBlob(blob => settle(blob), 'image/png'); } catch (error) { settle(null, error); }
  });
}

/** The gate remains held until restoration finishes, including rejected exports. */
export function createMockupCaptureGate() {
  let busy = false;
  return {
    get busy() { return busy; },
    async run<T>(capture: () => Promise<T>, restore: () => void): Promise<T> {
      if (busy) throw new Error('An image export is already running');
      busy = true;
      try { return await capture(); } finally { try { restore(); } finally { busy = false; } }
    },
  };
}
