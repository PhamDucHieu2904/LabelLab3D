import { parsePreferences } from "@/lib/labellab/preferences";
import { parseBottlePackConfig, parsePackagingParams } from "@/lib/packaging-cad/preferences";
import {
  CLOUD_PROJECT_LIMITS,
  computeCloudExpiryIso,
  type CloudProjectItem,
  type CloudProjectItemInput,
  type CloudProjectSummary,
} from "@/lib/projects/contracts";
import {
  collectPayloadAssetHashes,
  type SharedItemPayload,
  type SharedPackagingArtworkRefs,
  type SharedPanelOverlayRef,
} from "@/lib/share/contracts";
import { nowIso, randomId, requireDb, type AppEnv } from "./db";
import {
  putShareAsset,
  releaseShareAssets,
  retainExistingShareAssets,
} from "./share-assets";
import { ensureShareTables, type UploadedShareAssetInput } from "./shares";
import { getLiveSiteSettings } from "./site-config";
import { appendLedgerEntry, commitCoins, releaseCoins, reserveCoins } from "./wallet";

const tableReady = new WeakSet<object>();

export async function ensureCloudProjectTables(env: AppEnv) {
  await ensureShareTables(env);
  const db = requireDb(env);
  if (tableReady.has(db)) return db;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS cloud_projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      brand_name TEXT NOT NULL DEFAULT '',
      item_count INTEGER NOT NULL DEFAULT 0 CHECK (item_count >= 0),
      total_bytes INTEGER NOT NULL DEFAULT 0 CHECK (total_bytes >= 0),
      auto_renew INTEGER NOT NULL DEFAULT 0 CHECK (auto_renew IN (0, 1)),
      renewal_count INTEGER NOT NULL DEFAULT 0 CHECK (renewal_count >= 0),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS cloud_projects_user_time ON cloud_projects(user_id, updated_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS cloud_projects_expiry ON cloud_projects(expires_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS cloud_project_items (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES cloud_projects(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('beverage','packaging')),
      subtitle TEXT NOT NULL DEFAULT '',
      thumbnail_hash TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS cloud_project_items_order ON cloud_project_items(project_id, sort_order)"),
  ]);
  tableReady.add(db);
  return db;
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

function sanitizeCloudItemInput(raw: unknown, index: number): CloudProjectItemInput {
  if (!raw || typeof raw !== "object") throw new Error("INVALID_INPUT");
  const obj = raw as Record<string, unknown>;
  const kind = obj.kind === "packaging" ? "packaging" : obj.kind === "beverage" ? "beverage" : null;
  if (!kind) throw new Error("INVALID_INPUT");
  const name = sanitizeText(obj.name, CLOUD_PROJECT_LIMITS.maxNameLength, `Item ${index + 1}`);
  const subtitle = sanitizeText(obj.subtitle, 140);
  const sortOrder =
    Number.isSafeInteger(Number(obj.sortOrder)) && Number(obj.sortOrder) >= 0
      ? Number(obj.sortOrder)
      : index;
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

type CloudProjectRow = {
  id: string;
  userId: string;
  name: string;
  description: string;
  brandName: string;
  itemCount: number;
  totalBytes: number;
  autoRenew: number;
  renewalCount: number;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

type CloudItemRow = {
  id: string;
  projectId: string;
  sortOrder: number;
  name: string;
  kind: "beverage" | "packaging";
  subtitle: string;
  thumbnailHash: string | null;
  payloadJson: string;
  updatedAt: string;
};

function parseItemRow(row: CloudItemRow): CloudProjectItem | null {
  try {
    const payload = JSON.parse(row.payloadJson) as SharedItemPayload;
    if (!payload || (payload.kind !== "beverage" && payload.kind !== "packaging")) return null;
    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      subtitle: row.subtitle,
      sortOrder: Number(row.sortOrder ?? 0),
      ...(row.thumbnailHash ? { thumbnailHash: row.thumbnailHash } : {}),
      payload,
      updatedAt: row.updatedAt,
    };
  } catch {
    return null;
  }
}

function parseItemHashes(rows: readonly { thumbnailHash: string | null; payloadJson: string }[]): string[] {
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
      // Ignore malformed rows.
    }
  }
  return collectPayloadAssetHashes(parsed);
}

async function collectProjectAssetHashes(env: AppEnv, projectId: string): Promise<string[]> {
  const db = await ensureCloudProjectTables(env);
  const rows = await db
    .prepare("SELECT thumbnail_hash AS thumbnailHash, payload_json AS payloadJson FROM cloud_project_items WHERE project_id=?")
    .bind(projectId)
    .all<{ thumbnailHash: string | null; payloadJson: string }>();
  return parseItemHashes(rows.results ?? []);
}

/** Collect all asset hashes currently owned by a user across their cloud projects & shares. */
export async function getUserOwnedAssetHashes(env: AppEnv, userId: string): Promise<Set<string>> {
  const db = await ensureCloudProjectTables(env);
  const owned = new Set<string>();
  const [cloudRows, shareRows] = await Promise.all([
    db
      .prepare(
        "SELECT i.thumbnail_hash AS thumbnailHash, i.payload_json AS payloadJson FROM cloud_project_items i INNER JOIN cloud_projects p ON p.id=i.project_id WHERE p.user_id=?",
      )
      .bind(userId)
      .all<{ thumbnailHash: string | null; payloadJson: string }>(),
    db
      .prepare(
        "SELECT i.thumbnail_hash AS thumbnailHash, i.payload_json AS payloadJson FROM shared_project_items i INNER JOIN shared_projects s ON s.id=i.share_id WHERE s.user_id=?",
      )
      .bind(userId)
      .all<{ thumbnailHash: string | null; payloadJson: string }>(),
  ]);
  for (const h of parseItemHashes(cloudRows.results ?? [])) owned.add(h);
  for (const h of parseItemHashes(shareRows.results ?? [])) owned.add(h);
  return owned;
}

async function storeAndVerifyCloudAssets(
  env: AppEnv,
  userId: string,
  items: readonly CloudProjectItemInput[],
  uploaded: readonly UploadedShareAssetInput[],
): Promise<{ storedHashes: string[]; totalBytes: number }> {
  const requiredHashes = collectPayloadAssetHashes(items);
  const uploadedByHash = new Map<string, UploadedShareAssetInput>();
  let uploadTotalBytes = 0;

  for (const asset of uploaded) {
    uploadTotalBytes += asset.bytes.byteLength;
    if (uploadTotalBytes > CLOUD_PROJECT_LIMITS.maxTotalBytes) {
      throw new Error("PAYLOAD_TOO_LARGE");
    }
    const normalized = sanitizeHash(asset.expectedHash);
    if (!normalized) throw new Error("INVALID_INPUT");
    uploadedByHash.set(normalized, asset);
  }

  const storedHashes: string[] = [];
  let totalBytes = 0;

  try {
    const missingUploads = requiredHashes.filter((h) => !uploadedByHash.has(h));
    let retained = new Set<string>();
    if (missingUploads.length > 0) {
      const owned = await getUserOwnedAssetHashes(env, userId);
      const allowedMissing = missingUploads.filter((h) => owned.has(h));
      retained = await retainExistingShareAssets(env, allowedMissing);
      for (const h of retained) storedHashes.push(h);
    }

    for (const hash of requiredHashes) {
      if (retained.has(hash)) continue;
      const incoming = uploadedByHash.get(hash);
      if (!incoming) throw new Error("INVALID_INPUT");
      const saved = await putShareAsset(env, {
        bytes: incoming.bytes,
        expectedHash: hash,
        width: incoming.width,
        height: incoming.height,
        maxEdge: CLOUD_PROJECT_LIMITS.maxImageEdge,
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

async function computeProjectTotalBytes(env: AppEnv, projectId: string): Promise<number> {
  const hashes = await collectProjectAssetHashes(env, projectId);
  if (hashes.length === 0) return 0;
  const db = requireDb(env);
  let total = 0;
  for (const h of hashes) {
    const row = await db
      .prepare("SELECT byte_size AS byteSize FROM shared_assets WHERE content_hash=?")
      .bind(h)
      .first<{ byteSize: number }>();
    total += Number(row?.byteSize ?? 0);
  }
  return total;
}

async function getHydratedCloudProject(env: AppEnv, projectId: string): Promise<CloudProjectSummary | null> {
  const db = await ensureCloudProjectTables(env);
  const project = await db
    .prepare(
      "SELECT id, user_id AS userId, name, description, brand_name AS brandName, item_count AS itemCount, total_bytes AS totalBytes, auto_renew AS autoRenew, renewal_count AS renewalCount, expires_at AS expiresAt, created_at AS createdAt, updated_at AS updatedAt FROM cloud_projects WHERE id=?",
    )
    .bind(projectId)
    .first<CloudProjectRow>();
  if (!project) return null;
  const itemRows = await db
    .prepare(
      "SELECT id, project_id AS projectId, sort_order AS sortOrder, name, kind, subtitle, thumbnail_hash AS thumbnailHash, payload_json AS payloadJson, updated_at AS updatedAt FROM cloud_project_items WHERE project_id=? ORDER BY sort_order ASC, updated_at DESC",
    )
    .bind(projectId)
    .all<CloudItemRow>();
  const items = (itemRows.results ?? [])
    .map(parseItemRow)
    .filter((item): item is CloudProjectItem => Boolean(item));
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    brandName: project.brandName,
    itemCount: items.length,
    totalBytes: Number(project.totalBytes ?? 0),
    autoRenew: Number(project.autoRenew) === 1,
    renewalCount: Number(project.renewalCount ?? 0),
    expiresAt: project.expiresAt,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    items,
  };
}

export interface SweepExpiredProjectsResult {
  renewedIds: string[];
  deletedIds: string[];
}

/**
 * Process expired cloud projects (expires_at <= now):
 * - If `auto_renew = 1` and user has enough coins (`projectExtendCost`, default 10),
 *   atomically deduct coins via idempotent ledger entry and extend +30 days.
 * - Otherwise delete the expired project and garbage-collect unreferenced R2 assets.
 */
export async function sweepExpiredCloudProjects(
  env: AppEnv,
  options?: { userId?: string; nowMs?: number; limit?: number },
): Promise<SweepExpiredProjectsResult> {
  const db = await ensureCloudProjectTables(env);
  const nowMs = options?.nowMs ?? Date.now();
  const cutoffIso = new Date(nowMs).toISOString();
  const limit = Math.max(1, Math.min(100, options?.limit ?? 25));

  const query = options?.userId
    ? db
        .prepare(
          "SELECT id, user_id AS userId, auto_renew AS autoRenew, expires_at AS expiresAt, renewal_count AS renewalCount FROM cloud_projects WHERE user_id=? AND expires_at <= ? ORDER BY expires_at ASC LIMIT ?",
        )
        .bind(options.userId, cutoffIso, limit)
    : db
        .prepare(
          "SELECT id, user_id AS userId, auto_renew AS autoRenew, expires_at AS expiresAt, renewal_count AS renewalCount FROM cloud_projects WHERE expires_at <= ? ORDER BY expires_at ASC LIMIT ?",
        )
        .bind(cutoffIso, limit);

  const expired = await query.all<{
    id: string;
    userId: string;
    autoRenew: number;
    expiresAt: string;
    renewalCount: number;
  }>();
  const rows = expired.results ?? [];
  if (rows.length === 0) return { renewedIds: [], deletedIds: [] };

  const settings = await getLiveSiteSettings(env);
  const extendCost = Math.max(0, Math.floor(settings.projectExtendCost));

  const renewedIds: string[] = [];
  const deletedIds: string[] = [];

  for (const row of rows) {
    let renewed = false;
    if (Number(row.autoRenew) === 1) {
      const oldExpiryMs = Date.parse(row.expiresAt);
      const nextExpiryIso = computeCloudExpiryIso(
        Math.max(Number.isFinite(oldExpiryMs) ? oldExpiryMs : nowMs, nowMs),
        CLOUD_PROJECT_LIMITS.extensionDays,
      );
      const idemKey = `proj_autorenew_${row.id}_${Number.isFinite(oldExpiryMs) ? oldExpiryMs : nowMs}`;
      try {
        if (extendCost > 0) {
          await appendLedgerEntry(env, {
            userId: row.userId,
            amount: -extendCost,
            kind: "project_auto_renew",
            reference: `project_renew:${row.id}`,
            idempotencyKey: idemKey,
            metadata: {
              projectId: row.id,
              previousExpiresAt: row.expiresAt,
              nextExpiresAt: nextExpiryIso,
              days: CLOUD_PROJECT_LIMITS.extensionDays,
            },
          });
        }
        const updateRes = await db
          .prepare(
            "UPDATE cloud_projects SET expires_at=?, renewal_count=renewal_count+1, updated_at=? WHERE id=? AND expires_at=?",
          )
          .bind(nextExpiryIso, nowIso(), row.id, row.expiresAt)
          .run();
        if ((updateRes.meta?.changes as number | undefined) === 1) {
          renewed = true;
          renewedIds.push(row.id);
        }
      } catch (err) {
        const code = err instanceof Error ? err.message : "";
        if (code !== "INSUFFICIENT_COINS") {
          // Transient wallet conflict: skip deletion this pass so we never lose user data on a race.
          continue;
        }
      }
    }

    if (!renewed) {
      const hashes = await collectProjectAssetHashes(env, row.id);
      const del = await db
        .prepare("DELETE FROM cloud_projects WHERE id=? AND expires_at <= ?")
        .bind(row.id, cutoffIso)
        .run();
      if ((del.meta?.changes as number | undefined) === 1) {
        if (hashes.length > 0) {
          await releaseShareAssets(env, hashes).catch(() => {});
        }
        deletedIds.push(row.id);
      }
    }
  }

  return { renewedIds, deletedIds };
}

export async function listUserCloudProjects(
  env: AppEnv,
  userId: string,
  options?: { nowMs?: number; includeGlobalSweep?: boolean },
): Promise<CloudProjectSummary[]> {
  await sweepExpiredCloudProjects(env, { userId, nowMs: options?.nowMs });
  if (options?.includeGlobalSweep) {
    // Bounded background-safe opportunistic cleanup for stale projects of inactive accounts.
    await sweepExpiredCloudProjects(env, { nowMs: options?.nowMs, limit: 5 }).catch(() => {});
  }

  const db = await ensureCloudProjectTables(env);
  const projectRows = await db
    .prepare(
      "SELECT id, user_id AS userId, name, description, brand_name AS brandName, item_count AS itemCount, total_bytes AS totalBytes, auto_renew AS autoRenew, renewal_count AS renewalCount, expires_at AS expiresAt, created_at AS createdAt, updated_at AS updatedAt FROM cloud_projects WHERE user_id=? ORDER BY updated_at DESC LIMIT 60",
    )
    .bind(userId)
    .all<CloudProjectRow>();
  const projects = projectRows.results ?? [];
  if (projects.length === 0) return [];

  const itemRows = await db
    .prepare(
      "SELECT i.id, i.project_id AS projectId, i.sort_order AS sortOrder, i.name, i.kind, i.subtitle, i.thumbnail_hash AS thumbnailHash, i.payload_json AS payloadJson, i.updated_at AS updatedAt FROM cloud_project_items i INNER JOIN cloud_projects p ON p.id=i.project_id WHERE p.user_id=? ORDER BY i.sort_order ASC, i.updated_at DESC",
    )
    .bind(userId)
    .all<CloudItemRow>();

  const itemsByProject = new Map<string, CloudProjectItem[]>();
  for (const row of itemRows.results ?? []) {
    const parsed = parseItemRow(row);
    if (!parsed) continue;
    const list = itemsByProject.get(row.projectId) ?? [];
    list.push(parsed);
    itemsByProject.set(row.projectId, list);
  }

  return projects.map((project) => {
    const items = itemsByProject.get(project.id) ?? [];
    return {
      id: project.id,
      name: project.name,
      description: project.description,
      brandName: project.brandName,
      itemCount: items.length,
      totalBytes: Number(project.totalBytes ?? 0),
      autoRenew: Number(project.autoRenew) === 1,
      renewalCount: Number(project.renewalCount ?? 0),
      expiresAt: project.expiresAt,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      items,
    };
  });
}

export interface SaveCloudProjectInput {
  /** Existing cloud project ID when appending/updating inside an existing project. */
  projectId?: string;
  name?: string;
  description?: string;
  brandName?: string;
  autoRenew?: boolean;
  /** Single item or multiple items (used when migrating a local multi-item project). */
  items: unknown[];
  assets: UploadedShareAssetInput[];
}

export async function saveCloudProjectItems(
  env: AppEnv,
  userId: string,
  input: SaveCloudProjectInput,
): Promise<{ project: CloudProjectSummary; savedItemIds: string[] }> {
  await sweepExpiredCloudProjects(env, { userId });
  const db = await ensureCloudProjectTables(env);

  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error("INVALID_INPUT");
  }
  if (input.items.length > CLOUD_PROJECT_LIMITS.maxItemsPerProject) {
    throw new Error("INVALID_INPUT");
  }

  const sanitizedItems = input.items.map((item, idx) => sanitizeCloudItemInput(item, idx));
  const now = nowIso();

  let targetProject: CloudProjectRow | null = null;
  if (input.projectId) {
    targetProject = await db
      .prepare(
        "SELECT id, user_id AS userId, name, description, brand_name AS brandName, item_count AS itemCount, total_bytes AS totalBytes, auto_renew AS autoRenew, renewal_count AS renewalCount, expires_at AS expiresAt, created_at AS createdAt, updated_at AS updatedAt FROM cloud_projects WHERE id=? AND user_id=?",
      )
      .bind(input.projectId, userId)
      .first<CloudProjectRow>();
    if (!targetProject) throw new Error("NOT_FOUND");
  } else {
    const countRow = await db
      .prepare("SELECT COUNT(*) AS count FROM cloud_projects WHERE user_id=?")
      .bind(userId)
      .first<{ count: number }>();
    if (Number(countRow?.count ?? 0) >= CLOUD_PROJECT_LIMITS.maxProjectsPerUser) {
      throw new Error("PROJECT_LIMIT_REACHED");
    }
  }

  const existingItems = targetProject
    ? (
        await db
          .prepare(
            "SELECT id, project_id AS projectId, sort_order AS sortOrder, name, kind, subtitle, thumbnail_hash AS thumbnailHash, payload_json AS payloadJson, updated_at AS updatedAt FROM cloud_project_items WHERE project_id=?",
          )
          .bind(targetProject.id)
          .all<CloudItemRow>()
      ).results ?? []
    : [];
  const existingById = new Map(existingItems.map((row) => [row.id, row]));

  let newCount = 0;
  for (const item of sanitizedItems) {
    if (!item.id || !existingById.has(item.id)) newCount += 1;
  }
  if (existingItems.length + newCount > CLOUD_PROJECT_LIMITS.maxItemsPerProject) {
    throw new Error("PROJECT_LIMIT_REACHED");
  }

  const { storedHashes } = await storeAndVerifyCloudAssets(env, userId, sanitizedItems, input.assets);

  const projectId = targetProject ? targetProject.id : randomId("prj");
  const projectName = sanitizeText(
    input.name,
    CLOUD_PROJECT_LIMITS.maxNameLength,
    targetProject?.name || sanitizedItems[0].name,
  );
  const projectDesc =
    input.description !== undefined
      ? sanitizeText(input.description, CLOUD_PROJECT_LIMITS.maxDescriptionLength)
      : (targetProject?.description ?? "");
  const projectBrand =
    input.brandName !== undefined
      ? sanitizeText(input.brandName, CLOUD_PROJECT_LIMITS.maxBrandNameLength)
      : (targetProject?.brandName ?? "");
  const autoRenewInt =
    typeof input.autoRenew === "boolean"
      ? input.autoRenew
        ? 1
        : 0
      : Number(targetProject?.autoRenew ?? 0);
  const expiresAt = targetProject
    ? targetProject.expiresAt
    : computeCloudExpiryIso(Date.now(), CLOUD_PROJECT_LIMITS.retentionDays);

  let nextSort = existingItems.reduce((max, row) => Math.max(max, Number(row.sortOrder ?? 0) + 1), 0);
  const oldHashesToRelease: string[] = [];
  const savedItemIds: string[] = [];

  try {
    const statements = [];
    if (!targetProject) {
      statements.push(
        db
          .prepare(
            "INSERT INTO cloud_projects (id, user_id, name, description, brand_name, item_count, total_bytes, auto_renew, renewal_count, expires_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            projectId,
            userId,
            projectName,
            projectDesc,
            projectBrand,
            0,
            0,
            autoRenewInt,
            0,
            expiresAt,
            now,
            now,
          ),
      );
    }

    for (const item of sanitizedItems) {
      const existing = item.id ? existingById.get(item.id) : undefined;
      if (existing) {
        for (const h of parseItemHashes([existing])) oldHashesToRelease.push(h);
        statements.push(
          db
            .prepare(
              "UPDATE cloud_project_items SET name=?, kind=?, subtitle=?, thumbnail_hash=?, payload_json=?, updated_at=? WHERE id=? AND project_id=?",
            )
            .bind(
              item.name,
              item.kind,
              item.subtitle,
              item.thumbnailHash ?? null,
              JSON.stringify(item.payload),
              now,
              existing.id,
              projectId,
            ),
        );
        savedItemIds.push(existing.id);
      } else {
        const newItemId = randomId("itm");
        const order = nextSort;
        nextSort += 1;
        statements.push(
          db
            .prepare(
              "INSERT INTO cloud_project_items (id, project_id, sort_order, name, kind, subtitle, thumbnail_hash, payload_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
            )
            .bind(
              newItemId,
              projectId,
              order,
              item.name,
              item.kind,
              item.subtitle,
              item.thumbnailHash ?? null,
              JSON.stringify(item.payload),
              now,
              now,
            ),
        );
        savedItemIds.push(newItemId);
      }
    }

    await db.batch(statements);

    const totalBytes = await computeProjectTotalBytes(env, projectId);
    const finalCount = existingItems.length + newCount;
    await db
      .prepare(
        "UPDATE cloud_projects SET name=?, description=?, brand_name=?, auto_renew=?, item_count=?, total_bytes=?, updated_at=? WHERE id=?",
      )
      .bind(projectName, projectDesc, projectBrand, autoRenewInt, finalCount, totalBytes, now, projectId)
      .run();

    if (oldHashesToRelease.length > 0) {
      await releaseShareAssets(env, oldHashesToRelease).catch(() => {});
    }

    const hydrated = await getHydratedCloudProject(env, projectId);
    if (!hydrated) throw new Error("NOT_FOUND");
    return { project: hydrated, savedItemIds };
  } catch (error) {
    if (storedHashes.length > 0) {
      await releaseShareAssets(env, storedHashes).catch(() => {});
    }
    throw error;
  }
}

export async function updateCloudProject(
  env: AppEnv,
  userId: string,
  projectId: string,
  patch: {
    name?: string;
    description?: string;
    brandName?: string;
    autoRenew?: boolean;
  },
): Promise<CloudProjectSummary> {
  await sweepExpiredCloudProjects(env, { userId });
  const db = await ensureCloudProjectTables(env);
  const existing = await db
    .prepare(
      "SELECT id, name, description, brand_name AS brandName, auto_renew AS autoRenew FROM cloud_projects WHERE id=? AND user_id=?",
    )
    .bind(projectId, userId)
    .first<{ id: string; name: string; description: string; brandName: string; autoRenew: number }>();
  if (!existing) throw new Error("NOT_FOUND");

  const nextName =
    patch.name !== undefined
      ? sanitizeText(patch.name, CLOUD_PROJECT_LIMITS.maxNameLength, existing.name)
      : existing.name;
  const nextDesc =
    patch.description !== undefined
      ? sanitizeText(patch.description, CLOUD_PROJECT_LIMITS.maxDescriptionLength)
      : existing.description;
  const nextBrand =
    patch.brandName !== undefined
      ? sanitizeText(patch.brandName, CLOUD_PROJECT_LIMITS.maxBrandNameLength)
      : existing.brandName;
  const nextAutoRenew =
    typeof patch.autoRenew === "boolean" ? (patch.autoRenew ? 1 : 0) : Number(existing.autoRenew);

  await db
    .prepare(
      "UPDATE cloud_projects SET name=?, description=?, brand_name=?, auto_renew=?, updated_at=? WHERE id=? AND user_id=?",
    )
    .bind(nextName, nextDesc, nextBrand, nextAutoRenew, nowIso(), projectId, userId)
    .run();

  const hydrated = await getHydratedCloudProject(env, projectId);
  if (!hydrated) throw new Error("NOT_FOUND");
  return hydrated;
}

/**
 * Manually extend a cloud project's retention by +30 days for `projectExtendCost` coins (default 10).
 * Uses atomic coin reservation + commit (releasing automatically on any failure).
 */
export async function extendCloudProject(
  env: AppEnv,
  userId: string,
  projectId: string,
  options?: { idempotencyKey?: string; nowMs?: number },
): Promise<{ project: CloudProjectSummary; chargedCoins: number }> {
  await sweepExpiredCloudProjects(env, { userId, nowMs: options?.nowMs });
  const db = await ensureCloudProjectTables(env);
  const existing = await db
    .prepare("SELECT id, expires_at AS expiresAt FROM cloud_projects WHERE id=? AND user_id=?")
    .bind(projectId, userId)
    .first<{ id: string; expiresAt: string }>();
  if (!existing) throw new Error("NOT_FOUND");

  const settings = await getLiveSiteSettings(env);
  const cost = Math.max(0, Math.floor(settings.projectExtendCost));
  const rawIdem = typeof options?.idempotencyKey === "string" ? options.idempotencyKey.trim() : "";
  const idempotencyKey = /^reserve_[A-Za-z0-9_-]{16,120}$/.test(rawIdem)
    ? rawIdem
    : `reserve_${crypto.randomUUID().replaceAll("-", "")}`;

  let reserved = false;
  try {
    if (cost > 0) {
      await reserveCoins(env, {
        userId,
        amount: cost,
        idempotencyKey,
        reference: `project_extend:${projectId}`,
      });
      reserved = true;
    }

    const nowMs = options?.nowMs ?? Date.now();
    const baseMs = Math.max(Date.parse(existing.expiresAt) || nowMs, nowMs);
    const nextExpiresAt = computeCloudExpiryIso(baseMs, CLOUD_PROJECT_LIMITS.extensionDays);

    await db
      .prepare(
        "UPDATE cloud_projects SET expires_at=?, renewal_count=renewal_count+1, updated_at=? WHERE id=? AND user_id=?",
      )
      .bind(nextExpiresAt, nowIso(), projectId, userId)
      .run();

    if (reserved) {
      await commitCoins(env, { userId, idempotencyKey });
      reserved = false;
    }

    const hydrated = await getHydratedCloudProject(env, projectId);
    if (!hydrated) throw new Error("NOT_FOUND");
    return { project: hydrated, chargedCoins: cost };
  } catch (error) {
    if (reserved) {
      await releaseCoins(env, { userId, idempotencyKey }).catch(() => {});
    }
    throw error;
  }
}

export async function deleteCloudProject(env: AppEnv, userId: string, projectId: string): Promise<void> {
  const db = await ensureCloudProjectTables(env);
  const existing = await db
    .prepare("SELECT id FROM cloud_projects WHERE id=? AND user_id=?")
    .bind(projectId, userId)
    .first<{ id: string }>();
  if (!existing) throw new Error("NOT_FOUND");

  const hashes = await collectProjectAssetHashes(env, projectId);
  await db.prepare("DELETE FROM cloud_projects WHERE id=? AND user_id=?").bind(projectId, userId).run();
  if (hashes.length > 0) {
    await releaseShareAssets(env, hashes).catch(() => {});
  }
}

export async function deleteCloudProjectItem(
  env: AppEnv,
  userId: string,
  projectId: string,
  itemId: string,
): Promise<{ projectDeleted: boolean; project: CloudProjectSummary | null }> {
  const db = await ensureCloudProjectTables(env);
  const existingProject = await db
    .prepare("SELECT id FROM cloud_projects WHERE id=? AND user_id=?")
    .bind(projectId, userId)
    .first<{ id: string }>();
  if (!existingProject) throw new Error("NOT_FOUND");

  const itemRow = await db
    .prepare("SELECT id, thumbnail_hash AS thumbnailHash, payload_json AS payloadJson FROM cloud_project_items WHERE id=? AND project_id=?")
    .bind(itemId, projectId)
    .first<{ id: string; thumbnailHash: string | null; payloadJson: string }>();
  if (!itemRow) throw new Error("NOT_FOUND");

  const itemHashes = parseItemHashes([itemRow]);
  await db.prepare("DELETE FROM cloud_project_items WHERE id=? AND project_id=?").bind(itemId, projectId).run();

  const remaining = await db
    .prepare("SELECT COUNT(*) AS count FROM cloud_project_items WHERE project_id=?")
    .bind(projectId)
    .first<{ count: number }>();
  const remainingCount = Number(remaining?.count ?? 0);

  if (remainingCount <= 0) {
    await db.prepare("DELETE FROM cloud_projects WHERE id=? AND user_id=?").bind(projectId, userId).run();
    if (itemHashes.length > 0) {
      await releaseShareAssets(env, itemHashes).catch(() => {});
    }
    return { projectDeleted: true, project: null };
  }

  const totalBytes = await computeProjectTotalBytes(env, projectId);
  await db
    .prepare("UPDATE cloud_projects SET item_count=?, total_bytes=?, updated_at=? WHERE id=? AND user_id=?")
    .bind(remainingCount, totalBytes, nowIso(), projectId, userId)
    .run();

  if (itemHashes.length > 0) {
    await releaseShareAssets(env, itemHashes).catch(() => {});
  }

  const hydrated = await getHydratedCloudProject(env, projectId);
  return { projectDeleted: false, project: hydrated };
}

export async function isAssetAuthorizedForUserCloudProject(
  env: AppEnv,
  userId: string,
  projectId: string,
  contentHash: string,
): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/i.test(contentHash)) return false;
  const db = await ensureCloudProjectTables(env);
  const project = await db
    .prepare("SELECT id FROM cloud_projects WHERE id=? AND user_id=?")
    .bind(projectId, userId)
    .first<{ id: string }>();
  if (!project) return false;
  const hashes = await collectProjectAssetHashes(env, projectId);
  return hashes.includes(contentHash.toLowerCase());
}
