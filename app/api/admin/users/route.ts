import { hashPassword } from "@/lib/server/password";
import { nowIso, randomId, requireDb } from "@/lib/server/db";
import { appendLedgerEntry } from "@/lib/server/wallet";
import { requireAdmin } from "@/lib/server/admin";
import { assertSameOrigin, errorResponse, json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  status: "active" | "locked";
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  balance: number;
  loginDays: number;
  lastCheckin: string | null;
  paidOrders: number;
  totalPaidVnd: number;
  googleLinked: number;
};

export async function GET() {
  try {
    const { env } = await requireAdmin();
    const rows = await requireDb(env).prepare(`SELECT u.id,u.email,u.name,u.role,u.status,
      u.email_verified_at AS emailVerifiedAt,u.created_at AS createdAt,u.updated_at AS updatedAt,
      COALESCE(w.balance,0) AS balance,
      (SELECT COUNT(DISTINCT dc.day) FROM daily_checkins dc WHERE dc.user_id=u.id) AS loginDays,
      (SELECT MAX(dc.claimed_at) FROM daily_checkins dc WHERE dc.user_id=u.id) AS lastCheckin,
      (SELECT COUNT(*) FROM payment_orders po WHERE po.user_id=u.id AND po.status='paid') AS paidOrders,
      (SELECT COALESCE(SUM(po.amount_minor),0) FROM payment_orders po WHERE po.user_id=u.id AND po.status='paid' AND po.currency='VND') AS totalPaidVnd,
      (SELECT COUNT(*) FROM oauth_accounts oa WHERE oa.user_id=u.id AND oa.provider='google') AS googleLinked
      FROM users u LEFT JOIN wallets w ON w.user_id=u.id
      ORDER BY u.created_at DESC LIMIT 500`).all<UserRow>();
    return json({ users: rows.results ?? [] });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const { env, user: actor } = await requireAdmin();
    const body = await request.json().catch(() => ({})) as {
      action?: string; userId?: string; amount?: number; reason?: string;
      name?: string; email?: string; password?: string; status?: string; role?: string; idempotencyKey?: string;
    };
    const db = requireDb(env), action = body.action ?? "";
    if (action === "status") {
      if (!body.userId || !["active", "locked"].includes(String(body.status))) throw new Error("INVALID_INPUT");
      if (body.userId === actor.id && body.status === "locked") throw new Error("CANNOT_LOCK_SELF");
      await db.prepare("UPDATE users SET status=?,updated_at=? WHERE id=?").bind(body.status, nowIso(), body.userId).run();
      await db.prepare("INSERT INTO audit_events (id,actor_user_id,action,target_type,target_id,metadata_json,created_at) VALUES (?,?,?,?,?,?,?)").bind(randomId("audit"), actor.id, "admin_user_status", "user", body.userId, JSON.stringify({ status: body.status }), nowIso()).run();
      return json({ ok: true });
    }
    if (action === "role") {
      if (!body.userId || !["user", "admin"].includes(String(body.role))) throw new Error("INVALID_INPUT");
      if (body.userId === actor.id && body.role !== "admin") throw new Error("CANNOT_DEMOTE_SELF");
      await db.prepare("UPDATE users SET role=?,updated_at=? WHERE id=?").bind(body.role, nowIso(), body.userId).run();
      await db.prepare("INSERT INTO audit_events (id,actor_user_id,action,target_type,target_id,metadata_json,created_at) VALUES (?,?,?,?,?,?,?)").bind(randomId("audit"), actor.id, "admin_user_role", "user", body.userId, JSON.stringify({ role: body.role }), nowIso()).run();
      return json({ ok: true });
    }
    if (action === "coin_adjustment") {
      const amount = Number(body.amount), reason = body.reason?.trim() ?? "";
      const key = body.idempotencyKey?.trim() ?? "";
      if (!body.userId || !Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > 1_000_000 || reason.length < 3 || reason.length > 300 || !/^admincoin_[A-Za-z0-9_-]{16,120}$/.test(key)) throw new Error("INVALID_INPUT");
      const entry = await appendLedgerEntry(env, { userId: body.userId, amount, kind: "admin_adjustment", reference: reason.slice(0, 240), idempotencyKey: key, metadata: { actorId: actor.id, reason } });
      await db.prepare("INSERT INTO audit_events (id,actor_user_id,action,target_type,target_id,metadata_json,created_at) VALUES (?,?,?,?,?,?,?)").bind(randomId("audit"), actor.id, "admin_coin_adjustment", "user", body.userId, JSON.stringify({ amount, reason, ledgerId: entry.id }), nowIso()).run();
      return json({ ok: true, entry });
    }
    if (action === "create") {
      const email = body.email?.trim().toLowerCase() ?? "", name = body.name?.trim() ?? "", password = body.password ?? "";
      const role = body.role === "user" ? "user" : "admin";
      if (!/^\S+@\S+\.\S+$/.test(email) || !name || name.length > 120 || password.length < 12 || password.length > 128) throw new Error("INVALID_INPUT");
      const id = randomId("usr"), now = nowIso();
      await db.batch([
        db.prepare("INSERT INTO users (id,email,name,password_hash,role,status,email_verified_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(id, email, name, await hashPassword(password), role, "active", now, now, now),
        db.prepare("INSERT INTO wallets (user_id,balance,updated_at) VALUES (?,0,?) ON CONFLICT(user_id) DO NOTHING").bind(id, now),
        db.prepare("INSERT INTO audit_events (id,actor_user_id,action,target_type,target_id,metadata_json,created_at) VALUES (?,?,?,?,?,?,?)").bind(randomId("audit"), actor.id, "admin_user_create", "user", id, JSON.stringify({ email, role }), now),
      ]);
      return json({ ok: true, id }, { status: 201 });
    }
    throw new Error("INVALID_INPUT");
  } catch (error) { return errorResponse(error); }
}
