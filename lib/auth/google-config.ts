type AuthEnvironment = Record<string, string | undefined>;

export function getGoogleAuthConfig(env: AuthEnvironment = process.env) {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  const secret = env.NEXTAUTH_SECRET?.trim();
  const authUrl = env.NEXTAUTH_URL?.trim();
  if (!clientId || !clientSecret || !secret || secret.length < 32 || !authUrl) return null;

  try {
    const url = new URL(authUrl);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return null;
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
  } catch {
    return null;
  }
  return { clientId, clientSecret, secret };
}

export function isVerifiedGoogleProfile(profile: unknown): boolean {
  if (!profile || typeof profile !== "object") return false;
  const value = profile as Record<string, unknown>;
  return value.email_verified === true
    && typeof value.sub === "string" && value.sub.trim().length > 0
    && typeof value.email === "string" && value.email.trim().length > 0;
}

export function sameOriginRedirect(url: string, baseUrl: string): string {
  try {
    const target = new URL(url, baseUrl);
    return target.origin === new URL(baseUrl).origin ? target.href : baseUrl;
  } catch {
    return baseUrl;
  }
}
