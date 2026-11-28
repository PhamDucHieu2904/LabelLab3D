import { getLabModel } from './catalog';
import type { CustomProjectRecord } from './project-store';
import { getPackagingTemplate } from '../packaging-cad/templates/registry';
import {
  SHARE_LIMITS,
  type SharedItemPayload,
  type SharedPackagingArtworkRefs,
  type SharedPanelOverlayRef,
  type SharedProjectItemInput,
} from '../share/contracts';

export interface PackagedShareResult {
  items: SharedProjectItemInput[];
  assets: Map<string, Blob>;
  totalBytes: number;
  deduplicatedCount: number;
}

export async function hashBlobSha256(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function encodeCanvasBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), mime, quality);
    } catch {
      resolve(null);
    }
  });
}

async function decodeImageSource(blob: Blob): Promise<{
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  close: () => void;
} | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
        close: () => bitmap.close(),
      };
    } catch {
      // Fall back to HTMLImageElement below.
    }
  }
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null;
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image decode failed'));
      el.src = url;
    });
    return {
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
      close: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

export const CLOUD_MAX_IMAGE_EDGE = 2048;
export const CLOUD_MAX_THUMB_EDGE = 480;

/**
 * Compute exact target pixel dimensions for Cloudflare R2 storage:
 * images exceeding `maxEdge` (2048 px) are scaled proportionally so the longest
 * edge equals `maxEdge`; smaller images keep their native dimensions.
 */
export function computeCloudImageSize(
  width: number,
  height: number,
  maxEdge = CLOUD_MAX_IMAGE_EDGE,
): { width: number; height: number } {
  const safeW = Math.max(1, Math.round(Number.isFinite(width) ? width : 1));
  const safeH = Math.max(1, Math.round(Number.isFinite(height) ? height : 1));
  const longest = Math.max(safeW, safeH);
  if (longest <= maxEdge) return { width: safeW, height: safeH };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(safeW * scale)),
    height: Math.max(1, Math.round(safeH * scale)),
  };
}

/**
 * Resize (to at most 2048 px on the longest edge) and always encode to WebP
 * before uploading to Cloudflare R2 so local previews can be any pixel size
 * while cloud storage stays crisp, compact, and fast.
 */
export async function optimizeShareImageBlob(
  blob: Blob,
  options: { maxEdge: number; quality: number; maxBytes?: number },
): Promise<Blob> {
  const maxBytes = options.maxBytes ?? SHARE_LIMITS.maxD1AssetBytes;
  const cappedMaxEdge = Math.min(CLOUD_MAX_IMAGE_EDGE, Math.max(64, Math.floor(options.maxEdge)));
  if (typeof document === 'undefined') return blob;
  const decoded = await decodeImageSource(blob);
  if (!decoded || decoded.width <= 0 || decoded.height <= 0) return blob;

  try {
    const attempts: Array<{ edge: number; quality: number }> = [
      { edge: cappedMaxEdge, quality: options.quality },
      { edge: cappedMaxEdge, quality: 0.8 },
      { edge: Math.min(cappedMaxEdge, 1600), quality: 0.78 },
      { edge: Math.min(cappedMaxEdge, 1280), quality: 0.74 },
    ];

    let bestWebp: Blob | null = null;
    for (const attempt of attempts) {
      const { width: targetW, height: targetH } = computeCloudImageSize(
        decoded.width,
        decoded.height,
        attempt.edge,
      );

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) break;
      ctx.clearRect(0, 0, targetW, targetH);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      decoded.draw(ctx, targetW, targetH);

      const webp = await encodeCanvasBlob(canvas, 'image/webp', attempt.quality);
      canvas.width = 1;
      canvas.height = 1;

      if (webp && webp.type === 'image/webp' && webp.size > 0) {
        bestWebp = webp;
        if (webp.size <= maxBytes) break;
      } else {
        break;
      }
    }
    return bestWebp ?? blob;
  } finally {
    decoded.close();
  }
}

export const optimizeCloudImageBlob = optimizeShareImageBlob;

export function buildItemSubtitle(record: CustomProjectRecord): string {
  if (record.kind === 'packaging' && record.packagingParams) {
    const tpl = getPackagingTemplate(record.packagingParams.templateId);
    const p = record.packagingParams;
    return `${tpl.code} · ${Math.round(p.lengthMm)}×${Math.round(p.widthMm)}×${Math.round(p.heightMm)} mm`;
  }
  const model = getLabModel(record.settings.modelId);
  return `${model.name} (${model.volume})`;
}

/**
 * Package selected local project items into a deduplicated, upload-ready
 * manifest + compressed WebP asset map.
 */
export async function packageProjectsForShare(
  records: readonly CustomProjectRecord[],
  options?: {
    optimizeBlob?: (blob: Blob, kind: 'artwork' | 'thumbnail') => Promise<Blob>;
    onProgress?: (completed: number, total: number) => void;
  },
): Promise<PackagedShareResult> {
  if (records.length === 0) throw new Error('Select at least one item to share.');
  if (records.length > SHARE_LIMITS.maxItems) {
    throw new Error(`You can include at most ${SHARE_LIMITS.maxItems} items in one shared link.`);
  }

  const optimize =
    options?.optimizeBlob ??
    ((blob: Blob, kind: 'artwork' | 'thumbnail') =>
      optimizeShareImageBlob(blob, {
        maxEdge: kind === 'thumbnail' ? CLOUD_MAX_THUMB_EDGE : CLOUD_MAX_IMAGE_EDGE,
        quality: kind === 'thumbnail' ? 0.84 : 0.88,
        maxBytes: kind === 'thumbnail' ? 160 * 1024 : SHARE_LIMITS.maxD1AssetBytes,
      }));

  const assets = new Map<string, Blob>();
  const refCache = new Map<Blob, string>();
  let totalBytes = 0;
  let deduplicatedCount = 0;

  const registerBlob = async (blob: Blob | undefined, kind: 'artwork' | 'thumbnail'): Promise<string | undefined> => {
    if (!blob || blob.size === 0) return undefined;
    const cachedHash = refCache.get(blob);
    if (cachedHash) {
      deduplicatedCount += 1;
      return cachedHash;
    }
    const processed = await optimize(blob, kind);
    if (processed.size > SHARE_LIMITS.maxAssetBytes) {
      throw new Error('One of the artwork images is still too large after compression (max 2 MB).');
    }
    const hash = await hashBlobSha256(processed);
    refCache.set(blob, hash);
    if (assets.has(hash)) {
      deduplicatedCount += 1;
    } else {
      totalBytes += processed.size;
      if (totalBytes > SHARE_LIMITS.maxTotalBytes) {
        throw new Error('Total shared project size exceeds the 12 MB limit. Try fewer items.');
      }
      assets.set(hash, processed);
    }
    return hash;
  };

  const serializeArtworkSnapshot = async (
    artwork: CustomProjectRecord['packagingArtwork'],
  ): Promise<SharedPackagingArtworkRefs | undefined> => {
    if (!artwork) return undefined;
    const outsideDielineHash = await registerBlob(artwork.outsideDielineBlob, 'artwork');
    const insideDielineHash = await registerBlob(artwork.insideDielineBlob, 'artwork');
    const finishMaskHash = await registerBlob(artwork.finishMaskBlob, 'artwork');
    const panelOverlays: Record<string, SharedPanelOverlayRef> = {};
    for (const [key, ov] of Object.entries(artwork.panelOverlays)) {
      const imageHash = await registerBlob(ov.imageBlob, 'artwork');
      if (!imageHash && !ov.fillColor && !ov.text) continue;
      panelOverlays[key] = {
        panelId: ov.panelId,
        surface: ov.surface,
        ...(ov.fillColor ? { fillColor: ov.fillColor } : {}),
        ...(imageHash ? { imageHash } : {}),
        ...(ov.artworkName ? { artworkName: ov.artworkName } : {}),
        ...(ov.fitMode ? { fitMode: ov.fitMode } : {}),
        imageScale: ov.imageScale,
        imageOffsetX: ov.imageOffsetX,
        imageOffsetY: ov.imageOffsetY,
        imageRotationDeg: ov.imageRotationDeg,
        ...(ov.text ? { text: ov.text } : {}),
        ...(ov.textColor ? { textColor: ov.textColor } : {}),
        ...(ov.textSizePct !== undefined ? { textSizePct: ov.textSizePct } : {}),
      };
    }
    if (!outsideDielineHash && !insideDielineHash && !finishMaskHash && Object.keys(panelOverlays).length === 0) {
      return undefined;
    }
    return {
      mode: artwork.mode,
      ...(outsideDielineHash ? { outsideDielineHash } : {}),
      ...(insideDielineHash ? { insideDielineHash } : {}),
      ...(finishMaskHash ? { finishMaskHash } : {}),
      ...(artwork.finishMaskName ? { finishMaskName: artwork.finishMaskName } : {}),
      panelOverlays,
    };
  };

  const items: SharedProjectItemInput[] = [];
  for (let i = 0; i < records.length; i += 1) {
    const rec = records[i];
    const thumbnailHash = await registerBlob(rec.thumbnailBlob, 'thumbnail');
    let payload: SharedItemPayload;

    if (rec.kind === 'packaging' && rec.packagingParams) {
      const packagingArtwork = await serializeArtworkSnapshot(rec.packagingArtwork);

      let packedBottle:
        | {
            modelId: string;
            name?: string;
            settings?: CustomProjectRecord['settings'];
            labelHash?: string;
          }
        | undefined;
      if (rec.bottlePack?.enabled && rec.bottlePack.itemKind !== 'box') {
        const snapshot = rec.packedBottle;
        const labelHash = await registerBlob(snapshot?.labelBlob, 'artwork');
        packedBottle = {
          modelId: snapshot?.modelId ?? rec.bottlePack.modelId,
          ...(snapshot?.name ? { name: snapshot.name } : {}),
          ...(snapshot?.settings ? { settings: snapshot.settings } : {}),
          ...(labelHash ? { labelHash } : {}),
        };
      }

      let packedBox:
        | {
            name?: string;
            packagingParams: NonNullable<CustomProjectRecord['packagingParams']>;
            packagingArtwork?: SharedPackagingArtworkRefs;
          }
        | undefined;
      if (rec.bottlePack?.enabled && rec.bottlePack.itemKind === 'box' && rec.packedBox) {
        const innerArt = await serializeArtworkSnapshot(rec.packedBox.packagingArtwork);
        packedBox = {
          ...(rec.packedBox.name ? { name: rec.packedBox.name } : {}),
          packagingParams: rec.packedBox.packagingParams,
          ...(innerArt ? { packagingArtwork: innerArt } : {}),
        };
      }

      payload = {
        kind: 'packaging',
        settings: rec.settings,
        packagingParams: rec.packagingParams,
        ...(rec.bottlePack ? { bottlePack: rec.bottlePack } : {}),
        ...(packagingArtwork ? { packagingArtwork } : {}),
        ...(packedBottle ? { packedBottle } : {}),
        ...(packedBox ? { packedBox } : {}),
      };
    } else {
      const labelHash = await registerBlob(rec.artworkBlob, 'artwork');
      payload = {
        kind: 'beverage',
        settings: rec.settings,
        ...(labelHash ? { labelHash } : {}),
      };
    }

    items.push({
      id: `item_${rec.id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48)}`,
      name: rec.name,
      kind: rec.kind,
      subtitle: buildItemSubtitle(rec),
      sortOrder: i,
      ...(thumbnailHash ? { thumbnailHash } : {}),
      payload,
    });
    options?.onProgress?.(i + 1, records.length);
  }

  return { items, assets, totalBytes, deduplicatedCount };
}

export function buildShareFormData(
  manifest: Record<string, unknown>,
  assets: Map<string, Blob>,
): FormData {
  const form = new FormData();
  form.set('manifest', JSON.stringify(manifest));
  for (const [hash, blob] of assets.entries()) {
    const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/jpeg' ? 'jpg' : 'webp';
    form.append(`asset:${hash}`, blob, `${hash}.${ext}`);
  }
  return form;
}
