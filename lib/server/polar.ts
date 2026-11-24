import { constantTimeEqual, type AppEnv } from "./db";

export type PolarConfig = {
  environment: "sandbox" | "production";
  accessToken: string;
  webhookSecret: string;
  productId: string;
  publicUrl: string;
};

const WEBHOOK_TOLERANCE_SECONDS = 300;
const encoder = new TextEncoder();

function envString(env: AppEnv, key: string): string {
  const binding = env[key];
  if (typeof binding === "string" && binding.trim()) return binding.trim();
  const proc = process.env[key];
  return typeof proc === "string" ? proc.trim() : "";
}

export function polarApiBase(environment: PolarConfig["environment"]): string {
  return environment === "production" ? "https://api.polar.sh" : "https://sandbox-api.polar.sh";
}

/**
 * Read Polar.sh MoR configuration. Fails closed unless access token, webhook
 * secret, product id, and an HTTPS public URL are all configured.
 */
export function readPolarConfig(env: AppEnv): PolarConfig | null {
  const environment = envString(env, "POLAR_ENV") === "production" ? "production" : "sandbox";
  const accessToken = envString(env, "POLAR_ACCESS_TOKEN");
  const webhookSecret = envString(env, "POLAR_WEBHOOK_SECRET");
  const productId = envString(env, "POLAR_PRODUCT_ID");
  const publicUrl = (
    envString(env, "POLAR_PUBLIC_URL")
    || envString(env, "SEPAY_PUBLIC_URL")
    || envString(env, "NEXTAUTH_URL")
  ).replace(/\/$/, "");

  if (!accessToken || !webhookSecret || !productId || !publicUrl) return null;
  try {
    const parsed = new URL(publicUrl);
    if (parsed.protocol !== "https:") return null;
  } catch {
    return null;
  }
  return { environment, accessToken, webhookSecret, productId, publicUrl };
}

export async function createPolarCheckoutSession(
  config: PolarConfig,
  input: {
    orderId: string;
    orderCode: string;
    coins: number;
    amountCents: number;
    customerId: string;
    customerEmail: string;
    embedOrigin?: string;
    successUrl: string;
    returnUrl: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<{ checkoutId: string; url: string }> {
  const response = await fetchImpl(`${polarApiBase(config.environment)}/v1/checkouts/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      products: [config.productId],
      prices: {
        [config.productId]: [
          {
            amount_type: "fixed",
            price_amount: input.amountCents,
            price_currency: "usd",
          },
        ],
      },
      customer_email: input.customerEmail,
      external_customer_id: input.customerId,
      ...(input.embedOrigin ? { embed_origin: input.embedOrigin } : {}),
      metadata: {
        order_id: input.orderId,
        order_code: input.orderCode,
        user_id: input.customerId,
        coins: input.coins,
      },
      success_url: input.successUrl,
      return_url: input.returnUrl,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[polar-checkout] HTTP", response.status, detail.slice(0, 300));
    throw new Error("POLAR_CHECKOUT_FAILED");
  }

  const payload = await response.json().catch(() => null) as { id?: unknown; url?: unknown } | null;
  if (!payload || typeof payload.id !== "string" || !payload.id || typeof payload.url !== "string" || !payload.url) {
    throw new Error("POLAR_CHECKOUT_FAILED");
  }

  const parsedUrl = new URL(payload.url);
  if (parsedUrl.protocol !== "https:" || !parsedUrl.hostname.endsWith("polar.sh")) {
    throw new Error("POLAR_CHECKOUT_FAILED");
  }
  return { checkoutId: payload.id, url: parsedUrl.toString() };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(encoded: string): Uint8Array | null {
  try {
    const normalized = encoded.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized + "===".slice((normalized.length + 3) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function computeHmacBase64(keyBytes: Uint8Array, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes as unknown as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return bytesToBase64(new Uint8Array(sig));
}

function deriveStandardWebhookKeyCandidates(secret: string): Uint8Array[] {
  const trimmed = secret.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("whsec_")) {
    const decoded = base64ToBytes(trimmed.slice(6));
    return decoded && decoded.length > 0 ? [decoded] : [encoder.encode(trimmed)];
  }
  // Polar signs `polar_whs_...` secrets using the raw UTF-8 bytes of the full
  // secret (matching `@polar-sh/sdk`'s base64-wrap before `standardwebhooks`).
  return [encoder.encode(trimmed)];
}

/**
 * Pure Web Crypto Standard Webhooks verifier for Polar.sh (`webhook-id`,
 * `webhook-timestamp`, `webhook-signature` with `v1,<base64>` signatures).
 */
export async function verifyPolarWebhookSignature(
  rawBody: string,
  headers: { webhookId: string; webhookTimestamp: string; webhookSignature: string },
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const id = headers.webhookId.trim();
  const timestampRaw = headers.webhookTimestamp.trim();
  const signatureHeader = headers.webhookSignature.trim();
  if (!id || !timestampRaw || !signatureHeader || !secret.trim()) return false;

  const timestamp = Number(timestampRaw);
  if (!Number.isSafeInteger(timestamp) || Math.abs(nowSec - timestamp) > WEBHOOK_TOLERANCE_SECONDS) {
    return false;
  }

  const suppliedDigests = signatureHeader
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith("v1,"))
    .map((entry) => entry.slice(3))
    .filter(Boolean);
  if (suppliedDigests.length === 0) return false;

  const signedContent = `${id}.${timestampRaw}.${rawBody}`;
  const candidates = deriveStandardWebhookKeyCandidates(secret);
  for (const keyBytes of candidates) {
    const expected = await computeHmacBase64(keyBytes, signedContent);
    for (const supplied of suppliedDigests) {
      if (await constantTimeEqual(expected, supplied)) return true;
    }
  }
  return false;
}

/**
 * Extract the pre-tax USD cents amount from a Polar `order.paid` payload so
 * customer sales tax / VAT added by Polar MoR never causes a false mismatch.
 */
export function extractPolarPaidOrderAmountCents(data: Record<string, unknown>): number | null {
  const candidates = [
    data.subtotal_amount,
    data.net_amount,
    typeof data.total_amount === "number" && typeof data.tax_amount === "number"
      ? data.total_amount - data.tax_amount
      : undefined,
    data.amount,
  ];
  for (const value of candidates) {
    const n = Number(value);
    if (Number.isSafeInteger(n) && n > 0) return n;
  }
  return null;
}
