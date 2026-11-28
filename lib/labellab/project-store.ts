import { parsePreferences, type ScenePreferences } from './preferences';
import type {
  BottlePackConfig,
  PackagingArtworkState,
  PackagingParams,
  PanelDesignOverlay,
} from '../packaging-cad/types';
import { parseBottlePackConfig, parsePackagingParams } from '../packaging-cad/preferences';
import {
  DEFAULT_PACKABLE_BOX_TEMPLATE_ID,
  isPackableRetailBoxTemplate,
} from '../packaging-cad/pack-layout';
import { createDefaultPackagingParams } from '../packaging-cad/templates/registry';

export type CustomProjectKind = 'beverage' | 'packaging';

export interface PackagingPanelOverlaySnapshot {
  panelId: string;
  surface: 'outside' | 'inside';
  fillColor?: string;
  imageBlob?: Blob;
  artworkId?: string;
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

export interface PackagingArtworkSnapshot {
  mode: 'dieline' | 'panel';
  outsideDielineBlob?: Blob;
  insideDielineBlob?: Blob;
  finishMaskBlob?: Blob;
  finishMaskName?: string;
  panelOverlays: Record<string, PackagingPanelOverlaySnapshot>;
}

export interface PackedBottleSnapshot {
  modelId: string;
  name?: string;
  settings?: ScenePreferences;
  labelBlob?: Blob;
}

/**
 * Self-contained Tier-2 retail box snapshot packed inside a Tier-3 outer tray/carton.
 * Strictly non-recursive: only stores the inner box's closed geometry parameters & artwork.
 */
export interface PackedBoxSnapshot {
  name?: string;
  packagingParams: PackagingParams;
  packagingArtwork?: PackagingArtworkSnapshot;
}

export interface ProjectGroup {
  id: string;
  name: string;
  description?: string;
  brandName?: string;
  createdAt: number;
  updatedAt: number;
  shareId?: string;
  shareToken?: string;
  shareStatus?: 'active' | 'paused' | 'revoked';
  lastSharedAt?: number;
}

export interface CustomProjectRecord {
  id: string;
  name: string;
  kind: CustomProjectKind;
  date: string;
  createdAt: number;
  updatedAt: number;
  /** Parent project collection id so multiple flavors + boxes/trays live in one project. */
  groupId?: string;
  /** Parent project collection display name (cached for quick display & fallback). */
  groupName?: string;
  /** Ordering index inside the parent project collection. */
  sortOrder?: number;
  settings: ScenePreferences;
  /** Optional artwork library id if the project's label came from saved artworks. */
  artworkId?: string;
  /** Self-contained snapshot of the cropped bottle/can label artwork PNG/WebP. */
  artworkBlob?: Blob;
  /** Crisp 3D preview thumbnail captured at save time. */
  thumbnailBlob?: Blob;
  /** Optional packaging snapshot when saved from Boxes & Trays. */
  packagingParams?: PackagingParams;
  bottlePack?: BottlePackConfig;
  /** Self-contained box/tray face artwork & finish mask blobs for reliable reload & 3D sharing. */
  packagingArtwork?: PackagingArtworkSnapshot;
  /** Self-contained snapshot of the packed bottle/can inside a box/tray for reliable 3D sharing. */
  packedBottle?: PackedBottleSnapshot;
  /** Self-contained snapshot of the packed Tier-2 retail box inside a Tier-3 tray/carton. */
  packedBox?: PackedBoxSnapshot;
}

export interface GroupedProject {
  group: ProjectGroup;
  items: CustomProjectRecord[];
}

export const LEGACY_PROJECT_STORAGE_KEY = 'labellab.projects.v1';

const DB_NAME = 'labellab-custom-projects';
const DB_VERSION = 2;
const PROJECTS_STORE = 'projects';
const GROUPS_STORE = 'groups';
const MAX_PROJECTS = 120;

let opening: Promise<IDBDatabase> | undefined;

function storageError(error: unknown, action: string): Error {
  const detail = error instanceof DOMException && error.message ? `: ${error.message}` : '';
  return new Error(`Custom project storage ${action} failed${detail}`);
}

function unavailable(): Error {
  return new Error('Local project storage is unavailable in this browser.');
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validOptionalImageBlob(value: unknown): Blob | undefined {
  if (typeof Blob === 'undefined' || !(value instanceof Blob)) return undefined;
  return value.size > 0 && value.type.startsWith('image/') ? value : undefined;
}

function clampFinite(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function sanitizeProjectName(raw: string, fallback = 'Untitled Project'): string {
  const cleaned = raw.replace(/\s+/g, ' ').trim().slice(0, 80);
  return cleaned || fallback;
}

function parsePackagingArtworkSnapshot(raw: unknown): PackagingArtworkSnapshot | undefined {
  if (!isObject(raw)) return undefined;
  const mode = raw.mode === 'dieline' ? 'dieline' : 'panel';
  const outsideDielineBlob = validOptionalImageBlob(raw.outsideDielineBlob);
  const insideDielineBlob = validOptionalImageBlob(raw.insideDielineBlob);
  const finishMaskBlob = validOptionalImageBlob(raw.finishMaskBlob);
  const finishMaskName =
    typeof raw.finishMaskName === 'string' && raw.finishMaskName.trim()
      ? raw.finishMaskName.trim().slice(0, 120)
      : undefined;
  const panelOverlays: Record<string, PackagingPanelOverlaySnapshot> = {};
  if (isObject(raw.panelOverlays)) {
    for (const [key, value] of Object.entries(raw.panelOverlays)) {
      if (!isObject(value) || typeof value.panelId !== 'string' || !value.panelId) continue;
      const surface = value.surface === 'inside' ? 'inside' : 'outside';
      const imageBlob = validOptionalImageBlob(value.imageBlob);
      const fillColor =
        typeof value.fillColor === 'string' && /^#[0-9a-f]{3,8}$/i.test(value.fillColor.trim())
          ? value.fillColor.trim()
          : undefined;
      const artworkId =
        typeof value.artworkId === 'string' && value.artworkId.trim()
          ? value.artworkId.trim().slice(0, 120)
          : undefined;
      const artworkName =
        typeof value.artworkName === 'string' && value.artworkName.trim()
          ? value.artworkName.trim().slice(0, 120)
          : undefined;
      const fitMode = value.fitMode === 'logo' ? 'logo' : value.fitMode === 'crop' ? 'crop' : undefined;
      const text =
        typeof value.text === 'string' && value.text.trim() ? value.text.trim().slice(0, 160) : undefined;
      const textColor =
        typeof value.textColor === 'string' && /^#[0-9a-f]{3,8}$/i.test(value.textColor.trim())
          ? value.textColor.trim()
          : undefined;
      const textSizePct =
        value.textSizePct !== undefined ? clampFinite(value.textSizePct, 4, 60, 14) : undefined;
      if (!imageBlob && !fillColor && !text) continue;
      panelOverlays[key] = {
        panelId: value.panelId.slice(0, 80),
        surface,
        ...(fillColor ? { fillColor } : {}),
        ...(imageBlob ? { imageBlob } : {}),
        ...(artworkId ? { artworkId } : {}),
        ...(artworkName ? { artworkName } : {}),
        ...(fitMode ? { fitMode } : {}),
        imageScale: clampFinite(value.imageScale, 0.1, 2, 1),
        imageOffsetX: clampFinite(value.imageOffsetX, -0.5, 0.5, 0),
        imageOffsetY: clampFinite(value.imageOffsetY, -0.5, 0.5, 0),
        imageRotationDeg: clampFinite(value.imageRotationDeg, -180, 180, 0),
        ...(text ? { text } : {}),
        ...(textColor ? { textColor } : {}),
        ...(textSizePct !== undefined ? { textSizePct } : {}),
      };
    }
  }
  if (!outsideDielineBlob && !insideDielineBlob && !finishMaskBlob && !Object.keys(panelOverlays).length) {
    return undefined;
  }
  return {
    mode,
    ...(outsideDielineBlob ? { outsideDielineBlob } : {}),
    ...(insideDielineBlob ? { insideDielineBlob } : {}),
    ...(finishMaskBlob ? { finishMaskBlob } : {}),
    ...(finishMaskName ? { finishMaskName } : {}),
    panelOverlays,
  };
}

function parsePackedBottleSnapshot(raw: unknown): PackedBottleSnapshot | undefined {
  if (!isObject(raw) || typeof raw.modelId !== 'string' || !raw.modelId.trim()) return undefined;
  const labelBlob = validOptionalImageBlob(raw.labelBlob);
  const name =
    typeof raw.name === 'string' && raw.name.trim() ? sanitizeProjectName(raw.name) : undefined;
  const settings = isObject(raw.settings) ? parsePreferences(raw.settings) : undefined;
  return {
    modelId: raw.modelId.trim().slice(0, 120),
    ...(name ? { name } : {}),
    ...(settings ? { settings } : {}),
    ...(labelBlob ? { labelBlob } : {}),
  };
}

function parsePackedBoxSnapshot(raw: unknown): PackedBoxSnapshot | undefined {
  if (!isObject(raw) || !isObject(raw.packagingParams)) return undefined;
  const packagingParams = parsePackagingParams(raw.packagingParams);
  if (!isPackableRetailBoxTemplate(packagingParams.templateId)) return undefined;
  const name =
    typeof raw.name === 'string' && raw.name.trim() ? sanitizeProjectName(raw.name) : undefined;
  const packagingArtwork = parsePackagingArtworkSnapshot(raw.packagingArtwork);
  return {
    ...(name ? { name } : {}),
    packagingParams: {
      ...packagingParams,
      foldProgress: 1,
      showDimensions: false,
      showFaceLabels: false,
      showCreaseLines: false,
    },
    ...(packagingArtwork ? { packagingArtwork } : {}),
  };
}

export function parseProjectGroup(raw: unknown): ProjectGroup | null {
  if (!isObject(raw)) return null;
  if (typeof raw.id !== 'string' || !raw.id.trim() || raw.id.length > 100) return null;
  if (typeof raw.name !== 'string') return null;
  const now = Date.now();
  const createdAt =
    typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : now;
  const updatedAt =
    typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : createdAt;
  const description =
    typeof raw.description === 'string' && raw.description.trim()
      ? raw.description.trim().slice(0, 320)
      : undefined;
  const brandName =
    typeof raw.brandName === 'string' && raw.brandName.trim()
      ? raw.brandName.trim().slice(0, 80)
      : undefined;
  const shareId =
    typeof raw.shareId === 'string' && raw.shareId.trim() ? raw.shareId.trim().slice(0, 120) : undefined;
  const shareToken =
    typeof raw.shareToken === 'string' && raw.shareToken.trim()
      ? raw.shareToken.trim().slice(0, 64)
      : undefined;
  const shareStatus =
    raw.shareStatus === 'active' || raw.shareStatus === 'paused' || raw.shareStatus === 'revoked'
      ? raw.shareStatus
      : undefined;
  const lastSharedAt =
    typeof raw.lastSharedAt === 'number' && Number.isFinite(raw.lastSharedAt)
      ? raw.lastSharedAt
      : undefined;

  return {
    id: raw.id.trim(),
    name: sanitizeProjectName(raw.name),
    ...(description ? { description } : {}),
    ...(brandName ? { brandName } : {}),
    createdAt,
    updatedAt,
    ...(shareId ? { shareId } : {}),
    ...(shareToken ? { shareToken } : {}),
    ...(shareStatus ? { shareStatus } : {}),
    ...(lastSharedAt !== undefined ? { lastSharedAt } : {}),
  };
}

export function parseCustomProjectRecord(raw: unknown): CustomProjectRecord | null {
  if (!isObject(raw)) return null;
  if (typeof raw.id !== 'string' || !raw.id || raw.id.length > 100) return null;
  if (typeof raw.name !== 'string') return null;

  const parsedDateMs =
    typeof raw.date === 'string' && Number.isFinite(Date.parse(raw.date))
      ? Date.parse(raw.date)
      : typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt)
        ? raw.updatedAt
        : Date.now();
  const createdAt =
    typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt)
      ? raw.createdAt
      : parsedDateMs;
  const updatedAt =
    typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt)
      ? raw.updatedAt
      : parsedDateMs;
  const kind: CustomProjectKind = raw.kind === 'packaging' ? 'packaging' : 'beverage';
  const settings = parsePreferences(raw.settings);
  const groupId =
    typeof raw.groupId === 'string' && raw.groupId.trim() && raw.groupId.length <= 100
      ? raw.groupId.trim()
      : undefined;
  const groupName =
    typeof raw.groupName === 'string' && raw.groupName.trim()
      ? sanitizeProjectName(raw.groupName)
      : undefined;
  const sortOrder =
    typeof raw.sortOrder === 'number' && Number.isSafeInteger(raw.sortOrder) && raw.sortOrder >= 0
      ? raw.sortOrder
      : undefined;
  const artworkId =
    typeof raw.artworkId === 'string' && raw.artworkId.length > 0 && raw.artworkId.length <= 120
      ? raw.artworkId
      : undefined;
  const artworkBlob = validOptionalImageBlob(raw.artworkBlob);
  const thumbnailBlob = validOptionalImageBlob(raw.thumbnailBlob);
  const packagingParams = isObject(raw.packagingParams)
    ? parsePackagingParams(raw.packagingParams)
    : undefined;
  const bottlePack = isObject(raw.bottlePack)
    ? parseBottlePackConfig(raw.bottlePack)
    : undefined;
  const packagingArtwork = parsePackagingArtworkSnapshot(raw.packagingArtwork);
  const packedBottle = parsePackedBottleSnapshot(raw.packedBottle);
  const packedBox = parsePackedBoxSnapshot(raw.packedBox);

  return {
    id: raw.id,
    name: sanitizeProjectName(raw.name),
    kind,
    date: new Date(updatedAt).toISOString(),
    createdAt,
    updatedAt,
    ...(groupId ? { groupId } : {}),
    ...(groupName ? { groupName } : {}),
    ...(sortOrder !== undefined ? { sortOrder } : {}),
    settings,
    ...(artworkId ? { artworkId } : {}),
    ...(artworkBlob ? { artworkBlob } : {}),
    ...(thumbnailBlob ? { thumbnailBlob } : {}),
    ...(packagingParams ? { packagingParams } : {}),
    ...(bottlePack ? { bottlePack } : {}),
    ...(packagingArtwork ? { packagingArtwork } : {}),
    ...(packedBottle ? { packedBottle } : {}),
    ...(packedBox ? { packedBox } : {}),
  };
}

/**
 * Resolve the parent project group id for any item (backward-compatible with
 * legacy v1 single-item records that had no `groupId`).
 */
export function resolveItemGroupId(item: Pick<CustomProjectRecord, 'id' | 'groupId'>): string {
  return item.groupId || `grp_${item.id}`;
}

/**
 * Group flat saved items into multi-object projects, preserving backward
 * compatibility with single-item v1 records and honoring persisted group metadata.
 */
export function groupCustomProjects(
  items: readonly CustomProjectRecord[],
  groups: readonly ProjectGroup[] = [],
): GroupedProject[] {
  const groupById = new Map<string, ProjectGroup>();
  for (const g of groups) {
    groupById.set(g.id, g);
  }

  const bucket = new Map<string, CustomProjectRecord[]>();
  for (const item of items) {
    const gid = resolveItemGroupId(item);
    const list = bucket.get(gid) ?? [];
    list.push(item);
    bucket.set(gid, list);
  }

  const out: GroupedProject[] = [];
  for (const [gid, list] of bucket.entries()) {
    const sortedItems = [...list].sort((a, b) => {
      const ao = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
      const bo = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return a.createdAt - b.createdAt;
    });
    const storedGroup = groupById.get(gid);
    const createdAt = storedGroup?.createdAt ?? Math.min(...sortedItems.map((i) => i.createdAt));
    const latestItemUpdated = Math.max(...sortedItems.map((i) => i.updatedAt));
    const updatedAt = Math.max(storedGroup?.updatedAt ?? 0, latestItemUpdated);
    const fallbackName = sortedItems[0]?.groupName || sortedItems[0]?.name || 'Untitled Project';
    const group: ProjectGroup = storedGroup
      ? { ...storedGroup, updatedAt }
      : {
          id: gid,
          name: sanitizeProjectName(fallbackName),
          createdAt,
          updatedAt,
        };
    out.push({ group, items: sortedItems });
  }

  return out.sort((a, b) => b.group.updatedAt - a.group.updatedAt);
}

/** Freeze any blob/data URLs inside PackagingArtworkState into real Blobs for IndexedDB & sharing. */
async function fetchUrlAsImageBlob(url?: string): Promise<Blob | undefined> {
  if (!url) return undefined;
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    const blob = await response.blob();
    return blob.size > 0 && blob.type.startsWith('image/') ? blob : undefined;
  } catch {
    return undefined;
  }
}

export async function capturePackagingArtworkSnapshot(
  artwork: PackagingArtworkState,
): Promise<PackagingArtworkSnapshot | undefined> {
  const [outsideDielineBlob, insideDielineBlob, finishMaskBlob] = await Promise.all([
    fetchUrlAsImageBlob(artwork.outsideDielineUrl),
    fetchUrlAsImageBlob(artwork.insideDielineUrl),
    fetchUrlAsImageBlob(artwork.finishMaskUrl),
  ]);
  const panelOverlays: Record<string, PackagingPanelOverlaySnapshot> = {};
  await Promise.all(
    Object.entries(artwork.panelOverlays).map(async ([key, ov]) => {
      const imageBlob = await fetchUrlAsImageBlob(ov.imageUrl);
      if (!imageBlob && !ov.fillColor && !ov.text) return;
      panelOverlays[key] = {
        panelId: ov.panelId,
        surface: ov.surface,
        ...(ov.fillColor ? { fillColor: ov.fillColor } : {}),
        ...(imageBlob ? { imageBlob } : {}),
        ...(ov.artworkId ? { artworkId: ov.artworkId } : {}),
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
    }),
  );
  if (
    !outsideDielineBlob &&
    !insideDielineBlob &&
    !finishMaskBlob &&
    Object.keys(panelOverlays).length === 0
  ) {
    return undefined;
  }
  return {
    mode: artwork.mode,
    ...(outsideDielineBlob ? { outsideDielineBlob } : {}),
    ...(insideDielineBlob ? { insideDielineBlob } : {}),
    ...(finishMaskBlob ? { finishMaskBlob } : {}),
    ...(artwork.finishMaskName ? { finishMaskName: artwork.finishMaskName } : {}),
    panelOverlays,
  };
}

/** Rehydrate a frozen PackagingArtworkSnapshot into live blob URLs for PackagingSubjectController. */
export function hydratePackagingArtworkSnapshot(
  snapshot: PackagingArtworkSnapshot,
): PackagingArtworkState {
  const panelOverlays: Record<string, PanelDesignOverlay> = {};
  for (const [key, ov] of Object.entries(snapshot.panelOverlays)) {
    const imageUrl = ov.imageBlob ? URL.createObjectURL(ov.imageBlob) : undefined;
    panelOverlays[key] = {
      panelId: ov.panelId,
      surface: ov.surface,
      ...(ov.fillColor ? { fillColor: ov.fillColor } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      ...(ov.artworkId ? { artworkId: ov.artworkId } : {}),
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
  return {
    mode: snapshot.mode,
    ...(snapshot.outsideDielineBlob ? { outsideDielineUrl: URL.createObjectURL(snapshot.outsideDielineBlob) } : {}),
    ...(snapshot.insideDielineBlob ? { insideDielineUrl: URL.createObjectURL(snapshot.insideDielineBlob) } : {}),
    ...(snapshot.finishMaskBlob ? { finishMaskUrl: URL.createObjectURL(snapshot.finishMaskBlob) } : {}),
    ...(snapshot.finishMaskName ? { finishMaskName: snapshot.finishMaskName } : {}),
    panelOverlays,
  };
}

export async function capturePackedBottleSnapshot(
  bottlePack: BottlePackConfig,
  customBottle: CustomProjectRecord | undefined,
  effectiveLabelUrl: string | undefined,
  fallbackSettings?: ScenePreferences,
): Promise<PackedBottleSnapshot | undefined> {
  if (!bottlePack.enabled || bottlePack.itemKind === 'box') return undefined;
  const labelBlob =
    (await fetchUrlAsImageBlob(effectiveLabelUrl)) ?? customBottle?.artworkBlob;
  const settings = customBottle?.settings ?? fallbackSettings;
  return {
    modelId: customBottle?.settings.modelId ?? bottlePack.modelId,
    ...(customBottle?.name ? { name: customBottle.name } : {}),
    ...(settings ? { settings: { ...settings } } : {}),
    ...(labelBlob ? { labelBlob } : {}),
  };
}

export async function capturePackedBoxSnapshot(
  bottlePack: BottlePackConfig,
  customBoxProject: CustomProjectRecord | undefined,
  hydratedArtwork?: PackagingArtworkState,
): Promise<PackedBoxSnapshot | undefined> {
  if (!bottlePack.enabled || bottlePack.itemKind !== 'box') return undefined;
  const rawParams =
    customBoxProject?.packagingParams ??
    createDefaultPackagingParams(
      bottlePack.boxTemplateId && isPackableRetailBoxTemplate(bottlePack.boxTemplateId)
        ? bottlePack.boxTemplateId
        : DEFAULT_PACKABLE_BOX_TEMPLATE_ID,
    );
  if (!isPackableRetailBoxTemplate(rawParams.templateId)) return undefined;
  const packagingArtwork =
    customBoxProject?.packagingArtwork ??
    (hydratedArtwork ? await capturePackagingArtworkSnapshot(hydratedArtwork) : undefined);
  return {
    ...(customBoxProject?.name ? { name: customBoxProject.name } : {}),
    packagingParams: {
      ...rawParams,
      foldProgress: 1,
      showDimensions: false,
      showFaceLabels: false,
      showCreaseLines: false,
    },
    ...(packagingArtwork ? { packagingArtwork } : {}),
  };
}

export function readLegacyLocalStorageProjects(
  storage?: Pick<Storage, 'getItem'>,
): CustomProjectRecord[] {
  try {
    const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    const rawStr = target?.getItem(LEGACY_PROJECT_STORAGE_KEY);
    if (!rawStr) return [];
    const parsed: unknown = JSON.parse(rawStr);
    if (!Array.isArray(parsed)) return [];
    const out: CustomProjectRecord[] = [];
    for (const item of parsed.slice(0, MAX_PROJECTS)) {
      const rec = parseCustomProjectRecord(item);
      if (rec) out.push(rec);
    }
    return out;
  } catch {
    return [];
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (opening) return opening;
  if (typeof indexedDB === 'undefined') return Promise.reject(unavailable());
  opening = new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest;
    let rejected = false;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(storageError(error, 'open'));
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
        db.createObjectStore(PROJECTS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(GROUPS_STORE)) {
        db.createObjectStore(GROUPS_STORE, { keyPath: 'id' });
      }
    };
    request.onblocked = () => {
      rejected = true;
      reject(new Error('Custom project storage is blocked by another open tab.'));
    };
    request.onerror = () => reject(storageError(request.error, 'open'));
    request.onsuccess = () => {
      const db = request.result;
      if (rejected) {
        db.close();
        return;
      }
      db.onversionchange = () => {
        db.close();
        if (opening) opening = undefined;
      };
      resolve(db);
    };
  });
  opening = opening.catch((error) => {
    opening = undefined;
    throw error;
  });
  return opening;
}

export async function listProjectGroups(): Promise<ProjectGroup[]> {
  try {
    const db = await openDatabase();
    return await new Promise<ProjectGroup[]>((resolve, reject) => {
      try {
        const tx = db.transaction([GROUPS_STORE], 'readonly');
        const req = tx.objectStore(GROUPS_STORE).getAll();
        let rows: unknown[] = [];
        req.onsuccess = () => {
          rows = Array.isArray(req.result) ? req.result : [];
        };
        req.onerror = () => reject(storageError(req.error, 'read'));
        tx.oncomplete = () => {
          resolve(
            rows
              .map(parseProjectGroup)
              .filter((item): item is ProjectGroup => item !== null)
              .sort((a, b) => b.updatedAt - a.updatedAt),
          );
        };
        tx.onerror = () => reject(storageError(tx.error, 'read'));
        tx.onabort = () => reject(storageError(tx.error, 'read'));
      } catch (error) {
        reject(storageError(error, 'read'));
      }
    });
  } catch {
    return [];
  }
}

export async function saveProjectGroup(group: ProjectGroup): Promise<ProjectGroup> {
  const parsed = parseProjectGroup(group);
  if (!parsed) throw new Error('Invalid project group record.');
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction([GROUPS_STORE], 'readwrite');
      tx.objectStore(GROUPS_STORE).put(parsed);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(storageError(tx.error, 'save'));
      tx.onabort = () => reject(storageError(tx.error, 'save'));
    } catch (error) {
      reject(storageError(error, 'save'));
    }
  });
  return parsed;
}

export async function deleteProjectGroupRecord(groupId: string): Promise<void> {
  if (!groupId) return;
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction([GROUPS_STORE], 'readwrite');
        tx.objectStore(GROUPS_STORE).delete(groupId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(storageError(tx.error, 'delete'));
        tx.onabort = () => reject(storageError(tx.error, 'delete'));
      } catch (error) {
        reject(storageError(error, 'delete'));
      }
    });
  } catch {
    // Ignore when group store wasn't populated.
  }
}

export async function listCustomProjects(
  kind?: CustomProjectKind,
): Promise<CustomProjectRecord[]> {
  let idbRecords: CustomProjectRecord[] = [];
  let idbAvailable = true;
  try {
    const db = await openDatabase();
    idbRecords = await new Promise<CustomProjectRecord[]>((resolve, reject) => {
      try {
        const tx = db.transaction([PROJECTS_STORE], 'readonly');
        const req = tx.objectStore(PROJECTS_STORE).getAll();
        let rows: unknown[] = [];
        req.onsuccess = () => {
          rows = Array.isArray(req.result) ? req.result : [];
        };
        req.onerror = () => reject(storageError(req.error, 'read'));
        tx.oncomplete = () => {
          const valid = rows
            .map(parseCustomProjectRecord)
            .filter((item): item is CustomProjectRecord => item !== null);
          resolve(valid);
        };
        tx.onerror = () => reject(storageError(tx.error, 'read'));
        tx.onabort = () => reject(storageError(tx.error, 'read'));
      } catch (error) {
        reject(storageError(error, 'read'));
      }
    });
  } catch {
    idbAvailable = false;
  }

  const legacy = readLegacyLocalStorageProjects();
  const byId = new Map<string, CustomProjectRecord>();
  for (const rec of legacy) byId.set(rec.id, rec);
  for (const rec of idbRecords) byId.set(rec.id, rec);

  const merged = [...byId.values()]
    .filter((rec) => (kind ? rec.kind === kind : true))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_PROJECTS);

  if (!idbAvailable && !merged.length) {
    return [];
  }
  return merged;
}

export async function saveCustomProject(record: CustomProjectRecord): Promise<CustomProjectRecord> {
  const parsed = parseCustomProjectRecord(record);
  if (!parsed) throw new Error('Invalid custom project record.');
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction([PROJECTS_STORE], 'readwrite');
      tx.objectStore(PROJECTS_STORE).put(parsed);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(storageError(tx.error, 'save'));
      tx.onabort = () => reject(storageError(tx.error, 'save'));
    } catch (error) {
      reject(storageError(error, 'save'));
    }
  });
  return parsed;
}

export async function deleteCustomProject(id: string): Promise<void> {
  if (typeof id !== 'string' || !id) throw new Error('Invalid custom project id.');
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction([PROJECTS_STORE], 'readwrite');
        tx.objectStore(PROJECTS_STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(storageError(tx.error, 'delete'));
        tx.onabort = () => reject(storageError(tx.error, 'delete'));
      } catch (error) {
        reject(storageError(error, 'delete'));
      }
    });
  } catch {
    // Continue to clean legacy storage too.
  }
  try {
    const legacy = readLegacyLocalStorageProjects().filter((item) => item.id !== id);
    window.localStorage.setItem(
      LEGACY_PROJECT_STORAGE_KEY,
      JSON.stringify(
        legacy.map(({ id: pid, name, date, settings }) => ({ id: pid, name, date, settings })),
      ),
    );
  } catch {
    // Ignore restricted localStorage.
  }
}
