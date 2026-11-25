import { createManagementData, migrateManagementData, persistentManagementData, type ManagementRecord } from "@/lib/admin/management-data";
import { COIN_PACKAGES, type CoinPackage } from "@/lib/payments/packages";
import { LABELLAB_UPDATES } from "@/lib/labellab/updates";
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
  title: string;
  body: string;
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
  maintenance: boolean;
  resolutions: number[];
  tileThreshold: number;
  freeDownloads: number;
  renderCost: number;
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

export const DEFAULT_CHECKIN_SCHEDULE = [20, 30, 45, 45, 60, 70, 100];

export const DEFAULT_SITE_SETTINGS: LiveSiteSettings = {
  name: "HyperMockup",
  domain: "hypermockup.com",
  timezone: "Asia/Ho_Chi_Minh",
  locale: "vi",
  contact: "labellab3d@gmail.com",
  maintenance: true,
  resolutions: [1024, 2048, 4096, 8129],
  tileThreshold: 4096,
  freeDownloads: 1,
  renderCost: 1,
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
            condition: "Đăng nhập; nhận thưởng mỗi ngày theo lịch 7 ngày.",
          },
        }
      : row,
  );
  base.announcements = LABELLAB_UPDATES.map((item, idx) => ({
    id: `notice-${idx + 1}`,
    name: item.title,
    status: "Đang bật",
    updated: today,
    values: {
      text: item.title,
      start: "",
      end: "",
      url: "/studio",
    },
  }));
  return persistentManagementData(base);
}

export async function loadManagementData(env: AppEnv): Promise<Record<string, ManagementRecord[]>> {
  const initial = createInitialProductionManagement();
  const saved = await readConfigJson<Record<string, ManagementRecord[]>>(env, "management");
  if (!saved || typeof saved !== "object") return initial;
  return persistentManagementData(migrateManagementData(initial, saved));
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

export function extractLiveAnnouncements(management: Record<string, ManagementRecord[]>, todayIso?: string): LiveAnnouncement[] {
  const list = Array.isArray(management.announcements) ? management.announcements : [];
  const today = todayIso ?? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const tones: Array<"pink" | "blue" | "mint"> = ["pink", "blue", "mint"];
  const active = list.filter((row) => {
    if (row.status !== "Đang bật") return false;
    const start = row.values?.start?.trim();
    const end = row.values?.end?.trim();
    if (start && /^\d{4}-\d{2}-\d{2}$/.test(start) && today < start) return false;
    if (end && /^\d{4}-\d{2}-\d{2}$/.test(end) && today > end) return false;
    return Boolean(row.name.trim());
  });
  return active.slice(0, 6).map((row, idx) => ({
    id: row.id,
    tone: tones[idx % tones.length],
    title: row.name.trim(),
    body: row.values?.text?.trim() || row.name.trim(),
    time: row.updated || today,
    url: row.values?.url?.trim() || "/studio",
    unread: idx < 2,
  }));
}

export function defaultLiveCoinPackages(): LiveCoinPackage[] {
  return COIN_PACKAGES.map((pkg, idx) => ({
    id: `pack-${idx + 1}`,
    coins: pkg.coins,
    vnd: pkg.vnd,
    usd: pkg.usd,
    enabled: true,
  }));
}

export function sanitizeCoinPackages(input: unknown): LiveCoinPackage[] {
  if (!Array.isArray(input) || input.length === 0) return defaultLiveCoinPackages();
  const cleaned: LiveCoinPackage[] = [];
  const seenCoins = new Set<number>();
  for (let i = 0; i < input.length; i += 1) {
    const item = input[i] as Record<string, unknown>;
    const coins = Number(item?.coins);
    const vnd = Number(item?.vnd);
    const usd = Number(item?.usd);
    if (!Number.isSafeInteger(coins) || coins < 1 || coins > 1_000_000 || seenCoins.has(coins)) continue;
    if (!Number.isSafeInteger(vnd) || vnd < 1000 || vnd > 500_000_000) continue;
    if (!Number.isFinite(usd) || usd < 0.5 || usd > 10_000) continue;
    seenCoins.add(coins);
    cleaned.push({
      id: typeof item?.id === "string" && item.id.trim() ? item.id.trim() : `pack-${i + 1}`,
      coins,
      vnd,
      usd: Math.round(usd * 100) / 100,
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
    sessionHours: [1, 720],
    loginLimit: [1, 100],
    retention: [7, 730],
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
      Object.assign(result, { [key]: val.slice(0, 400) });
    }
  }
  return result;
}

export async function getLiveSiteSettings(env: AppEnv): Promise<LiveSiteSettings> {
  const stored = await readConfigJson<unknown>(env, "settings");
  return sanitizeSiteSettings(stored);
}
