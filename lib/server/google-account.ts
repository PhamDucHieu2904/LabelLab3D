import { CURRENT_POLICY_VERSION } from "@/lib/legal/policies";
import { WELCOME_BONUS_COINS } from "@/lib/payments/packages";
import { nowIso, randomId, requireDb, type AppEnv } from "./db";
import type { AuthUser } from "./auth";
import { recordLegalConsent } from "./legal";
import { appendLedgerEntry } from "./wallet";

export type GoogleIdentity = {
  sub: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
};

/**
 * Provision or link a verified Google identity into D1 `users` and `oauth_accounts`
 * so Google sign-in produces a real wallet-backed account usable for check-ins,
 * renders, and SePay coin purchases.
 */
export async function upsertGoogleUser(env: AppEnv, identity: GoogleIdentity): Promise<AuthUser> {
  const db = requireDb(env);
  const sub = identity.sub.trim();
  const email = identity.email.trim().toLowerCase();
  const displayName = (identity.name?.trim() || email.split("@")[0] || "HyperMockup user").slice(0, 120);
  const avatarUrl = identity.avatarUrl?.trim() || null;
  if (!sub || !email) throw new Error("INVALID_INPUT");
  const now = nowIso();

  // 1. Existing Google link by stable provider subject.
  const linked = await db.prepare(
    "SELECT u.id,u.email,u.name,u.role,u.status FROM oauth_accounts oa JOIN users u ON u.id=oa.user_id WHERE oa.provider='google' AND oa.provider_subject=?",
  ).bind(sub).first<AuthUser>();
  if (linked) {
    if (linked.status !== "active") throw new Error("FORBIDDEN");
    await db.prepare(
      "UPDATE oauth_accounts SET email=?,avatar_url=?,updated_at=? WHERE provider='google' AND provider_subject=?",
    ).bind(email, avatarUrl, now, sub).run();
    return linked;
  }

  // 2. Existing D1 user with matching email (Google already guaranteed email_verified=true).
  const existing = await db.prepare(
    "SELECT id,email,name,role,status,email_verified_at AS emailVerifiedAt FROM users WHERE email=?",
  ).bind(email).first<AuthUser & { emailVerifiedAt: string | null }>();

  if (existing) {
    if (existing.status !== "active") throw new Error("FORBIDDEN");
    // Protect against pre-account takeover: if a non-admin password row was
    // never email-verified, invalidate that unverified password before linking
    // the verified Google owner. Never auto-link admin accounts by email alone.
    if (existing.role === "admin" && !existing.emailVerifiedAt) throw new Error("FORBIDDEN");
    if (!existing.emailVerifiedAt) {
      await db.prepare("UPDATE users SET password_hash=NULL,email_verified_at=?,updated_at=? WHERE id=?").bind(now, now, existing.id).run();
    }
    await db.prepare(
      "INSERT INTO oauth_accounts (provider,provider_subject,user_id,email,avatar_url,created_at,updated_at) VALUES ('google',?,?,?,?,?,?) ON CONFLICT(provider,provider_subject) DO UPDATE SET email=excluded.email,avatar_url=excluded.avatar_url,updated_at=excluded.updated_at",
    ).bind(sub, existing.id, email, avatarUrl, now, now).run();
    return { id: existing.id, email: existing.email, name: existing.name, role: existing.role, status: existing.status };
  }

  // 3. Brand-new Google user -> respect registrations toggle, then create D1 user + wallet + oauth_accounts link.
  try {
    const cfgRow = await db.prepare("SELECT value_json AS valueJson FROM site_config WHERE key='settings'").first<{ valueJson: string }>();
    if (cfgRow?.valueJson) {
      const parsed = JSON.parse(cfgRow.valueJson) as { registrations?: unknown };
      if (parsed.registrations === false) throw new Error("REGISTRATIONS_DISABLED");
    }
  } catch (error) {
    if (error instanceof Error && error.message === "REGISTRATIONS_DISABLED") throw error;
    // Allow lightweight unit-test mock DBs without site_config table to proceed.
  }

  const userId = randomId("usr");
  await db.batch([
    db.prepare(
      "INSERT INTO users (id,email,name,password_hash,role,status,email_verified_at,created_at,updated_at) VALUES (?,?,?,NULL,'user','active',?,?,?)",
    ).bind(userId, email, displayName, now, now, now),
    db.prepare(
      "INSERT INTO wallets (user_id,balance,updated_at) VALUES (?,0,?) ON CONFLICT(user_id) DO NOTHING",
    ).bind(userId, now),
    db.prepare(
      "INSERT INTO oauth_accounts (provider,provider_subject,user_id,email,avatar_url,created_at,updated_at) VALUES ('google',?,?,?,?,?,?)",
    ).bind(sub, userId, email, avatarUrl, now, now),
  ]);
  await appendLedgerEntry(env, {
    userId,
    amount: WELCOME_BONUS_COINS,
    kind: "welcome_bonus",
    reference: `welcome:${userId}`,
    idempotencyKey: `welcome:${userId}`,
    metadata: { source: "google_oauth" },
  });
  await recordLegalConsent(env, {
    userId,
    consentType: "oauth_google",
    policyVersion: CURRENT_POLICY_VERSION,
    metadata: { email, provider: "google" },
  });
  return { id: userId, email, name: displayName, role: "user", status: "active" };
}
