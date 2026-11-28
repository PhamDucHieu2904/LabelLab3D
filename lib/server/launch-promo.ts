import {
  LAUNCH_PROMO_COINS,
  LAUNCH_PROMO_END_ISO,
  LAUNCH_PROMO_ID,
  LAUNCH_PROMO_MAX_CLAIMS_PER_IP,
  LAUNCH_PROMO_START_ISO,
  type LaunchPromoStatusResponse,
} from "@/lib/promotions/launch-event";
import { nowIso, randomId, requireDb, sha256, type AppEnv } from "./db";
import { appendLedgerEntry } from "./wallet";

const tableReady = new WeakSet<object>();

export async function ensurePromoClaimsTable(env: AppEnv) {
  const db = requireDb(env);
  if (tableReady.has(db)) return db;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS promo_claims (
      promo_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email_canonical_hash TEXT NOT NULL,
      coins INTEGER NOT NULL CHECK (coins > 0),
      ip_hash TEXT,
      ledger_id TEXT,
      claimed_at TEXT NOT NULL,
      PRIMARY KEY (promo_id, user_id),
      UNIQUE (promo_id, email_canonical_hash)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS promo_claims_promo_ip ON promo_claims(promo_id, ip_hash, claimed_at)"),
  ]);
  tableReady.add(db);
  return db;
}

/**
 * Normalizes emails to prevent Gmail dot-trick (a.b@gmail.com) and +alias
 * (user+alt2@gmail.com / @googlemail.com) multi-account bonus farming.
 */
export function canonicalizeEmailForPromo(rawEmail: string): string {
  const cleaned = rawEmail.trim().toLowerCase();
  const at = cleaned.lastIndexOf("@");
  if (at <= 0) return cleaned;
  let local = cleaned.slice(0, at);
  let domain = cleaned.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (domain === "gmail.com") {
    local = local.replace(/\./g, "");
  }
  return `${local}@${domain}`;
}

function resolveWindowState(nowMs: number): "upcoming" | "active" | "ended" {
  const startMs = Date.parse(LAUNCH_PROMO_START_ISO);
  const endMs = Date.parse(LAUNCH_PROMO_END_ISO);
  if (nowMs < startMs) return "upcoming";
  if (nowMs > endMs) return "ended";
  return "active";
}

function normalizeTrackableIp(rawIp: string | null | undefined): string | null {
  const ip = (rawIp ?? "").trim();
  if (!ip || ip === "unknown" || ip === "127.0.0.1" || ip === "::1") return null;
  return ip.slice(0, 128);
}

type PromoUserRow = {
  id: string;
  email: string;
  status: string;
  emailVerifiedAt: string | null;
  createdAt: string;
};

type ExistingClaimRow = {
  userId: string;
  ledgerId: string | null;
  claimedAt: string;
};

export async function getLaunchPromoStatus(
  env: AppEnv,
  userId: string | null,
  nowMs = Date.now(),
): Promise<LaunchPromoStatusResponse> {
  const windowState = resolveWindowState(nowMs);
  const base = {
    promoId: LAUNCH_PROMO_ID,
    coins: LAUNCH_PROMO_COINS,
    startsAt: LAUNCH_PROMO_START_ISO,
    endsAt: LAUNCH_PROMO_END_ISO,
    windowState,
  };

  if (!userId) {
    return {
      ...base,
      authenticated: false,
      eligible: false,
      claimed: false,
      claimedAt: null,
      reason:
        windowState === "upcoming"
          ? "PROMO_NOT_STARTED"
          : windowState === "ended"
            ? "PROMO_EXPIRED"
            : "LOGIN_REQUIRED",
    };
  }

  const db = await ensurePromoClaimsTable(env);
  const user = await db
    .prepare(
      "SELECT id, email, status, email_verified_at AS emailVerifiedAt, created_at AS createdAt FROM users WHERE id = ?",
    )
    .bind(userId)
    .first<PromoUserRow>();

  if (!user || user.status !== "active") {
    return {
      ...base,
      authenticated: true,
      eligible: false,
      claimed: false,
      claimedAt: null,
      reason: "ACCOUNT_INACTIVE",
    };
  }

  const emailCanonicalHash = await sha256(`promo-email:${canonicalizeEmailForPromo(user.email)}`);
  const existing = await db
    .prepare(
      "SELECT user_id AS userId, ledger_id AS ledgerId, claimed_at AS claimedAt FROM promo_claims WHERE promo_id = ? AND (user_id = ? OR email_canonical_hash = ?) LIMIT 1",
    )
    .bind(LAUNCH_PROMO_ID, user.id, emailCanonicalHash)
    .first<ExistingClaimRow>();

  if (existing && existing.userId === user.id && existing.ledgerId) {
    return {
      ...base,
      authenticated: true,
      eligible: false,
      claimed: true,
      claimedAt: existing.claimedAt,
      reason: "ALREADY_CLAIMED",
    };
  }

  if (existing && existing.userId !== user.id) {
    return {
      ...base,
      authenticated: true,
      eligible: false,
      claimed: false,
      claimedAt: null,
      reason: "ALREADY_CLAIMED_EMAIL",
    };
  }

  if (windowState === "upcoming") {
    return { ...base, authenticated: true, eligible: false, claimed: false, claimedAt: null, reason: "PROMO_NOT_STARTED" };
  }
  if (windowState === "ended") {
    return { ...base, authenticated: true, eligible: false, claimed: false, claimedAt: null, reason: "PROMO_EXPIRED" };
  }
  if (!user.emailVerifiedAt) {
    return { ...base, authenticated: true, eligible: false, claimed: false, claimedAt: null, reason: "EMAIL_NOT_VERIFIED" };
  }

  const startMs = Date.parse(LAUNCH_PROMO_START_ISO);
  const endMs = Date.parse(LAUNCH_PROMO_END_ISO);
  const createdMs = Date.parse(user.createdAt);
  if (!Number.isFinite(createdMs) || createdMs < startMs || createdMs > endMs) {
    return {
      ...base,
      authenticated: true,
      eligible: false,
      claimed: false,
      claimedAt: null,
      reason: "NOT_ELIGIBLE_REGISTRATION_DATE",
    };
  }

  return {
    ...base,
    authenticated: true,
    eligible: true,
    claimed: false,
    claimedAt: null,
    reason: "ELIGIBLE",
  };
}

export async function claimLaunchPromo(
  env: AppEnv,
  userId: string,
  options: { ip?: string | null; nowMs?: number } = {},
): Promise<{
  promoId: string;
  coins: number;
  balance: number;
  ledgerId: string;
  claimedAt: string;
}> {
  const nowMs = options.nowMs ?? Date.now();
  const windowState = resolveWindowState(nowMs);
  if (windowState === "upcoming") throw new Error("PROMO_NOT_STARTED");
  if (windowState === "ended") throw new Error("PROMO_EXPIRED");

  const db = await ensurePromoClaimsTable(env);
  const user = await db
    .prepare(
      "SELECT id, email, status, email_verified_at AS emailVerifiedAt, created_at AS createdAt FROM users WHERE id = ?",
    )
    .bind(userId)
    .first<PromoUserRow>();

  if (!user || user.status !== "active") throw new Error("FORBIDDEN");
  if (!user.emailVerifiedAt) throw new Error("EMAIL_NOT_VERIFIED");

  const startMs = Date.parse(LAUNCH_PROMO_START_ISO);
  const endMs = Date.parse(LAUNCH_PROMO_END_ISO);
  const createdMs = Date.parse(user.createdAt);
  if (!Number.isFinite(createdMs) || createdMs < startMs || createdMs > endMs) {
    throw new Error("NOT_ELIGIBLE_REGISTRATION_DATE");
  }

  const emailCanonicalHash = await sha256(`promo-email:${canonicalizeEmailForPromo(user.email)}`);
  const trackableIp = normalizeTrackableIp(options.ip);
  const ipHash = trackableIp ? await sha256(`promo-ip:${trackableIp}`) : null;

  // Fast pre-check before touching writes or IP counters.
  const preExisting = await db
    .prepare(
      "SELECT user_id AS userId, ledger_id AS ledgerId, claimed_at AS claimedAt FROM promo_claims WHERE promo_id = ? AND (user_id = ? OR email_canonical_hash = ?) LIMIT 1",
    )
    .bind(LAUNCH_PROMO_ID, user.id, emailCanonicalHash)
    .first<ExistingClaimRow>();

  if (preExisting) {
    if (preExisting.userId !== user.id) throw new Error("PROMO_ALREADY_CLAIMED_EMAIL");
    if (preExisting.ledgerId) throw new Error("PROMO_ALREADY_CLAIMED");
    const claimAgeMs = nowMs - Date.parse(preExisting.claimedAt);
    if (Number.isFinite(claimAgeMs) && claimAgeMs < 5_000) {
      // Another in-flight request from this user is currently settling the ledger write.
      throw new Error("PROMO_ALREADY_CLAIMED");
    }
  }

  if (
    ipHash &&
    !preExisting &&
    typeof LAUNCH_PROMO_MAX_CLAIMS_PER_IP === "number" &&
    LAUNCH_PROMO_MAX_CLAIMS_PER_IP > 0
  ) {
    const ipRow = await db
      .prepare("SELECT COUNT(*) AS cnt FROM promo_claims WHERE promo_id = ? AND ip_hash = ? AND user_id <> ?")
      .bind(LAUNCH_PROMO_ID, ipHash, user.id)
      .first<{ cnt: number | null }>();
    if (Number(ipRow?.cnt ?? 0) >= LAUNCH_PROMO_MAX_CLAIMS_PER_IP) {
      throw new Error("PROMO_IP_LIMIT");
    }
  }

  const claimedAt = new Date(nowMs).toISOString();

  // Atomic lock: PRIMARY KEY (promo_id, user_id) and UNIQUE (promo_id, email_canonical_hash)
  // ensure at most one concurrent request can insert and advance to crediting coins.
  if (!preExisting) {
    const insertRes = await db
      .prepare(
        `INSERT OR IGNORE INTO promo_claims
          (promo_id, user_id, email_canonical_hash, coins, ip_hash, ledger_id, claimed_at)
         VALUES (?, ?, ?, ?, ?, NULL, ?)`,
      )
      .bind(LAUNCH_PROMO_ID, user.id, emailCanonicalHash, LAUNCH_PROMO_COINS, ipHash, claimedAt)
      .run();

    const changes = Number(insertRes.meta?.changes ?? 0);
    if (changes !== 1) {
      const raced = await db
        .prepare(
          "SELECT user_id AS userId FROM promo_claims WHERE promo_id = ? AND (user_id = ? OR email_canonical_hash = ?) LIMIT 1",
        )
        .bind(LAUNCH_PROMO_ID, user.id, emailCanonicalHash)
        .first<{ userId: string }>();
      if (raced && raced.userId !== user.id) throw new Error("PROMO_ALREADY_CLAIMED_EMAIL");
      throw new Error("PROMO_ALREADY_CLAIMED");
    }
  }

  // Deterministic idempotency key guarantees the coin ledger can NEVER credit twice
  // even across retries or worker restarts.
  const ledgerEntry = await appendLedgerEntry(env, {
    userId: user.id,
    amount: LAUNCH_PROMO_COINS,
    kind: "promo_bonus",
    reference: `promo:${LAUNCH_PROMO_ID}`,
    idempotencyKey: `promo:${LAUNCH_PROMO_ID}:${user.id}`,
    metadata: {
      promoId: LAUNCH_PROMO_ID,
      coins: LAUNCH_PROMO_COINS,
      source: "launch_banner",
    },
  });

  await db
    .prepare("UPDATE promo_claims SET ledger_id = ? WHERE promo_id = ? AND user_id = ?")
    .bind(ledgerEntry.id, LAUNCH_PROMO_ID, user.id)
    .run();

  try {
    await db
      .prepare(
        "INSERT INTO audit_events (id,actor_user_id,action,target_type,target_id,ip_hash,metadata_json,created_at) VALUES (?,?,?,?,?,?,?,?)",
      )
      .bind(
        randomId("audit"),
        user.id,
        "promo_claim",
        "promo",
        LAUNCH_PROMO_ID,
        ipHash,
        JSON.stringify({ promoId: LAUNCH_PROMO_ID, coins: LAUNCH_PROMO_COINS, ledgerId: ledgerEntry.id }),
        nowIso(),
      )
      .run();
  } catch {
    // Non-fatal in minimal test DB harnesses without audit_events table.
  }

  return {
    promoId: LAUNCH_PROMO_ID,
    coins: LAUNCH_PROMO_COINS,
    balance: ledgerEntry.balance,
    ledgerId: ledgerEntry.id,
    claimedAt: preExisting?.claimedAt ?? claimedAt,
  };
}
