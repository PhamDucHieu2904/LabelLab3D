"use client";

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const SITE_CONFIG_TTL_MS = 60_000;
const ACCOUNT_TTL_MS = 15_000;

let siteConfigCache: CacheEntry<Record<string, unknown> | null> | null = null;
let siteConfigPromise: Promise<Record<string, unknown> | null> | null = null;

let accountMeCache: CacheEntry<Record<string, unknown> | null> | null = null;
let accountMePromise: Promise<Record<string, unknown> | null> | null = null;

let checkInCache: CacheEntry<{ ok: boolean; data: Record<string, unknown> | null }> | null = null;
let checkInPromise: Promise<{ ok: boolean; data: Record<string, unknown> | null }> | null = null;

let listenerBound = false;

export function invalidateClientApiCache(scope: "account" | "all" = "all") {
  accountMeCache = null;
  accountMePromise = null;
  checkInCache = null;
  checkInPromise = null;
  if (scope === "all") {
    siteConfigCache = null;
    siteConfigPromise = null;
  }
}

function ensureInvalidationListener() {
  if (listenerBound || typeof window === "undefined") return;
  listenerBound = true;
  // Capture phase ensures cache invalidates BEFORE any bubble-phase component
  // listener calls fetch*Cached(), so all listeners coalesce into 1 request.
  window.addEventListener(
    "labellab-account-changed",
    () => {
      invalidateClientApiCache("all");
    },
    true,
  );
}

export async function fetchSiteConfigCached<T = Record<string, unknown>>(): Promise<T | null> {
  ensureInvalidationListener();
  const now = Date.now();
  if (siteConfigCache && siteConfigCache.expiresAt > now) {
    return siteConfigCache.value as T | null;
  }
  if (siteConfigPromise) {
    return (await siteConfigPromise) as T | null;
  }
  siteConfigPromise = fetch("/api/site/config", { credentials: "same-origin", cache: "no-store" })
    .then(async (res) => {
      if (!res.ok) return null;
      const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      siteConfigCache = { value: payload, expiresAt: Date.now() + SITE_CONFIG_TTL_MS };
      return payload;
    })
    .catch(() => null)
    .finally(() => {
      siteConfigPromise = null;
    });
  return (await siteConfigPromise) as T | null;
}

export async function fetchAccountMeCached<T = Record<string, unknown>>(): Promise<T | null> {
  ensureInvalidationListener();
  const now = Date.now();
  if (accountMeCache && accountMeCache.expiresAt > now) {
    return accountMeCache.value as T | null;
  }
  if (accountMePromise) {
    return (await accountMePromise) as T | null;
  }
  accountMePromise = fetch("/api/account/me", { credentials: "same-origin", cache: "no-store" })
    .then(async (res) => {
      const payload = res.ok
        ? ((await res.json().catch(() => ({ user: null }))) as Record<string, unknown>)
        : { user: null };
      accountMeCache = { value: payload, expiresAt: Date.now() + ACCOUNT_TTL_MS };
      return payload;
    })
    .catch(() => ({ user: null }))
    .finally(() => {
      accountMePromise = null;
    });
  return (await accountMePromise) as T | null;
}

export async function fetchCheckInCached<T = Record<string, unknown>>(): Promise<{ ok: boolean; data: T | null }> {
  ensureInvalidationListener();
  const now = Date.now();
  if (checkInCache && checkInCache.expiresAt > now) {
    return checkInCache.value as { ok: boolean; data: T | null };
  }
  if (checkInPromise) {
    return (await checkInPromise) as { ok: boolean; data: T | null };
  }
  checkInPromise = fetch("/api/account/check-in", { credentials: "same-origin", cache: "no-store" })
    .then(async (res) => {
      const data = res.ok ? ((await res.json().catch(() => null)) as Record<string, unknown> | null) : null;
      const result = { ok: res.ok, data };
      checkInCache = { value: result, expiresAt: Date.now() + ACCOUNT_TTL_MS };
      return result;
    })
    .catch(() => ({ ok: false, data: null }))
    .finally(() => {
      checkInPromise = null;
    });
  return (await checkInPromise) as { ok: boolean; data: T | null };
}
