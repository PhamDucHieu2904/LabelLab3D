import {
  isSupportedRenderResolution,
  resolveRenderCoinCost,
} from "@/lib/payments/packages";
import { getLiveSiteSettings } from "@/lib/server/site-config";
import { reserveCoins } from "@/lib/server/wallet";
import { env, sessionUser, json, errorResponse, assertSameOrigin } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIELINE_FORMATS = new Set(["svg", "pdf", "dxf"]);

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const user = await sessionUser();
    if (!user) throw new Error("FORBIDDEN");
    const runtimeEnv = await env();
    const body = await request.json().catch(() => ({})) as {
      action?: unknown;
      idempotencyKey?: unknown;
      modelId?: unknown;
      resolution?: unknown;
      format?: unknown;
      ttlSeconds?: unknown;
    };
    const action = body.action === "dieline" ? "dieline" : body.action === "share" ? "share" : "render";
    const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
    const modelId = typeof body.modelId === "string" ? body.modelId.trim() : "";
    if (!/^reserve_[A-Za-z0-9_-]{16,120}$/.test(idempotencyKey) || !/^[A-Za-z0-9._-]{1,120}$/.test(modelId)) {
      throw new Error("INVALID_INPUT");
    }

    const settings = await getLiveSiteSettings(runtimeEnv);
    const ttlSeconds = typeof body.ttlSeconds === "number" ? body.ttlSeconds : undefined;

    if (action === "share") {
      const amount = Math.max(0, Math.floor(settings.shareCost));
      if (amount === 0) {
        return json({ free: true, reservation: null, quote: { amount: 0, action: "share", modelId } });
      }
      const reservation = await reserveCoins(runtimeEnv, {
        userId: user.id,
        amount,
        idempotencyKey,
        reference: `share:${modelId}`,
        ttlSeconds,
      });
      return json({ free: false, reservation, quote: { amount, action: "share", modelId } });
    }

    if (action === "dieline") {
      const format = typeof body.format === "string" ? body.format.trim().toLowerCase() : "";
      if (!DIELINE_FORMATS.has(format)) throw new Error("INVALID_INPUT");
      const amount = Math.max(0, Math.floor(settings.dielineCost));
      if (amount === 0) {
        return json({ free: true, reservation: null, quote: { amount: 0, action: "dieline", modelId, format } });
      }
      const reservation = await reserveCoins(runtimeEnv, {
        userId: user.id,
        amount,
        idempotencyKey,
        reference: `dieline:${modelId}:${format}`,
        ttlSeconds,
      });
      return json({ free: false, reservation, quote: { amount, action: "dieline", modelId, format } });
    }

    const resolution = Number(body.resolution);
    if (!isSupportedRenderResolution(resolution)) throw new Error("INVALID_INPUT");
    const amount = resolveRenderCoinCost(resolution, settings.renderCost);
    if (amount === 0) {
      return json({ free: true, reservation: null, quote: { amount: 0, action: "render", modelId, resolution } });
    }
    const reservation = await reserveCoins(runtimeEnv, {
      userId: user.id,
      amount,
      idempotencyKey,
      reference: `render:${modelId}:${resolution}`,
      ttlSeconds,
    });
    return json({ free: false, reservation, quote: { amount, action: "render", modelId, resolution } });
  } catch (error) {
    return errorResponse(error);
  }
}
