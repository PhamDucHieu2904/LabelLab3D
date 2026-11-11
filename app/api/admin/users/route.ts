import { hashPassword } from "@/lib/server/password";
import { nowIso, randomId, requireDb } from "@/lib/server/db";
import { appendLedgerEntry } from "@/lib/server/wallet";
import { requireAdmin } from "@/lib/server/admin";
import { assertSameOrigin, errorResponse, json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UserRow = { id: string; email: string; name: string; role: "user" | "admin"; status: "active" | "locked"; createdAt: string; updatedAt: string; balance: number; loginDays: number; lastCheckin: string | null };

export async function GET() {
  try {
    const { env } = await requireAdmin();
    const rows = await requireDb(env).prepare(`SELECT u.id,u.email,u.name,u.role,u.status,u.created_at AS createdAt,u.updated_at AS updatedAt,
      COALESCE(w.balance,0) AS balance, COUNT(DISTINCT dc.day) AS loginDays, MAX(dc.claimed_at) AS lastCheckin
      FROM users u LEFT JOIN wallets w ON w.user_id=u.id LEFT JOIN daily_checkins dc ON dc.user_id=u.id
      GROUP BY u.id ORDER BY u.created_at DESC LIMIT 500`).all<UserRow>();
    return json({ users: rows.results ?? [] });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const { env, user: actor } = await requireAdmin();
    const body = await request.json().catch(() => ({})) as { action?: string; userId?: string; amount?: number; reason?: string; name?: string; email?: string; password?: string; status?: string; idempotencyKey?: string };
    const db = requireDb(env), action = body.action ?? "";
    if (action === "status") {
      if (!body.userId || !["active", "locked"].includes(String(body.status))) throw new Error("INVALID_INPUT");
      if (body.userId === actor.id && body.status === "locked") throw new Error("CANNOT_LOCK_SELF");
      await db.prepare("UPDATE users SET status=?,updated_at=? WHERE id=?").bind(body.status, nowIso(), body.userId).run();
      await db.prepare("INSERT INTO audit_events (id,actor_user_id,action,target_type,target_id,metadata_json,created_at) VALUES (?,?,?,?,?,?,?)").bind(randomId("audit"), actor.id, "admin_user_status", "user", body.userId, JSON.stringify({ status: body.status }), nowIso()).run();
      return json({ ok: true });
    }
    if (action === "coin_adjustment") {
      const amount = Number(body.amount), reason = body.reason?.trim() ?? "";
      const key = body.idempotencyKey?.trim() ?? "";
      if (!body.userId || !Number.isSafeInteger(amount) || amount === 0 || reason.length < 3 || reason.length > 300 || !/^admincoin_[A-Za-z0-9_-]{16,120}$/.test(key)) throw new Error("INVALID_INPUT");
      const entry = await appendLedgerEntry(env, { userId: body.userId, amount, kind: "admin_adjustment", reference: reason.slice(0, 240), idempotencyKey: key, metadata: { actorId: actor.id, reason } });
      await db.prepare("INSERT INTO audit_events (id,actor_user_id,action,target_type,target_id,metadata_json,created_at) VALUES (?,?,?,?,?,?,?)").bind(randomId("audit"), actor.id, "admin_coin_adjustment", "user", body.userId, JSON.stringify({ amount, reason, ledgerId: entry.id }), nowIso()).run();
      return json({ ok: true, entry });
    }
    if (action === "create") {
      const email = body.email?.trim().toLowerCase() ?? "", name = body.name?.trim() ?? "", password = body.password ?? "";
      if (!/^\S+@\S+\.\S+$/.test(email) || !name || name.length > 120 || password.length < 12 || password.length > 128) throw new Error("INVALID_INPUT");
      const id = randomId("usr"), now = nowIso();
      await db.prepare("INSERT INTO users (id,email,name,password_hash,role,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").bind(id, email, name, await hashPassword(password), "admin", "active", now, now).run();
      await db.prepare("INSERT INTO audit_events (id,actor_user_id,action,target_type,target_id,metadata_json,created_at) VALUES (?,?,?,?,?,?,?)").bind(randomId("audit"), actor.id, "admin_user_create", "user", id, JSON.stringify({ email }), now).run();
      return json({ ok: true, id }, { status: 201 });
    }
    throw new Error("INVALID_INPUT");
  } catch (error) { return errorResponse(error); }
}
