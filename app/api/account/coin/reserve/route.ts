import { reserveCoins } from "@/lib/server/wallet";
import { env, sessionUser, json, errorResponse, assertSameOrigin } from "@/lib/server/http";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const user = await sessionUser();
    if (!user) throw new Error("FORBIDDEN");
    const body = await request.json().catch(() => ({})) as { idempotencyKey?: unknown; modelId?: unknown; resolution?: unknown; ttlSeconds?: unknown };
    const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
    const modelId = typeof body.modelId === "string" ? body.modelId.trim() : "";
    const resolution = Number(body.resolution);
    const costs: Record<number, number> = { 1024: 1, 2048: 2, 4096: 4, 8129: 8 };
    if (!/^reserve_[A-Za-z0-9_-]{16,120}$/.test(idempotencyKey) || !/^[A-Za-z0-9._-]{1,120}$/.test(modelId) || !Object.hasOwn(costs, resolution)) throw new Error("INVALID_INPUT");
    const reservation = await reserveCoins(await env(), { userId: user.id, amount: costs[resolution], idempotencyKey, reference: `render:${modelId}:${resolution}`, ttlSeconds: typeof body.ttlSeconds === "number" ? body.ttlSeconds : undefined });
    return json({ reservation, quote: { amount: costs[resolution], modelId, resolution } });
  } catch (error) { return errorResponse(error); }
}
