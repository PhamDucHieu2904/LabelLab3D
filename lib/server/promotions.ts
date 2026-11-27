import { nowIso, randomId, requireDb, type AppEnv } from "./db";
import {
  ensureNotificationTable,
  sanitizeNotificationBody,
  sanitizeNotificationTitle,
} from "./notifications";
import { appendLedgerEntry } from "./wallet";

export const MAX_MASS_GIFT_COINS = 100_000;

export type CoinGiftEventRecord = {
  id: string;
  idempotencyKey: string;
  actorUserId: string | null;
  actorName: string;
  actorEmail: string;
  title: string;
  body: string;
  coinsPerUser: number;
  recipientCount: number;
  totalCoinsDistributed: number;
  createdAt: string;
};

const tableReady = new WeakSet<object>();

export async function ensureGiftEventsTable(env: AppEnv) {
  const db = requireDb(env);
  if (tableReady.has(db)) return db;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS coin_gift_events (
      id TEXT PRIMARY KEY,
      idempotency_key TEXT NOT NULL UNIQUE,
      actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      coins_per_user INTEGER NOT NULL CHECK (coins_per_user > 0),
      recipient_count INTEGER NOT NULL DEFAULT 0 CHECK (recipient_count >= 0),
      total_coins_distributed INTEGER NOT NULL DEFAULT 0 CHECK (total_coins_distributed >= 0),
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS coin_gift_events_created_at ON coin_gift_events(created_at)"),
  ]);
  tableReady.add(db);
  return db;
}

export async function listCoinGiftEvents(env: AppEnv, limit = 50): Promise<CoinGiftEventRecord[]> {
  const db = await ensureGiftEventsTable(env);
  const clamped = Math.max(1, Math.min(200, Math.floor(limit)));
  const res = await db
    .prepare(
      `SELECT
         e.id,
         e.idempotency_key AS idempotencyKey,
         e.actor_user_id AS actorUserId,
         COALESCE(u.name, 'Admin') AS actorName,
         COALESCE(u.email, '') AS actorEmail,
         e.title,
         e.body,
         e.coins_per_user AS coinsPerUser,
         e.recipient_count AS recipientCount,
         e.total_coins_distributed AS totalCoinsDistributed,
         e.created_at AS createdAt
       FROM coin_gift_events e
       LEFT JOIN users u ON u.id = e.actor_user_id
       ORDER BY e.created_at DESC
       LIMIT ?`,
    )
    .bind(clamped)
    .all<CoinGiftEventRecord>();
  return res.results ?? [];
}

export async function executeMassCoinGiftEvent(
  env: AppEnv,
  input: {
    actorUserId: string;
    coins: number;
    title?: string;
    body: string;
    idempotencyKey: string;
  },
): Promise<{
  id: string;
  title: string;
  body: string;
  coinsPerUser: number;
  recipientCount: number;
  totalCoinsDistributed: number;
  createdAt: string;
  replayed: boolean;
}> {
  const coins = Number(input.coins);
  const body = sanitizeNotificationBody(input.body);
  const rawTitle = sanitizeNotificationTitle(input.title);
  const title =
    rawTitle.length >= 2
      ? rawTitle
      : sanitizeNotificationTitle(`Quà tặng sự kiện +${coins.toLocaleString("vi-VN")} Coin từ HyperMockup`);
  const key = input.idempotencyKey.trim();

  if (
    !Number.isSafeInteger(coins) ||
    coins < 1 ||
    coins > MAX_MASS_GIFT_COINS ||
    title.length < 2 ||
    body.length < 2 ||
    !/^evtgift_[A-Za-z0-9_-]{16,120}$/.test(key)
  ) {
    throw new Error("INVALID_INPUT");
  }

  const db = await ensureGiftEventsTable(env);
  await ensureNotificationTable(env);

  const existing = await db
    .prepare(
      `SELECT id, title, body, coins_per_user AS coinsPerUser, recipient_count AS recipientCount,
              total_coins_distributed AS totalCoinsDistributed, created_at AS createdAt
       FROM coin_gift_events WHERE idempotency_key = ?`,
    )
    .bind(key)
    .first<{
      id: string;
      title: string;
      body: string;
      coinsPerUser: number;
      recipientCount: number;
      totalCoinsDistributed: number;
      createdAt: string;
    }>();

  if (existing) {
    if (existing.coinsPerUser !== coins || existing.body !== body || existing.title !== title) {
      throw new Error("IDEMPOTENCY_CONFLICT");
    }
    return { ...existing, replayed: true };
  }

  const eventId = randomId("gift");
  const createdAt = nowIso();

  const insertRes = await db
    .prepare(
      `INSERT OR IGNORE INTO coin_gift_events
        (id, idempotency_key, actor_user_id, title, body, coins_per_user, recipient_count, total_coins_distributed, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?)`,
    )
    .bind(eventId, key, input.actorUserId, title, body, coins, createdAt)
    .run();

  if (Number(insertRes.meta?.changes ?? 0) !== 1) {
    const raced = await db
      .prepare(
        `SELECT id, title, body, coins_per_user AS coinsPerUser, recipient_count AS recipientCount,
                total_coins_distributed AS totalCoinsDistributed, created_at AS createdAt
         FROM coin_gift_events WHERE idempotency_key = ?`,
      )
      .bind(key)
      .first<{
        id: string;
        title: string;
        body: string;
        coinsPerUser: number;
        recipientCount: number;
        totalCoinsDistributed: number;
        createdAt: string;
      }>();
    if (raced && raced.coinsPerUser === coins && raced.body === body && raced.title === title) {
      return { ...raced, replayed: true };
    }
    throw new Error("IDEMPOTENCY_CONFLICT");
  }

  const usersRes = await db
    .prepare("SELECT id FROM users WHERE status = 'active' ORDER BY created_at ASC LIMIT 2000")
    .all<{ id: string }>();
  const userIds = (usersRes.results ?? []).map((u) => u.id);

  // Credit wallets sequentially in small concurrency chunks via appendLedgerEntry
  // so every credit has an atomic CAS update + deterministic ledger idempotency key.
  const creditedUserIds: string[] = [];
  const ledgerChunkSize = 10;
  for (let i = 0; i < userIds.length; i += ledgerChunkSize) {
    const chunk = userIds.slice(i, i + ledgerChunkSize);
    const settled = await Promise.all(
      chunk.map(async (uid) => {
        await appendLedgerEntry(env, {
          userId: uid,
          amount: coins,
          kind: "event_gift",
          reference: title.slice(0, 240),
          idempotencyKey: `evtgift:${eventId}:${uid}`,
          metadata: {
            eventId,
            actorId: input.actorUserId,
            title,
            coins,
          },
        });
        return uid;
      }),
    );
    creditedUserIds.push(...settled);
  }

  // Send admin bell notification to every credited user in batches of 50.
  const notifChunkSize = 50;
  for (let i = 0; i < creditedUserIds.length; i += notifChunkSize) {
    const chunk = creditedUserIds.slice(i, i + notifChunkSize);
    await db.batch(
      chunk.map((uid) =>
        db
          .prepare(
            `INSERT INTO user_notifications
              (id, user_id, sender_admin_id, kind, title, body, feedback_id, read_at, created_at)
             VALUES (?, ?, ?, 'admin_message', ?, ?, NULL, NULL, ?)`,
          )
          .bind(randomId("ntf"), uid, input.actorUserId, title, body, createdAt),
      ),
    );
  }

  const recipientCount = creditedUserIds.length;
  const totalCoinsDistributed = recipientCount * coins;

  await db
    .prepare(
      "UPDATE coin_gift_events SET recipient_count = ?, total_coins_distributed = ? WHERE id = ?",
    )
    .bind(recipientCount, totalCoinsDistributed, eventId)
    .run();

  try {
    await db
      .prepare(
        "INSERT INTO audit_events (id,actor_user_id,action,target_type,target_id,metadata_json,created_at) VALUES (?,?,?,?,?,?,?)",
      )
      .bind(
        randomId("audit"),
        input.actorUserId,
        "admin_event_gift",
        "coin_gift_event",
        eventId,
        JSON.stringify({ coinsPerUser: coins, recipientCount, totalCoinsDistributed, title }),
        createdAt,
      )
      .run();
  } catch {
    // Non-fatal in minimal test DB harnesses without audit_events table.
  }

  return {
    id: eventId,
    title,
    body,
    coinsPerUser: coins,
    recipientCount,
    totalCoinsDistributed,
    createdAt,
    replayed: false,
  };
}
