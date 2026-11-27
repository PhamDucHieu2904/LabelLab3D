import { headers } from "next/headers";
import { assertSameOrigin, env, errorResponse, json, sessionUser } from "@/lib/server/http";
import { claimLaunchPromo, getLaunchPromoStatus } from "@/lib/server/launch-promo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await sessionUser();
    const status = await getLaunchPromoStatus(await env(), user?.id ?? null);
    return json(status);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST() {
  try {
    await assertSameOrigin();
    const user = await sessionUser();
    if (!user) {
      return json({ error: "LOGIN_REQUIRED" }, { status: 401 });
    }
    const reqHeaders = await headers();
    const ip =
      reqHeaders.get("cf-connecting-ip") ??
      reqHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      null;
    const result = await claimLaunchPromo(await env(), user.id, { ip });
    return json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}
