import type { ScenePreferences } from '../labellab/preferences';
import type { BottlePackConfig, PackagingParams } from '../packaging-cad/types';

export const SHARE_LIMITS = Object.freeze({
  maxItems: 15,
  maxAssetBytes: 2 * 1024 * 1024, // 2 MB per WebP/PNG image (R2)
  maxD1AssetBytes: 900 * 1024, // 900 KB safety ceiling when falling back to D1 blobs
  maxTotalBytes: 12 * 1024 * 1024, // 12 MB per upload request
  maxActiveSharesPerUser: 20,
  maxTitleLength: 100,
  maxDescriptionLength: 400,
  maxBrandNameLength: 80,
  maxItemNameLength: 80,
  minPasscodeLength: 4,
  maxPasscodeLength: 32,
  maxExpiryDays: 30,
});

export type ShareStatus = 'active' | 'paused' | 'revoked';
export type ShareExpiryPreset = '1d' | '7d' | '14d' | '30d';

export interface SharedProjectOptions {
  allowFold: boolean;
  allowDimensions: boolean;
  allowBgSwitch: boolean;
  defaultItemId?: string;
}

export const DEFAULT_SHARED_PROJECT_OPTIONS: SharedProjectOptions = Object.freeze({
  allowFold: true,
  allowDimensions: true,
  allowBgSwitch: true,
});

export interface SharedPanelOverlayRef {
  panelId: string;
  surface: 'outside' | 'inside';
  fillColor?: string;
  imageHash?: string;
  artworkName?: string;
  fitMode?: 'logo' | 'crop';
  imageScale: number;
  imageOffsetX: number;
  imageOffsetY: number;
  imageRotationDeg: number;
  text?: string;
  textColor?: string;
  textSizePct?: number;
}

export interface SharedPackagingArtworkRefs {
  mode: 'dieline' | 'panel';
  outsideDielineHash?: string;
  insideDielineHash?: string;
  finishMaskHash?: string;
  finishMaskName?: string;
  panelOverlays: Record<string, SharedPanelOverlayRef>;
}

export interface SharedPackedBottlePayload {
  modelId: string;
  name?: string;
  settings?: ScenePreferences;
  labelHash?: string;
}

export interface SharedPackedBoxPayload {
  name?: string;
  packagingParams: PackagingParams;
  packagingArtwork?: SharedPackagingArtworkRefs;
}

export interface SharedBeverageItemPayload {
  kind: 'beverage';
  settings: ScenePreferences;
  labelHash?: string;
}

export interface SharedPackagingItemPayload {
  kind: 'packaging';
  settings: ScenePreferences;
  packagingParams: PackagingParams;
  bottlePack?: BottlePackConfig;
  packagingArtwork?: SharedPackagingArtworkRefs;
  packedBottle?: SharedPackedBottlePayload;
  packedBox?: SharedPackedBoxPayload;
}

export type SharedItemPayload = SharedBeverageItemPayload | SharedPackagingItemPayload;

export interface SharedProjectItemInput {
  id?: string;
  name: string;
  kind: 'beverage' | 'packaging';
  subtitle: string;
  sortOrder: number;
  thumbnailHash?: string;
  payload: SharedItemPayload;
}

export interface SharedProjectItemPublic {
  id: string;
  name: string;
  kind: 'beverage' | 'packaging';
  subtitle: string;
  sortOrder: number;
  thumbnailHash?: string;
  payload: SharedItemPayload;
}

export interface SharedProjectSummary {
  id: string;
  token: string;
  localProjectId?: string;
  title: string;
  description: string;
  brandName: string;
  hasPasscode: boolean;
  status: ShareStatus;
  options: SharedProjectOptions;
  itemCount: number;
  totalBytes: number;
  viewCount: number;
  lastViewedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PublicSharedProjectResponse =
  | {
      state: 'ready';
      share: {
        token: string;
        title: string;
        description: string;
        brandName: string;
        options: SharedProjectOptions;
        itemCount: number;
        expiresAt: string | null;
        updatedAt: string;
      };
      items: SharedProjectItemPublic[];
    }
  | {
      state: 'locked';
      share: {
        token: string;
        title: string;
        brandName: string;
        itemCount: number;
      };
    }
  | {
      state: 'expired' | 'paused' | 'revoked' | 'not_found';
    };

export function collectPayloadAssetHashes(
  items: ReadonlyArray<{ thumbnailHash?: string; payload: SharedItemPayload }>,
): string[] {
  const hashes = new Set<string>();
  const add = (hash?: string) => {
    if (hash && /^[a-f0-9]{64}$/i.test(hash)) hashes.add(hash.toLowerCase());
  };
  for (const item of items) {
    add(item.thumbnailHash);
    if (item.payload.kind === 'beverage') {
      add(item.payload.labelHash);
    } else {
      add(item.payload.packedBottle?.labelHash);
      const collectArtworkHashes = (art?: SharedPackagingArtworkRefs) => {
        if (!art) return;
        add(art.outsideDielineHash);
        add(art.insideDielineHash);
        add(art.finishMaskHash);
        for (const ov of Object.values(art.panelOverlays)) {
          add(ov.imageHash);
        }
      };
      collectArtworkHashes(item.payload.packagingArtwork);
      collectArtworkHashes(item.payload.packedBox?.packagingArtwork);
    }
  }
  return [...hashes];
}

export function computeExpiryIso(preset: ShareExpiryPreset, nowMs = Date.now()): string {
  const days =
    preset === '1d'
      ? 1
      : preset === '7d'
        ? 7
        : preset === '14d'
          ? 14
          : SHARE_LIMITS.maxExpiryDays;
  return new Date(nowMs + days * 86_400_000).toISOString();
}
