import type {
  CloudProjectItem,
  CloudProjectSummary,
} from '../projects/contracts';
import {
  collectPayloadAssetHashes,
  type SharedProjectItemInput,
} from '../share/contracts';
import type {
  CustomProjectRecord,
  GroupedProject,
  PackagingArtworkSnapshot,
  PackagingPanelOverlaySnapshot,
} from './project-store';
import {
  buildShareFormData,
  packageProjectsForShare,
} from './share-packager';

export type StudioProjectSource = 'cloud' | 'local';

export interface StudioProjectCollection {
  id: string;
  source: StudioProjectSource;
  name: string;
  description: string;
  brandName: string;
  updatedAt: number;
  createdAt: number;
  /** Cloud-only retention & auto-renew metadata */
  expiresAt?: string;
  autoRenew?: boolean;
  renewalCount?: number;
  totalBytes?: number;
  /** Cloud items (lightweight metadata; blobs fetched lazily on open) */
  cloudItems?: CloudProjectItem[];
  /** Local items (full records with inline blobs) */
  localGroup?: GroupedProject;
}

export function cloudProjectAssetUrl(projectId: string, hash: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(hash)}`;
}

export async function fetchUserCloudProjects(): Promise<{
  authenticated: boolean;
  projects: CloudProjectSummary[];
  extendCost?: number;
}> {
  const res = await fetch('/api/projects', { credentials: 'same-origin', cache: 'no-store' });
  if (res.status === 401 || res.status === 403) {
    return { authenticated: false, projects: [] };
  }
  if (!res.ok) {
    throw new Error('Could not load cloud projects.');
  }
  const payload = (await res.json().catch(() => null)) as {
    projects?: CloudProjectSummary[];
    extendCost?: number;
  } | null;
  return {
    authenticated: true,
    projects: Array.isArray(payload?.projects) ? payload.projects : [],
    extendCost: typeof payload?.extendCost === 'number' ? payload.extendCost : undefined,
  };
}

export async function saveRecordToCloudProject(input: {
  record: CustomProjectRecord;
  cloudProjectId?: string;
  cloudItemId?: string;
  projectName: string;
  autoRenew?: boolean;
}): Promise<{ project: CloudProjectSummary; savedItemId: string }> {
  const packaged = await packageProjectsForShare([input.record]);
  const itemInput: SharedProjectItemInput = {
    ...packaged.items[0],
    id: input.cloudItemId,
  };

  const manifest: Record<string, unknown> = {
    ...(input.cloudProjectId ? { projectId: input.cloudProjectId } : {}),
    name: input.projectName,
    ...(typeof input.autoRenew === 'boolean' ? { autoRenew: input.autoRenew } : {}),
    items: [itemInput],
  };

  const form = buildShareFormData(manifest, packaged.assets);
  const res = await fetch('/api/projects', {
    method: 'POST',
    credentials: 'same-origin',
    body: form,
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error('AUTH_REQUIRED');
  }

  const payload = (await res.json().catch(() => null)) as {
    project?: CloudProjectSummary;
    savedItemIds?: string[];
    error?: string;
  } | null;
  if (!res.ok || !payload?.project) {
    throw new Error(payload?.error || 'SAVE_FAILED');
  }
  return {
    project: payload.project,
    savedItemId: payload.savedItemIds?.[0] ?? payload.project.items[payload.project.items.length - 1]?.id ?? '',
  };
}

export async function migrateLocalGroupToCloud(
  grouped: GroupedProject,
  autoRenew = false,
): Promise<CloudProjectSummary> {
  const packaged = await packageProjectsForShare(grouped.items);
  const items = packaged.items.map((item) => ({ ...item, id: undefined }));
  const manifest: Record<string, unknown> = {
    name: grouped.group.name,
    description: grouped.group.description ?? '',
    brandName: grouped.group.brandName ?? '',
    autoRenew,
    items,
  };
  const form = buildShareFormData(manifest, packaged.assets);
  const res = await fetch('/api/projects', {
    method: 'POST',
    credentials: 'same-origin',
    body: form,
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error('AUTH_REQUIRED');
  }
  const payload = (await res.json().catch(() => null)) as {
    project?: CloudProjectSummary;
    error?: string;
  } | null;
  if (!res.ok || !payload?.project) {
    throw new Error(payload?.error || 'MIGRATE_FAILED');
  }
  return payload.project;
}

export async function patchCloudProject(
  projectId: string,
  patch: { name?: string; description?: string; brandName?: string; autoRenew?: boolean },
): Promise<CloudProjectSummary> {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (res.status === 401 || res.status === 403) throw new Error('AUTH_REQUIRED');
  const payload = (await res.json().catch(() => null)) as { project?: CloudProjectSummary; error?: string } | null;
  if (!res.ok || !payload?.project) throw new Error(payload?.error || 'UPDATE_FAILED');
  return payload.project;
}

export async function extendCloudProjectApi(
  projectId: string,
): Promise<{ project: CloudProjectSummary; chargedCoins: number }> {
  const idempotencyKey = `reserve_${crypto.randomUUID().replaceAll('-', '')}`;
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/extend`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idempotencyKey }),
  });
  if (res.status === 401 || res.status === 403) throw new Error('AUTH_REQUIRED');
  const payload = (await res.json().catch(() => null)) as {
    project?: CloudProjectSummary;
    chargedCoins?: number;
    error?: string;
  } | null;
  if (!res.ok || !payload?.project) throw new Error(payload?.error || 'EXTEND_FAILED');
  return {
    project: payload.project,
    chargedCoins: Number(payload.chargedCoins ?? 0),
  };
}

export async function deleteCloudProjectApi(projectId: string): Promise<void> {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  });
  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || 'DELETE_FAILED');
  }
}

export async function deleteCloudProjectItemApi(
  projectId: string,
  itemId: string,
): Promise<{ projectDeleted: boolean; project: CloudProjectSummary | null }> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/items/${encodeURIComponent(itemId)}`,
    {
      method: 'DELETE',
      credentials: 'same-origin',
    },
  );
  const payload = (await res.json().catch(() => null)) as {
    projectDeleted?: boolean;
    project?: CloudProjectSummary | null;
    error?: string;
  } | null;
  if (!res.ok || !payload) throw new Error(payload?.error || 'DELETE_FAILED');
  return {
    projectDeleted: Boolean(payload.projectDeleted),
    project: payload.project ?? null,
  };
}

async function fetchCloudAssetBlob(projectId: string, hash: string): Promise<Blob | undefined> {
  try {
    const res = await fetch(cloudProjectAssetUrl(projectId, hash), { credentials: 'same-origin' });
    if (!res.ok) return undefined;
    const blob = await res.blob();
    return blob.size > 0 ? blob : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Hydrate a lightweight cloud project item into a full in-memory CustomProjectRecord
 * by fetching only the WebP assets referenced by that item.
 */
export async function hydrateCloudItemToRecord(
  project: CloudProjectSummary,
  item: CloudProjectItem,
): Promise<CustomProjectRecord> {
  const hashes = collectPayloadAssetHashes([item]);
  const blobMap = new Map<string, Blob>();
  await Promise.all(
    hashes.map(async (hash) => {
      const blob = await fetchCloudAssetBlob(project.id, hash);
      if (blob) blobMap.set(hash, blob);
    }),
  );

  const updatedMs = Date.parse(item.updatedAt) || Date.now();
  const thumbnailBlob = item.thumbnailHash ? blobMap.get(item.thumbnailHash) : undefined;

  if (item.payload.kind === 'packaging') {
    const rawArt = item.payload.packagingArtwork;
    let packagingArtwork: PackagingArtworkSnapshot | undefined;
    if (rawArt) {
      const panelOverlays: Record<string, PackagingPanelOverlaySnapshot> = {};
      for (const [key, ov] of Object.entries(rawArt.panelOverlays)) {
        panelOverlays[key] = {
          panelId: ov.panelId,
          surface: ov.surface,
          ...(ov.fillColor ? { fillColor: ov.fillColor } : {}),
          ...(ov.imageHash && blobMap.get(ov.imageHash) ? { imageBlob: blobMap.get(ov.imageHash) } : {}),
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
      packagingArtwork = {
        mode: rawArt.mode,
        ...(rawArt.outsideDielineHash && blobMap.get(rawArt.outsideDielineHash)
          ? { outsideDielineBlob: blobMap.get(rawArt.outsideDielineHash) }
          : {}),
        ...(rawArt.insideDielineHash && blobMap.get(rawArt.insideDielineHash)
          ? { insideDielineBlob: blobMap.get(rawArt.insideDielineHash) }
          : {}),
        ...(rawArt.finishMaskHash && blobMap.get(rawArt.finishMaskHash)
          ? { finishMaskBlob: blobMap.get(rawArt.finishMaskHash) }
          : {}),
        ...(rawArt.finishMaskName ? { finishMaskName: rawArt.finishMaskName } : {}),
        panelOverlays,
      };
    }

    const rawPacked = item.payload.packedBottle;
    const packedBottle = rawPacked
      ? {
          modelId: rawPacked.modelId,
          ...(rawPacked.name ? { name: rawPacked.name } : {}),
          ...(rawPacked.settings ? { settings: rawPacked.settings } : {}),
          ...(rawPacked.labelHash && blobMap.get(rawPacked.labelHash)
            ? { labelBlob: blobMap.get(rawPacked.labelHash) }
            : {}),
        }
      : undefined;

    return {
      id: item.id,
      name: item.name,
      kind: 'packaging',
      date: item.updatedAt,
      createdAt: updatedMs,
      updatedAt: updatedMs,
      groupId: project.id,
      groupName: project.name,
      sortOrder: item.sortOrder,
      settings: item.payload.settings,
      ...(thumbnailBlob ? { thumbnailBlob } : {}),
      packagingParams: item.payload.packagingParams,
      ...(item.payload.bottlePack ? { bottlePack: item.payload.bottlePack } : {}),
      ...(packagingArtwork ? { packagingArtwork } : {}),
      ...(packedBottle ? { packedBottle } : {}),
    };
  }

  const labelBlob = item.payload.labelHash ? blobMap.get(item.payload.labelHash) : undefined;
  return {
    id: item.id,
    name: item.name,
    kind: 'beverage',
    date: item.updatedAt,
    createdAt: updatedMs,
    updatedAt: updatedMs,
    groupId: project.id,
    groupName: project.name,
    sortOrder: item.sortOrder,
    settings: item.payload.settings,
    ...(labelBlob ? { artworkBlob: labelBlob } : {}),
    ...(thumbnailBlob ? { thumbnailBlob } : {}),
  };
}
