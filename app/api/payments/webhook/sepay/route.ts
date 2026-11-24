import { appendLedgerEntry } from "@/lib/server/wallet";
import { constantTimeEqual, nowIso, randomId, requireDb, sha256 } from "@/lib/server/db";
import { env, json } from "@/lib/server/http";
import { readSepayConfig } from "@/lib/server/sepay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SepayNotification = {
  timestamp?: number;
  notification_type?: string;
  order?: {
    id?: string;
    order_status?: string;
    order_currency?: string;
    order_amount?: string | number;
    order_invoice_number?: string;
  };
  transaction?: {
    id?: string;
    transaction_status?: string;
    transaction_amount?: string | number;
    transaction_currency?: string;
    payment_method?: string;
  };
};

export async function POST(request: Request) {
  const runtimeEnv = await env();
  const config = readSepayConfig(runtimeEnv);
  const suppliedSecret = request.headers.get("x-secret-key") ?? "";
  if (!config.ipnSecret || !suppliedSecret || !(await constantTimeEqual(config.ipnSecret, suppliedSecret))) {
    return json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const rawBody = await request.text();
  const rawHash = await sha256(rawBody);
  let event: SepayNotification;
  try { event = JSON.parse(rawBody) as SepayNotification; } catch { return json({ error: "INVALID_JSON" }, { status: 400 }); }
  const orderCode = event.order?.order_invoice_number?.trim() ?? "";
  const providerEventId = event.transaction?.id?.trim() || event.order?.id?.trim() || rawHash;
  if (!orderCode || !providerEventId) return json({ error: "INVALID_EVENT" }, { status: 400 });

  const db = requireDb(runtimeEnv);
  const order = await db.prepare("SELECT id,user_id AS userId,order_code AS orderCode,package_coins AS coins,amount_minor AS amount,currency,status,expires_at AS expiresAt FROM payment_orders WHERE order_code=?").bind(orderCode).first<{
    id: string; userId: string; orderCode: string; coins: number; amount: number; currency: string; status: string; expiresAt: string;
  }>();
  if (!order) return json({ error: "ORDER_NOT_FOUND" }, { status: 404 });

  try {
    await db.prepare(`INSERT INTO payment_events
      (id,provider,provider_event_id,order_id,raw_payload_hash,signature_valid,processing_status,created_at)
      VALUES (?,?,?,?,?,?,?,?)`).bind(randomId("pev"), "sepay", providerEventId, order.id, rawHash, 1, "received", nowIso()).run();
  } catch {
    // A processed/ignored event is safe to acknowledge. If the worker crashed
    // after inserting `received`, continue below so the ledger can be repaired.
    const existing = await db.prepare("SELECT processing_status AS status,raw_payload_hash AS rawHash FROM payment_events WHERE provider=? AND provider_event_id=?").bind("sepay", providerEventId).first<{ status: string; rawHash: string }>();
    if (!existing || existing.rawHash !== rawHash) return json({ error: "EVENT_CONFLICT" }, { status: 409 });
    if (existing.status === "processed" || existing.status === "ignored") return json({ success: true, duplicate: true });
  }

  if (order.status === "paid") {
    await db.prepare("UPDATE payment_events SET processing_status='ignored' WHERE provider=? AND provider_event_id=?").bind("sepay", providerEventId).run();
    return json({ success: true, alreadyPaid: true });
  }

  const receivedAmount = Number(event.order?.order_amount ?? event.transaction?.transaction_amount);
  // Accept verified CAPTURED+APPROVED transfers even if IPN arrived slightly
  // after the 15-minute checkout expiry so customers who already transferred
  // money never lose their coins.
  const creditableStatus = order.status === "pending" || order.status === "expired";
  const validPayment = event.notification_type === "ORDER_PAID"
    && event.order?.order_status === "CAPTURED"
    && event.transaction?.transaction_status === "APPROVED"
    && event.order?.order_currency === "VND"
    && event.transaction?.transaction_currency === "VND"
    && event.transaction?.payment_method === "BANK_TRANSFER"
    && creditableStatus
    && Number.isFinite(receivedAmount)
    && receivedAmount === order.amount;
  if (!validPayment) {
    await db.prepare("UPDATE payment_events SET processing_status='rejected' WHERE provider=? AND provider_event_id=?").bind("sepay", providerEventId).run();
    return json({ error: "INVALID_PAYMENT" }, { status: 400 });
  }

  const providerOrderId = event.order?.id?.trim() || null;
  try {
    await appendLedgerEntry(runtimeEnv, {
      userId: order.userId,
      amount: order.coins,
      kind: "purchase",
      reference: `sepay:${order.orderCode}`,
      idempotencyKey: `payment:${order.id}`,
      metadata: { provider: "sepay", providerEventId, providerOrderId, amount: order.amount, currency: order.currency },
    });
    await db.prepare("UPDATE payment_orders SET status='paid',provider_order_id=COALESCE(provider_order_id,?),updated_at=? WHERE id=? AND status IN ('pending','expired')").bind(providerOrderId, nowIso(), order.id).run();
    await db.prepare("UPDATE payment_events SET processing_status='processed' WHERE provider=? AND provider_event_id=?").bind("sepay", providerEventId).run();
    return json({ success: true });
  } catch {
    await db.prepare("UPDATE payment_events SET processing_status='received' WHERE provider=? AND provider_event_id=?").bind("sepay", providerEventId).run();
    return json({ error: "PROCESSING_FAILED" }, { status: 500 });
  }
}
