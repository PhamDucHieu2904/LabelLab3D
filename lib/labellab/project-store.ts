import { parsePreferences, type ScenePreferences } from './preferences';
import type { BottlePackConfig, PackagingParams } from '../packaging-cad/types';
import { parseBottlePackConfig, parsePackagingParams } from '../packaging-cad/preferences';

export type CustomProjectKind = 'beverage' | 'packaging';

export interface CustomProjectRecord {
  id: string;
  name: string;
  kind: CustomProjectKind;
  date: string;
  createdAt: number;
  updatedAt: number;
  settings: ScenePreferences;
  /** Optional artwork library id if the project's label came from saved artworks. */
  artworkId?: string;
  /** Self-contained snapshot of the cropped bottle/can label artwork PNG. */
  artworkBlob?: Blob;
  /** Crisp 3D preview thumbnail captured at save time. */
  thumbnailBlob?: Blob;
  /** Optional packaging snapshot when saved from Boxes & Trays. */
  packagingParams?: PackagingParams;
  bottlePack?: BottlePackConfig;
}

export const LEGACY_PROJECT_STORAGE_KEY = 'labellab.projects.v1';

const DB_NAME = 'labellab-custom-projects';
const DB_VERSION = 1;
const PROJECTS_STORE = 'projects';
const MAX_PROJECTS = 60;

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

export function sanitizeProjectName(raw: string, fallback = 'Untitled Project'): string {
  const cleaned = raw.replace(/\s+/g, ' ').trim().slice(0, 80);
  return cleaned || fallback;
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

  return {
    id: raw.id,
    name: sanitizeProjectName(raw.name),
    kind,
    date: new Date(updatedAt).toISOString(),
    createdAt,
    updatedAt,
    settings,
    ...(artworkId ? { artworkId } : {}),
    ...(artworkBlob ? { artworkBlob } : {}),
    ...(thumbnailBlob ? { thumbnailBlob } : {}),
    ...(packagingParams ? { packagingParams } : {}),
    ...(bottlePack ? { bottlePack } : {}),
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

  // Seamlessly fold in any legacy localStorage projects not yet in IndexedDB.
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
