import { createManagementData, migrateManagementData, persistentManagementData, type ManagementRecord } from "@/lib/admin/management-data";
import {
  COIN_PACKAGES,
  DEFAULT_DIELINE_COIN_COST,
  DEFAULT_PROJECT_EXTEND_COIN_COST,
  DEFAULT_RENDER_COIN_COST,
  DEFAULT_SHARE_COIN_COST,
  type CoinPackage,
  type CoinPackageBadge,
  type CoinRegion,
} from "@/lib/payments/packages";
import { LABELLAB_UPDATES, LEGACY_DEMO_ANNOUNCEMENT_TITLES } from "@/lib/labellab/updates";
import { nowIso, requireDb, type AppEnv } from "./db";

export type LiveCheckInConfig = {
  enabled: boolean;
  reward: number;
  dailyLimit: number;
  schedule: number[];
  condition: string;
};

export type LiveAnnouncement = {
  id: string;
  tone: "pink" | "blue" | "mint";
  category: string;
  pinned: boolean;
  title: string;
  body: string;
  titleEn?: string;
  bodyEn?: string;
  ctaLabel?: string;
  ctaLabelEn?: string;
  time: string;
  url: string;
  unread: boolean;
};

export type LiveCoinPackage = CoinPackage & {
  id: string;
  enabled: boolean;
};

export type LiveSiteSettings = {
  name: string;
  domain: string;
  timezone: "Asia/Ho_Chi_Minh" | "UTC";
  locale: "en" | "vi";
  contact: string;
  ownerName: string;
  ownerTaxId: string;
  maskOwnerTaxId: boolean;
  ownerAddress: string;
  ownerPhone: string;
  moitStatusUrl: string;
  usdToVndRate: number;
  maintenance: boolean;
  resolutions: number[];
  tileThreshold: number;
  freeDownloads: number;
  renderCost: number;
  dielineCost: number;
  shareCost: number;
  projectExtendCost: number;
  emailVerified: boolean;
  sessionHours: number;
  loginLimit: number;
  registrations: boolean;
  botPatterns: string;
  excludedIPs: string;
  retention: number;
  consent: boolean;
  excludeOwner: boolean;
  analytics: boolean;
  storagePublicId: string;
  analyticsPublicId: string;
};

export const DEFAULT_CHECKIN_SCHEDULE = [10, 10, 10, 20, 10, 10, 30];

export const DEFAULT_SITE_SETTINGS: LiveSiteSettings = {
  name: "HyperMockup",
  domain: "hypermockup.com",
  timezone: "Asia/Ho_Chi_Minh",
  locale: "vi",
  contact: "hypermockup@gmail.com",
  ownerName: "",
  ownerTaxId: "",
  maskOwnerTaxId: true,
  ownerAddress: "",
  ownerPhone: "",
  moitStatusUrl: "",
  usdToVndRate: 25500,
  maintenance: true,
  resolutions: [1024, 2048, 4096, 8129],
  tileThreshold: 4096,
  freeDownloads: 1,
  renderCost: DEFAULT_RENDER_COIN_COST,
  dielineCost: DEFAULT_DIELINE_COIN_COST,
  shareCost: DEFAULT_SHARE_COIN_COST,
  projectExtendCost: DEFAULT_PROJECT_EXTEND_COIN_COST,
  emailVerified: true,
  sessionHours: 720,
  loginLimit: 5,
  registrations: true,
  botPatterns: "bot, crawler, spider, headless, slurp, curl, wget",
  excludedIPs: "",
  retention: 90,
  consent: true,
  excludeOwner: true,
  analytics: true,
  storagePublicId: "",
  analyticsPublicId: "",
};

const tableReady = new WeakSet<object>();

export async function ensureSiteTables(env: AppEnv) {
  const db = requireDb(env);
  if (tableReady.has(db)) return db;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS site_config (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_by TEXT REFERENCES users(id) ON DELETE SET NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS site_events (id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('pageview','studio_session','render')), visitor_type TEXT NOT NULL CHECK (visitor_type IN ('guest','user','bot')), user_id TEXT REFERENCES users(id) ON DELETE SET NULL, path TEXT NOT NULL DEFAULT '/', created_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS site_events_time_kind ON site_events(created_at, kind, visitor_type)"),
  ]);
  tableReady.add(db);
  return db;
}

export async function readConfigJson<T>(env: AppEnv, key: string): Promise<T | null> {
  const db = await ensureSiteTables(env);
  const row = await db.prepare("SELECT value_json AS valueJson FROM site_config WHERE key=?").bind(key).first<{ valueJson: string }>();
  if (!row?.valueJson) return null;
  try {
    return JSON.parse(row.valueJson) as T;
  } catch {
    return null;
  }
}

export async function writeConfigJson(env: AppEnv, key: string, value: unknown, updatedBy: string | null) {
  const db = await ensureSiteTables(env);
  const now = nowIso();
  await db.prepare(
    "INSERT INTO site_config (key,value_json,updated_by,updated_at) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at",
  ).bind(key, JSON.stringify(value), updatedBy, now).run();
  return now;
}

export function createInitialProductionManagement(): Record<string, ManagementRecord[]> {
  const base = createManagementData();
  const today = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  base.rewards = base.rewards.map((row) =>
    row.id === "checkin"
      ? {
          ...row,
          updated: today,
          values: {
            ...row.values,
            reward: String(DEFAULT_CHECKIN_SCHEDULE[0]),
            limit: "1",
            schedule: DEFAULT_CHECKIN_SCHEDULE.join(", "),
            condition: "Điểm danh liên tiếp 7 ngày (10/10/10/20/10/10/30 xu). Bỏ lỡ 1 ngày sẽ đặt lại về Ngày 1.",
          },
        }
      : row,
  );
  base.announcements = LABELLAB_UPDATES.map((item) => ({
    id: item.id,
    name: item.title,
    status: "Đang bật",
    updated: today,
    values: {
      category: item.category,
      pinned: item.pinned ? "Có" : "Không",
      text: item.body,
      titleEn: item.titleEn,
      textEn: item.bodyEn,
      ctaLabel: item.ctaLabel,
      ctaLabelEn: item.ctaLabelEn,
      start: "",
      end: "",
      url: item.url,
    },
  }));
  return persistentManagementData(base);
}

function isLegacyDemoAnnouncementSet(list: ManagementRecord[] | undefined): boolean {
  if (!Array.isArray(list) || list.length === 0) return false;
  return list.every(
    (row) =>
      /^notice-\d+$/.test(row.id) &&
      LEGACY_DEMO_ANNOUNCEMENT_TITLES.has(row.name.trim()) &&
      (!row.values?.text || row.values.text.trim() === row.name.trim()),
  );
}

export async function loadManagementData(env: AppEnv): Promise<Record<string, ManagementRecord[]>> {
  const initial = createInitialProductionManagement();
  const saved = await readConfigJson<Record<string, ManagementRecord[]>>(env, "management");
  if (!saved || typeof saved !== "object") return initial;
  const migrated = migrateManagementData(initial, saved);
  // Automatically replace untouched early English demo placeholders with current bilingual HyperMockup updates.
  // Any announcement created or customized by the admin is preserved verbatim.
  if (isLegacyDemoAnnouncementSet(migrated.announcements)) {
    migrated.announcements = initial.announcements;
  }
  return persistentManagementData(migrated);
}

export function parseCheckInSchedule(rawSchedule: string | undefined, fallbackReward: number): number[] {
  const parsed = String(rawSchedule ?? "")
    .split(/[,;\s/|]+/)
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isSafeInteger(n) && n > 0 && n <= 100_000);
  if (parsed.length > 0) return parsed.slice(0, 7);
  const safeFallback = Number.isSafeInteger(fallbackReward) && fallbackReward > 0 && fallbackReward <= 100_000
    ? fallbackReward
    : DEFAULT_CHECKIN_SCHEDULE[0];
  return [safeFallback];
}

export function extractCheckInConfig(management: Record<string, ManagementRecord[]>): LiveCheckInConfig {
  const rewards = Array.isArray(management.rewards) ? management.rewards : [];
  const row = rewards.find((item) => item.id === "checkin")
    ?? rewards.find((item) => item.name.toLowerCase().includes("điểm danh"));
  if (!row) {
    return {
      enabled: true,
      reward: DEFAULT_CHECKIN_SCHEDULE[0],
      dailyLimit: 1,
      schedule: [...DEFAULT_CHECKIN_SCHEDULE],
      condition: "Đăng nhập; một lần mỗi ngày.",
    };
  }
  const enabled = row.status === "Đang bật";
  const rawReward = Number(row.values?.reward);
  const baseReward = Number.isSafeInteger(rawReward) && rawReward > 0 && rawReward <= 100_000
    ? rawReward
    : DEFAULT_CHECKIN_SCHEDULE[0];
  const parsedSchedule = parseCheckInSchedule(row.values?.schedule, baseReward);
  // If admin changed "Coin mỗi lượt" while leaving schedule single-value or
  // mismatched with Day 1, honor explicit multi-day schedule; if schedule has
  // fewer than 7 entries, pad cleanly up to 7 using the last or base reward.
  const schedule = parsedSchedule.length === 1
    ? Array.from({ length: 7 }, () => parsedSchedule[0])
    : parsedSchedule.length < 7
      ? [...parsedSchedule, ...Array.from({ length: 7 - parsedSchedule.length }, () => parsedSchedule[parsedSchedule.length - 1])]
      : parsedSchedule;
  const rawLimit = Number(row.values?.limit);
  const dailyLimit = Number.isSafeInteger(rawLimit) && rawLimit >= 0 ? rawLimit : 1;
  return {
    enabled: enabled && dailyLimit > 0,
    reward: baseReward,
    dailyLimit,
    schedule,
    condition: row.values?.condition?.trim() || "Đăng nhập; một lần mỗi ngày.",
  };
}

export async function getLiveCheckInConfig(env: AppEnv): Promise<LiveCheckInConfig> {
  const management = await loadManagementData(env);
  return extractCheckInConfig(management);
}

function resolveAnnouncementTone(category: string | undefined, fallbackIdx: number): "pink" | "blue" | "mint" {
  const normalized = (category ?? "").trim().toLowerCase();
  if (normalized.includes("ưu đãi") || normalized.includes("promo") || normalized.includes("khuyến")) return "pink";
  if (normalized.includes("tính năng") || normalized.includes("feature") || normalized.includes("ra mắt")) return "mint";
  if (normalized.includes("nâng cấp") || normalized.includes("hệ thống") || normalized.includes("upgrade") || normalized.includes("system")) return "blue";
  const tones: Array<"pink" | "blue" | "mint"> = ["mint", "blue", "pink"];
  return tones[fallbackIdx % tones.length];
}

export function extractLiveAnnouncements(management: Record<string, ManagementRecord[]>, todayIso?: string): LiveAnnouncement[] {
  const list = Array.isArray(management.announcements) ? management.announcements : [];
  const today = todayIso ?? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const active = list.filter((row) => {
    if (row.status !== "Đang bật") return false;
    const start = row.values?.start?.trim();
    const end = row.values?.end?.trim();
    if (start && /^\d{4}-\d{2}-\d{2}$/.test(start) && today < start) return false;
    if (end && /^\d{4}-\d{2}-\d{2}$/.test(end) && today > end) return false;
    return Boolean(row.name.trim());
  });
  // Keep pinned announcements at the top while preserving admin ordering within each group.
  const ordered = [
    ...active.filter((row) => row.values?.pinned === "Có"),
    ...active.filter((row) => row.values?.pinned !== "Có"),
  ];
  return ordered.slice(0, 8).map((row, idx) => {
    const rawUrl = row.values?.url?.trim() || "";
    const safeUrl = /^\/(?!\/)/.test(rawUrl) || /^https:\/\/[^\s]+$/i.test(rawUrl) ? rawUrl : "/studio";
    const category = row.values?.category?.trim() || "Hệ thống";
    const titleEn = row.values?.titleEn?.trim() || undefined;
    const bodyEn = row.values?.textEn?.trim() || undefined;
    const ctaLabel = row.values?.ctaLabel?.trim() || undefined;
    const ctaLabelEn = row.values?.ctaLabelEn?.trim() || undefined;
    return {
      id: row.id,
      tone: resolveAnnouncementTone(category, idx),
      category,
      pinned: row.values?.pinned === "Có",
      title: row.name.trim(),
      body: row.values?.text?.trim() || row.name.trim(),
      ...(titleEn ? { titleEn } : {}),
      ...(bodyEn ? { bodyEn } : {}),
      ...(ctaLabel ? { ctaLabel } : {}),
      ...(ctaLabelEn ? { ctaLabelEn } : {}),
      time: row.updated || today,
      url: safeUrl,
      unread: true,
    };
  });
}

export function defaultLiveCoinPackages(): LiveCoinPackage[] {
  return COIN_PACKAGES.map((pkg) => ({
    ...pkg,
    enabled: true,
  }));
}

export function sanitizeCoinPackages(input: unknown): LiveCoinPackage[] {
  if (!Array.isArray(input) || input.length === 0) return defaultLiveCoinPackages();
  const cleaned: LiveCoinPackage[] = [];
  const seenKeys = new Set<string>();
  for (let i = 0; i < input.length; i += 1) {
    const item = input[i] as Record<string, unknown>;
    const rawRegion = item?.region;
    const region: CoinRegion | undefined =
      rawRegion === "vietnam" || rawRegion === "international" ? rawRegion : undefined;
    const coins = Number(item?.coins);
    const vnd = Number(item?.vnd ?? 0);
    const usd = Number(item?.usd ?? 0);
    const dedupKey = `${region ?? "all"}:${coins}`;
    if (!Number.isSafeInteger(coins) || coins < 1 || coins > 1_000_000 || seenKeys.has(dedupKey)) continue;
    if (region === "vietnam") {
      if (!Number.isSafeInteger(vnd) || vnd < 1000 || vnd > 500_000_000) continue;
      if (!Number.isFinite(usd) || usd < 0 || usd > 10_000) continue;
    } else if (region === "international") {
      if (!Number.isFinite(usd) || usd < 0.5 || usd > 10_000) continue;
      if (!Number.isSafeInteger(vnd) || vnd < 0 || vnd > 500_000_000) continue;
    } else {
      if (!Number.isSafeInteger(vnd) || vnd < 1000 || vnd > 500_000_000) continue;
      if (!Number.isFinite(usd) || usd < 0.5 || usd > 10_000) continue;
    }
    const rawBaseCoins = item?.baseCoins !== undefined ? Number(item.baseCoins) : undefined;
    const baseCoins = rawBaseCoins !== undefined && Number.isSafeInteger(rawBaseCoins) && rawBaseCoins >= 1 && rawBaseCoins <= coins
      ? rawBaseCoins
      : undefined;
    const rawBonusPct = item?.bonusPct !== undefined ? Number(item.bonusPct) : undefined;
    const bonusPct = rawBonusPct !== undefined && Number.isSafeInteger(rawBonusPct) && rawBonusPct >= 0 && rawBonusPct <= 100
      ? rawBonusPct
      : undefined;
    const tier = typeof item?.tier === "string" && item.tier.trim() ? item.tier.trim().slice(0, 40) : undefined;
    const badge: CoinPackageBadge | undefined =
      item?.badge === "popular" || item?.badge === "best" ? item.badge : undefined;
    seenKeys.add(dedupKey);
    cleaned.push({
      id: typeof item?.id === "string" && item.id.trim() ? item.id.trim() : `pack-${i + 1}`,
      ...(region ? { region } : {}),
      ...(tier ? { tier } : {}),
      coins,
      ...(baseCoins !== undefined ? { baseCoins } : {}),
      ...(bonusPct !== undefined ? { bonusPct } : {}),
      ...(badge ? { badge } : {}),
      vnd: region === "international" ? 0 : vnd,
      usd: region === "vietnam" ? 0 : Math.round(usd * 100) / 100,
      enabled: item?.enabled !== false,
    });
  }
  return cleaned.length > 0 ? cleaned : defaultLiveCoinPackages();
}

export async function getLiveCoinPackages(env: AppEnv): Promise<LiveCoinPackage[]> {
  const stored = await readConfigJson<unknown>(env, "coin_packages");
  return sanitizeCoinPackages(stored);
}

export function sanitizeSiteSettings(input: unknown): LiveSiteSettings {
  if (!input || typeof input !== "object") return { ...DEFAULT_SITE_SETTINGS };
  const raw = input as Record<string, unknown>;
  const result: LiveSiteSettings = { ...DEFAULT_SITE_SETTINGS };
  const numericBounds: Partial<Record<keyof LiveSiteSettings, [number, number]>> = {
    freeDownloads: [0, 100],
    renderCost: [0, 10000],
    dielineCost: [0, 10000],
    shareCost: [0, 10000],
    projectExtendCost: [0, 10000],
    sessionHours: [1, 720],
    loginLimit: [1, 100],
    retention: [7, 730],
    usdToVndRate: [15000, 40000],
  };
  for (const key of Object.keys(DEFAULT_SITE_SETTINGS) as (keyof LiveSiteSettings)[]) {
    const val = raw[key];
    if (key === "resolutions") {
      if (Array.isArray(val) && val.length > 0 && val.every((n) => DEFAULT_SITE_SETTINGS.resolutions.includes(Number(n)))) {
        result.resolutions = [...new Set(val.map(Number))].sort((a, b) => a - b);
      }
      continue;
    }
    if (typeof val !== typeof DEFAULT_SITE_SETTINGS[key]) continue;
    if (typeof val === "number") {
      const bounds = numericBounds[key];
      if (!Number.isSafeInteger(val)) continue;
      if (bounds && (val < bounds[0] || val > bounds[1])) continue;
      if (key === "tileThreshold" && ![4096, 8129].includes(val)) continue;
      Object.assign(result, { [key]: val });
    } else if (typeof val === "boolean") {
      Object.assign(result, { [key]: val });
    } else if (typeof val === "string") {
      if (key === "locale" && !["en", "vi"].includes(val)) continue;
      if (key === "timezone" && !["Asia/Ho_Chi_Minh", "UTC"].includes(val)) continue;
      if (key === "moitStatusUrl") {
        const trimmed = val.trim().slice(0, 400);
        if (trimmed && !/^https?:\/\/(?:www\.)?online\.gov\.vn\/[^\s]+$/i.test(trimmed)) continue;
        Object.assign(result, { [key]: trimmed });
        continue;
      }
      if (key === "ownerTaxId") {
        Object.assign(result, { [key]: val.replace(/[^\dA-Za-z-]/g, "").slice(0, 32) });
        continue;
      }
      if (key === "ownerPhone") {
        Object.assign(result, { [key]: val.replace(/[^\d+\s().-]/g, "").trim().slice(0, 32) });
        continue;
      }
      Object.assign(result, { [key]: val.trim().slice(0, 400) });
    }
  }
  return result;
}

export async function getLiveSiteSettings(env: AppEnv): Promise<LiveSiteSettings> {
  const stored = await readConfigJson<unknown>(env, "settings");
  return sanitizeSiteSettings(stored);
}
