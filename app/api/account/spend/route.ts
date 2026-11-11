import { appendLedgerEntry } from "@/lib/server/wallet";
import { env, sessionUser, json, errorResponse, assertSameOrigin } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Local rendering is charged before the browser starts the capture. The
// server owns the amount and kind; clients can only supply a unique request
// key and a bounded model reference, so they cannot mint or choose prices.
export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const user = await sessionUser();
    if (!user) throw new Error("FORBIDDEN");
    const body = await request.json().catch(() => ({})) as { idempotencyKey?: string; modelId?: string; resolution?: number };
    const key = body.idempotencyKey?.trim() ?? "";
    const modelId = body.modelId?.trim() ?? "unknown";
    const resolution = Number(body.resolution);
    if (!/^render_[A-Za-z0-9_-]{16,120}$/.test(key) || !/^[A-Za-z0-9._-]{1,120}$/.test(modelId) || ![1024, 2048, 4096, 8129].includes(resolution)) throw new Error("INVALID_INPUT");
    const entry = await appendLedgerEntry(await env(), {
      userId: user.id,
      amount: -1,
      kind: "render",
      reference: `render:${modelId}:${resolution}`,
      idempotencyKey: key,
      metadata: { modelId, resolution },
    });
    return json({ charged: true, amount: entry.amount, balance: entry.balance, transactionId: entry.id });
  } catch (error) {
    return errorResponse(error);
  }
}
