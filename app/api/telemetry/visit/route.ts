import { headers } from "next/headers";
import { recordToolUsageSummary } from "@/lib/server/anticheat";
import { nowIso, randomId, sha256 } from "@/lib/server/db";
import { assertSameOrigin, env, json, sessionUser } from "@/lib/server/http";
import { consumeRateLimit } from "@/lib/server/rate-limit";
import { ensureSiteTables, getLiveSiteSettings } from "@/lib/server/site-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TelemetryBody = {
  kind?: unknown;
  path?: unknown;
  rendersStarted?: unknown;
  rendersCompleted?: unknown;
  dielinesStarted?: unknown;
  dielinesCompleted?: unknown;
  expectedCoins?: unknown;
  domSvgCopies?: unknown;
};

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const runtimeEnv = await env();

    // Parse via text() so navigator.sendBeacon works with both text/plain and application/json.
    const rawText = await request.text().catch(() => "");
    let body: TelemetryBody = {};
    if (rawText && rawText.length <= 4096) {
      try {
        body = JSON.parse(rawText) as TelemetryBody;
      } catch {
        body = {};
      }
    }

    const user = await sessionUser().catch(() => null);
    const reqHeaders = await headers();
    const ua = (reqHeaders.get("user-agent") ?? "").toLowerCase();
    const ip = reqHeaders.get("cf-connecting-ip") ?? reqHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";

    const withinLimit = await consumeRateLimit(runtimeEnv, {
      namespace: "telemetry",
      key: ip || user?.id || "anon",
      limit: 30,
      windowMinutes: 15,
    });
    if (!withinLimit) return json({ ok: true, skipped: true });

    // Operational anti-cheat summary (1 batched sendBeacon on studio exit;
    // essential for billing integrity even if marketing analytics are disabled).
    if (body.kind === "tool_summary") {
      const visitorHash = await sha256(`u:${user?.id ?? ip ?? "anon"}`).catch(() => "anon");
      await recordToolUsageSummary(runtimeEnv, {
        userId: user?.id ?? null,
        visitorHash,
        rendersStarted: body.rendersStarted,
        rendersCompleted: body.rendersCompleted,
        dielinesStarted: body.dielinesStarted,
        dielinesCompleted: body.dielinesCompleted,
        expectedCoins: body.expectedCoins,
        domSvgCopies: body.domSvgCopies,
      });
      return json({ ok: true });
    }

    const settings = await getLiveSiteSettings(runtimeEnv);
    if (!settings.analytics) return json({ ok: true, skipped: true });
    if (settings.excludeOwner && user?.role === "admin") {
      return json({ ok: true, skipped: true });
    }

    const excludedIps = settings.excludedIPs.split(",").map((s) => s.trim()).filter(Boolean);
    if (ip && excludedIps.includes(ip)) return json({ ok: true, skipped: true });

    const kind = body.kind === "studio_session" || body.kind === "render" ? body.kind : "pageview";
    const rawPath = typeof body.path === "string" ? body.path.trim().slice(0, 120) : "/";
    const path = rawPath.startsWith("/") ? rawPath : "/";

    const botTokens = settings.botPatterns.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    const isBot = !user && botTokens.some((token) => ua.includes(token));
    const visitorType = isBot ? "bot" : user ? "user" : "guest";

    const db = await ensureSiteTables(runtimeEnv);
    await db.prepare(
      "INSERT INTO site_events (id,kind,visitor_type,user_id,path,created_at) VALUES (?,?,?,?,?,?)",
    ).bind(randomId("evt"), kind, visitorType, user?.id ?? null, path, nowIso()).run();

    return json({ ok: true });
  } catch {
    // Telemetry must never disrupt the user experience.
    return json({ ok: false }, { status: 200 });
  }
}
