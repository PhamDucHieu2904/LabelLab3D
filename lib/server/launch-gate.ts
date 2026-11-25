import { cookies } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getSessionUser } from "./auth";
import type { AppEnv } from "./db";
import { DEFAULT_SITE_SETTINGS, getLiveSiteSettings } from "./site-config";

/**
 * Determine whether public storefront pages should render the Coming Soon gate.
 * - Reads D1 `site_config` `settings.maintenance` (defaults to `true` until launch).
 * - Authenticated `admin` sessions automatically bypass Coming Soon so the owner
 *   can verify Home, Studio, auth, and payments live on hypermockup.com.
 * - Fails open in local non-production dev when Cloudflare D1 isn't bound,
 *   and fails closed to the configured default in production.
 */
export async function shouldShowComingSoon(): Promise<boolean> {
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
    return process.env.NODE_ENV === "production" ? DEFAULT_SITE_SETTINGS.maintenance : false;
  }
}
