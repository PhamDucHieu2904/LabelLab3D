import { requireDb, nowIso } from "@/lib/server/db";
import { assertSameOrigin, env, sessionUser, json, errorResponse } from "@/lib/server/http";
import { saveOrderReceipt } from "@/lib/server/legal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await sessionUser();
    if (!user) throw new Error("FORBIDDEN");
    const { id } = await params;
    const db = requireDb(await env());
    const row = await db.prepare(`SELECT id,order_code AS orderCode,package_coins AS coins,amount_minor AS amount,
      currency,status,expires_at AS expiresAt FROM payment_orders WHERE id=? AND user_id=?`).bind(id, user.id).first<{
      id: string; orderCode: string; coins: number; amount: number; currency: string; status: string; expiresAt: string;
    }>();
    if (!row) throw new Error("NOT_FOUND");
    if (row.status === "pending" && Date.parse(row.expiresAt) <= Date.now()) {
      await db.prepare("UPDATE payment_orders SET status='expired',updated_at=? WHERE id=? AND user_id=? AND status='pending'").bind(nowIso(), id, user.id).run();
      row.status = "expired";
    }
    return json({ order: row });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertSameOrigin();
    const user = await sessionUser();
    if (!user) throw new Error("FORBIDDEN");
    const { id } = await params;
    const runtimeEnv = await env();
    const db = requireDb(runtimeEnv);
    const existing = await db.prepare(
      "SELECT id,provider FROM payment_orders WHERE id=? AND user_id=?",
    ).bind(id, user.id).first<{ id: string; provider: string }>();
    if (!existing) throw new Error("NOT_FOUND");
    if (existing.provider !== "sepay") throw new Error("INVALID_INPUT");

    const body = (await request.json().catch(() => ({}))) as { receipt?: unknown };
    const saved = await saveOrderReceipt(runtimeEnv, {
      orderId: existing.id,
      userId: user.id,
      receipt: body.receipt,
    });
    if (!saved) throw new Error("INVALID_INPUT");
    return json({ ok: true, receipt: saved });
  } catch (error) {
    return errorResponse(error);
  }
}
