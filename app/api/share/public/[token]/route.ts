import { cookies } from "next/headers";
import { env, errorResponse, json } from "@/lib/server/http";
import { getPublicSharedProject, shareUnlockCookieName } from "@/lib/server/shares";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { token } = await context.params;
    const cookieJar = await cookies();
    const unlockCookie = cookieJar.get(shareUnlockCookieName(token))?.value ?? null;
    const payload = await getPublicSharedProject(await env(), token, unlockCookie, { recordView: true });
    const status =
      payload.state === "not_found"
        ? 404
        : payload.state === "revoked" || payload.state === "expired" || payload.state === "paused"
          ? 410
          : 200;
    return json(payload, {
      status,
      headers: {
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
