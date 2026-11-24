import { createHmac } from "node:crypto";
import type { AppEnv } from "./db";

export type SepayConfig = {
  environment: "sandbox" | "production";
  merchantId: string;
  secretKey: string;
  ipnSecret: string;
  publicUrl: string;
};

function stringValue(env: AppEnv, key: string) {
  const fromBinding = env[key];
  if (typeof fromBinding === "string" && fromBinding.trim()) return fromBinding.trim();
  const fromProcess = process.env[key];
  return typeof fromProcess === "string" ? fromProcess.trim() : "";
}

export function readSepayConfig(env: AppEnv): SepayConfig {
  const environment = stringValue(env, "SEPAY_ENV") === "production" ? "production" : "sandbox";
  return {
    environment,
    merchantId: stringValue(env, "SEPAY_MERCHANT_ID"),
    secretKey: stringValue(env, "SEPAY_SECRET_KEY"),
    ipnSecret: stringValue(env, "SEPAY_IPN_SECRET"),
    publicUrl: stringValue(env, "SEPAY_PUBLIC_URL").replace(/\/$/, ""),
  };
}

export function assertSepayConfig(config: SepayConfig) {
  if (!config.merchantId || !config.secretKey || !config.ipnSecret || !config.publicUrl) throw new Error("PAYMENT_NOT_CONFIGURED");
  if (config.environment === "sandbox" && (/^SP-LIVE-/i.test(config.merchantId) || /^spsk_live_/i.test(config.secretKey))) {
    throw new Error("PAYMENT_ENV_MISMATCH");
  }
  if (config.environment === "production" && (/^SP-TEST-/i.test(config.merchantId) || /^spsk_test_/i.test(config.secretKey))) {
    throw new Error("PAYMENT_ENV_MISMATCH");
  }
  let parsed: URL;
  try { parsed = new URL(config.publicUrl); } catch { throw new Error("PAYMENT_NOT_CONFIGURED"); }
  if (parsed.protocol !== "https:" || /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(parsed.hostname)) throw new Error("PAYMENT_PUBLIC_URL_REQUIRED");
}

export function sepayCheckoutEndpoint(environment: SepayConfig["environment"]) {
  return environment === "production" ? "https://pay.sepay.vn/v1/checkout/init" : "https://pay-sandbox.sepay.vn/v1/checkout/init";
}

const SIGNED_FIELDS = [
  "order_amount", "merchant", "currency", "operation", "order_description",
  "order_invoice_number", "customer_id", "payment_method", "success_url",
  "error_url", "cancel_url",
] as const;

export type SepayCheckoutFields = Record<string, string> & { signature: string };

export function createSepayCheckout(config: SepayConfig, input: {
  amount: number;
  orderCode: string;
  description: string;
  customerId: string;
  successUrl: string;
  errorUrl: string;
  cancelUrl: string;
}): SepayCheckoutFields {
  const fields: Record<string, string> = {
    order_amount: String(input.amount),
    merchant: config.merchantId,
    currency: "VND",
    operation: "PURCHASE",
    order_description: input.description,
    order_invoice_number: input.orderCode,
    customer_id: input.customerId,
    // The first domestic implementation deliberately enables only QR bank
    // transfer; NAPAS and cards can be added as separate providers later.
    payment_method: "BANK_TRANSFER",
    success_url: input.successUrl,
    error_url: input.errorUrl,
    cancel_url: input.cancelUrl,
    lang: "vi",
  };
  const signing = SIGNED_FIELDS
    .filter((key) => fields[key] !== undefined && fields[key] !== "" && fields[key] !== "0")
    .map((key) => `${key}=${fields[key]}`)
    .join(",");
  const signature = createHmac("sha256", config.secretKey).update(signing).digest("base64");
  return { ...fields, signature };
}

