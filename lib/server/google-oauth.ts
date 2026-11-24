import { getGoogleAuthConfig, isVerifiedGoogleProfile, sameOriginRedirect } from "@/lib/auth/google-config";
import { base64Url, base64UrlBytes, constantTimeEqual, sha256, type AppEnv } from "./db";

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS_ENDPOINT = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

const TX_TTL_MS = 10 * 60_000;
const JWKS_TTL_MS = 10 * 60_000;
const CLOCK_SKEW_SEC = 60;

export const CSRF_COOKIE_NAME = "ll_auth_csrf";
export const TX_COOKIE_NAME = "ll_oauth_tx";
export const SESSION_COOKIE_NAME = "ll_session";

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  secret: string;
  origin: string;
};

export type GoogleOAuthTransaction = {
  state: string;
  nonce: string;
  codeVerifier: string;
  callbackUrl: string;
  exp: number;
};

export type VerifiedGoogleClaims = {
  sub: string;
  email: string;
  name?: string;
  avatarUrl?: string;
};

type GoogleJwk = JsonWebKey & { kid?: string; use?: string; alg?: string };

let cachedJwks: { keys: GoogleJwk[]; expiresAt: number } | null = null;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function randomBase64Url(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

export function mergedGoogleAuthEnv(runtimeEnv: AppEnv, requestOrigin: string): Record<string, string | undefined> {
  const pick = (key: string) => {
    const binding = runtimeEnv[key];
    if (typeof binding === "string" && binding.trim()) return binding.trim();
    const proc = process.env[key];
    return typeof proc === "string" && proc.trim() ? proc.trim() : undefined;
  };
  return {
    GOOGLE_CLIENT_ID: pick("GOOGLE_CLIENT_ID"),
    GOOGLE_CLIENT_SECRET: pick("GOOGLE_CLIENT_SECRET"),
    NEXTAUTH_SECRET: pick("NEXTAUTH_SECRET"),
    NEXTAUTH_URL: pick("NEXTAUTH_URL") ?? requestOrigin,
  };
}

export function readGoogleOAuthConfig(runtimeEnv: AppEnv, requestOrigin: string): GoogleOAuthConfig | null {
  const authEnv = mergedGoogleAuthEnv(runtimeEnv, requestOrigin);
  const config = getGoogleAuthConfig(authEnv);
  if (!config || !authEnv.NEXTAUTH_URL) return null;
  return {
    ...config,
    origin: new URL(authEnv.NEXTAUTH_URL).origin,
  };
}

async function hmacSha256(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return base64Url(new Uint8Array(signature));
}

export async function signCookiePayload(secret: string, purpose: string, payload: unknown): Promise<string> {
  const body = base64Url(encoder.encode(JSON.stringify(payload)));
  const sig = await hmacSha256(secret, `${purpose}.${body}`);
  return `${body}.${sig}`;
}

export async function verifyCookiePayload<T>(secret: string, purpose: string, raw: string | undefined): Promise<T | null> {
  if (!raw || raw.length > 4096) return null;
  const dot = raw.indexOf(".");
  if (dot <= 0 || dot !== raw.lastIndexOf(".")) return null;
  const body = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!body || !sig) return null;
  const expected = await hmacSha256(secret, `${purpose}.${body}`);
  if (!(await constantTimeEqual(sig, expected))) return null;
  try {
    return JSON.parse(decoder.decode(base64UrlBytes(body))) as T;
  } catch {
    return null;
  }
}

export async function createCsrfTokenPair(secret: string): Promise<{ csrfToken: string; cookieValue: string }> {
  const csrfToken = randomBase64Url(32);
  const cookieValue = await signCookiePayload(secret, "csrf", { t: csrfToken });
  return { csrfToken, cookieValue };
}

export async function verifyCsrfToken(
  secret: string,
  cookieValue: string | undefined,
  submittedToken: string | undefined,
): Promise<boolean> {
  if (!submittedToken || submittedToken.length > 256) return false;
  const parsed = await verifyCookiePayload<{ t?: unknown }>(secret, "csrf", cookieValue);
  if (!parsed || typeof parsed.t !== "string" || !parsed.t) return false;
  return constantTimeEqual(parsed.t, submittedToken);
}

export async function startGoogleOAuth(
  config: GoogleOAuthConfig,
  rawCallbackUrl: string,
  nowMs = Date.now(),
): Promise<{ url: string; txCookieValue: string; state: string; nonce: string; codeVerifier: string }> {
  const callbackUrl = sameOriginRedirect(rawCallbackUrl, config.origin);
  const state = randomBase64Url(32);
  const nonce = randomBase64Url(32);
  const codeVerifier = randomBase64Url(32);
  const codeChallenge = await sha256(codeVerifier);

  const tx: GoogleOAuthTransaction = {
    state,
    nonce,
    codeVerifier,
    callbackUrl,
    exp: nowMs + TX_TTL_MS,
  };
  const txCookieValue = await signCookiePayload(config.secret, "google-tx", tx);

  const authUrl = new URL(GOOGLE_AUTH_ENDPOINT);
  authUrl.searchParams.set("client_id", config.clientId);
  authUrl.searchParams.set("redirect_uri", `${config.origin}/api/auth/callback/google`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("prompt", "select_account");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("nonce", nonce);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  return { url: authUrl.toString(), txCookieValue, state, nonce, codeVerifier };
}

export async function verifyOAuthTransaction(
  secret: string,
  cookieValue: string | undefined,
  returnedState: string | null,
  nowMs = Date.now(),
): Promise<GoogleOAuthTransaction | null> {
  if (!returnedState) return null;
  const tx = await verifyCookiePayload<GoogleOAuthTransaction>(secret, "google-tx", cookieValue);
  if (
    !tx
    || typeof tx.state !== "string"
    || typeof tx.nonce !== "string"
    || typeof tx.codeVerifier !== "string"
    || typeof tx.callbackUrl !== "string"
    || typeof tx.exp !== "number"
  ) {
    return null;
  }
  if (nowMs >= tx.exp) return null;
  if (!(await constantTimeEqual(tx.state, returnedState))) return null;
  return tx;
}

export async function exchangeGoogleCode(
  config: GoogleOAuthConfig,
  input: { code: string; codeVerifier: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ idToken: string }> {
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: `${config.origin}/api/auth/callback/google`,
    code_verifier: input.codeVerifier,
  });
  const response = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: form.toString(),
  });
  if (!response.ok) {
    throw new Error(`GOOGLE_TOKEN_HTTP_${response.status}`);
  }
  const payload = await response.json().catch(() => null) as { id_token?: unknown } | null;
  if (!payload || typeof payload.id_token !== "string" || !payload.id_token) {
    throw new Error("GOOGLE_TOKEN_MISSING_ID_TOKEN");
  }
  return { idToken: payload.id_token };
}

async function loadGoogleJwks(fetchImpl: typeof fetch, forceRefresh: boolean, nowMs: number): Promise<GoogleJwk[]> {
  if (!forceRefresh && cachedJwks && nowMs < cachedJwks.expiresAt) {
    return cachedJwks.keys;
  }
  const response = await fetchImpl(GOOGLE_JWKS_ENDPOINT, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`GOOGLE_JWKS_HTTP_${response.status}`);
  const payload = await response.json().catch(() => null) as { keys?: unknown } | null;
  if (!payload || !Array.isArray(payload.keys)) throw new Error("GOOGLE_JWKS_INVALID");
  const keys = payload.keys as GoogleJwk[];
  cachedJwks = { keys, expiresAt: nowMs + JWKS_TTL_MS };
  return keys;
}

function findMatchingRsaKey(keys: GoogleJwk[], kid: string): GoogleJwk | undefined {
  return keys.find((key) => key.kid === kid && key.kty === "RSA" && (!key.use || key.use === "sig") && Boolean(key.n) && Boolean(key.e));
}

export async function verifyGoogleIdToken(
  idToken: string,
  options: {
    clientId: string;
    expectedNonce: string;
    nowMs?: number;
    jwks?: GoogleJwk[];
    fetchImpl?: typeof fetch;
  },
): Promise<VerifiedGoogleClaims> {
  const parts = idToken.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) throw new Error("GOOGLE_ID_TOKEN_MALFORMED");
  const [headerB64, payloadB64, signatureB64] = parts;

  let header: { alg?: unknown; kid?: unknown };
  let claims: Record<string, unknown>;
  try {
    header = JSON.parse(decoder.decode(base64UrlBytes(headerB64))) as { alg?: unknown; kid?: unknown };
    claims = JSON.parse(decoder.decode(base64UrlBytes(payloadB64))) as Record<string, unknown>;
  } catch {
    throw new Error("GOOGLE_ID_TOKEN_MALFORMED");
  }

  if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) {
    throw new Error("GOOGLE_ID_TOKEN_UNSUPPORTED_ALG");
  }

  const nowMs = options.nowMs ?? Date.now();
  const fetchImpl = options.fetchImpl ?? fetch;
  let jwk: GoogleJwk | undefined;
  if (options.jwks) {
    jwk = findMatchingRsaKey(options.jwks, header.kid);
  } else {
    const firstKeys = await loadGoogleJwks(fetchImpl, false, nowMs);
    jwk = findMatchingRsaKey(firstKeys, header.kid);
    if (!jwk) {
      const refreshedKeys = await loadGoogleJwks(fetchImpl, true, nowMs);
      jwk = findMatchingRsaKey(refreshedKeys, header.kid);
    }
  }
  if (!jwk) throw new Error("GOOGLE_ID_TOKEN_UNKNOWN_KID");

  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signatureValid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    base64UrlBytes(signatureB64) as unknown as BufferSource,
    encoder.encode(`${headerB64}.${payloadB64}`),
  );
  if (!signatureValid) throw new Error("GOOGLE_ID_TOKEN_BAD_SIGNATURE");

  const nowSec = Math.floor(nowMs / 1000);
  if (typeof claims.iss !== "string" || !GOOGLE_ISSUERS.has(claims.iss)) {
    throw new Error("GOOGLE_ID_TOKEN_BAD_ISS");
  }
  const audMatches = claims.aud === options.clientId
    || (Array.isArray(claims.aud) && claims.aud.includes(options.clientId) && claims.azp === options.clientId);
  if (!audMatches) throw new Error("GOOGLE_ID_TOKEN_BAD_AUD");
  if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_SEC <= nowSec) {
    throw new Error("GOOGLE_ID_TOKEN_EXPIRED");
  }
  if (typeof claims.iat === "number" && claims.iat - 300 > nowSec) {
    throw new Error("GOOGLE_ID_TOKEN_FUTURE_IAT");
  }
  if (typeof claims.nonce !== "string" || !(await constantTimeEqual(claims.nonce, options.expectedNonce))) {
    throw new Error("GOOGLE_ID_TOKEN_BAD_NONCE");
  }
  if (!isVerifiedGoogleProfile(claims)) {
    throw new Error("GOOGLE_ID_TOKEN_UNVERIFIED_EMAIL");
  }

  return {
    sub: String(claims.sub).trim(),
    email: String(claims.email).trim().toLowerCase(),
    name: typeof claims.name === "string" && claims.name.trim() ? claims.name.trim() : undefined,
    avatarUrl: typeof claims.picture === "string" && claims.picture.trim() ? claims.picture.trim() : undefined,
  };
}

export function serializeCookie(
  name: string,
  value: string,
  options: {
    path?: string;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "Lax" | "Strict" | "None";
    maxAge?: number;
    expires?: Date;
  } = {},
): string {
  const segments = [`${name}=${encodeURIComponent(value)}`];
  segments.push(`Path=${options.path ?? "/"}`);
  if (options.httpOnly !== false) segments.push("HttpOnly");
  if (options.secure) segments.push("Secure");
  segments.push(`SameSite=${options.sameSite ?? "Lax"}`);
  if (typeof options.maxAge === "number") segments.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  if (options.expires) segments.push(`Expires=${options.expires.toUTCString()}`);
  return segments.join("; ");
}

export function parseCookieHeader(header: string | null): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    const rawValue = part.slice(eq + 1).trim();
    if (!key) continue;
    try {
      result[key] = decodeURIComponent(rawValue);
    } catch {
      result[key] = rawValue;
    }
  }
  return result;
}
