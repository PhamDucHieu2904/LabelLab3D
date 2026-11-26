import { parsePreferences } from "@/lib/labellab/preferences";
import { parseBottlePackConfig, parsePackagingParams } from "@/lib/packaging-cad/preferences";
import {
  collectPayloadAssetHashes,
  DEFAULT_SHARED_PROJECT_OPTIONS,
  SHARE_LIMITS,
  type PublicSharedProjectResponse,
  type SharedItemPayload,
  type SharedPackagingArtworkRefs,
  type SharedPanelOverlayRef,
  type SharedProjectItemInput,
  type SharedProjectItemPublic,
  type SharedProjectOptions,
  type SharedProjectSummary,
  type ShareStatus,
} from "@/lib/share/contracts";
import {
  base64Url,
  base64UrlBytes,
  constantTimeEqual,
  nowIso,
  randomId,
  requireDb,
  type AppEnv,
} from "./db";
import {
  putShareAsset,
  releaseShareAssets,
  retainExistingShareAssets,
} from "./share-assets";

const PASSCODE_ITERATIONS = 100_000;
const encoder = new TextEncoder();
const tableReady = new WeakSet<object>();

export async function ensureShareTables(env: AppEnv) {
  const db = requireDb(env);
  if (tableReady.has(db)) return db;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS shared_projects (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      local_project_id TEXT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      brand_name TEXT NOT NULL DEFAULT '',
      passcode_hash TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','revoked')),
      options_json TEXT NOT NULL DEFAULT '{}',
      item_count INTEGER NOT NULL DEFAULT 0 CHECK (item_count >= 0),
      total_bytes INTEGER NOT NULL DEFAULT 0 CHECK (total_bytes >= 0),
      view_count INTEGER NOT NULL DEFAULT 0 CHECK (view_count >= 0),
      last_viewed_at TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS shared_projects_user_time ON shared_projects(user_id, updated_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS shared_projects_token ON shared_projects(token)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS shared_project_items (
      id TEXT PRIMARY KEY,
      share_id TEXT NOT NULL REFERENCES shared_projects(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('beverage','packaging')),
      subtitle TEXT NOT NULL DEFAULT '',
      thumbnail_hash TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS shared_project_items_order ON shared_project_items(share_id, sort_order)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS shared_assets (
      content_hash TEXT PRIMARY KEY,
      mime_type TEXT NOT NULL,
      byte_size INTEGER NOT NULL CHECK (byte_size > 0),
      width INTEGER NOT NULL DEFAULT 0,
      height INTEGER NOT NULL DEFAULT 0,
      storage_backend TEXT NOT NULL CHECK (storage_backend IN ('r2','d1')),
      r2_key TEXT,
      ref_count INTEGER NOT NULL DEFAULT 1 CHECK (ref_count >= 0),
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS shared_asset_blobs (
      content_hash TEXT PRIMARY KEY REFERENCES shared_assets(content_hash) ON DELETE CASCADE,
      data BLOB NOT NULL
    )`),
  ]);
  tableReady.add(db);
  return db;
}

export function generateShareToken(): string {
  const bytes = new Uint8Array(12); // 96 bits of cryptographic entropy -> 16 base64url chars
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function derivePasscodeBits(passcode: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(passcode), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations, hash: "SHA-256" },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashSharePasscode(passcode: string): Promise<string> {
  const clean = passcode.trim();
  if (clean.length < SHARE_LIMITS.minPasscodeLength || clean.length > SHARE_LIMITS.maxPasscodeLength) {
    throw new Error("INVALID_INPUT");
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePasscodeBits(clean, salt, PASSCODE_ITERATIONS);
  return `share-pbkdf2$${PASSCODE_ITERATIONS}$${base64Url(salt)}$${base64Url(hash)}`;
}

export async function verifySharePasscode(passcode: string, encoded: string): Promise<boolean> {
  const clean = typeof passcode === "string" ? passcode.trim() : "";
  if (clean.length < SHARE_LIMITS.minPasscodeLength || clean.length > SHARE_LIMITS.maxPasscodeLength) {
    return false;
  }
  try {
    const [alg, iterText, saltText, digestText] = encoded.split("$");
    const iterations = Number(iterText);
    if (alg !== "share-pbkdf2" || !Number.isSafeInteger(iterations) || iterations < 100_000 || iterations > 500_000) {
      return false;
    }
    const salt = base64UrlBytes(saltText);
    if (salt.length < 16) return false;
    const actual = base64Url(await derivePasscodeBits(clean, salt, iterations));
    return constantTimeEqual(actual, digestText);
  } catch {
    return false;
  }
}

export function shareUnlockCookieName(token: string): string {
  const safe = token.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24);
  return `hm_su_${safe}`;
}

function unlockSigningSecret(env: AppEnv): string {
  const secret =
    (typeof env.SHARE_UNLOCK_SECRET === "string" && env.SHARE_UNLOCK_SECRET) ||
    (typeof env.NEXTAUTH_SECRET === "string" && env.NEXTAUTH_SECRET) ||
    (typeof env.GOOGLE_CLIENT_SECRET === "string" && env.GOOGLE_CLIENT_SECRET) ||
    "hypermockup-share-unlock-v1-key";
  return secret;
}

async function hmacSign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return base64Url(new Uint8Array(sig));
}

export async function signShareUnlockCookie(
  env: AppEnv,
  token: string,
  passcodeHash: string,
): Promise<string> {
  const epoch = Math.floor(Date.now() / 1000);
  const fingerprint = passcodeHash.slice(-16);
  const payload = `${token}.${fingerprint}.${epoch}`;
  const sig = await hmacSign(unlockSigningSecret(env), payload);
  return `${epoch}.${sig}`;
}

export async function verifyShareUnlockCookie(
  env: AppEnv,
  token: string,
  passcodeHash: string | null,
  cookieValue: string | null | undefined,
): Promise<boolean> {
  if (!passcodeHash) return true;
  if (!cookieValue) return false;
  const parts = cookieValue.split(".");
  if (parts.length !== 2) return false;
  const epoch = Number(parts[0]);
  const sig = parts[1];
  if (!Number.isSafeInteger(epoch) || !sig) return false;
  // Unlock cookie valid for 7 days
  if (Date.now() / 1000 - epoch > 7 * 86400) return false;
  const fingerprint = passcodeHash.slice(-16);
  const expected = await hmacSign(unlockSigningSecret(env), `${token}.${fingerprint}.${epoch}`);
  return constantTimeEqual(sig, expected);
}

function sanitizeText(raw: unknown, maxLen: number, fallback = ""): string {
  if (typeof raw !== "string") return fallback;
  return raw.replace(/\s+/g, " ").trim().slice(0, maxLen) || fallback;
}

function sanitizeHash(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const clean = raw.trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(clean) ? clean : undefined;
}

function sanitizeOptions(raw: unknown): SharedProjectOptions {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SHARED_PROJECT_OPTIONS };
  const obj = raw as Record<string, unknown>;
  const defaultItemId =
    typeof obj.defaultItemId === "string" && obj.defaultItemId.trim()
      ? obj.defaultItemId.trim().slice(0, 100)
      : undefined;
  return {
    allowFold: obj.allowFold !== false,
    allowDimensions: obj.allowDimensions !== false,
    allowBgSwitch: obj.allowBgSwitch !== false,
    ...(defaultItemId ? { defaultItemId } : {}),
  };
}

function sanitizePackagingArtworkRefs(raw: unknown): SharedPackagingArtworkRefs | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;
  const mode = obj.mode === "dieline" ? "dieline" : "panel";
  const outsideDielineHash = sanitizeHash(obj.outsideDielineHash);
  const insideDielineHash = sanitizeHash(obj.insideDielineHash);
  const finishMaskHash = sanitizeHash(obj.finishMaskHash);
  const finishMaskName = sanitizeText(obj.finishMaskName, 120) || undefined;
  const panelOverlays: Record<string, SharedPanelOverlayRef> = {};
  if (obj.panelOverlays && typeof obj.panelOverlays === "object" && !Array.isArray(obj.panelOverlays)) {
    for (const [key, value] of Object.entries(obj.panelOverlays as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const ov = value as Record<string, unknown>;
      const panelId = sanitizeText(ov.panelId, 80);
      if (!panelId) continue;
      const surface = ov.surface === "inside" ? "inside" : "outside";
      const imageHash = sanitizeHash(ov.imageHash);
      const fillColor =
        typeof ov.fillColor === "string" && /^#[0-9a-f]{3,8}$/i.test(ov.fillColor.trim())
          ? ov.fillColor.trim()
          : undefined;
      const text = sanitizeText(ov.text, 160) || undefined;
      if (!imageHash && !fillColor && !text) continue;
      const num = (v: unknown, min: number, max: number, fb: number) => {
        const n = Number(v);
        return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fb;
      };
      panelOverlays[key.slice(0, 100)] = {
        panelId,
        surface,
        ...(fillColor ? { fillColor } : {}),
        ...(imageHash ? { imageHash } : {}),
        ...(sanitizeText(ov.artworkName, 120) ? { artworkName: sanitizeText(ov.artworkName, 120) } : {}),
        ...(ov.fitMode === "logo" || ov.fitMode === "crop" ? { fitMode: ov.fitMode } : {}),
        imageScale: num(ov.imageScale, 0.1, 2, 1),
        imageOffsetX: num(ov.imageOffsetX, -0.5, 0.5, 0),
        imageOffsetY: num(ov.imageOffsetY, -0.5, 0.5, 0),
        imageRotationDeg: num(ov.imageRotationDeg, -180, 180, 0),
        ...(text ? { text } : {}),
        ...(typeof ov.textColor === "string" && /^#[0-9a-f]{3,8}$/i.test(ov.textColor.trim())
          ? { textColor: ov.textColor.trim() }
          : {}),
        ...(ov.textSizePct !== undefined ? { textSizePct: num(ov.textSizePct, 4, 60, 14) } : {}),
      };
    }
  }
  if (!outsideDielineHash && !insideDielineHash && !finishMaskHash && !Object.keys(panelOverlays).length) {
    return undefined;
  }
  return {
    mode,
    ...(outsideDielineHash ? { outsideDielineHash } : {}),
    ...(insideDielineHash ? { insideDielineHash } : {}),
    ...(finishMaskHash ? { finishMaskHash } : {}),
    ...(finishMaskName ? { finishMaskName } : {}),
    panelOverlays,
  };
}

function sanitizeItemInput(raw: unknown, index: number): SharedProjectItemInput {
  if (!raw || typeof raw !== "object") throw new Error("INVALID_INPUT");
  const obj = raw as Record<string, unknown>;
  const kind = obj.kind === "packaging" ? "packaging" : obj.kind === "beverage" ? "beverage" : null;
  if (!kind) throw new Error("INVALID_INPUT");
  const name = sanitizeText(obj.name, SHARE_LIMITS.maxItemNameLength, `Item ${index + 1}`);
  const subtitle = sanitizeText(obj.subtitle, 140);
  const sortOrder = Number.isSafeInteger(Number(obj.sortOrder)) && Number(obj.sortOrder) >= 0 ? Number(obj.sortOrder) : index;
  const thumbnailHash = sanitizeHash(obj.thumbnailHash);
  const rawPayload = obj.payload as Record<string, unknown> | undefined;
  if (!rawPayload || typeof rawPayload !== "object") throw new Error("INVALID_INPUT");

  let payload: SharedItemPayload;
  if (kind === "beverage") {
    const labelHash = sanitizeHash(rawPayload.labelHash);
    payload = {
      kind: "beverage",
      settings: parsePreferences(rawPayload.settings),
      ...(labelHash ? { labelHash } : {}),
    };
  } else {
    const packagingParams = parsePackagingParams(rawPayload.packagingParams);
    const bottlePack =
      rawPayload.bottlePack && typeof rawPayload.bottlePack === "object"
        ? parseBottlePackConfig(rawPayload.bottlePack)
        : undefined;
    const packagingArtwork = sanitizePackagingArtworkRefs(rawPayload.packagingArtwork);
    const rawPacked = rawPayload.packedBottle as Record<string, unknown> | undefined;
    const packedBottle =
      rawPacked && typeof rawPacked === "object" && typeof rawPacked.modelId === "string" && rawPacked.modelId.trim()
        ? {
            modelId: rawPacked.modelId.trim().slice(0, 120),
            ...(sanitizeText(rawPacked.name, 80) ? { name: sanitizeText(rawPacked.name, 80) } : {}),
            ...(rawPacked.settings && typeof rawPacked.settings === "object"
              ? { settings: parsePreferences(rawPacked.settings) }
              : {}),
            ...(sanitizeHash(rawPacked.labelHash) ? { labelHash: sanitizeHash(rawPacked.labelHash) } : {}),
          }
        : undefined;
    payload = {
      kind: "packaging",
      settings: parsePreferences(rawPayload.settings),
      packagingParams,
      ...(bottlePack ? { bottlePack } : {}),
      ...(packagingArtwork ? { packagingArtwork } : {}),
      ...(packedBottle ? { packedBottle } : {}),
    };
  }

  return {
    id: typeof obj.id === "string" && /^[A-Za-z0-9_-]{4,80}$/.test(obj.id) ? obj.id : undefined,
    name,
    kind,
    subtitle,
    sortOrder,
    ...(thumbnailHash ? { thumbnailHash } : {}),
    payload,
  };
}

function sanitizeExpiresAt(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw !== "string") throw new Error("INVALID_INPUT");
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) throw new Error("INVALID_INPUT");
  // Clamp expiry between +1 hour and +365 days
  const now = Date.now();
  if (ms < now + 3_600_000 || ms > now + 366 * 86_400_000) {
    throw new Error("INVALID_INPUT");
  }
  return new Date(ms).toISOString();
}

export interface UploadedShareAssetInput {
  expectedHash: string;
  bytes: Uint8Array;
  width?: number;
  height?: number;
}

export interface CreateSharedProjectInput {
  localProjectId?: string;
  title: string;
  description?: string;
  brandName?: string;
  passcode?: string;
  expiresAt?: string | null;
  options?: Partial<SharedProjectOptions>;
  items: unknown[];
  assets: UploadedShareAssetInput[];
}

export interface UpdateSharedProjectInput {
  title?: string;
  description?: string;
  brandName?: string;
  /** undefined = keep existing passcode, "" / null = remove passcode, string = set new passcode */
  passcode?: string | null;
  status?: ShareStatus;
  expiresAt?: string | null;
  options?: Partial<SharedProjectOptions>;
  items?: unknown[];
  assets?: UploadedShareAssetInput[];
}

type ShareRow = {
  id: string;
  token: string;
  userId: string;
  localProjectId: string | null;
  title: string;
  description: string;
  brandName: string;
  passcodeHash: string | null;
  status: ShareStatus;
  optionsJson: string;
  itemCount: number;
  totalBytes: number;
  viewCount: number;
  lastViewedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function rowToSummary(row: ShareRow): SharedProjectSummary {
  let options: SharedProjectOptions = { ...DEFAULT_SHARED_PROJECT_OPTIONS };
  try {
    options = sanitizeOptions(JSON.parse(row.optionsJson));
  } catch {
    // Keep defaults.
  }
  return {
    id: row.id,
    token: row.token,
    ...(row.localProjectId ? { localProjectId: row.localProjectId } : {}),
    title: row.title,
    description: row.description,
    brandName: row.brandName,
    hasPasscode: Boolean(row.passcodeHash),
    status: row.status,
    options,
    itemCount: Number(row.itemCount ?? 0),
    totalBytes: Number(row.totalBytes ?? 0),
    viewCount: Number(row.viewCount ?? 0),
    lastViewedAt: row.lastViewedAt ?? null,
    expiresAt: row.expiresAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function readOwnedAssetHashes(env: AppEnv, userId: string): Promise<Set<string>> {
  const db = requireDb(env);
  const owned = new Set<string>();
  const addRows = (rows: readonly { thumbnailHash: string | null; payloadJson: string }[]) => {
    const parsed: Array<{ thumbnailHash?: string; payload: SharedItemPayload }> = [];
    for (const row of rows) {
      try {
        const payload = JSON.parse(row.payloadJson) as SharedItemPayload;
        if (payload && (payload.kind === "beverage" || payload.kind === "packaging")) {
          parsed.push({
            ...(row.thumbnailHash ? { thumbnailHash: row.thumbnailHash } : {}),
            payload,
          });
        }
      } catch {
        // Ignore malformed row.
      }
    }
    for (const h of collectPayloadAssetHashes(parsed)) owned.add(h);
  };

  const shareRows = await db
    .prepare(
      "SELECT i.thumbnail_hash AS thumbnailHash, i.payload_json AS payloadJson FROM shared_project_items i INNER JOIN shared_projects s ON s.id=i.share_id WHERE s.user_id=?",
    )
    .bind(userId)
    .all<{ thumbnailHash: string | null; payloadJson: string }>();
  addRows(shareRows.results ?? []);

  try {
    const cloudRows = await db
      .prepare(
        "SELECT i.thumbnail_hash AS thumbnailHash, i.payload_json AS payloadJson FROM cloud_project_items i INNER JOIN cloud_projects p ON p.id=i.project_id WHERE p.user_id=?",
      )
      .bind(userId)
      .all<{ thumbnailHash: string | null; payloadJson: string }>();
    addRows(cloudRows.results ?? []);
  } catch {
    // cloud_projects tables may not exist yet in isolated share-only test DBs.
  }

  return owned;
}

async function storeAndVerifyAssets(
  env: AppEnv,
  userId: string,
  items: readonly SharedProjectItemInput[],
  uploaded: readonly UploadedShareAssetInput[],
): Promise<{ storedHashes: string[]; totalBytes: number }> {
  const requiredHashes = collectPayloadAssetHashes(items);
  const uploadedByHash = new Map<string, UploadedShareAssetInput>();
  let uploadTotalBytes = 0;

  for (const asset of uploaded) {
    uploadTotalBytes += asset.bytes.byteLength;
    if (uploadTotalBytes > SHARE_LIMITS.maxTotalBytes) {
      throw new Error("PAYLOAD_TOO_LARGE");
    }
    const normalized = sanitizeHash(asset.expectedHash);
    if (!normalized) throw new Error("INVALID_INPUT");
    uploadedByHash.set(normalized, asset);
  }

  const storedHashes: string[] = [];
  let totalBytes = 0;

  try {
    // Retain only hashes already owned by this user (from their existing shares or cloud projects).
    const missingUploads = requiredHashes.filter((h) => !uploadedByHash.has(h));
    let retained = new Set<string>();
    if (missingUploads.length > 0) {
      const owned = await readOwnedAssetHashes(env, userId);
      const allowed = missingUploads.filter((h) => owned.has(h));
      retained = await retainExistingShareAssets(env, allowed);
      for (const h of retained) storedHashes.push(h);
    }

    for (const hash of requiredHashes) {
      if (retained.has(hash)) continue;
      const incoming = uploadedByHash.get(hash);
      if (!incoming) {
        throw new Error("INVALID_INPUT");
      }
      const saved = await putShareAsset(env, {
        bytes: incoming.bytes,
        expectedHash: hash,
        width: incoming.width,
        height: incoming.height,
        maxEdge: 2048,
      });
      storedHashes.push(saved.contentHash);
      totalBytes += saved.byteSize;
    }

    if (retained.size > 0) {
      const db = requireDb(env);
      for (const h of retained) {
        const row = await db
          .prepare("SELECT byte_size AS byteSize FROM shared_assets WHERE content_hash=?")
          .bind(h)
          .first<{ byteSize: number }>();
        totalBytes += Number(row?.byteSize ?? 0);
      }
    }

    return { storedHashes, totalBytes };
  } catch (error) {
    if (storedHashes.length > 0) {
      await releaseShareAssets(env, storedHashes).catch(() => {});
    }
    throw error;
  }
}

export async function createSharedProject(
  env: AppEnv,
  userId: string,
  input: CreateSharedProjectInput,
): Promise<SharedProjectSummary> {
  await sweepExpiredSharedProjects(env, { userId }).catch(() => {});
  const db = await ensureShareTables(env);
  if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > SHARE_LIMITS.maxItems) {
    throw new Error("INVALID_INPUT");
  }
  const title = sanitizeText(input.title, SHARE_LIMITS.maxTitleLength);
  if (!title) throw new Error("INVALID_INPUT");

  const activeCountRow = await db
    .prepare("SELECT COUNT(*) AS count FROM shared_projects WHERE user_id=? AND status='active'")
    .bind(userId)
    .first<{ count: number }>();
  if (Number(activeCountRow?.count ?? 0) >= SHARE_LIMITS.maxActiveSharesPerUser) {
    throw new Error("SHARE_LIMIT_REACHED");
  }

  const items = input.items.map((raw, idx) => sanitizeItemInput(raw, idx));
  const description = sanitizeText(input.description, SHARE_LIMITS.maxDescriptionLength);
  const brandName = sanitizeText(input.brandName, SHARE_LIMITS.maxBrandNameLength);
  const localProjectId = sanitizeText(input.localProjectId, 100) || null;
  const expiresAt = sanitizeExpiresAt(input.expiresAt);
  const options = sanitizeOptions(input.options);
  const passcodeHash =
    typeof input.passcode === "string" && input.passcode.trim()
      ? await hashSharePasscode(input.passcode)
      : null;

  const { storedHashes, totalBytes } = await storeAndVerifyAssets(env, userId, items, input.assets);

  const id = randomId("shr");
  const token = generateShareToken();
  const createdAt = nowIso();

  try {
    const statements = [
      db
        .prepare(
          `INSERT INTO shared_projects
            (id, token, user_id, local_project_id, title, description, brand_name, passcode_hash, status, options_json, item_count, total_bytes, view_count, last_viewed_at, expires_at, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,NULL,?,?,?)`,
        )
        .bind(
          id,
          token,
          userId,
          localProjectId,
          title,
          description,
          brandName,
          passcodeHash,
          "active",
          JSON.stringify(options),
          items.length,
          totalBytes,
          expiresAt,
          createdAt,
          createdAt,
        ),
      ...items.map((item, idx) =>
        db
          .prepare(
            `INSERT INTO shared_project_items
              (id, share_id, sort_order, name, kind, subtitle, thumbnail_hash, payload_json, created_at)
             VALUES (?,?,?,?,?,?,?,?,?)`,
          )
          .bind(
            item.id || randomId("sitem"),
            id,
            idx,
            item.name,
            item.kind,
            item.subtitle,
            item.thumbnailHash ?? null,
            JSON.stringify(item.payload),
            createdAt,
          ),
      ),
    ];
    await db.batch(statements);
  } catch (error) {
    await releaseShareAssets(env, storedHashes).catch(() => {});
    throw error;
  }

  return {
    id,
    token,
    ...(localProjectId ? { localProjectId } : {}),
    title,
    description,
    brandName,
    hasPasscode: Boolean(passcodeHash),
    status: "active",
    options,
    itemCount: items.length,
    totalBytes,
    viewCount: 0,
    lastViewedAt: null,
    expiresAt,
    createdAt,
    updatedAt: createdAt,
  };
}

async function readOwnedShare(env: AppEnv, userId: string, shareId: string): Promise<ShareRow | null> {
  const db = await ensureShareTables(env);
  return db
    .prepare(
      `SELECT id, token, user_id AS userId, local_project_id AS localProjectId, title, description,
              brand_name AS brandName, passcode_hash AS passcodeHash, status, options_json AS optionsJson,
              item_count AS itemCount, total_bytes AS totalBytes, view_count AS viewCount,
              last_viewed_at AS lastViewedAt, expires_at AS expiresAt, created_at AS createdAt, updated_at AS updatedAt
       FROM shared_projects WHERE id=? AND user_id=?`,
    )
    .bind(shareId, userId)
    .first<ShareRow>();
}

async function readShareItems(env: AppEnv, shareId: string): Promise<SharedProjectItemPublic[]> {
  const db = await ensureShareTables(env);
  const res = await db
    .prepare(
      `SELECT id, sort_order AS sortOrder, name, kind, subtitle, thumbnail_hash AS thumbnailHash, payload_json AS payloadJson
       FROM shared_project_items WHERE share_id=? ORDER BY sort_order ASC, created_at ASC`,
    )
    .bind(shareId)
    .all<{
      id: string;
      sortOrder: number;
      name: string;
      kind: "beverage" | "packaging";
      subtitle: string;
      thumbnailHash: string | null;
      payloadJson: string;
    }>();

  const out: SharedProjectItemPublic[] = [];
  for (const row of res.results ?? []) {
    try {
      const payload = JSON.parse(row.payloadJson) as SharedItemPayload;
      out.push({
        id: row.id,
        sortOrder: Number(row.sortOrder ?? 0),
        name: row.name,
        kind: row.kind,
        subtitle: row.subtitle,
        ...(row.thumbnailHash ? { thumbnailHash: row.thumbnailHash } : {}),
        payload,
      });
    } catch {
      // Skip corrupted row.
    }
  }
  return out;
}

export async function listUserSharedProjects(
  env: AppEnv,
  userId: string,
): Promise<SharedProjectSummary[]> {
  await sweepExpiredSharedProjects(env, { userId }).catch(() => {});
  const db = await ensureShareTables(env);
  const res = await db
    .prepare(
      `SELECT id, token, user_id AS userId, local_project_id AS localProjectId, title, description,
              brand_name AS brandName, passcode_hash AS passcodeHash, status, options_json AS optionsJson,
              item_count AS itemCount, total_bytes AS totalBytes, view_count AS viewCount,
              last_viewed_at AS lastViewedAt, expires_at AS expiresAt, created_at AS createdAt, updated_at AS updatedAt
       FROM shared_projects WHERE user_id=? AND status <> 'revoked'
       ORDER BY updated_at DESC LIMIT 50`,
    )
    .bind(userId)
    .all<ShareRow>();
  return (res.results ?? []).map(rowToSummary);
}

export async function updateSharedProject(
  env: AppEnv,
  userId: string,
  shareId: string,
  input: UpdateSharedProjectInput,
): Promise<SharedProjectSummary> {
  const db = await ensureShareTables(env);
  const existing = await readOwnedShare(env, userId, shareId);
  if (!existing) throw new Error("NOT_FOUND");

  const nextTitle = input.title !== undefined ? sanitizeText(input.title, SHARE_LIMITS.maxTitleLength) : existing.title;
  if (!nextTitle) throw new Error("INVALID_INPUT");
  const nextDescription =
    input.description !== undefined
      ? sanitizeText(input.description, SHARE_LIMITS.maxDescriptionLength)
      : existing.description;
  const nextBrandName =
    input.brandName !== undefined
      ? sanitizeText(input.brandName, SHARE_LIMITS.maxBrandNameLength)
      : existing.brandName;
  const nextStatus: ShareStatus =
    input.status === "active" || input.status === "paused" || input.status === "revoked"
      ? input.status
      : existing.status;
  const nextExpiresAt =
    input.expiresAt !== undefined ? sanitizeExpiresAt(input.expiresAt) : existing.expiresAt;
  const currentOptions = rowToSummary(existing).options;
  const nextOptions =
    input.options !== undefined ? sanitizeOptions({ ...currentOptions, ...input.options }) : currentOptions;

  let nextPasscodeHash = existing.passcodeHash;
  if (input.passcode === null || input.passcode === "") {
    nextPasscodeHash = null;
  } else if (typeof input.passcode === "string" && input.passcode.trim()) {
    nextPasscodeHash = await hashSharePasscode(input.passcode);
  }

  const updatedAt = nowIso();
  let nextItemCount = existing.itemCount;
  let nextTotalBytes = existing.totalBytes;

  if (input.items !== undefined) {
    if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > SHARE_LIMITS.maxItems) {
      throw new Error("INVALID_INPUT");
    }
    const prevItems = await readShareItems(env, existing.id);
    const prevHashes = collectPayloadAssetHashes(prevItems);
    const nextItems = input.items.map((raw, idx) => sanitizeItemInput(raw, idx));
    const { storedHashes, totalBytes } = await storeAndVerifyAssets(env, userId, nextItems, input.assets ?? []);
    nextItemCount = nextItems.length;
    nextTotalBytes = totalBytes;

    try {
      await db.batch([
        db
          .prepare(
            `UPDATE shared_projects
             SET title=?, description=?, brand_name=?, passcode_hash=?, status=?, options_json=?,
                 item_count=?, total_bytes=?, expires_at=?, updated_at=?
             WHERE id=? AND user_id=?`,
          )
          .bind(
            nextTitle,
            nextDescription,
            nextBrandName,
            nextPasscodeHash,
            nextStatus,
            JSON.stringify(nextOptions),
            nextItemCount,
            nextTotalBytes,
            nextExpiresAt,
            updatedAt,
            existing.id,
            userId,
          ),
        db.prepare("DELETE FROM shared_project_items WHERE share_id=?").bind(existing.id),
        ...nextItems.map((item, idx) =>
          db
            .prepare(
              `INSERT INTO shared_project_items
                (id, share_id, sort_order, name, kind, subtitle, thumbnail_hash, payload_json, created_at)
               VALUES (?,?,?,?,?,?,?,?,?)`,
            )
            .bind(
              item.id || randomId("sitem"),
              existing.id,
              idx,
              item.name,
              item.kind,
              item.subtitle,
              item.thumbnailHash ?? null,
              JSON.stringify(item.payload),
              updatedAt,
            ),
        ),
      ]);
    } catch (error) {
      await releaseShareAssets(env, storedHashes).catch(() => {});
      throw error;
    }

    // Safely release old asset references after new items commit
    await releaseShareAssets(env, prevHashes).catch(() => {});
  } else {
    const revokingNow = nextStatus === "revoked" && existing.status !== "revoked";
    const prevHashesToRelease = revokingNow
      ? collectPayloadAssetHashes(await readShareItems(env, existing.id))
      : [];
    if (revokingNow) {
      await db.batch([
        db.prepare("DELETE FROM shared_project_items WHERE share_id=?").bind(existing.id),
        db
          .prepare(
            `UPDATE shared_projects
             SET title=?, description=?, brand_name=?, passcode_hash=?, status=?, options_json=?,
                 item_count=0, total_bytes=0, expires_at=?, updated_at=?
             WHERE id=? AND user_id=?`,
          )
          .bind(
            nextTitle,
            nextDescription,
            nextBrandName,
            nextPasscodeHash,
            nextStatus,
            JSON.stringify(nextOptions),
            nextExpiresAt,
            updatedAt,
            existing.id,
            userId,
          ),
      ]);
      if (prevHashesToRelease.length > 0) {
        await releaseShareAssets(env, prevHashesToRelease).catch(() => {});
      }
    } else {
      await db
        .prepare(
          `UPDATE shared_projects
           SET title=?, description=?, brand_name=?, passcode_hash=?, status=?, options_json=?,
               expires_at=?, updated_at=?
           WHERE id=? AND user_id=?`,
        )
        .bind(
          nextTitle,
          nextDescription,
          nextBrandName,
          nextPasscodeHash,
          nextStatus,
          JSON.stringify(nextOptions),
          nextExpiresAt,
          updatedAt,
          existing.id,
          userId,
        )
        .run();
    }
  }

  const refreshed = await readOwnedShare(env, userId, existing.id);
  if (!refreshed) throw new Error("NOT_FOUND");
  return rowToSummary(refreshed);
}

export async function deleteSharedProject(env: AppEnv, userId: string, shareId: string): Promise<void> {
  const db = await ensureShareTables(env);
  const existing = await readOwnedShare(env, userId, shareId);
  if (!existing) throw new Error("NOT_FOUND");
  const prevItems = await readShareItems(env, existing.id);
  const prevHashes = collectPayloadAssetHashes(prevItems);
  await db.batch([
    db.prepare("DELETE FROM shared_project_items WHERE share_id=?").bind(existing.id),
    db.prepare("DELETE FROM shared_projects WHERE id=? AND user_id=?").bind(existing.id, userId),
  ]);
  await releaseShareAssets(env, prevHashes).catch(() => {});
}

/**
 * Delete all share links linked to a cloud project (`local_project_id = projectId`)
 * so manually deleting a cloud project never leaves behind unreachable orphan shares
 * or holds unreferenced R2/D1 assets alive.
 */
export async function deleteLinkedSharesForProject(
  env: AppEnv,
  userId: string,
  localProjectId: string,
): Promise<{ deletedShareIds: string[]; releasedHashes: string[] }> {
  const db = await ensureShareTables(env);
  const rows = await db
    .prepare("SELECT id FROM shared_projects WHERE user_id=? AND local_project_id=?")
    .bind(userId, localProjectId)
    .all<{ id: string }>();
  const shares = rows.results ?? [];
  if (shares.length === 0) return { deletedShareIds: [], releasedHashes: [] };

  const deletedShareIds: string[] = [];
  const allHashes = new Set<string>();
  for (const row of shares) {
    const items = await readShareItems(env, row.id);
    for (const h of collectPayloadAssetHashes(items)) allHashes.add(h);
    await db.batch([
      db.prepare("DELETE FROM shared_project_items WHERE share_id=?").bind(row.id),
      db.prepare("DELETE FROM shared_projects WHERE id=? AND user_id=?").bind(row.id, userId),
    ]);
    deletedShareIds.push(row.id);
  }

  return { deletedShareIds, releasedHashes: [...allHashes] };
}

/**
 * Sweep expired (`expires_at <= now`) or `revoked` shared projects, removing their
 * rows and garbage-collecting any unreferenced assets from R2 & D1.
 */
export async function sweepExpiredSharedProjects(
  env: AppEnv,
  options?: { userId?: string; nowMs?: number; limit?: number },
): Promise<{ deletedIds: string[] }> {
  const db = await ensureShareTables(env);
  const nowMs = options?.nowMs ?? Date.now();
  const cutoffIso = new Date(nowMs).toISOString();
  const limit = Math.max(1, Math.min(100, options?.limit ?? 25));

  const query = options?.userId
    ? db
        .prepare(
          `SELECT id FROM shared_projects
           WHERE user_id=? AND (status='revoked' OR (expires_at IS NOT NULL AND expires_at <= ?))
           ORDER BY updated_at ASC LIMIT ?`,
        )
        .bind(options.userId, cutoffIso, limit)
    : db
        .prepare(
          `SELECT id FROM shared_projects
           WHERE status='revoked' OR (expires_at IS NOT NULL AND expires_at <= ?)
           ORDER BY updated_at ASC LIMIT ?`,
        )
        .bind(cutoffIso, limit);

  const stale = await query.all<{ id: string }>();
  const rows = stale.results ?? [];
  if (rows.length === 0) return { deletedIds: [] };

  const deletedIds: string[] = [];
  for (const row of rows) {
    const items = await readShareItems(env, row.id);
    const hashes = collectPayloadAssetHashes(items);
    await db.batch([
      db.prepare("DELETE FROM shared_project_items WHERE share_id=?").bind(row.id),
      db.prepare("DELETE FROM shared_projects WHERE id=?").bind(row.id),
    ]);
    if (hashes.length > 0) {
      await releaseShareAssets(env, hashes).catch(() => {});
    }
    deletedIds.push(row.id);
  }

  return { deletedIds };
}

export async function readShareByToken(env: AppEnv, token: string): Promise<ShareRow | null> {
  if (!/^[A-Za-z0-9_-]{10,48}$/.test(token)) return null;
  const db = await ensureShareTables(env);
  return db
    .prepare(
      `SELECT id, token, user_id AS userId, local_project_id AS localProjectId, title, description,
              brand_name AS brandName, passcode_hash AS passcodeHash, status, options_json AS optionsJson,
              item_count AS itemCount, total_bytes AS totalBytes, view_count AS viewCount,
              last_viewed_at AS lastViewedAt, expires_at AS expiresAt, created_at AS createdAt, updated_at AS updatedAt
       FROM shared_projects WHERE token=?`,
    )
    .bind(token)
    .first<ShareRow>();
}

export function isShareExpired(row: Pick<ShareRow, "expiresAt">): boolean {
  return Boolean(row.expiresAt && Date.parse(row.expiresAt) <= Date.now());
}

export async function getPublicSharedProject(
  env: AppEnv,
  token: string,
  unlockCookieValue?: string | null,
  options?: { recordView?: boolean },
): Promise<PublicSharedProjectResponse> {
  const row = await readShareByToken(env, token);
  if (!row) return { state: "not_found" };
  if (row.status === "revoked") return { state: "revoked" };
  if (row.status === "paused") return { state: "paused" };
  if (isShareExpired(row)) return { state: "expired" };

  const unlocked = await verifyShareUnlockCookie(env, row.token, row.passcodeHash, unlockCookieValue);
  if (!unlocked) {
    return {
      state: "locked",
      share: {
        token: row.token,
        title: row.title,
        brandName: row.brandName,
        itemCount: Number(row.itemCount ?? 0),
      },
    };
  }

  const items = await readShareItems(env, row.id);
  if (options?.recordView !== false) {
    const db = await ensureShareTables(env);
    await db
      .prepare("UPDATE shared_projects SET view_count=view_count+1, last_viewed_at=? WHERE id=?")
      .bind(nowIso(), row.id)
      .run()
      .catch(() => {});
  }

  const summary = rowToSummary(row);
  return {
    state: "ready",
    share: {
      token: summary.token,
      title: summary.title,
      description: summary.description,
      brandName: summary.brandName,
      options: summary.options,
      itemCount: items.length,
      expiresAt: summary.expiresAt,
      updatedAt: summary.updatedAt,
    },
    items,
  };
}

/** Verify that `contentHash` belongs to an active, unlocked share identified by `token`. */
export async function authorizeShareAssetRead(
  env: AppEnv,
  token: string,
  contentHash: string,
  unlockCookieValue?: string | null,
): Promise<{ allowed: boolean; isProtected: boolean }> {
  const cleanHash = sanitizeHash(contentHash);
  if (!cleanHash) return { allowed: false, isProtected: false };
  const row = await readShareByToken(env, token);
  if (!row || row.status !== "active" || isShareExpired(row)) {
    return { allowed: false, isProtected: false };
  }
  const unlocked = await verifyShareUnlockCookie(env, row.token, row.passcodeHash, unlockCookieValue);
  if (!unlocked) return { allowed: false, isProtected: true };
  const items = await readShareItems(env, row.id);
  const hashes = collectPayloadAssetHashes(items);
  return {
    allowed: hashes.includes(cleanHash),
    isProtected: Boolean(row.passcodeHash),
  };
}
