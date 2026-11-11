import { requireDb } from "@/lib/server/db";
import { env, sessionUser, json, errorResponse, assertSameOrigin } from "@/lib/server/http";
import { claimDailyCheckIn } from "@/lib/server/rewards";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const user = await sessionUser(); if (!user) throw new Error("FORBIDDEN");
    const db = requireDb(await env()); const today = new Date().toISOString().slice(0,10);
    const rows = await db.prepare("SELECT day,coins,claimed_at AS claimedAt FROM daily_checkins WHERE user_id=? ORDER BY day DESC LIMIT 30").bind(user.id).all();
    const todayRow = (rows.results ?? []).find((row) => (row as {day?: string}).day === today);
    return json({ today, claimed: Boolean(todayRow), current: todayRow ?? null, history: rows.results ?? [] });
  } catch (e) { return errorResponse(e); }
}
export async function POST(request: Request) {
  try { await assertSameOrigin(); const user = await sessionUser(); if (!user) throw new Error("FORBIDDEN"); const body = await request.json().catch(() => ({})) as { day?: string }; if (body.day && !/^\d{4}-\d{2}-\d{2}$/.test(body.day)) throw new Error("INVALID_INPUT"); return json(await claimDailyCheckIn(await env(), user.id, body.day)); }
  catch (e) { return errorResponse(e); }
}
