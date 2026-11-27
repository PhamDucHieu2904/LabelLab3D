import { cookies, headers } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { AppEnv } from "./db";
import { createSession, getSessionUser, revokeSession, type AuthUser } from "./auth";

export async function env(): Promise<AppEnv> { return (await getCloudflareContext({ async: true })).env as AppEnv; }
export async function sessionUser() { return getSessionUser(await env(), (await cookies()).get("ll_session")?.value ?? null); }
export async function sessionCookie(user: AuthUser) {
  const token = await createSession(await env(), user);
  (await cookies()).set("ll_session", token.token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", expires: new Date(token.expiresAt) });
}
export async function clearSession() { const jar = await cookies(); await revokeSession(await env(), jar.get("ll_session")?.value ?? null); jar.set("ll_session", "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 }); }
export async function assertSameOrigin() {
  const h = await headers(), host = h.get("host"), origin = h.get("origin"), referer = h.get("referer");
  if (!host) throw new Error("CSRF");
  const candidate = origin || referer;
  // All mutating account/admin routes are browser endpoints. Requiring one of
  // these browser provenance headers prevents cross-site form submissions and
  // requests that intentionally omit Origin to bypass a CSRF check.
  if (!candidate) throw new Error("CSRF");
  try {
    if (new URL(candidate).host !== host) throw new Error("CSRF");
  } catch {
    throw new Error("CSRF");
  }
}
export function json(data: unknown, init?: ResponseInit) { return Response.json(data, { headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) }, ...init }); }
export function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "ERROR";
  const status = code === "FORBIDDEN" || code === "CSRF" || code === "REGION_RESTRICTED" ? 403
    : code === "INVALID_CREDENTIALS" ? 401
    : code === "AUTH_RATE_LIMIT" || code === "VERIFICATION_COOLDOWN" || code === "CODE_TOO_MANY_ATTEMPTS" || code === "FEEDBACK_COOLDOWN" || code === "FEEDBACK_DAILY_LIMIT" || code === "PROMO_IP_LIMIT" ? 429
    : code === "NOT_FOUND" ? 404
    : ["PAYMENT_NOT_CONFIGURED", "PAYMENT_PUBLIC_URL_REQUIRED", "PAYMENT_ENV_MISMATCH", "POLAR_CHECKOUT_FAILED", "EMAIL_NOT_CONFIGURED", "EMAIL_SEND_FAILED", "CHECKIN_DISABLED", "REGISTRATIONS_DISABLED"].includes(code) ? 503
    : ["EMAIL_EXISTS", "INSUFFICIENT_COINS", "WALLET_CONFLICT_RETRY", "CHECKIN_CONFLICT_RETRY", "IDEMPOTENCY_CONFLICT", "RESERVATION_CONFLICT", "RESERVATION_NOT_READY", "RESERVATION_EXPIRED", "RESERVATION_RELEASED", "RESERVATION_COMMITTED", "RESERVATION_REQUIRED", "SHARE_LIMIT_REACHED", "PROJECT_LIMIT_REACHED", "PROMO_ALREADY_CLAIMED", "PROMO_ALREADY_CLAIMED_EMAIL", "NOT_ELIGIBLE_REGISTRATION_DATE", "EMAIL_NOT_VERIFIED", "PROMO_NOT_STARTED", "PROMO_EXPIRED"].includes(code) ? 409
    : code === "PAYLOAD_TOO_LARGE" || code === "ASSET_TOO_LARGE" || code === "IMAGE_TOO_LARGE" ? 413
    : 400;
  const exposed = status === 400
    ? (["INVALID_CODE", "CODE_EXPIRED", "INVALID_INPUT", "CONSENT_REQUIRED"].includes(code) ? code : "REQUEST_FAILED")
    : code;
  if (status === 400 && exposed === "REQUEST_FAILED") {
    console.error("[api-error]", error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  }
  return json({ error: exposed }, { status });
}
