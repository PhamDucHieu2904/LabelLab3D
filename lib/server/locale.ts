import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, resolveInitialLocale, type UiLocale } from "@/lib/i18n/locale";

/**
 * Resolve the visitor's initial UI locale on the server from:
 * 1. Explicit ?lang=vi|en query parameter (optional)
 * 2. Persisted hm_lang cookie (user manual selection)
 * 3. Geo-IP header (cf-ipcountry / x-vercel-ip-country: VN -> vi, else -> en)
 * Safely falls back to "vi" during static prerender contexts where headers/cookies
 * are unavailable.
 */
export async function readServerLocale(queryLang?: string | null): Promise<UiLocale> {
  try {
    const [cookieStore, reqHeaders] = await Promise.all([cookies(), headers()]);
    const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value ?? null;
    const countryHeader = reqHeaders.get("cf-ipcountry") ?? reqHeaders.get("x-vercel-ip-country") ?? null;
    return resolveInitialLocale({ queryLang, cookieLocale, countryHeader });
  } catch {
    return resolveInitialLocale({ queryLang });
  }
}
