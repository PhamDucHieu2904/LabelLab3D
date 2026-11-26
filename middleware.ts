import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { evaluateIncomingRequest, isStaticOrBypassPath } from "@/lib/server/bot-shield";
import type { AppEnv } from "@/lib/server/db";
import { recordWorkerRequest, type RequestActorType } from "@/lib/server/request-meter";

const CF_CONTEXT_SYMBOL = Symbol.for("__cloudflare-context__");

type CloudflareContextLike = {
  env?: AppEnv;
  ctx?: { waitUntil?: (promise: Promise<unknown>) => void };
};

async function shortActorHash(raw: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < 8; i += 1) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    ""
  );
}

export async function middleware(request: NextRequest, event: NextFetchEvent) {
  const pathname = request.nextUrl.pathname;

  // Static files never invoke metering or bot shield.
  if (isStaticOrBypassPath(pathname)) {
    return NextResponse.next();
  }

  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent") ?? "";
  const decision = evaluateIncomingRequest({
    pathname,
    method: request.method,
    userAgent,
    ip,
  });

  // Read Cloudflare context injected by @opennextjs/cloudflare without importing Node/Wrangler APIs.
  const cfCtx = (globalThis as Record<PropertyKey, unknown>)[CF_CONTEXT_SYMBOL] as CloudflareContextLike | undefined;
  const cfEnv = cfCtx?.env;
  const waitUntil =
    typeof event?.waitUntil === "function"
      ? (p: Promise<unknown>) => event.waitUntil(p)
      : typeof cfCtx?.ctx?.waitUntil === "function"
        ? (p: Promise<unknown>) => cfCtx.ctx!.waitUntil!(p)
        : undefined;

  if (cfEnv?.DB) {
    const sessionToken = request.cookies.get("ll_session")?.value?.trim() || "";
    const isBot = !decision.allowed || decision.isKnownBot;
    const actorType: RequestActorType = isBot ? "bot" : sessionToken ? "user" : "guest";
    const actorSeed = isBot
      ? `b:${ip || userAgent.slice(0, 64) || "bot"}`
      : sessionToken
        ? `u:${sessionToken}`
        : `g:${ip || userAgent.slice(0, 64) || "anon"}`;

    try {
      const hash = await shortActorHash(actorSeed);
      recordWorkerRequest(cfEnv, waitUntil, {
        category: decision.category,
        actorKey: `${actorType[0]}:${hash}`,
        actorType,
        blocked: !decision.allowed,
      });
    } catch {
      // Request metering must never interrupt user traffic.
    }
  }

  if (!decision.allowed) {
    const headers: Record<string, string> = {
      "Cache-Control": "no-store",
      "X-Bot-Shield": decision.reason,
    };
    if (decision.retryAfterSec) {
      headers["Retry-After"] = String(decision.retryAfterSec);
    }
    return new NextResponse(
      decision.status === 429 ? "Too Many Requests" : "Forbidden",
      { status: decision.status, headers },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|models/|branding/|home/|environments/|decoders/|assets/|catalog/|favicon\\.ico|icon\\.svg|robots\\.txt|sitemap\\.xml).*)",
  ],
};
