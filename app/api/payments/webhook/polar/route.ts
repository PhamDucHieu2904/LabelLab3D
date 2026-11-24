import { nowIso, randomId, requireDb, sha256 } from "@/lib/server/db";
import { env, json } from "@/lib/server/http";
import {
  extractPolarPaidOrderAmountCents,
  readPolarConfig,
  verifyPolarWebhookSignature,
} from "@/lib/server/polar";
import { appendLedgerEntry } from "@/lib/server/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PolarWebhookEvent = {
  type?: string;
  data?: Record<string, unknown> & {
    id?: string;
    checkout_id?: string | null;
    currency?: string;
    paid?: boolean;
    status?: string;
    metadata?: Record<string, unknown>;
  };
};

type OrderRow = {
  id: string;
  userId: string;
  orderCode: string;
  coins: number;
  amount: number;
  currency: string;
  status: string;
  expiresAt: string;
};

export async function POST(request: Request) {
  const runtimeEnv = await env();
  const config = readPolarConfig(runtimeEnv);
  if (!config) return json({ error: "PAYMENT_NOT_CONFIGURED" }, { status: 503 });

  const rawBody = await request.text();
  const validSig = await verifyPolarWebhookSignature(
    rawBody,
    {
      webhookId: request.headers.get("webhook-id") ?? "",
      webhookTimestamp: request.headers.get("webhook-timestamp") ?? "",
      webhookSignature: request.headers.get("webhook-signature") ?? "",
    },
    config.webhookSecret,
  );
  if (!validSig) {
    return json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let event: PolarWebhookEvent;
  try {
    event = JSON.parse(rawBody) as PolarWebhookEvent;
  } catch {
    return json({ error: "INVALID_JSON" }, { status: 400 });
  }

  if (event.type !== "order.paid" && event.type !== "order.refunded") {
    return json({ received: true, ignored: true, type: event.type ?? "unknown" }, { status: 202 });
  }

  const data = event.data ?? {};
  const meta = (data.metadata && typeof data.metadata === "object" ? data.metadata : {}) as Record<string, unknown>;
  const orderCode = typeof meta.order_code === "string" ? meta.order_code.trim() : "";
  const orderIdMeta = typeof meta.order_id === "string" ? meta.order_id.trim() : "";
  const checkoutId = typeof data.checkout_id === "string" ? data.checkout_id.trim() : "";

  const db = requireDb(runtimeEnv);
  let order: OrderRow | null = null;
  if (orderCode) {
    order = await db.prepare(
      "SELECT id,user_id AS userId,order_code AS orderCode,package_coins AS coins,amount_minor AS amount,currency,status,expires_at AS expiresAt FROM payment_orders WHERE order_code=? AND provider='polar'",
    ).bind(orderCode).first<OrderRow>();
  }
  if (!order && orderIdMeta) {
    order = await db.prepare(
      "SELECT id,user_id AS userId,order_code AS orderCode,package_coins AS coins,amount_minor AS amount,currency,status,expires_at AS expiresAt FROM payment_orders WHERE id=? AND provider='polar'",
    ).bind(orderIdMeta).first<OrderRow>();
  }
  if (!order && checkoutId) {
    order = await db.prepare(
      "SELECT id,user_id AS userId,order_code AS orderCode,package_coins AS coins,amount_minor AS amount,currency,status,expires_at AS expiresAt FROM payment_orders WHERE provider_order_id=? AND provider='polar'",
    ).bind(checkoutId).first<OrderRow>();
  }

  if (!order) {
    return json({ received: true, ignored: true, reason: "NO_MATCHING_ORDER" }, { status: 202 });
  }

  const rawHash = await sha256(rawBody);
  const webhookId = (request.headers.get("webhook-id") ?? "").trim();
  const providerOrderId = typeof data.id === "string" && data.id.trim() ? data.id.trim() : checkoutId || null;
  const providerEventId = `${event.type}:${webhookId || providerOrderId || rawHash}`;

  try {
    await db.prepare(`INSERT INTO payment_events
      (id,provider,provider_event_id,order_id,raw_payload_hash,signature_valid,processing_status,created_at)
      VALUES (?,?,?,?,?,?,?,?)`).bind(randomId("pev"), "polar", providerEventId, order.id, rawHash, 1, "received", nowIso()).run();
  } catch {
    const existing = await db.prepare(
      "SELECT processing_status AS status,raw_payload_hash AS rawHash FROM payment_events WHERE provider='polar' AND provider_event_id=?",
    ).bind(providerEventId).first<{ status: string; rawHash: string }>();
    if (!existing || existing.rawHash !== rawHash) return json({ error: "EVENT_CONFLICT" }, { status: 409 });
    if (existing.status === "processed" || existing.status === "ignored") {
      return json({ received: true, success: true, duplicate: true }, { status: 202 });
    }
  }

  if (event.type === "order.refunded") {
    if (order.status === "paid") {
      try {
        await appendLedgerEntry(runtimeEnv, {
          userId: order.userId,
          amount: -order.coins,
          kind: "refund",
          reference: `polar_refund:${order.orderCode}`,
          idempotencyKey: `refund:${order.id}`,
          metadata: { provider: "polar", providerEventId, providerOrderId },
        });
      } catch {
        // User may have already spent coins; still mark order refunded and audit.
      }
      await db.prepare("UPDATE payment_orders SET status='refunded',updated_at=? WHERE id=?").bind(nowIso(), order.id).run();
    }
    await db.prepare("UPDATE payment_events SET processing_status='processed' WHERE provider='polar' AND provider_event_id=?").bind(providerEventId).run();
    return json({ received: true, success: true }, { status: 202 });
  }

  if (order.status === "paid") {
    await db.prepare("UPDATE payment_events SET processing_status='ignored' WHERE provider='polar' AND provider_event_id=?").bind(providerEventId).run();
    return json({ received: true, success: true, alreadyPaid: true }, { status: 202 });
  }

  const currencyOk = String(data.currency ?? "").trim().toLowerCase() === "usd";
  const amountCents = extractPolarPaidOrderAmountCents(data);
  const creditableStatus = order.status === "pending" || order.status === "expired";
  const validPayment = currencyOk
    && creditableStatus
    && amountCents !== null
    && amountCents === order.amount;

  if (!validPayment) {
    await db.prepare("UPDATE payment_events SET processing_status='rejected' WHERE provider='polar' AND provider_event_id=?").bind(providerEventId).run();
    return json({ received: true, ignored: true, reason: "INVALID_PAYMENT" }, { status: 202 });
  }

  try {
    await appendLedgerEntry(runtimeEnv, {
      userId: order.userId,
      amount: order.coins,
      kind: "purchase",
      reference: `polar:${order.orderCode}`,
      idempotencyKey: `payment:${order.id}`,
      metadata: {
        provider: "polar",
        providerEventId,
        providerOrderId,
        amountCents,
        currency: "USD",
      },
    });
    await db.prepare(
      "UPDATE payment_orders SET status='paid',provider_order_id=?,updated_at=? WHERE id=? AND status IN ('pending','expired')",
    ).bind(providerOrderId, nowIso(), order.id).run();
    await db.prepare("UPDATE payment_events SET processing_status='processed' WHERE provider='polar' AND provider_event_id=?").bind(providerEventId).run();
    return json({ received: true, success: true }, { status: 202 });
  } catch {
    await db.prepare("UPDATE payment_events SET processing_status='received' WHERE provider='polar' AND provider_event_id=?").bind(providerEventId).run();
    return json({ error: "PROCESSING_FAILED" }, { status: 500 });
  }
}
