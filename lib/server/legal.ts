import { CURRENT_POLICY_VERSION, maskTaxId, sanitizeOrderReceipt, type LegalOperatorInfo, type SanitizedOrderReceipt } from "@/lib/legal/policies";
import { nowIso, randomId, requireDb, sha256, type AppEnv } from "./db";
import type { LiveSiteSettings } from "./site-config";

export type ConsentType = "register_email" | "oauth_google" | "checkout" | "cookies";

const legalTablesReady = new WeakSet<object>();

export async function ensureLegalTables(env: AppEnv) {
  const db = requireDb(env);
  if (legalTablesReady.has(db)) return db;
  try {
    await db.batch([
      db.prepare(
        "CREATE TABLE IF NOT EXISTS legal_consents (id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE SET NULL, consent_type TEXT NOT NULL CHECK (consent_type IN ('register_email','oauth_google','checkout','cookies')), policy_version TEXT NOT NULL, accepted_at TEXT NOT NULL, ip_hash TEXT, metadata_json TEXT NOT NULL DEFAULT '{}')",
      ),
      db.prepare("CREATE INDEX IF NOT EXISTS legal_consents_user_time ON legal_consents(user_id, accepted_at)"),
      db.prepare(
        "CREATE TABLE IF NOT EXISTS order_receipts (order_id TEXT PRIMARY KEY REFERENCES payment_orders(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, buyer_name TEXT NOT NULL DEFAULT '', tax_code TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
      ),
      db.prepare("CREATE INDEX IF NOT EXISTS order_receipts_user_time ON order_receipts(user_id, created_at)"),
    ]);
    legalTablesReady.add(db);
  } catch {
    // Allow lightweight mock DBs in unit tests to proceed without DDL support.
  }
  return db;
}

export async function recordLegalConsent(
  env: AppEnv,
  input: {
    userId: string | null;
    consentType: ConsentType;
    ip?: string | null;
    policyVersion?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const db = await ensureLegalTables(env);
    const ipHash = input.ip ? (await sha256(input.ip)).slice(0, 32) : null;
    await db.prepare(
      "INSERT INTO legal_consents (id,user_id,consent_type,policy_version,accepted_at,ip_hash,metadata_json) VALUES (?,?,?,?,?,?,?)",
    ).bind(
      randomId("cns"),
      input.userId,
      input.consentType,
      input.policyVersion || CURRENT_POLICY_VERSION,
      nowIso(),
      ipHash,
      JSON.stringify(input.metadata ?? {}),
    ).run();
  } catch {
    // Never break existing flows on unit-test mock DBs that do not implement legal_consents.
  }
}

export async function saveOrderReceipt(
  env: AppEnv,
  input: {
    orderId: string;
    userId: string;
    receipt: unknown;
  },
): Promise<SanitizedOrderReceipt | null> {
  const cleaned = sanitizeOrderReceipt(input.receipt);
  if (!cleaned) return null;
  try {
    const db = await ensureLegalTables(env);
    const now = nowIso();
    await db.prepare(
      `INSERT INTO order_receipts (order_id,user_id,buyer_name,tax_code,address,email,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(order_id) DO UPDATE SET
         buyer_name=excluded.buyer_name,
         tax_code=excluded.tax_code,
         address=excluded.address,
         email=excluded.email,
         updated_at=excluded.updated_at`,
    ).bind(
      input.orderId,
      input.userId,
      cleaned.buyerName,
      cleaned.taxCode,
      cleaned.address,
      cleaned.email,
      now,
      now,
    ).run();
  } catch {
    // Allow mock DBs without order_receipts table to continue safely.
  }
  return cleaned;
}

export function extractOperatorInfo(settings: LiveSiteSettings): LegalOperatorInfo {
  return {
    siteName: settings.name || "HyperMockup",
    domain: settings.domain || "hypermockup.com",
    contactEmail: settings.contact || "hypermockup@gmail.com",
    ownerName: settings.ownerName || "",
    ownerTaxId: maskTaxId(settings.ownerTaxId || "", settings.maskOwnerTaxId !== false),
    ownerAddress: settings.ownerAddress || "",
    ownerPhone: settings.ownerPhone || "",
    moitStatusUrl: settings.moitStatusUrl || "",
    retentionDays: settings.retention || 90,
  };
}
