import { findCoinPackage } from "@/lib/payments/packages";
import { nowIso, randomId, requireDb } from "@/lib/server/db";
import { env, sessionUser, json, errorResponse, assertSameOrigin } from "@/lib/server/http";
import { getPaymentProvider } from "@/lib/server/payment-provider";
import { readSepayConfig } from "@/lib/server/sepay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function orderCode() {
  return `LL${Date.now().toString(36).toUpperCase()}${randomId("o").replace(/[^a-z0-9]/gi, "").toUpperCase()}`.slice(0, 45);
}

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const user = await sessionUser();
    if (!user) throw new Error("FORBIDDEN");
    const runtimeEnv = await env();
    const provider = getPaymentProvider(runtimeEnv);
    const body = await request.json().catch(() => ({})) as { coins?: unknown };
    const coins = Number(body.coins);
    const selected = Number.isSafeInteger(coins) ? findCoinPackage(coins) : null;
    if (!selected) throw new Error("INVALID_INPUT");

    const id = randomId("pay");
    const code = orderCode();
    const now = nowIso();
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
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
      order: { id, orderCode: code, coins: selected.coins, amount: selected.vnd, currency: "VND", status: "pending", expiresAt },
      checkout,
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
