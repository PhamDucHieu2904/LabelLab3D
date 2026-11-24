import { constantTimeEqual, type AppEnv } from "./db";
import { assertSepayConfig, createSepayCheckout, readSepayConfig, sepayCheckoutEndpoint, type SepayCheckoutFields } from "./sepay";

export type CheckoutInput = {
  amount: number;
  orderCode: string;
  description: string;
  customerId: string;
  successUrl: string;
  errorUrl: string;
  cancelUrl: string;
};

export type CheckoutForm = { action: string; method: "POST"; fields: SepayCheckoutFields };
export type PaymentStatus = "pending" | "paid" | "expired" | "cancelled" | "refunded";
export type VerifiedWebhook = { eventId: string; orderCode: string; amount: number; currency: string; status: "paid" };

/** Provider-neutral boundary. New providers can implement this contract
 * without changing the order tables or the coin ledger. */
export interface PaymentProvider {
  readonly id: "sepay";
  createCheckout(input: CheckoutInput): CheckoutForm;
  verifyWebhook(request: Request, rawBody: string): Promise<VerifiedWebhook | null>;
  getPaymentStatus(orderCode: string): Promise<PaymentStatus>;
  refund(orderCode: string, idempotencyKey: string): Promise<{ status: "pending" | "succeeded" | "failed" }>;
}

export class SepayProvider implements PaymentProvider {
  readonly id = "sepay" as const;
  constructor(private readonly runtimeEnv: AppEnv) {}

  createCheckout(input: CheckoutInput): CheckoutForm {
    const config = readSepayConfig(this.runtimeEnv);
    assertSepayConfig(config);
    return {
      action: sepayCheckoutEndpoint(config.environment),
      method: "POST",
      fields: createSepayCheckout(config, input),
    };
  }

  async verifyWebhook(request: Request, rawBody: string) {
    const config = readSepayConfig(this.runtimeEnv);
    const supplied = request.headers.get("x-secret-key") ?? "";
    if (!config.ipnSecret || !supplied || !(await constantTimeEqual(config.ipnSecret, supplied))) return null;
    const body = JSON.parse(rawBody) as { notification_type?: string; order?: { order_invoice_number?: string; order_amount?: string | number; order_currency?: string; order_status?: string }; transaction?: { id?: string; transaction_status?: string; transaction_currency?: string; payment_method?: string } };
    if (
      body.notification_type !== "ORDER_PAID"
      || body.order?.order_status !== "CAPTURED"
      || body.transaction?.transaction_status !== "APPROVED"
      || body.order.order_currency !== "VND"
      || body.transaction.transaction_currency !== "VND"
      || body.transaction.payment_method !== "BANK_TRANSFER"
    ) return null;
    const orderCode = body.order.order_invoice_number?.trim();
    const eventId = body.transaction.id?.trim();
    const amount = Number(body.order.order_amount);
    if (!orderCode || !eventId || !Number.isSafeInteger(amount)) return null;
    return { eventId, orderCode, amount, currency: "VND", status: "paid" as const };
  }

  async getPaymentStatus(orderCode: string) {
    const config = readSepayConfig(this.runtimeEnv);
    assertSepayConfig(config);
    const host = config.environment === "production" ? "https://pgapi.sepay.vn" : "https://pgapi-sandbox.sepay.vn";
    const auth = btoa(`${config.merchantId}:${config.secretKey}`);
    const response = await fetch(`${host}/v1/order/detail/${encodeURIComponent(orderCode)}`, { headers: { Authorization: `Basic ${auth}` } });
    if (!response.ok) throw new Error("PAYMENT_STATUS_UNAVAILABLE");
    const body = await response.json() as { order_status?: string };
    if (body.order_status === "CAPTURED") return "paid";
    if (["CANCELLED", "CANCELED"].includes(body.order_status ?? "")) return "cancelled";
    return "pending";
  }

  async refund(orderCode: string, idempotencyKey: string): Promise<{ status: "pending" | "succeeded" | "failed" }> {
    void orderCode;
    void idempotencyKey;
    throw new Error("PAYMENT_REFUND_NOT_AVAILABLE");
  }
}

export function getPaymentProvider(env: AppEnv): PaymentProvider {
  return new SepayProvider(env);
}
