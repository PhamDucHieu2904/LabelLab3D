import { SHARE_LIMITS } from "@/lib/share/contracts";
import { nowIso, requireDb, type AppEnv } from "./db";

export type StoredShareAsset = {
  contentHash: string;
  mimeType: string;
  byteSize: number;
  bytes: Uint8Array;
};

/** Inspect binary magic bytes to enforce real WebP/PNG images only (never SVG/HTML/JS). */
export function detectSafeImageMime(bytes: Uint8Array): "image/webp" | "image/png" | "image/jpeg" | null {
  if (bytes.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  // WebP: RIFF....WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  return null;
}

/**
 * Inspect binary image headers (WebP VP8/VP8L/VP8X, PNG IHDR, JPEG SOF)
 * without external decoders so Cloudflare Workers can enforce max 2048px
 * uploads server-side.
 */
export function inspectImageDimensions(
  bytes: Uint8Array,
  mimeType: "image/webp" | "image/png" | "image/jpeg",
): { width: number; height: number } | null {
  try {
    if (mimeType === "image/png" && bytes.length >= 24) {
      const width =
        ((bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]) >>> 0;
      const height =
        ((bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]) >>> 0;
      if (width > 0 && height > 0) return { width, height };
      return null;
    }

    if (mimeType === "image/webp" && bytes.length >= 30) {
      const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
      if (chunk === "VP8X") {
        const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
        const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
        if (width > 0 && height > 0) return { width, height };
      } else if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
        const width = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
        const height = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
        if (width > 0 && height > 0) return { width, height };
      } else if (chunk === "VP8L" && bytes[20] === 0x2f) {
        const bits =
          (bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24)) >>> 0;
        const width = (bits & 0x3fff) + 1;
        const height = ((bits >>> 14) & 0x3fff) + 1;
        if (width > 0 && height > 0) return { width, height };
      }
      return null;
    }

    if (mimeType === "image/jpeg") {
      let offset = 2;
      while (offset + 9 < bytes.length) {
        if (bytes[offset] !== 0xff) break;
        while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
        if (offset >= bytes.length) break;
        const marker = bytes[offset];
        offset += 1;
        if (marker === 0xd9 || marker === 0xda) break;
        if (offset + 2 > bytes.length) break;
        const length = (bytes[offset] << 8) | bytes[offset + 1];
        if (length < 2 || offset + length > bytes.length) break;
        const isSof =
          (marker >= 0xc0 && marker <= 0xc3) ||
          (marker >= 0xc5 && marker <= 0xc7) ||
          (marker >= 0xc9 && marker <= 0xcb) ||
          (marker >= 0xcd && marker <= 0xcf);
        if (isSof && length >= 7) {
          const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
          const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
          if (width > 0 && height > 0) return { width, height };
          return null;
        }
        offset += length;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy);
  const view = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < view.length; i += 1) {
    hex += view[i].toString(16).padStart(2, "0");
  }
  return hex;
}

function extensionForMime(mime: "image/webp" | "image/png" | "image/jpeg"): string {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg") return "jpg";
  return "webp";
}

function toUint8Array(raw: unknown): Uint8Array | null {
  if (!raw) return null;
  if (raw instanceof Uint8Array) return raw;
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  if (Array.isArray(raw)) return Uint8Array.from(raw);
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(raw)) {
    return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  }
  return null;
}

/**
 * Store a verified image blob once (content-addressed by SHA-256) or increment
 * `ref_count` when already present. Uses Cloudflare R2 (`env.SHARE_BUCKET`)
 * when bound, falling back transparently to `shared_asset_blobs` in D1.
 */
export async function putShareAsset(
  env: AppEnv,
  input: {
    bytes: Uint8Array;
    expectedHash?: string;
    width?: number;
    height?: number;
    maxEdge?: number;
  },
): Promise<{ contentHash: string; mimeType: string; byteSize: number; deduplicated: boolean }> {
  const bytes = input.bytes;
  if (bytes.byteLength === 0 || bytes.byteLength > SHARE_LIMITS.maxAssetBytes) {
    throw new Error("INVALID_INPUT");
  }
  const mimeType = detectSafeImageMime(bytes);
  if (!mimeType) {
    throw new Error("INVALID_INPUT");
  }
  const detectedDims = inspectImageDimensions(bytes, mimeType);
  const maxEdge = input.maxEdge ?? 2048;
  if (detectedDims && maxEdge > 0 && (detectedDims.width > maxEdge || detectedDims.height > maxEdge)) {
    throw new Error("IMAGE_TOO_LARGE");
  }
  const contentHash = await sha256Hex(bytes);
  if (input.expectedHash && input.expectedHash.toLowerCase() !== contentHash) {
    throw new Error("INVALID_INPUT");
  }

  const db = requireDb(env);
  const existing = await db
    .prepare("SELECT content_hash AS contentHash, mime_type AS mimeType, byte_size AS byteSize FROM shared_assets WHERE content_hash=?")
    .bind(contentHash)
    .first<{ contentHash: string; mimeType: string; byteSize: number }>();

  if (existing) {
    await db
      .prepare("UPDATE shared_assets SET ref_count=ref_count+1 WHERE content_hash=?")
      .bind(contentHash)
      .run();
    return {
      contentHash,
      mimeType: existing.mimeType,
      byteSize: Number(existing.byteSize),
      deduplicated: true,
    };
  }

  const useR2 = Boolean(env.SHARE_BUCKET);
  if (!useR2 && bytes.byteLength > SHARE_LIMITS.maxD1AssetBytes) {
    throw new Error("ASSET_TOO_LARGE");
  }

  const createdAt = nowIso();
  const width = detectedDims?.width ?? (Number.isSafeInteger(input.width) && (input.width ?? 0) > 0 ? input.width! : 0);
  const height = detectedDims?.height ?? (Number.isSafeInteger(input.height) && (input.height ?? 0) > 0 ? input.height! : 0);

  if (useR2 && env.SHARE_BUCKET) {
    const r2Key = `shares/${contentHash}.${extensionForMime(mimeType)}`;
    await env.SHARE_BUCKET.put(r2Key, bytes, { httpMetadata: { contentType: mimeType } });
    await db
      .prepare(
        "INSERT INTO shared_assets (content_hash, mime_type, byte_size, width, height, storage_backend, r2_key, ref_count, created_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(content_hash) DO UPDATE SET ref_count=shared_assets.ref_count+1",
      )
      .bind(contentHash, mimeType, bytes.byteLength, width, height, "r2", r2Key, 1, createdAt)
      .run();
  } else {
    await db.batch([
      db
        .prepare(
          "INSERT INTO shared_assets (content_hash, mime_type, byte_size, width, height, storage_backend, r2_key, ref_count, created_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(content_hash) DO UPDATE SET ref_count=shared_assets.ref_count+1",
        )
        .bind(contentHash, mimeType, bytes.byteLength, width, height, "d1", null, 1, createdAt),
      db
        .prepare("INSERT OR IGNORE INTO shared_asset_blobs (content_hash, data) VALUES (?,?)")
        .bind(contentHash, bytes),
    ]);
  }

  return {
    contentHash,
    mimeType,
    byteSize: bytes.byteLength,
    deduplicated: false,
  };
}

/** Increment ref_count for an already-stored asset hash (e.g. during re-sync). */
export async function retainExistingShareAssets(env: AppEnv, hashes: readonly string[]): Promise<Set<string>> {
  const retained = new Set<string>();
  if (!hashes.length) return retained;
  const db = requireDb(env);
  for (const hash of hashes) {
    if (!/^[a-f0-9]{64}$/i.test(hash)) continue;
    const normalized = hash.toLowerCase();
    const res = await db
      .prepare("UPDATE shared_assets SET ref_count=ref_count+1 WHERE content_hash=?")
      .bind(normalized)
      .run();
    if ((res.meta?.changes as number | undefined) === 1) {
      retained.add(normalized);
    }
  }
  return retained;
}

export async function getShareAsset(env: AppEnv, contentHash: string): Promise<StoredShareAsset | null> {
  if (!/^[a-f0-9]{64}$/i.test(contentHash)) return null;
  const normalized = contentHash.toLowerCase();
  const db = requireDb(env);
  const meta = await db
    .prepare(
      "SELECT content_hash AS contentHash, mime_type AS mimeType, byte_size AS byteSize, storage_backend AS storageBackend, r2_key AS r2Key FROM shared_assets WHERE content_hash=?",
    )
    .bind(normalized)
    .first<{
      contentHash: string;
      mimeType: string;
      byteSize: number;
      storageBackend: "r2" | "d1";
      r2Key: string | null;
    }>();
  if (!meta) return null;

  if (meta.storageBackend === "r2" && meta.r2Key && env.SHARE_BUCKET) {
    const obj = await env.SHARE_BUCKET.get(meta.r2Key);
    if (!obj) return null;
    const bytes = new Uint8Array(await obj.arrayBuffer());
    return {
      contentHash: meta.contentHash,
      mimeType: meta.mimeType,
      byteSize: bytes.byteLength,
      bytes,
    };
  }

  const blobRow = await db
    .prepare("SELECT data FROM shared_asset_blobs WHERE content_hash=?")
    .bind(normalized)
    .first<{ data: unknown }>();
  const bytes = toUint8Array(blobRow?.data);
  if (!bytes) return null;
  return {
    contentHash: meta.contentHash,
    mimeType: meta.mimeType,
    byteSize: bytes.byteLength,
    bytes,
  };
}

async function countLiveAssetReferences(env: AppEnv, contentHash: string): Promise<number> {
  const db = requireDb(env);
  let total = 0;
  try {
    const shareRow = await db
      .prepare(
        "SELECT COUNT(*) AS count FROM shared_project_items WHERE thumbnail_hash=? OR instr(payload_json, ?) > 0",
      )
      .bind(contentHash, contentHash)
      .first<{ count: number }>();
    total += Number(shareRow?.count ?? 0);
  } catch {
    // shared_project_items may not exist yet in isolated asset-only tests.
  }
  try {
    const cloudRow = await db
      .prepare(
        "SELECT COUNT(*) AS count FROM cloud_project_items WHERE thumbnail_hash=? OR instr(payload_json, ?) > 0",
      )
      .bind(contentHash, contentHash)
      .first<{ count: number }>();
    total += Number(cloudRow?.count ?? 0);
  } catch {
    // cloud_project_items may not exist yet in share-only databases/tests.
  }
  return total;
}

async function deleteStoredAssetRow(
  env: AppEnv,
  row: { contentHash: string; storageBackend: "r2" | "d1"; r2Key: string | null },
): Promise<void> {
  const db = requireDb(env);
  if (row.storageBackend === "r2" && row.r2Key && env.SHARE_BUCKET) {
    await env.SHARE_BUCKET.delete(row.r2Key).catch(() => {});
  }
  await db.batch([
    db.prepare("DELETE FROM shared_asset_blobs WHERE content_hash=?").bind(row.contentHash),
    db.prepare("DELETE FROM shared_assets WHERE content_hash=?").bind(row.contentHash),
  ]);
}

/**
 * Reconcile live references across `cloud_project_items` & `shared_project_items`
 * and garbage-collect truly unreferenced assets from R2 & D1 (`shared_assets` +
 * cascading `shared_asset_blobs`).
 *
 * Checking live references instead of blindly decrementing `ref_count - 1` prevents
 * both permanent orphan leaks (when an asset was saved across separate requests for
 * items in the same project) and premature deletion (when deleting one item whose
 * artwork is still referenced by another item in the same project).
 */
export async function releaseShareAssets(env: AppEnv, hashes: readonly string[]): Promise<void> {
  if (!hashes.length) return;
  const db = requireDb(env);
  const unique = [...new Set(hashes.map((h) => h.toLowerCase()).filter((h) => /^[a-f0-9]{64}$/.test(h)))];
  for (const hash of unique) {
    const row = await db
      .prepare(
        "SELECT content_hash AS contentHash, storage_backend AS storageBackend, r2_key AS r2Key FROM shared_assets WHERE content_hash=?",
      )
      .bind(hash)
      .first<{ contentHash: string; storageBackend: "r2" | "d1"; r2Key: string | null }>();
    if (!row) continue;

    const liveRefs = await countLiveAssetReferences(env, hash);
    if (liveRefs > 0) {
      await db
        .prepare("UPDATE shared_assets SET ref_count=? WHERE content_hash=?")
        .bind(liveRefs, hash)
        .run();
      continue;
    }

    await deleteStoredAssetRow(env, row);
  }
}

/**
 * Opportunistic garbage collector for any historical orphaned rows in `shared_assets`
 * (and their R2 objects / `shared_asset_blobs`) that are no longer referenced by any
 * cloud project or share link. Enforces a grace age (`minAgeMs`, default 10 minutes)
 * so in-flight uploads that have not yet committed their item rows are never touched.
 */
export async function pruneOrphanShareAssets(
  env: AppEnv,
  options?: { limit?: number; minAgeMs?: number; nowMs?: number },
): Promise<number> {
  const db = requireDb(env);
  const nowMs = options?.nowMs ?? Date.now();
  const minAgeMs = Math.max(0, options?.minAgeMs ?? 10 * 60_000);
  const cutoffIso = new Date(nowMs - minAgeMs).toISOString();
  const limit = Math.max(1, Math.min(100, options?.limit ?? 20));

  type OrphanRow = { contentHash: string; storageBackend: "r2" | "d1"; r2Key: string | null };
  let rows: OrphanRow[] = [];

  try {
    const res = await db
      .prepare(
        `SELECT a.content_hash AS contentHash, a.storage_backend AS storageBackend, a.r2_key AS r2Key
         FROM shared_assets a
         WHERE a.created_at <= ?
           AND NOT EXISTS (
             SELECT 1 FROM shared_project_items si
             WHERE si.thumbnail_hash = a.content_hash OR instr(si.payload_json, a.content_hash) > 0
           )
           AND NOT EXISTS (
             SELECT 1 FROM cloud_project_items ci
             WHERE ci.thumbnail_hash = a.content_hash OR instr(ci.payload_json, a.content_hash) > 0
           )
         ORDER BY a.created_at ASC
         LIMIT ?`,
      )
      .bind(cutoffIso, limit)
      .all<OrphanRow>();
    rows = res.results ?? [];
  } catch {
    try {
      const res = await db
        .prepare(
          `SELECT a.content_hash AS contentHash, a.storage_backend AS storageBackend, a.r2_key AS r2Key
           FROM shared_assets a
           WHERE a.created_at <= ?
             AND NOT EXISTS (
               SELECT 1 FROM shared_project_items si
               WHERE si.thumbnail_hash = a.content_hash OR instr(si.payload_json, a.content_hash) > 0
             )
           ORDER BY a.created_at ASC
           LIMIT ?`,
        )
        .bind(cutoffIso, limit)
        .all<OrphanRow>();
      rows = res.results ?? [];
    } catch {
      return 0;
    }
  }

  let deleted = 0;
  for (const row of rows) {
    await deleteStoredAssetRow(env, row);
    deleted += 1;
  }
  return deleted;
}
