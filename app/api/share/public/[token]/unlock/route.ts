import { cookies, headers } from "next/headers";
import { assertSameOrigin, env, errorResponse, json } from "@/lib/server/http";
import { consumeRateLimit } from "@/lib/server/rate-limit";
import {
  getPublicSharedProject,
  isShareExpired,
  readShareByToken,
  shareUnlockCookieName,
  signShareUnlockCookie,
  verifySharePasscode,
} from "@/lib/server/shares";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ token: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    await assertSameOrigin();
    const { token } = await context.params;
    const runtimeEnv = await env();
    const h = await headers();
    const ip =
      h.get("cf-connecting-ip")?.trim() ||
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";

    const withinBudget = await consumeRateLimit(runtimeEnv, {
      namespace: "share_unlock",
      key: `${token}:${ip}`,
      limit: 5,
      windowMinutes: 15,
    });
    if (!withinBudget) throw new Error("AUTH_RATE_LIMIT");

    const body = (await request.json().catch(() => ({}))) as { passcode?: unknown };
    const passcode = typeof body.passcode === "string" ? body.passcode : "";

    const row = await readShareByToken(runtimeEnv, token);
    if (!row || row.status !== "active" || isShareExpired(row)) {
      throw new Error("NOT_FOUND");
    }
    if (!row.passcodeHash) {
      const payload = await getPublicSharedProject(runtimeEnv, token, null, { recordView: true });
      return json(payload, { headers: { "X-Robots-Tag": "noindex, nofollow" } });
    }

    const ok = await verifySharePasscode(passcode, row.passcodeHash);
    if (!ok) {
      throw new Error("INVALID_CREDENTIALS");
    }

    const cookieVal = await signShareUnlockCookie(runtimeEnv, row.token, row.passcodeHash);
    (await cookies()).set(shareUnlockCookieName(row.token), cookieVal, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 86400,
    });

    const payload = await getPublicSharedProject(runtimeEnv, row.token, cookieVal, { recordView: true });
    return json(payload, { headers: { "X-Robots-Tag": "noindex, nofollow" } });
  } catch (error) {
    return errorResponse(error);
  }
}
