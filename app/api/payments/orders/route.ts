import { nowIso, randomId, requireDb } from "@/lib/server/db";
import { env, sessionUser, json, errorResponse, assertSameOrigin } from "@/lib/server/http";
import { getPaymentProvider } from "@/lib/server/payment-provider";
import { createPolarCheckoutSession, readPolarConfig } from "@/lib/server/polar";
import { buildSepayQrImageUrl, generateOrderCode, readSepayConfig, readSepayQrConfig } from "@/lib/server/sepay";
import { getLiveCoinPackages } from "@/lib/server/site-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const user = await sessionUser();
    if (!user) throw new Error("FORBIDDEN");
    const runtimeEnv = await env();
    const body = await request.json().catch(() => ({})) as { coins?: unknown; region?: unknown };
    const coins = Number(body.coins);
    const region = body.region === "international" ? "international" : "vietnam";
    const livePackages = await getLiveCoinPackages(runtimeEnv);
    const selected = Number.isSafeInteger(coins)
      ? livePackages.find((pkg) => pkg.enabled && pkg.coins === coins) ?? null
      : null;
    if (!selected) throw new Error("INVALID_INPUT");

    const id = randomId("pay");
    const code = generateOrderCode();
    const now = nowIso();

    if (region === "international") {
      const polarConfig = readPolarConfig(runtimeEnv);
      if (!polarConfig) throw new Error("PAYMENT_NOT_CONFIGURED");
      const amountCents = Math.round(selected.usd * 100);
      if (!Number.isSafeInteger(amountCents) || amountCents < 50) throw new Error("INVALID_INPUT");

      const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
      const session = await createPolarCheckoutSession(polarConfig, {
        orderId: id,
        orderCode: code,
        coins: selected.coins,
        amountCents,
        customerId: user.id,
        customerEmail: user.email,
        successUrl: `${polarConfig.publicUrl}/payment/polar/success?order=${encodeURIComponent(code)}&id=${encodeURIComponent(id)}&checkout_id={CHECKOUT_ID}`,
        returnUrl: `${polarConfig.publicUrl}/`,
      });

      await requireDb(runtimeEnv).prepare(`INSERT INTO payment_orders
        (id,user_id,provider,order_code,package_coins,amount_minor,currency,status,provider_order_id,expires_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        id, user.id, "polar", code, selected.coins, amountCents, "USD", "pending", session.checkoutId, expiresAt, now, now,
      ).run();

      return json({
        mode: "polar_checkout",
        order: { id, orderCode: code, coins: selected.coins, amount: amountCents, currency: "USD", status: "pending", expiresAt },
        polar: {
          checkoutId: session.checkoutId,
          url: session.url,
          sandbox: polarConfig.environment === "sandbox",
        },
        qr: null,
        checkout: null,
      }, { status: 201 });
    }

    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const qrConfig = readSepayQrConfig(runtimeEnv);

    if (qrConfig) {
      await requireDb(runtimeEnv).prepare(`INSERT INTO payment_orders
        (id,user_id,provider,order_code,package_coins,amount_minor,currency,status,provider_order_id,expires_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        id, user.id, "sepay", code, selected.coins, selected.vnd, "VND", "pending", null, expiresAt, now, now,
      ).run();

      return json({
        mode: "direct_qr",
        order: { id, orderCode: code, coins: selected.coins, amount: selected.vnd, currency: "VND", status: "pending", expiresAt },
        qr: {
          imageUrl: buildSepayQrImageUrl(qrConfig, { amount: selected.vnd, description: code, template: "qronly" }),
          downloadUrl: buildSepayQrImageUrl(qrConfig, { amount: selected.vnd, description: code, template: "compact", download: true }),
          bankCode: qrConfig.bankCode,
          bankName: qrConfig.bankCode,
          accountNumber: qrConfig.accountNumber,
          accountOwner: qrConfig.accountOwner,
          transferContent: code,
        },
        polar: null,
        checkout: null,
      }, { status: 201 });
    }

    const provider = getPaymentProvider(runtimeEnv);
    const publicUrl = readSepayConfig(runtimeEnv).publicUrl;
    const base = `${publicUrl}/payment/sepay`;
    const checkout = provider.createCheckout({
      amount: selected.vnd,
      orderCode: code,
      description: `Labellab3D nap ${selected.coins} coins`,
      customerId: user.id,
      successUrl: `${base}/success?order=${encodeURIComponent(code)}&id=${encodeURIComponent(id)}`,
      errorUrl: `${base}/error?order=${encodeURIComponent(code)}&id=${encodeURIComponent(id)}`,
      cancelUrl: `${base}/cancel?order=${encodeURIComponent(code)}&id=${encodeURIComponent(id)}`,
    });

    await requireDb(runtimeEnv).prepare(`INSERT INTO payment_orders
      (id,user_id,provider,order_code,package_coins,amount_minor,currency,status,provider_order_id,expires_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      id, user.id, "sepay", code, selected.coins, selected.vnd, "VND", "pending", null, expiresAt, now, now,
    ).run();

    return json({
      mode: "gateway",
      order: { id, orderCode: code, coins: selected.coins, amount: selected.vnd, currency: "VND", status: "pending", expiresAt },
      qr: null,
      polar: null,
      checkout,
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
