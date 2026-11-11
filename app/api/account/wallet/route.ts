import { getCoinBalance } from "@/lib/server/wallet";
import { ensureBadgeCatalog } from "@/lib/server/badges";
import { env, sessionUser, json, errorResponse } from "@/lib/server/http";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const user = await sessionUser(); if (!user) throw new Error("FORBIDDEN");
    const runtimeEnv = await env(); const db = runtimeEnv.DB!; await ensureBadgeCatalog(runtimeEnv);
    // Settle expired reservations before reading the ledger so the returned
    // balance and history describe the same point in time.
    const balance = await getCoinBalance(runtimeEnv, user.id);
    const [ledger, badges] = await Promise.all([
      db.prepare("SELECT id,amount,kind,reference,balance,created_at AS createdAt FROM coin_ledger WHERE user_id=? ORDER BY created_at DESC LIMIT 100").bind(user.id).all(),
      db.prepare("SELECT b.id,b.slug,b.name,b.description,ub.awarded_at AS awardedAt FROM user_badges ub JOIN badges b ON b.id=ub.badge_id WHERE ub.user_id=? ORDER BY ub.awarded_at DESC").bind(user.id).all(),
    ]);
    return json({ balance, entries: ledger.results ?? [], badges: badges.results ?? [] });
  } catch (e) { return errorResponse(e); }
}
