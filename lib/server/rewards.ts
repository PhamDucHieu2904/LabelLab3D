import { appendLedgerEntry } from "./wallet";
import { requireDb, randomId, nowIso, type AppEnv } from "./db";
import { awardBadge } from "./badges";

export function currentRewardDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export async function claimDailyCheckIn(env: AppEnv, userId: string, requestedDay?: string) {
  const day = currentRewardDay();
  if (requestedDay && requestedDay !== day) throw new Error("INVALID_INPUT");
  const db = requireDb(env), idempotencyKey = `checkin:${userId}:${day}`;
  const existing = await db.prepare("SELECT id,coins,claimed_at FROM daily_checkins WHERE idempotency_key=?").bind(idempotencyKey).first<{ id: string; coins: number; claimed_at: string }>();
  if (existing) {
    // Recover a reservation if the isolate was terminated after the unique
    // daily row was written but before its ledger credit committed.
    const credited = await db.prepare("SELECT id,created_at AS createdAt FROM coin_ledger WHERE idempotency_key=?").bind(idempotencyKey).first<{ id: string; createdAt: string }>();
    if (!credited) await appendLedgerEntry(env, { userId, amount: existing.coins, kind: "daily_checkin", reference: idempotencyKey, idempotencyKey, metadata: { day, recovered: true } });
    return { claimed: false, ...existing };
  }
  const reward = 20;
  const claimedAt = nowIso();
  // Claim the unique day first. This closes the race where two requests both
  // credit the ledger before one loses the UNIQUE(user_id, day) insert.
  const claim = await db.prepare("INSERT OR IGNORE INTO daily_checkins (id,user_id,day,coins,idempotency_key,claimed_at) VALUES (?,?,?,?,?,?)").bind(randomId("checkin"), userId, day, reward, idempotencyKey, claimedAt).run();
  if ((claim.meta?.changes as number | undefined) !== 1) {
    const raced = await db.prepare("SELECT id,coins,claimed_at FROM daily_checkins WHERE idempotency_key=?").bind(idempotencyKey).first<{ id: string; coins: number; claimed_at: string }>();
    if (raced) return { claimed: false, ...raced };
    throw new Error("CHECKIN_CONFLICT_RETRY");
  }
  let entry;
  try {
    entry = await appendLedgerEntry(env, { userId, amount: reward, kind: "daily_checkin", reference: idempotencyKey, idempotencyKey, metadata: { day } });
  } catch (error) {
    await db.prepare("DELETE FROM daily_checkins WHERE idempotency_key=?").bind(idempotencyKey).run();
    throw error;
  }
  const total = await db.prepare("SELECT COUNT(*) AS count FROM daily_checkins WHERE user_id=?").bind(userId).first<{ count: number }>();
  if (Number(total?.count ?? 0) >= 1) await awardBadge(env, userId, "first-checkin", { day });
  if (Number(total?.count ?? 0) >= 7) await awardBadge(env, userId, "seven-checkins", { day });
  return { claimed: true, id: entry.id, coins: reward, claimedAt: entry.createdAt };
}
