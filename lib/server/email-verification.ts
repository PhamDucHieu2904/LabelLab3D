import { constantTimeEqual, nowIso, randomId, requireDb, sha256, type AppEnv } from "./db";
import { sendVerificationEmail } from "./email";

export type VerificationPurpose = "register" | "reset";

export const VERIFICATION_CODE_TTL_MS = 10 * 60_000;
export const VERIFICATION_COOLDOWN_MS = 60_000;
export const VERIFICATION_MAX_ATTEMPTS = 5;
const VERIFICATION_HOURLY_LIMIT = 6;
const VERIFICATION_WINDOW_MS = 60 * 60_000;

export function generateVerificationCode(): string {
  // Rejection-free uniform 6-digit code in [000000..999999].
  const limit = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000;
  const buf = new Uint32Array(1);
  while (true) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return String(buf[0] % 1_000_000).padStart(6, "0");
  }
}

export function hashVerificationCode(email: string, purpose: VerificationPurpose, code: string) {
  return sha256(`${purpose}:${email.trim().toLowerCase()}:${code.trim()}`);
}

export async function issueVerificationCode(
  env: AppEnv,
  input: { email: string; purpose: VerificationPurpose; ip: string; deliver?: typeof sendVerificationEmail },
): Promise<{ cooldownSeconds: number }> {
  const email = input.email.trim().toLowerCase();
  const db = requireDb(env);
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();

  // Enforce per-email resend cooldown (60 seconds).
  const latest = await db.prepare(
    "SELECT created_at AS createdAt FROM email_verification_codes WHERE email=? AND purpose=? ORDER BY created_at DESC LIMIT 1",
  ).bind(email, input.purpose).first<{ createdAt: string }>();
  if (latest && nowMs - Date.parse(latest.createdAt) < VERIFICATION_COOLDOWN_MS) {
    throw new Error("VERIFICATION_COOLDOWN");
  }

  // Enforce hourly cap per email and per IP using the shared auth_rate_limits table.
  const ipScope = `otp-ip:${await sha256(input.ip || "unknown")}`;
  const emailScope = `otp-email:${await sha256(`${input.purpose}:${email}`)}`;
  for (const scope of [ipScope, emailScope]) {
    const row = await db.prepare("SELECT failures,locked_until AS lockedUntil,updated_at AS updatedAt FROM auth_rate_limits WHERE scope=?").bind(scope).first<{ failures: number; lockedUntil: string | null; updatedAt: string }>();
    if (row?.lockedUntil && Date.parse(row.lockedUntil) > nowMs) throw new Error("AUTH_RATE_LIMIT");
    const recent = row && nowMs - Date.parse(row.updatedAt) < VERIFICATION_WINDOW_MS ? row.failures : 0;
    if (recent >= VERIFICATION_HOURLY_LIMIT) throw new Error("AUTH_RATE_LIMIT");
  }

  const code = generateVerificationCode();
  const codeHash = await hashVerificationCode(email, input.purpose, code);
  const id = randomId("otp");
  const expiresAt = new Date(nowMs + VERIFICATION_CODE_TTL_MS).toISOString();

  // Invalidate any older unconsumed codes for this email/purpose before issuing the new one.
  await db.prepare(
    "UPDATE email_verification_codes SET consumed_at=? WHERE email=? AND purpose=? AND consumed_at IS NULL",
  ).bind(now, email, input.purpose).run();
  await db.prepare(
    "INSERT INTO email_verification_codes (id,email,purpose,code_hash,attempts,expires_at,consumed_at,created_at) VALUES (?,?,?,?,0,?,NULL,?)",
  ).bind(id, email, input.purpose, codeHash, expiresAt, now).run();

  try {
    const deliver = input.deliver ?? sendVerificationEmail;
    await deliver(env, { to: email, purpose: input.purpose, code });
  } catch (error) {
    // Remove unsent code so the user isn't stuck on a 60s cooldown for a failed delivery.
    await db.prepare("DELETE FROM email_verification_codes WHERE id=?").bind(id).run();
    throw error;
  }

  // Record successful send against hourly rate limits.
  for (const scope of [ipScope, emailScope]) {
    const row = await db.prepare("SELECT failures,updated_at AS updatedAt FROM auth_rate_limits WHERE scope=?").bind(scope).first<{ failures: number; updatedAt: string }>();
    const recent = row && nowMs - Date.parse(row.updatedAt) < VERIFICATION_WINDOW_MS ? row.failures : 0;
    const next = recent + 1;
    const lockedUntil = next >= VERIFICATION_HOURLY_LIMIT ? new Date(nowMs + VERIFICATION_WINDOW_MS).toISOString() : null;
    await db.prepare(
      "INSERT INTO auth_rate_limits (scope,failures,locked_until,updated_at) VALUES (?,?,?,?) ON CONFLICT(scope) DO UPDATE SET failures=excluded.failures,locked_until=excluded.locked_until,updated_at=excluded.updated_at",
    ).bind(scope, next, lockedUntil, now).run();
  }

  return { cooldownSeconds: Math.round(VERIFICATION_COOLDOWN_MS / 1000) };
}

export async function verifyAndConsumeCode(
  env: AppEnv,
  input: { email: string; purpose: VerificationPurpose; code: string },
): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const code = input.code.trim();
  if (!/^\d{6}$/.test(code)) throw new Error("INVALID_CODE");
  const db = requireDb(env);
  const row = await db.prepare(
    "SELECT id,code_hash AS codeHash,attempts,expires_at AS expiresAt FROM email_verification_codes WHERE email=? AND purpose=? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1",
  ).bind(email, input.purpose).first<{ id: string; codeHash: string; attempts: number; expiresAt: string }>();
  if (!row) throw new Error("CODE_EXPIRED");
  if (Date.parse(row.expiresAt) <= Date.now()) {
    await db.prepare("UPDATE email_verification_codes SET consumed_at=? WHERE id=? AND consumed_at IS NULL").bind(nowIso(), row.id).run();
    throw new Error("CODE_EXPIRED");
  }
  if (row.attempts >= VERIFICATION_MAX_ATTEMPTS) {
    throw new Error("CODE_TOO_MANY_ATTEMPTS");
  }
  const suppliedHash = await hashVerificationCode(email, input.purpose, code);
  if (!(await constantTimeEqual(row.codeHash, suppliedHash))) {
    await db.prepare("UPDATE email_verification_codes SET attempts=attempts+1 WHERE id=?").bind(row.id).run();
    throw new Error("INVALID_CODE");
  }
  const consumed = await db.prepare(
    "UPDATE email_verification_codes SET consumed_at=? WHERE id=? AND consumed_at IS NULL",
  ).bind(nowIso(), row.id).run();
  if ((consumed.meta?.changes as number | undefined) !== 1) throw new Error("CODE_EXPIRED");
}
