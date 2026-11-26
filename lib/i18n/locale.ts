export type UiLocale = "vi" | "en";

export const LOCALE_COOKIE = "hm_lang";
export const LOCALE_STORAGE_KEY = "hypermockup.locale.v1";

export function normalizeUiLocale(raw: unknown): UiLocale | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim().toLowerCase();
  if (cleaned === "vi" || cleaned === "vi-vn") return "vi";
  if (cleaned === "en" || cleaned === "en-us" || cleaned === "en-gb") return "en";
  return null;
}

/**
 * Default UI language from Cloudflare/proxy Geo-IP country header.
 * Visitors in Vietnam (or local dev without proxy headers) default to Vietnamese;
 * visitors outside Vietnam default to English.
 * Note: UI language is intentionally independent from payment currency, which stays
 * Geo-IP locked per Circular 32/2013/TT-NHNN.
 */
export function localeFromCountry(countryHeader: string | null | undefined): UiLocale {
  const cleaned = (countryHeader ?? "").trim().toUpperCase();
  if (!cleaned || cleaned === "XX" || cleaned === "T1" || cleaned === "VN") {
    return "vi";
  }
  return "en";
}

export function resolveInitialLocale(input: {
  queryLang?: string | null;
  cookieLocale?: string | null;
  countryHeader?: string | null;
}): UiLocale {
  return (
    normalizeUiLocale(input.queryLang)
    ?? normalizeUiLocale(input.cookieLocale)
    ?? localeFromCountry(input.countryHeader)
  );
}

export function numberLocale(locale: UiLocale): string {
  return locale === "vi" ? "vi-VN" : "en-US";
}
