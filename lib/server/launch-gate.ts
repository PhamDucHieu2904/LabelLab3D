import { cookies, headers } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getSessionUser } from "./auth";
import type { AppEnv } from "./db";
import { DEFAULT_SITE_SETTINGS, getLiveSiteSettings } from "./site-config";

function isLocalHost(hostHeader: string | null): boolean {
  if (!hostHeader) return false;
  const host = hostHeader.trim().toLowerCase();
  const hostname = host.startsWith("[")
    ? host.slice(0, host.indexOf("]") + 1)
    : host.split(":")[0];
  return hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "[::1]"
    || hostname.endsWith(".localhost");
}

/**
 * Determine whether public storefront pages should render the maintenance gate.
 * - Always bypassed in local development (`NODE_ENV !== "production"`) and on
 *   localhost/127.0.0.1 hosts so local testing works immediately without admin login.
 * - In production, reads D1 `site_config` `settings.maintenance` (defaults to `false`
 *   now that HyperMockup is officially live) and automatically bypasses for authenticated `admin` sessions.
 */
export async function shouldShowComingSoon(): Promise<boolean> {
  if (process.env.NODE_ENV !== "production") return false;
  const host = (await headers()).get("host");
  if (isLocalHost(host)) return false;

  try {
    const { env } = await getCloudflareContext({ async: true });
    const runtimeEnv = env as AppEnv;
    const token = (await cookies()).get("ll_session")?.value ?? null;
    const [settings, user] = await Promise.all([
      getLiveSiteSettings(runtimeEnv),
      getSessionUser(runtimeEnv, token).catch(() => null),
    ]);
    if (user?.role === "admin") return false;
    return settings.maintenance;
  } catch {
    return DEFAULT_SITE_SETTINGS.maintenance;
  }
}
