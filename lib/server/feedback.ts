import { nowIso, randomId, requireDb, type AppEnv } from "./db";

export type FeedbackCategory = "suggestion" | "bug" | "model_request" | "other";
export type FeedbackStatus = "new" | "read" | "resolved" | "archived";

export type FeedbackItem = {
  id: string;
  userId: string | null;
  senderName: string;
  senderEmail: string;
  category: FeedbackCategory;
  message: string;
  status: FeedbackStatus;
  adminNote: string;
  pagePath: string;
  locale: string;
  createdAt: string;
  updatedAt: string;
};

export type FeedbackSummary = {
  total: number;
  newCount: number;
  readCount: number;
  resolvedCount: number;
  bugCount: number;
};

const VALID_CATEGORIES = new Set<FeedbackCategory>(["suggestion", "bug", "model_request", "other"]);
const VALID_STATUSES = new Set<FeedbackStatus>(["new", "read", "resolved", "archived"]);

const tableReady = new WeakSet<object>();

export async function ensureFeedbackTable(env: AppEnv) {
  const db = requireDb(env);
  if (tableReady.has(db)) return db;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS user_feedback (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      sender_name TEXT NOT NULL DEFAULT '',
      sender_email TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'suggestion' CHECK (category IN ('suggestion','bug','model_request','other')),
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','read','resolved','archived')),
      admin_note TEXT NOT NULL DEFAULT '',
      page_path TEXT NOT NULL DEFAULT '/',
      locale TEXT NOT NULL DEFAULT 'vi',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS user_feedback_status_time ON user_feedback(status, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS user_feedback_created_at ON user_feedback(created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS user_feedback_user_time ON user_feedback(user_id, created_at)"),
  ]);
  tableReady.add(db);
  return db;
}

export function sanitizeFeedbackCategory(raw: unknown): FeedbackCategory {
  if (typeof raw === "string" && VALID_CATEGORIES.has(raw as FeedbackCategory)) {
    return raw as FeedbackCategory;
  }
  return "suggestion";
}

export function sanitizeFeedbackStatus(raw: unknown): FeedbackStatus | null {
  if (typeof raw === "string" && VALID_STATUSES.has(raw as FeedbackStatus)) {
    return raw as FeedbackStatus;
  }
  return null;
}

export function sanitizeFeedbackMessage(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\r\n/g, "\n").trim().slice(0, 1500);
}

export function sanitizeOptionalEmail(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const cleaned = raw.trim().toLowerCase().slice(0, 160);
  if (!cleaned) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned) ? cleaned : "";
}

export const FEEDBACK_DAILY_LIMIT_PER_USER = 10;
export const FEEDBACK_COOLDOWN_SECONDS = 120;

export type FeedbackQuotaCheck =
  | { allowed: true; sentToday: number; remainingToday: number }
  | { allowed: false; reason: "FEEDBACK_DAILY_LIMIT"; sentToday: number; limit: number }
  | { allowed: false; reason: "FEEDBACK_COOLDOWN"; retryAfterSec: number; sentToday: number };

function startOfVnDayUtcIso(nowMs = Date.now()): string {
  const vnOffsetMs = 7 * 60 * 60 * 1000;
  const vnDate = new Date(nowMs + vnOffsetMs);
  const midnightVnAsUtc = Date.UTC(vnDate.getUTCFullYear(), vnDate.getUTCMonth(), vnDate.getUTCDate()) - vnOffsetMs;
  return new Date(midnightVnAsUtc).toISOString();
}

export async function checkUserFeedbackQuota(env: AppEnv, userId: string): Promise<FeedbackQuotaCheck> {
  const db = await ensureFeedbackTable(env);
  const dayStartIso = startOfVnDayUtcIso();
  const [countRow, latestRow] = await Promise.all([
    db
      .prepare("SELECT COUNT(*) AS cnt FROM user_feedback WHERE user_id = ? AND created_at >= ?")
      .bind(userId, dayStartIso)
      .first<{ cnt: number | null }>(),
    db
      .prepare("SELECT created_at AS createdAt FROM user_feedback WHERE user_id = ? ORDER BY created_at DESC LIMIT 1")
      .bind(userId)
      .first<{ createdAt: string | null }>(),
  ]);

  const sentToday = Number(countRow?.cnt ?? 0);
  if (sentToday >= FEEDBACK_DAILY_LIMIT_PER_USER) {
    return {
      allowed: false,
      reason: "FEEDBACK_DAILY_LIMIT",
      sentToday,
      limit: FEEDBACK_DAILY_LIMIT_PER_USER,
    };
  }

  if (latestRow?.createdAt) {
    const elapsedMs = Date.now() - Date.parse(latestRow.createdAt);
    const cooldownMs = FEEDBACK_COOLDOWN_SECONDS * 1000;
    if (Number.isFinite(elapsedMs) && elapsedMs >= 0 && elapsedMs < cooldownMs) {
      return {
        allowed: false,
        reason: "FEEDBACK_COOLDOWN",
        retryAfterSec: Math.max(1, Math.ceil((cooldownMs - elapsedMs) / 1000)),
        sentToday,
      };
    }
  }

  return {
    allowed: true,
    sentToday,
    remainingToday: Math.max(0, FEEDBACK_DAILY_LIMIT_PER_USER - sentToday),
  };
}

export async function createUserFeedback(
  env: AppEnv,
  input: {
    userId: string | null;
    senderName: string;
    senderEmail: string;
    category: FeedbackCategory;
    message: string;
    pagePath?: string;
    locale?: string;
  },
): Promise<{ id: string; createdAt: string }> {
  const db = await ensureFeedbackTable(env);
  const id = randomId("fb");
  const now = nowIso();
  const safeName = input.senderName.replace(/\s+/g, " ").trim().slice(0, 120);
  const safeEmail = input.senderEmail.trim().toLowerCase().slice(0, 160);
  const safePath = (input.pagePath || "/").trim().slice(0, 200);
  const safeLocale = input.locale === "en" ? "en" : "vi";

  await db
    .prepare(
      `INSERT INTO user_feedback (id, user_id, sender_name, sender_email, category, message, status, admin_note, page_path, locale, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'new', '', ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.userId,
      safeName,
      safeEmail,
      input.category,
      input.message,
      safePath,
      safeLocale,
      now,
      now,
    )
    .run();

  return { id, createdAt: now };
}

export async function listAdminFeedback(
  env: AppEnv,
  limit = 200,
): Promise<{ items: FeedbackItem[]; summary: FeedbackSummary }> {
  const db = await ensureFeedbackTable(env);
  const clampedLimit = Math.max(1, Math.min(500, Math.floor(limit)));

  const [rows, counts] = await Promise.all([
    db
      .prepare(
        `SELECT
           f.id,
           f.user_id AS userId,
           COALESCE(NULLIF(f.sender_name, ''), u.name, '') AS senderName,
           COALESCE(NULLIF(f.sender_email, ''), u.email, '') AS senderEmail,
           f.category,
           f.message,
           f.status,
           f.admin_note AS adminNote,
           f.page_path AS pagePath,
           f.locale,
           f.created_at AS createdAt,
           f.updated_at AS updatedAt
         FROM user_feedback f
         LEFT JOIN users u ON u.id = f.user_id
         ORDER BY f.created_at DESC
         LIMIT ?`,
      )
      .bind(clampedLimit)
      .all<FeedbackItem>(),
    db
      .prepare(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS newCount,
           SUM(CASE WHEN status = 'read' THEN 1 ELSE 0 END) AS readCount,
           SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolvedCount,
           SUM(CASE WHEN category = 'bug' AND status != 'archived' THEN 1 ELSE 0 END) AS bugCount
         FROM user_feedback`,
      )
      .first<{
        total: number | null;
        newCount: number | null;
        readCount: number | null;
        resolvedCount: number | null;
        bugCount: number | null;
      }>(),
  ]);

  return {
    items: rows.results ?? [],
    summary: {
      total: Number(counts?.total ?? 0),
      newCount: Number(counts?.newCount ?? 0),
      readCount: Number(counts?.readCount ?? 0),
      resolvedCount: Number(counts?.resolvedCount ?? 0),
      bugCount: Number(counts?.bugCount ?? 0),
    },
  };
}
