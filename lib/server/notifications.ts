import { nowIso, randomId, requireDb, type AppEnv } from "./db";
import { ensureFeedbackTable } from "./feedback";

export type UserNotificationKind = "admin_message" | "feedback_reply" | "system";

export type UserNotificationItem = {
  id: string;
  userId: string;
  kind: UserNotificationKind;
  title: string;
  body: string;
  feedbackId: string | null;
  readAt: string | null;
  createdAt: string;
  senderAdminName: string;
};

export type AdminSentNotification = {
  id: string;
  userId: string;
  recipientName: string;
  recipientEmail: string;
  kind: UserNotificationKind;
  title: string;
  body: string;
  feedbackId: string | null;
  readAt: string | null;
  createdAt: string;
  senderAdminName: string;
};

export type FeedbackReplyItem = {
  id: string;
  feedbackId: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  senderAdminName: string;
};

const tableReady = new WeakSet<object>();

export async function ensureNotificationTable(env: AppEnv) {
  await ensureFeedbackTable(env);
  const db = requireDb(env);
  if (tableReady.has(db)) return db;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS user_notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sender_admin_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      kind TEXT NOT NULL DEFAULT 'admin_message' CHECK (kind IN ('admin_message','feedback_reply','system')),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      feedback_id TEXT REFERENCES user_feedback(id) ON DELETE SET NULL,
      read_at TEXT,
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS user_notifications_user_time ON user_notifications(user_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS user_notifications_user_unread ON user_notifications(user_id, read_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS user_notifications_feedback ON user_notifications(feedback_id, created_at)"),
  ]);
  tableReady.add(db);
  return db;
}

export function sanitizeNotificationTitle(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim().slice(0, 160);
}

export function sanitizeNotificationBody(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\r\n/g, "\n").trim().slice(0, 2000);
}

export function sanitizeNotificationKind(raw: unknown): UserNotificationKind {
  if (raw === "feedback_reply" || raw === "system" || raw === "admin_message") return raw;
  return "admin_message";
}

export async function createUserNotification(
  env: AppEnv,
  input: {
    userId: string;
    senderAdminId: string;
    kind: UserNotificationKind;
    title: string;
    body: string;
    feedbackId?: string | null;
  },
): Promise<{ id: string; createdAt: string }> {
  const db = await ensureNotificationTable(env);
  const id = randomId("ntf");
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO user_notifications (id, user_id, sender_admin_id, kind, title, body, feedback_id, read_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    )
    .bind(
      id,
      input.userId,
      input.senderAdminId,
      input.kind,
      input.title,
      input.body,
      input.feedbackId ?? null,
      now,
    )
    .run();
  return { id, createdAt: now };
}

export async function broadcastNotificationToActiveUsers(
  env: AppEnv,
  input: {
    senderAdminId: string;
    title: string;
    body: string;
    kind?: UserNotificationKind;
  },
): Promise<{ sentCount: number; createdAt: string }> {
  const db = await ensureNotificationTable(env);
  const usersRes = await db
    .prepare("SELECT id FROM users WHERE status = 'active' LIMIT 2000")
    .all<{ id: string }>();
  const userIds = (usersRes.results ?? []).map((u) => u.id);
  const now = nowIso();
  const kind = input.kind ?? "admin_message";
  if (userIds.length === 0) return { sentCount: 0, createdAt: now };

  // Batch inserts in chunks of 50 to stay well within D1 batch limits.
  const chunkSize = 50;
  for (let i = 0; i < userIds.length; i += chunkSize) {
    const chunk = userIds.slice(i, i + chunkSize);
    await db.batch(
      chunk.map((uid) =>
        db
          .prepare(
            `INSERT INTO user_notifications (id, user_id, sender_admin_id, kind, title, body, feedback_id, read_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?)`,
          )
          .bind(randomId("ntf"), uid, input.senderAdminId, kind, input.title, input.body, now),
      ),
    );
  }
  return { sentCount: userIds.length, createdAt: now };
}

export async function listUserNotifications(
  env: AppEnv,
  userId: string,
  limit = 50,
): Promise<{ notifications: UserNotificationItem[]; unreadCount: number }> {
  const db = await ensureNotificationTable(env);
  const clampedLimit = Math.max(1, Math.min(100, Math.floor(limit)));

  const [rows, unreadRow] = await Promise.all([
    db
      .prepare(
        `SELECT
           n.id,
           n.user_id AS userId,
           n.kind,
           n.title,
           n.body,
           n.feedback_id AS feedbackId,
           n.read_at AS readAt,
           n.created_at AS createdAt,
           COALESCE(a.name, 'HyperMockup Admin') AS senderAdminName
         FROM user_notifications n
         LEFT JOIN users a ON a.id = n.sender_admin_id
         WHERE n.user_id = ?
         ORDER BY n.created_at DESC
         LIMIT ?`,
      )
      .bind(userId, clampedLimit)
      .all<UserNotificationItem>(),
    db
      .prepare("SELECT COUNT(*) AS cnt FROM user_notifications WHERE user_id = ? AND read_at IS NULL")
      .bind(userId)
      .first<{ cnt: number | null }>(),
  ]);

  return {
    notifications: rows.results ?? [],
    unreadCount: Number(unreadRow?.cnt ?? 0),
  };
}

export async function markUserNotificationRead(env: AppEnv, userId: string, id: string) {
  const db = await ensureNotificationTable(env);
  const now = nowIso();
  await db
    .prepare("UPDATE user_notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND user_id = ?")
    .bind(now, id, userId)
    .run();
}

export async function markAllUserNotificationsRead(env: AppEnv, userId: string) {
  const db = await ensureNotificationTable(env);
  const now = nowIso();
  await db
    .prepare("UPDATE user_notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL")
    .bind(now, userId)
    .run();
}

export async function deleteUserNotification(env: AppEnv, userId: string, id: string) {
  const db = await ensureNotificationTable(env);
  await db
    .prepare("DELETE FROM user_notifications WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .run();
}

export async function listRepliesForFeedback(
  env: AppEnv,
): Promise<Map<string, FeedbackReplyItem[]>> {
  const db = await ensureNotificationTable(env);
  const rows = await db
    .prepare(
      `SELECT
         n.id,
         n.feedback_id AS feedbackId,
         n.title,
         n.body,
         n.read_at AS readAt,
         n.created_at AS createdAt,
         COALESCE(a.name, 'Admin') AS senderAdminName
       FROM user_notifications n
       LEFT JOIN users a ON a.id = n.sender_admin_id
       WHERE n.feedback_id IS NOT NULL
       ORDER BY n.created_at ASC
       LIMIT 1000`,
    )
    .all<FeedbackReplyItem>();

  const map = new Map<string, FeedbackReplyItem[]>();
  for (const row of rows.results ?? []) {
    const existing = map.get(row.feedbackId);
    if (existing) existing.push(row);
    else map.set(row.feedbackId, [row]);
  }
  return map;
}

export async function listAdminSentNotifications(
  env: AppEnv,
  limit = 150,
): Promise<AdminSentNotification[]> {
  const db = await ensureNotificationTable(env);
  const clampedLimit = Math.max(1, Math.min(300, Math.floor(limit)));
  const rows = await db
    .prepare(
      `SELECT
         n.id,
         n.user_id AS userId,
         COALESCE(u.name, 'Người dùng') AS recipientName,
         COALESCE(u.email, '') AS recipientEmail,
         n.kind,
         n.title,
         n.body,
         n.feedback_id AS feedbackId,
         n.read_at AS readAt,
         n.created_at AS createdAt,
         COALESCE(a.name, 'Admin') AS senderAdminName
       FROM user_notifications n
       LEFT JOIN users u ON u.id = n.user_id
       LEFT JOIN users a ON a.id = n.sender_admin_id
       ORDER BY n.created_at DESC
       LIMIT ?`,
    )
    .bind(clampedLimit)
    .all<AdminSentNotification>();
  return rows.results ?? [];
}
