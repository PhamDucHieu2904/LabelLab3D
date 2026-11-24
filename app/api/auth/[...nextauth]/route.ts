import type { NextRequest } from "next/server";
import { sameOriginRedirect } from "@/lib/auth/google-config";
import { createSession, getSessionUser, revokeSession } from "@/lib/server/auth";
import { requireDb } from "@/lib/server/db";
import { upsertGoogleUser } from "@/lib/server/google-account";
import {
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  TX_COOKIE_NAME,
  createCsrfTokenPair,
  exchangeGoogleCode,
  parseCookieHeader,
  readGoogleOAuthConfig,
  serializeCookie,
  startGoogleOAuth,
  verifyCsrfToken,
  verifyGoogleIdToken,
  verifyOAuthTransaction,
} from "@/lib/server/google-oauth";
import { env } from "@/lib/server/http";

type RouteContext = { params: Promise<{ nextauth: string[] }> };

function noStoreJson(data: unknown, status = 200, cookies: string[] = []): Response {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(JSON.stringify(data), { status, headers });
}

function redirectResponse(location: string, cookies: string[] = []): Response {
  const headers = new Headers({
    Location: location,
    "Cache-Control": "no-store",
  });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}

async function readFormOrJsonBody(request: NextRequest): Promise<Record<string, string>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const raw = await request.json().catch(() => ({})) as Record<string, unknown>;
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        result[key] = String(value);
      }
    }
    return result;
  }
  const text = await request.text().catch(() => "");
  return Object.fromEntries(new URLSearchParams(text).entries());
}

async function authRoute(request: NextRequest, context: RouteContext) {
  const { nextauth } = await context.params;
  const action = nextauth[0] ?? "";
  const providerId = nextauth[1] ?? "";
  const runtimeEnv = await env();
  const config = readGoogleOAuthConfig(runtimeEnv, request.nextUrl.origin);
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const secureCookies = (config?.origin ?? request.nextUrl.origin).startsWith("https://");

  if (action === "_log") {
    return noStoreJson({ ok: true });
  }

  // Always serve session status from the authoritative D1 `ll_session` cookie
  // so `useSession()` and `/api/account/me` stay in lockstep.
  if (request.method === "GET" && action === "session") {
    try {
      const user = await getSessionUser(runtimeEnv, cookies[SESSION_COOKIE_NAME] ?? null);
      if (!user) return noStoreJson({});
      let image: string | null = null;
      try {
        const linked = await requireDb(runtimeEnv).prepare(
          "SELECT avatar_url AS avatarUrl FROM oauth_accounts WHERE user_id=? ORDER BY updated_at DESC LIMIT 1",
        ).bind(user.id).first<{ avatarUrl: string | null }>();
        image = linked?.avatarUrl ?? null;
      } catch {
        image = null;
      }
      return noStoreJson({
        user: { name: user.name, email: user.email, image },
        expires: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      });
    } catch {
      return noStoreJson({});
    }
  }

  if (!config) {
    const publicRead = request.method === "GET" && nextauth.length === 1 && action === "providers";
    return noStoreJson(
      publicRead ? {} : { error: "Authentication is not configured." },
      publicRead ? 200 : 503,
    );
  }

  if (request.method === "GET" && action === "providers") {
    return noStoreJson({
      google: {
        id: "google",
        name: "Google",
        type: "oauth",
        signinUrl: `${config.origin}/api/auth/signin/google`,
        callbackUrl: `${config.origin}/api/auth/callback/google`,
      },
    });
  }

  if (request.method === "GET" && action === "csrf") {
    const { csrfToken, cookieValue } = await createCsrfTokenPair(config.secret);
    return noStoreJson(
      { csrfToken },
      200,
      [serializeCookie(CSRF_COOKIE_NAME, cookieValue, { path: "/", secure: secureCookies, sameSite: "Lax", maxAge: 3600 })],
    );
  }

  if (request.method === "POST" && action === "signout") {
    const body = await readFormOrJsonBody(request);
    const validCsrf = await verifyCsrfToken(config.secret, cookies[CSRF_COOKIE_NAME], body.csrfToken);
    if (!validCsrf) {
      return noStoreJson({ error: "Invalid CSRF token." }, 403);
    }
    try {
      await revokeSession(runtimeEnv, cookies[SESSION_COOKIE_NAME] ?? null);
    } catch {
      // Clear browser cookie even if session row was already removed.
    }
    const clearCookies = [
      serializeCookie(SESSION_COOKIE_NAME, "", { path: "/", secure: secureCookies, sameSite: "Lax", maxAge: 0 }),
    ];
    const targetUrl = sameOriginRedirect(body.callbackUrl || config.origin, config.origin);
    if (body.json === "true") {
      return noStoreJson({ url: targetUrl }, 200, clearCookies);
    }
    return redirectResponse(targetUrl, clearCookies);
  }

  if ((request.method === "POST" || request.method === "GET") && action === "signin" && providerId === "google") {
    let rawCallbackUrl = request.nextUrl.searchParams.get("callbackUrl") || config.origin;
    let wantsJson = false;
    if (request.method === "POST") {
      const body = await readFormOrJsonBody(request);
      const validCsrf = await verifyCsrfToken(config.secret, cookies[CSRF_COOKIE_NAME], body.csrfToken);
      if (!validCsrf) {
        const failUrl = `${config.origin}/?error=OAuthSignin`;
        return body.json === "true" ? noStoreJson({ url: failUrl }, 200) : redirectResponse(failUrl);
      }
      if (body.callbackUrl) rawCallbackUrl = body.callbackUrl;
      wantsJson = body.json === "true";
    }
    const started = await startGoogleOAuth(config, rawCallbackUrl);
    const txCookie = serializeCookie(TX_COOKIE_NAME, started.txCookieValue, {
      path: "/api/auth",
      secure: secureCookies,
      sameSite: "Lax",
      maxAge: 600,
    });
    if (wantsJson) {
      return noStoreJson({ url: started.url }, 200, [txCookie]);
    }
    return redirectResponse(started.url, [txCookie]);
  }

  if (request.method === "GET" && action === "callback" && providerId === "google") {
    const clearTxCookie = serializeCookie(TX_COOKIE_NAME, "", {
      path: "/api/auth",
      secure: secureCookies,
      sameSite: "Lax",
      maxAge: 0,
    });
    const failRedirect = (code: string) => redirectResponse(`${config.origin}/?error=${encodeURIComponent(code)}`, [clearTxCookie]);

    const providerError = request.nextUrl.searchParams.get("error");
    if (providerError) {
      console.error("[google-oauth] provider error:", providerError);
      return failRedirect("OAuthCallback");
    }

    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    if (!code || !state) {
      console.error("[google-oauth] missing code or state");
      return failRedirect("OAuthCallback");
    }

    const tx = await verifyOAuthTransaction(config.secret, cookies[TX_COOKIE_NAME], state);
    if (!tx) {
      console.error("[google-oauth] invalid or expired transaction cookie");
      return failRedirect("OAuthCallback");
    }

    try {
      const { idToken } = await exchangeGoogleCode(config, { code, codeVerifier: tx.codeVerifier });
      const claims = await verifyGoogleIdToken(idToken, {
        clientId: config.clientId,
        expectedNonce: tx.nonce,
      });
      const dbUser = await upsertGoogleUser(runtimeEnv, {
        sub: claims.sub,
        email: claims.email,
        name: claims.name,
        avatarUrl: claims.avatarUrl,
      });
      const session = await createSession(runtimeEnv, dbUser);
      const sessionCookieHeader = serializeCookie(SESSION_COOKIE_NAME, session.token, {
        path: "/",
        httpOnly: true,
        secure: secureCookies,
        sameSite: "Lax",
        expires: new Date(session.expiresAt),
      });
      const destination = sameOriginRedirect(tx.callbackUrl, config.origin);
      return redirectResponse(destination, [clearTxCookie, sessionCookieHeader]);
    } catch (error) {
      console.error(
        "[google-oauth] callback failed:",
        error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      );
      return failRedirect("OAuthCallback");
    }
  }

  return noStoreJson({ error: "Not found." }, 404);
}

export { authRoute as GET, authRoute as POST };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
