import type { SharedItemPayload, SharedProjectItemInput, SharedProjectItemPublic } from '../share/contracts';

export const CLOUD_PROJECT_LIMITS = Object.freeze({
  retentionDays: 30,
  extensionDays: 30,
  maxProjectsPerUser: 30,
  maxItemsPerProject: 20,
  maxImageEdge: 2048,
  maxThumbnailEdge: 480,
  maxAssetBytes: 2 * 1024 * 1024, // 2 MB per WebP asset
  maxD1AssetBytes: 900 * 1024,
  maxTotalBytes: 12 * 1024 * 1024, // 12 MB per upload request
  maxNameLength: 80,
  maxDescriptionLength: 400,
  maxBrandNameLength: 80,
});

export type CloudProjectItem = SharedProjectItemPublic & {
  updatedAt: string;
};

export type CloudProjectItemInput = SharedProjectItemInput;

export interface CloudProjectSummary {
  id: string;
  name: string;
  description: string;
  brandName: string;
  itemCount: number;
  totalBytes: number;
  autoRenew: boolean;
  renewalCount: number;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  items: CloudProjectItem[];
}

export function computeCloudExpiryIso(baseMs = Date.now(), days = CLOUD_PROJECT_LIMITS.retentionDays): string {
  return new Date(baseMs + days * 86_400_000).toISOString();
}

export function daysRemainingFromIso(expiresAt: string, nowMs = Date.now()): number {
  const diff = Date.parse(expiresAt) - nowMs;
  if (!Number.isFinite(diff) || diff <= 0) return 0;
  return Math.max(1, Math.ceil(diff / 86_400_000));
}

export type CloudProjectPayload = SharedItemPayload;
