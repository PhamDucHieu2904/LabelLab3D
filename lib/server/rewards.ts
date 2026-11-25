import { appendLedgerEntry } from "./wallet";
import { requireDb, randomId, nowIso, type AppEnv } from "./db";
import { awardBadge } from "./badges";
import { getLiveCheckInConfig, type LiveCheckInConfig } from "./site-config";

export function currentRewardDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Return the calendar day (YYYY-MM-DD) immediately before `day` using pure UTC date math. */
export function previousCalendarDay(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) throw new Error("INVALID_INPUT");
  const utc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) - 1);
  return new Date(utc).toISOString().slice(0, 10);
}

/**
 * Compute strict consecutive daily check-in streak relative to `today` (Asia/Ho_Chi_Minh).
 * Missing even a single calendar day resets `streakBeforeToday` back to 0 (Day 1).
 */
export function computeConsecutiveStreak(claimedDays: readonly string[], today: string): {
  claimedToday: boolean;
  streakBeforeToday: number;
  currentStreak: number;
} {
  const daySet = new Set(claimedDays);
  const claimedToday = daySet.has(today);
  let streakBeforeToday = 0;
  let cursor = previousCalendarDay(today);
  while (daySet.has(cursor)) {
    streakBeforeToday += 1;
    cursor = previousCalendarDay(cursor);
  }
  return {
    claimedToday,
    streakBeforeToday,
    currentStreak: claimedToday ? streakBeforeToday + 1 : streakBeforeToday,
  };
}

/**
 * Compute today's reward amount from the live 7-day check-in schedule based on
 * the user's consecutive check-in streak immediately prior to today.
 * Missing a day passes `0`, resetting the reward cycle back to Day 1.
 */
export function resolveCheckInReward(config: LiveCheckInConfig, priorConsecutiveDays: number): { dayIndex: number; coins: number } {
  const schedule = config.schedule.length > 0 ? config.schedule : [config.reward];
  const dayIndex = Math.max(0, Math.floor(priorConsecutiveDays)) % schedule.length;
  const coins = schedule[dayIndex] ?? config.reward;
  return { dayIndex, coins };
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

  const checkInConfig = await getLiveCheckInConfig(env);
  if (!checkInConfig.enabled) throw new Error("CHECKIN_DISABLED");

  const priorRows = await db.prepare("SELECT day FROM daily_checkins WHERE user_id=? ORDER BY day DESC LIMIT 4000").bind(userId).all<{ day: string }>();
  const priorDays = (priorRows.results ?? []).map((row) => row.day);
  const { streakBeforeToday } = computeConsecutiveStreak(priorDays, day);
  const { dayIndex, coins: reward } = resolveCheckInReward(checkInConfig, streakBeforeToday);
  const nextStreak = streakBeforeToday + 1;
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
    entry = await appendLedgerEntry(env, { userId, amount: reward, kind: "daily_checkin", reference: idempotencyKey, idempotencyKey, metadata: { day, dayIndex, streak: nextStreak } });
  } catch (error) {
    await db.prepare("DELETE FROM daily_checkins WHERE idempotency_key=?").bind(idempotencyKey).run();
    throw error;
  }
  const total = await db.prepare("SELECT COUNT(*) AS count FROM daily_checkins WHERE user_id=?").bind(userId).first<{ count: number }>();
  if (Number(total?.count ?? 0) >= 1) await awardBadge(env, userId, "first-checkin", { day, streak: nextStreak });
  if (nextStreak >= 7 || Number(total?.count ?? 0) >= 7) await awardBadge(env, userId, "seven-checkins", { day, streak: nextStreak });
  return { claimed: true, id: entry.id, coins: reward, dayIndex, streak: nextStreak, claimedAt: entry.createdAt };
}
