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
export function errorResponse(error: unknown) { const code = error instanceof Error ? error.message : "ERROR"; const status = code === "FORBIDDEN" ? 403 : code === "CSRF" ? 403 : code === "INVALID_CREDENTIALS" ? 401 : code === "AUTH_RATE_LIMIT" ? 429 : ["INSUFFICIENT_COINS", "WALLET_CONFLICT_RETRY", "CHECKIN_CONFLICT_RETRY", "IDEMPOTENCY_CONFLICT"].includes(code) ? 409 : 400; return json({ error: status === 400 ? "REQUEST_FAILED" : code }, { status }); }
