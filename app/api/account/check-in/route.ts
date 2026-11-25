import { requireDb } from "@/lib/server/db";
import { env, sessionUser, json, errorResponse, assertSameOrigin } from "@/lib/server/http";
import { claimDailyCheckIn, computeConsecutiveStreak, currentRewardDay, resolveCheckInReward } from "@/lib/server/rewards";
import { getLiveCheckInConfig } from "@/lib/server/site-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const runtimeEnv = await env();
    const config = await getLiveCheckInConfig(runtimeEnv);
    const user = await sessionUser();
    const today = currentRewardDay();
    if (!user) {
      return json({
        today,
        claimed: false,
        current: null,
        history: [],
        config,
        completedCount: 0,
        streak: 0,
        nextDayIndex: 0,
        todayReward: config.schedule[0] ?? config.reward,
      });
    }
    const db = requireDb(runtimeEnv);
    const [rows, countRow] = await Promise.all([
      db.prepare("SELECT day,coins,claimed_at AS claimedAt FROM daily_checkins WHERE user_id=? ORDER BY day DESC LIMIT 4000").bind(user.id).all<{ day: string; coins: number; claimedAt: string }>(),
      db.prepare("SELECT COUNT(*) AS count FROM daily_checkins WHERE user_id=?").bind(user.id).first<{ count: number }>(),
    ]);
    const allRows = rows.results ?? [];
    const history = allRows.slice(0, 30);
    const todayRow = allRows.find((row) => row.day === today) ?? null;
    const completedCount = Number(countRow?.count ?? allRows.length);
    const { claimedToday, streakBeforeToday, currentStreak } = computeConsecutiveStreak(
      allRows.map((row) => row.day),
      today,
    );
    const { dayIndex, coins } = resolveCheckInReward(config, streakBeforeToday);
    return json({
      today,
      claimed: claimedToday,
      current: todayRow,
      history,
      config,
      completedCount,
      streak: currentStreak,
      nextDayIndex: dayIndex,
      todayReward: todayRow?.coins ?? coins,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const user = await sessionUser();
    if (!user) throw new Error("FORBIDDEN");
    const body = await request.json().catch(() => ({})) as { day?: string };
    if (body.day && !/^\d{4}-\d{2}-\d{2}$/.test(body.day)) throw new Error("INVALID_INPUT");
    return json(await claimDailyCheckIn(await env(), user.id, body.day));
  } catch (e) {
    return errorResponse(e);
  }
}
