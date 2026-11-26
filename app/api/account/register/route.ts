import { headers } from "next/headers";
import { hashPassword } from "@/lib/server/password";
import { randomId, nowIso, requireDb } from "@/lib/server/db";
import { env, json, errorResponse, sessionCookie, assertSameOrigin } from "@/lib/server/http";
import { assertRegistrationAllowed, recordRegistrationAttempt } from "@/lib/server/rate-limit";
import { verifyAndConsumeCode } from "@/lib/server/email-verification";
import { getLiveSiteSettings } from "@/lib/server/site-config";
import { recordLegalConsent } from "@/lib/server/legal";
import { appendLedgerEntry } from "@/lib/server/wallet";
import { CURRENT_POLICY_VERSION } from "@/lib/legal/policies";
import { WELCOME_BONUS_COINS } from "@/lib/payments/packages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const body = await request.json().catch(() => ({})) as {
      email?: unknown;
      name?: unknown;
      password?: unknown;
      verificationCode?: unknown;
      acceptedTerms?: unknown;
      acceptedPrivacy?: unknown;
    };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const verificationCode = typeof body.verificationCode === "string" ? body.verificationCode.trim() : "";
    const acceptedTerms = body.acceptedTerms === true;
    const acceptedPrivacy = body.acceptedPrivacy === true;

    if (!acceptedTerms || !acceptedPrivacy) {
      throw new Error("CONSENT_REQUIRED");
    }

    if (
      !/^\S+@\S+\.\S+$/.test(email) || email.length > 254
      || !name || name.length > 120
      || password.length < 12 || password.length > 128
      || !/[A-Za-z]/.test(password) || !/\d/.test(password)
    ) {
      throw new Error("INVALID_INPUT");
    }

    const runtimeEnv = await env();
    const siteSettings = await getLiveSiteSettings(runtimeEnv);
    if (!siteSettings.registrations) throw new Error("REGISTRATIONS_DISABLED");
    const db = requireDb(runtimeEnv);
    const requestHeaders = await headers();
    const ip = requestHeaders.get("cf-connecting-ip") ?? requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const registrationScope = await assertRegistrationAllowed(runtimeEnv, ip);

    const existing = await db.prepare("SELECT id FROM users WHERE email=?").bind(email).first<{ id: string }>();
    if (existing) throw new Error("EMAIL_EXISTS");

    await verifyAndConsumeCode(runtimeEnv, { email, purpose: "register", code: verificationCode });
    await recordRegistrationAttempt(runtimeEnv, registrationScope);

    const id = randomId("usr");
    const now = nowIso();
    const passwordHash = await hashPassword(password);
    await db.batch([
      db.prepare(
        "INSERT INTO users (id,email,name,password_hash,role,status,email_verified_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
      ).bind(id, email, name, passwordHash, "user", "active", now, now, now),
      db.prepare(
        "INSERT INTO wallets (user_id,balance,updated_at) VALUES (?,0,?) ON CONFLICT(user_id) DO NOTHING",
      ).bind(id, now),
    ]);
    await appendLedgerEntry(runtimeEnv, {
      userId: id,
      amount: WELCOME_BONUS_COINS,
      kind: "welcome_bonus",
      reference: `welcome:${id}`,
      idempotencyKey: `welcome:${id}`,
      metadata: { source: "email_register" },
    });
    await recordLegalConsent(runtimeEnv, {
      userId: id,
      consentType: "register_email",
      ip,
      policyVersion: CURRENT_POLICY_VERSION,
      metadata: { email, acceptedTerms: true, acceptedPrivacy: true },
    });
    await sessionCookie({ id, email, name, role: "user", status: "active" });
    return json({ user: { id, email, name, role: "user" }, welcomeBonus: WELCOME_BONUS_COINS }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
