import { appendLedgerEntry } from "@/lib/server/wallet";
import { constantTimeEqual, nowIso, randomId, requireDb, sha256, type AppEnv } from "@/lib/server/db";
import { env, json } from "@/lib/server/http";
import {
  extractOrderCodesFromTransfer,
  normalizeAccountNumber,
  parseSepayApikeyHeader,
  readSepayConfig,
  readSepayQrConfig,
} from "@/lib/server/sepay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SepayGatewayNotification = {
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

type SepayBankWebhook = {
  id?: number | string;
  gateway?: string;
  transactionDate?: string;
  accountNumber?: string;
  subAccount?: string | null;
  code?: string | null;
  content?: string | null;
  transferType?: string;
  description?: string | null;
  transferAmount?: number | string;
  referenceCode?: string | null;
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

async function settleVerifiedOrder(
  runtimeEnv: AppEnv,
  input: {
    order: OrderRow;
    providerEventId: string;
    providerOrderId: string | null;
    rawHash: string;
    validPayment: boolean;
    rejectStatus: number;
    rejectBody: Record<string, unknown>;
    metadata: Record<string, unknown>;
  },
) {
  const db = requireDb(runtimeEnv);
  const { order, providerEventId, providerOrderId, rawHash } = input;

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

  if (!input.validPayment) {
    await db.prepare("UPDATE payment_events SET processing_status='rejected' WHERE provider=? AND provider_event_id=?").bind("sepay", providerEventId).run();
    return json(input.rejectBody, { status: input.rejectStatus });
  }

  try {
    await appendLedgerEntry(runtimeEnv, {
      userId: order.userId,
      amount: order.coins,
      kind: "purchase",
      reference: `sepay:${order.orderCode}`,
      idempotencyKey: `payment:${order.id}`,
      metadata: input.metadata,
    });
    await db.prepare("UPDATE payment_orders SET status='paid',provider_order_id=COALESCE(provider_order_id,?),updated_at=? WHERE id=? AND status IN ('pending','expired')").bind(providerOrderId, nowIso(), order.id).run();
    await db.prepare("UPDATE payment_events SET processing_status='processed' WHERE provider=? AND provider_event_id=?").bind("sepay", providerEventId).run();
    return json({ success: true });
  } catch {
    await db.prepare("UPDATE payment_events SET processing_status='received' WHERE provider=? AND provider_event_id=?").bind("sepay", providerEventId).run();
    return json({ error: "PROCESSING_FAILED" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const runtimeEnv = await env();
  const gatewayConfig = readSepayConfig(runtimeEnv);
  const qrConfig = readSepayQrConfig(runtimeEnv);

  const suppliedGatewaySecret = request.headers.get("x-secret-key") ?? "";
  const suppliedBankApiKey = parseSepayApikeyHeader(request.headers.get("authorization"));

  const isGatewayAuth = Boolean(
    gatewayConfig.ipnSecret && suppliedGatewaySecret
    && (await constantTimeEqual(gatewayConfig.ipnSecret, suppliedGatewaySecret)),
  );
  const isBankWebhookAuth = Boolean(
    qrConfig?.webhookApiKey && suppliedBankApiKey
    && (await constantTimeEqual(qrConfig.webhookApiKey, suppliedBankApiKey)),
  );

  if (!isGatewayAuth && !isBankWebhookAuth) {
    return json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const rawBody = await request.text();
  const rawHash = await sha256(rawBody);
  const db = requireDb(runtimeEnv);

  if (isBankWebhookAuth && qrConfig) {
    let event: SepayBankWebhook;
    try { event = JSON.parse(rawBody) as SepayBankWebhook; } catch { return json({ error: "INVALID_JSON" }, { status: 400 }); }

    if (event.transferType !== "in") {
      return json({ success: true, ignored: true, reason: "NOT_INCOMING" });
    }
    const receivedAccount = normalizeAccountNumber(String(event.accountNumber ?? ""));
    if (!receivedAccount || receivedAccount !== normalizeAccountNumber(qrConfig.accountNumber)) {
      return json({ success: true, ignored: true, reason: "ACCOUNT_MISMATCH" });
    }

    const candidates = extractOrderCodesFromTransfer(event);
    let order: OrderRow | null = null;
    for (const candidate of candidates) {
      const found = await db.prepare("SELECT id,user_id AS userId,order_code AS orderCode,package_coins AS coins,amount_minor AS amount,currency,status,expires_at AS expiresAt FROM payment_orders WHERE order_code=?").bind(candidate).first<OrderRow>();
      if (found) {
        order = found;
        break;
      }
    }
    // Unrelated personal transfers into the merchant's bank account must be
    // acknowledged with 200 so SePay does not retry them repeatedly.
    if (!order) {
      return json({ success: true, ignored: true, reason: "NO_MATCHING_ORDER" });
    }

    const txId = String(event.id ?? "").trim() || String(event.referenceCode ?? "").trim() || rawHash;
    const providerEventId = `bank:${txId}`;
    const providerOrderId = String(event.referenceCode ?? "").trim() || String(event.id ?? "").trim() || null;
    const receivedAmount = Number(event.transferAmount);
    const creditableStatus = order.status === "pending" || order.status === "expired";
    const validPayment = creditableStatus
      && Number.isSafeInteger(receivedAmount)
      && receivedAmount === order.amount;

    return settleVerifiedOrder(runtimeEnv, {
      order,
      providerEventId,
      providerOrderId,
      rawHash,
      validPayment,
      // Return 200 after recording the rejected audit event so SePay does not
      // retry a permanently mismatched amount 7 times.
      rejectStatus: 200,
      rejectBody: { success: true, ignored: true, reason: "AMOUNT_MISMATCH" },
      metadata: {
        provider: "sepay",
        source: "bank_webhook",
        providerEventId,
        providerOrderId,
        gateway: event.gateway ?? null,
        amount: order.amount,
        currency: order.currency,
      },
    });
  }

  let event: SepayGatewayNotification;
  try { event = JSON.parse(rawBody) as SepayGatewayNotification; } catch { return json({ error: "INVALID_JSON" }, { status: 400 }); }
  const orderCode = event.order?.order_invoice_number?.trim() ?? "";
  const providerEventId = event.transaction?.id?.trim() || event.order?.id?.trim() || rawHash;
  if (!orderCode || !providerEventId) return json({ error: "INVALID_EVENT" }, { status: 400 });

  const order = await db.prepare("SELECT id,user_id AS userId,order_code AS orderCode,package_coins AS coins,amount_minor AS amount,currency,status,expires_at AS expiresAt FROM payment_orders WHERE order_code=?").bind(orderCode).first<OrderRow>();
  if (!order) return json({ error: "ORDER_NOT_FOUND" }, { status: 404 });

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

  const providerOrderId = event.order?.id?.trim() || null;
  return settleVerifiedOrder(runtimeEnv, {
    order,
    providerEventId,
    providerOrderId,
    rawHash,
    validPayment,
    rejectStatus: 400,
    rejectBody: { error: "INVALID_PAYMENT" },
    metadata: {
      provider: "sepay",
      source: "gateway_ipn",
      providerEventId,
      providerOrderId,
      amount: order.amount,
      currency: order.currency,
    },
  });
}
