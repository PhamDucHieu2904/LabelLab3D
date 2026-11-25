import type { ArtworkDieline, ArtworkTransform } from './artwork-transform';
import { validArtworkTransform } from './artwork-transform';

export type StoredArtwork = {
  id: string;
  name: string;
  source: Blob;
  preview: Blob;
  width: number;
  height: number;
  transform: ArtworkTransform;
  dieline: ArtworkDieline;
  /** Optional isolation namespace so bottle labels and each box face keep independent histories. */
  scope?: string;
  createdAt: number;
  updatedAt: number;
};

export function bottleArtworkScope(modelId: string): string {
  return `bottle:${modelId}`;
}

export function packagingFaceArtworkScope(
  templateId: string,
  surface: 'outside' | 'inside',
  panelId: string,
): string {
  return `packaging:${templateId}:${surface}:${panelId}`;
}

export function packagingTemplateScopePrefix(templateId: string): string {
  return `packaging:${templateId}:`;
}

type SelectionRecord = { modelId: string; artworkId: string };

const DB_NAME = 'labellab-artwork-library';
const DB_VERSION = 1;
const ARTWORKS_STORE = 'artworks';
const SELECTIONS_STORE = 'selections';

let opening: Promise<IDBDatabase> | undefined;

function storageError(error: unknown, action: string): Error {
  const detail = error instanceof DOMException && error.message ? `: ${error.message}` : '';
  return new Error(`Local artwork storage ${action} failed${detail}`);
}

function unavailable(): Error {
  return new Error('Local artwork storage is unavailable in this browser.');
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function validBlob(value: unknown): value is Blob {
  return typeof Blob !== 'undefined' && value instanceof Blob && value.size > 0 && value.type.startsWith('image/');
}

function validRecord(value: unknown): value is StoredArtwork {
  if (!isObject(value)) return false;
  return typeof value.id === 'string' && value.id.length > 0
    && typeof value.name === 'string'
    && validBlob(value.source) && validBlob(value.preview)
    && typeof value.width === 'number' && Number.isFinite(value.width) && value.width > 0 && value.width <= 100000000
    && typeof value.height === 'number' && Number.isFinite(value.height) && value.height > 0 && value.height <= 100000000
    && validArtworkTransform(value.transform)
    && isObject(value.dieline) && typeof value.dieline.width === 'number' && Number.isFinite(value.dieline.width) && value.dieline.width > 0
    && typeof value.dieline.height === 'number' && Number.isFinite(value.dieline.height) && value.dieline.height > 0
    && (value.dieline.unit === undefined || value.dieline.unit === 'mm')
    && (value.scope === undefined || (typeof value.scope === 'string' && value.scope.length > 0 && value.scope.length <= 160))
    && typeof value.createdAt === 'number' && typeof value.updatedAt === 'number' && Number.isFinite(value.createdAt) && Number.isFinite(value.updatedAt);
}

function validSelection(value: unknown): value is SelectionRecord {
  return isObject(value) && typeof value.modelId === 'string' && value.modelId.length > 0
    && typeof value.artworkId === 'string' && value.artworkId.length > 0;
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
      if (!db.objectStoreNames.contains(ARTWORKS_STORE)) {
        db.createObjectStore(ARTWORKS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SELECTIONS_STORE)) {
        db.createObjectStore(SELECTIONS_STORE, { keyPath: 'modelId' });
      }
    };
    request.onblocked = () => { rejected = true; reject(new Error('Local artwork storage is blocked by another open tab.')); };
    request.onerror = () => reject(storageError(request.error, 'open'));
    request.onsuccess = () => {
      const db = request.result;
      if (rejected) { db.close(); return; }
      db.onversionchange = () => { db.close(); if (opening) opening = undefined; };
      resolve(db);
    };
  });
  opening = opening.catch(error => {
    opening = undefined;
    throw error;
  });
  return opening;
}

export async function listArtworks(scope?: string): Promise<StoredArtwork[]> {
  if (scope !== undefined && (typeof scope !== 'string' || !scope)) {
    throw new Error('Invalid artwork scope.');
  }
  const db = await openDatabase();
  return new Promise<StoredArtwork[]>((resolve, reject) => {
    try {
      const tx = db.transaction([ARTWORKS_STORE], 'readonly');
      const request = tx.objectStore(ARTWORKS_STORE).getAll();
      let records: unknown[] = [];
      request.onsuccess = () => { records = Array.isArray(request.result) ? request.result : []; };
      request.onerror = () => reject(storageError(request.error, 'read'));
      tx.oncomplete = () => {
        const valid = records.filter(validRecord);
        const filtered = scope === undefined
          ? valid
          : valid.filter(record => record.scope === scope);
        resolve(filtered.sort((a, b) => b.updatedAt - a.updatedAt));
      };
      tx.onerror = () => reject(storageError(tx.error, 'read'));
      tx.onabort = () => reject(storageError(tx.error, 'read'));
    } catch (error) { reject(storageError(error, 'read')); }
  });
}

export async function getArtworkById(id: string): Promise<StoredArtwork | undefined> {
  if (typeof id !== 'string' || !id) return undefined;
  const db = await openDatabase();
  return new Promise<StoredArtwork | undefined>((resolve, reject) => {
    try {
      const tx = db.transaction([ARTWORKS_STORE], 'readonly');
      const req = tx.objectStore(ARTWORKS_STORE).get(id);
      let result: StoredArtwork | undefined;
      req.onsuccess = () => {
        result = validRecord(req.result) ? req.result : undefined;
      };
      req.onerror = () => reject(storageError(req.error, 'read'));
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(storageError(tx.error, 'read'));
      tx.onabort = () => reject(storageError(tx.error, 'read'));
    } catch (error) { reject(storageError(error, 'read')); }
  });
}

export async function getArtworkSelectionsByPrefix(prefix: string): Promise<Record<string, string>> {
  if (typeof prefix !== 'string' || !prefix) return {};
  const db = await openDatabase();
  return new Promise<Record<string, string>>((resolve, reject) => {
    try {
      const tx = db.transaction([SELECTIONS_STORE], 'readonly');
      const req = tx.objectStore(SELECTIONS_STORE).getAll();
      let rows: unknown[] = [];
      req.onsuccess = () => { rows = Array.isArray(req.result) ? req.result : []; };
      req.onerror = () => reject(storageError(req.error, 'read'));
      tx.oncomplete = () => {
        const result: Record<string, string> = {};
        for (const row of rows) {
          if (validSelection(row) && row.modelId.startsWith(prefix)) {
            result[row.modelId] = row.artworkId;
          }
        }
        resolve(result);
      };
      tx.onerror = () => reject(storageError(tx.error, 'read'));
      tx.onabort = () => reject(storageError(tx.error, 'read'));
    } catch (error) { reject(storageError(error, 'read')); }
  });
}

export async function clearArtworkSelectionsByPrefix(prefix: string): Promise<void> {
  if (typeof prefix !== 'string' || !prefix) return;
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction([SELECTIONS_STORE], 'readwrite');
      const cursorReq = tx.objectStore(SELECTIONS_STORE).openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) return;
        if (validSelection(cursor.value) && cursor.value.modelId.startsWith(prefix)) {
          cursor.delete();
        }
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(storageError(tx.error, 'delete'));
      tx.onabort = () => reject(storageError(tx.error, 'delete'));
    } catch (error) { reject(storageError(error, 'delete')); }
  });
}
export async function saveArtwork(record: StoredArtwork): Promise<void> {
  if (!validRecord(record)) throw new Error('Invalid artwork record.');
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction([ARTWORKS_STORE], 'readwrite');
      tx.objectStore(ARTWORKS_STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(storageError(tx.error, 'save'));
      tx.onabort = () => reject(storageError(tx.error, 'save'));
    } catch (error) { reject(storageError(error, 'save')); }
  });
}

export async function deleteArtwork(id: string): Promise<void> {
  if (typeof id !== 'string' || !id) throw new Error('Invalid artwork id.');
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction([ARTWORKS_STORE, SELECTIONS_STORE], 'readwrite');
      tx.objectStore(ARTWORKS_STORE).delete(id);
      const cursorRequest = tx.objectStore(SELECTIONS_STORE).openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        if (validSelection(cursor.value) && cursor.value.artworkId === id) cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(storageError(tx.error, 'delete'));
      tx.onabort = () => reject(storageError(tx.error, 'delete'));
    } catch (error) { reject(storageError(error, 'delete')); }
  });
}

export async function getArtworkSelection(modelId: string): Promise<string | undefined> {
  if (typeof modelId !== 'string' || !modelId) throw new Error('Invalid model id.');
  const db = await openDatabase();
  return new Promise<string | undefined>((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction([SELECTIONS_STORE], 'readonly');
      const req = tx.objectStore(SELECTIONS_STORE).get(modelId);
      let result: string | undefined;
      req.onsuccess = () => { const value = req.result; result = validSelection(value) ? value.artworkId : undefined; };
      req.onerror = () => reject(storageError(req.error, 'read'));
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(storageError(tx.error, 'read'));
      tx.onabort = () => reject(storageError(tx.error, 'read'));
    } catch (error) { reject(storageError(error, 'read')); }
  });
}

export async function setArtworkSelection(modelId: string, id?: string): Promise<void> {
  if (typeof modelId !== 'string' || !modelId || (id !== undefined && (typeof id !== 'string' || !id))) {
    throw new Error('Invalid artwork selection.');
  }
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction([SELECTIONS_STORE], 'readwrite');
      const store = tx.objectStore(SELECTIONS_STORE);
      if (id === undefined) store.delete(modelId);
      else store.put({ modelId, artworkId: id });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(storageError(tx.error, 'selection'));
      tx.onabort = () => reject(storageError(tx.error, 'selection'));
    } catch (error) { reject(storageError(error, 'selection')); }
  });
}






