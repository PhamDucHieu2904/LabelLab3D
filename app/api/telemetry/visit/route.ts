import { headers } from "next/headers";
import { nowIso, randomId } from "@/lib/server/db";
import { assertSameOrigin, env, json, sessionUser } from "@/lib/server/http";
import { ensureSiteTables, getLiveSiteSettings } from "@/lib/server/site-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const runtimeEnv = await env();
    const settings = await getLiveSiteSettings(runtimeEnv);
    if (!settings.analytics) return json({ ok: true, skipped: true });

    const body = await request.json().catch(() => ({})) as { kind?: unknown; path?: unknown };
    const kind = body.kind === "studio_session" || body.kind === "render" ? body.kind : "pageview";
    const rawPath = typeof body.path === "string" ? body.path.trim().slice(0, 120) : "/";
    const path = rawPath.startsWith("/") ? rawPath : "/";

    const user = await sessionUser().catch(() => null);
    if (settings.excludeOwner && user?.role === "admin") {
      return json({ ok: true, skipped: true });
    }

    const reqHeaders = await headers();
    const ua = (reqHeaders.get("user-agent") ?? "").toLowerCase();
    const ip = reqHeaders.get("cf-connecting-ip") ?? reqHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    const excludedIps = settings.excludedIPs.split(",").map((s) => s.trim()).filter(Boolean);
    if (ip && excludedIps.includes(ip)) return json({ ok: true, skipped: true });

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
