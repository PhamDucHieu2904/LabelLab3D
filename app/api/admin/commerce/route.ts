import { requireAdmin } from "@/lib/server/admin";
import { nowIso, randomId } from "@/lib/server/db";
import { assertSameOrigin, errorResponse, json } from "@/lib/server/http";
import { ensureSiteTables, getLiveCoinPackages, sanitizeCoinPackages, writeConfigJson } from "@/lib/server/site-config";
import { appendLedgerEntry } from "@/lib/server/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { env } = await requireAdmin();
    const db = await ensureSiteTables(env);
    const [ordersRes, ledgerRes, usersRes, packs] = await Promise.all([
      db.prepare(`SELECT po.id,po.order_code AS orderCode,po.user_id AS userId,u.name AS userName,u.email AS userEmail,
        po.provider,po.package_coins AS coins,po.amount_minor AS amount,po.currency,po.status,
        po.provider_order_id AS providerOrderId,po.expires_at AS expiresAt,po.created_at AS createdAt,po.updated_at AS updatedAt
        FROM payment_orders po LEFT JOIN users u ON u.id=po.user_id
        ORDER BY po.created_at DESC LIMIT 500`).all(),
      db.prepare(`SELECT cl.id,cl.user_id AS userId,u.name AS userName,u.email AS userEmail,
        cl.amount,cl.kind,cl.reference,cl.balance,cl.created_at AS createdAt
        FROM coin_ledger cl LEFT JOIN users u ON u.id=cl.user_id
        ORDER BY cl.created_at DESC LIMIT 500`).all(),
      db.prepare(`SELECT u.id,u.name,u.email,u.status,COALESCE(w.balance,0) AS balance
        FROM users u LEFT JOIN wallets w ON w.user_id=u.id
        ORDER BY u.created_at DESC LIMIT 500`).all(),
      getLiveCoinPackages(env),
    ]);
    return json({
      orders: ordersRes.results ?? [],
      ledger: ledgerRes.results ?? [],
      users: usersRes.results ?? [],
      packs,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const { env, user: actor } = await requireAdmin();
    const db = await ensureSiteTables(env);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "adjust_coins") {
      const userId = typeof body.userId === "string" ? body.userId.trim() : "";
      const amount = Number(body.amount);
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      const key = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : `admincoin_${randomId("adj")}`;
      if (!userId || !Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > 1_000_000 || reason.length < 3 || reason.length > 300) {
        throw new Error("INVALID_INPUT");
      }
      const entry = await appendLedgerEntry(env, {
        userId,
        amount,
        kind: "admin_adjustment",
        reference: reason.slice(0, 240),
        idempotencyKey: key,
        metadata: { actorId: actor.id, reason },
      });
      await db.prepare(
        "INSERT INTO audit_events (id,actor_user_id,action,target_type,target_id,metadata_json,created_at) VALUES (?,?,?,?,?,?,?)",
      ).bind(randomId("audit"), actor.id, "admin_coin_adjustment", "user", userId, JSON.stringify({ amount, reason, ledgerId: entry.id }), nowIso()).run();
      return json({ ok: true, entry });
    }

    if (action === "update_order_status") {
      const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
      const nextStatus = typeof body.status === "string" ? body.status.trim() : "";
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (!orderId || !["pending", "paid", "expired", "cancelled", "refunded"].includes(nextStatus) || reason.length < 5 || reason.length > 300) {
        throw new Error("INVALID_INPUT");
      }
      const order = await db.prepare(
        "SELECT id,user_id AS userId,order_code AS orderCode,package_coins AS coins,amount_minor AS amount,currency,status FROM payment_orders WHERE id=?",
      ).bind(orderId).first<{ id: string; userId: string; orderCode: string; coins: number; amount: number; currency: string; status: string }>();
      if (!order) throw new Error("NOT_FOUND");
      if (order.status === nextStatus) return json({ ok: true });

      const now = nowIso();
      if (nextStatus === "paid" && order.status !== "paid") {
        await appendLedgerEntry(env, {
          userId: order.userId,
          amount: order.coins,
          kind: "purchase",
          reference: `sepay:${order.orderCode}`,
          idempotencyKey: `payment:${order.id}`,
          metadata: { provider: "sepay", source: "admin_manual_confirm", actorId: actor.id, reason },
        });
      } else if (nextStatus === "refunded" && order.status === "paid") {
        await appendLedgerEntry(env, {
          userId: order.userId,
          amount: -order.coins,
          kind: "refund",
          reference: `refund:${order.orderCode}`,
          idempotencyKey: `refund:${order.id}`,
          metadata: { actorId: actor.id, reason },
        });
      }
      await db.prepare("UPDATE payment_orders SET status=?,updated_at=? WHERE id=?").bind(nextStatus, now, order.id).run();
      await db.prepare(
        "INSERT INTO audit_events (id,actor_user_id,action,target_type,target_id,metadata_json,created_at) VALUES (?,?,?,?,?,?,?)",
      ).bind(randomId("audit"), actor.id, "admin_order_status", "payment_order", order.orderCode, JSON.stringify({ from: order.status, to: nextStatus, reason }), now).run();
      return json({ ok: true });
    }

    if (action === "save_packs") {
      const packs = sanitizeCoinPackages(body.packs);
      await writeConfigJson(env, "coin_packages", packs, actor.id);
      await db.prepare(
        "INSERT INTO audit_events (id,actor_user_id,action,target_type,target_id,metadata_json,created_at) VALUES (?,?,?,?,?,?,?)",
      ).bind(randomId("audit"), actor.id, "admin_update_packs", "site_config", "coin_packages", JSON.stringify({ count: packs.length }), nowIso()).run();
      return json({ ok: true, packs });
    }

    throw new Error("INVALID_INPUT");
  } catch (error) {
    return errorResponse(error);
  }
}
