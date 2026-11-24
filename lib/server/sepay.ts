import { createHmac } from "node:crypto";
import type { AppEnv } from "./db";

export type SepayConfig = {
  environment: "sandbox" | "production";
  merchantId: string;
  secretKey: string;
  ipnSecret: string;
  publicUrl: string;
};

export type SepayQrConfig = {
  bankCode: string;
  accountNumber: string;
  accountOwner: string;
  webhookApiKey: string;
};

const ORDER_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

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

/**
 * Direct VietQR + SePay Bank Webhook configuration. Fails closed unless the
 * bank code, account number, and webhook API key are all configured so the UI
 * never displays a QR code whose transfers cannot be automatically verified.
 */
export function readSepayQrConfig(env: AppEnv): SepayQrConfig | null {
  const bankCode = stringValue(env, "SEPAY_BANK_CODE");
  const accountNumber = stringValue(env, "SEPAY_BANK_ACCOUNT");
  const accountOwner = stringValue(env, "SEPAY_BANK_OWNER");
  const webhookApiKey = stringValue(env, "SEPAY_WEBHOOK_API_KEY");
  if (!bankCode || !accountNumber || !webhookApiKey) return null;
  return { bankCode, accountNumber, accountOwner, webhookApiKey };
}

export function normalizeAccountNumber(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export function parseSepayApikeyHeader(header: string | null): string {
  if (!header) return "";
  const match = header.trim().match(/^Apikey\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

export function generateOrderCode(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let suffix = "";
  for (const byte of bytes) {
    suffix += ORDER_CODE_ALPHABET[byte % ORDER_CODE_ALPHABET.length];
  }
  return `LL${suffix}`;
}

export function buildSepayQrImageUrl(
  config: Pick<SepayQrConfig, "bankCode" | "accountNumber">,
  input: { amount: number; description: string; template?: "qronly" | "compact"; download?: boolean },
): string {
  const url = new URL("https://qr.sepay.vn/img");
  url.searchParams.set("acc", config.accountNumber);
  url.searchParams.set("bank", config.bankCode);
  url.searchParams.set("amount", String(input.amount));
  url.searchParams.set("des", input.description);
  url.searchParams.set("template", input.template ?? "qronly");
  if (input.download) url.searchParams.set("download", "true");
  return url.toString();
}

export function extractOrderCodesFromTransfer(input: {
  code?: string | null;
  content?: string | null;
  description?: string | null;
}): string[] {
  const seen = new Set<string>();
  const add = (candidate: string) => {
    const clean = candidate.trim().toUpperCase();
    if (/^LL[A-Z0-9]{8,43}$/.test(clean)) seen.add(clean);
  };
  if (typeof input.code === "string" && input.code.trim()) {
    add(input.code);
  }
  for (const field of [input.content, input.description]) {
    if (typeof field !== "string" || !field) continue;
    for (const match of field.matchAll(/\b(LL[A-Z0-9]{8,43})\b/gi)) {
      if (match[1]) add(match[1]);
    }
    for (const match of field.matchAll(/LL[A-Z0-9]{10,43}/gi)) {
      if (match[0]) add(match[0]);
    }
  }
  return [...seen];
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
