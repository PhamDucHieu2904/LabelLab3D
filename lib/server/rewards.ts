import { appendLedgerEntry } from "./wallet";
import { requireDb, randomId, nowIso, type AppEnv } from "./db";

export async function claimDailyCheckIn(env: AppEnv, userId: string, day = new Date().toISOString().slice(0, 10)) {
  const db = requireDb(env), idempotencyKey = `checkin:${userId}:${day}`;
  const existing = await db.prepare("SELECT id,coins,claimed_at FROM daily_checkins WHERE idempotency_key=?").bind(idempotencyKey).first<{ id: string; coins: number; claimed_at: string }>();
  if (existing) return { claimed: false, ...existing };
  const reward = 20;
  const entry = await appendLedgerEntry(env, { userId, amount: reward, kind: "daily_checkin", reference: idempotencyKey, idempotencyKey, metadata: { day } });
  await db.prepare("INSERT INTO daily_checkins (id,user_id,day,coins,idempotency_key,claimed_at) VALUES (?,?,?,?,?,?)").bind(randomId("checkin"), userId, day, reward, idempotencyKey, nowIso()).run();
  return { claimed: true, id: entry.id, coins: reward, claimedAt: entry.createdAt };
}
