import { headers } from "next/headers";
import { CURRENT_POLICY_VERSION } from "@/lib/legal/policies";
import { assertSameOrigin, env, errorResponse, json, sessionUser } from "@/lib/server/http";
import { recordLegalConsent } from "@/lib/server/legal";
import { consumeRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const runtimeEnv = await env();
    const body = (await request.json().catch(() => ({}))) as {
      consentType?: unknown;
      analyticsAccepted?: unknown;
    };
    const consentType = body.consentType === "cookies" ? "cookies" : "cookies";
    const user = await sessionUser().catch(() => null);
    const reqHeaders = await headers();
    const ip =
      reqHeaders.get("cf-connecting-ip")
      ?? reqHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? null;

    const withinLimit = await consumeRateLimit(runtimeEnv, {
      namespace: "legal-consent",
      key: ip ?? user?.id ?? "anon",
      limit: 20,
      windowMinutes: 15,
    });
    if (!withinLimit) throw new Error("AUTH_RATE_LIMIT");

    await recordLegalConsent(runtimeEnv, {
      userId: user?.id ?? null,
      consentType,
      ip,
      policyVersion: CURRENT_POLICY_VERSION,
      metadata: { analyticsAccepted: Boolean(body.analyticsAccepted) },
    });

    return json({ ok: true, policyVersion: CURRENT_POLICY_VERSION });
  } catch (error) {
    return errorResponse(error);
  }
}
