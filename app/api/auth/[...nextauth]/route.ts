import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
import { getGoogleAuthConfig } from "@/lib/auth/google-config";
import { createAuthOptions } from "@/lib/auth/options";
import { env, sessionCookie } from "@/lib/server/http";
import { upsertGoogleUser } from "@/lib/server/google-account";

type RouteContext = { params: Promise<{ nextauth: string[] }> };

function mergedAuthEnv(runtimeEnv: Record<string, unknown>, requestOrigin: string): Record<string, string | undefined> {
  const pick = (key: string) => {
    const binding = runtimeEnv[key];
    if (typeof binding === "string" && binding.trim()) return binding.trim();
    const proc = process.env[key];
    return typeof proc === "string" && proc.trim() ? proc.trim() : undefined;
  };
  return {
    GOOGLE_CLIENT_ID: pick("GOOGLE_CLIENT_ID"),
    GOOGLE_CLIENT_SECRET: pick("GOOGLE_CLIENT_SECRET"),
    NEXTAUTH_SECRET: pick("NEXTAUTH_SECRET"),
    NEXTAUTH_URL: pick("NEXTAUTH_URL") ?? requestOrigin,
  };
}

async function authRoute(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  const runtimeEnv = await env();
  const authEnv = mergedAuthEnv(runtimeEnv, request.nextUrl.origin);
  const config = getGoogleAuthConfig(authEnv);

  if (!config) {
    // Keep the public editor usable before OAuth is configured. No fabricated
    // session, fallback secret, or broken provider redirect in that state.
    const publicRead = request.method === "GET" && params.nextauth.length === 1
      && ["session", "providers"].includes(params.nextauth[0]);
    return Response.json(publicRead ? {} : { error: "Authentication is not configured." }, {
      status: publicRead ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  // NextAuth v4 inspects process.env.NEXTAUTH_URL / NEXTAUTH_SECRET internally
  // when validating callback URLs and signing cookies on Cloudflare Workers.
  if (authEnv.NEXTAUTH_URL) process.env.NEXTAUTH_URL = authEnv.NEXTAUTH_URL;
  process.env.NEXTAUTH_SECRET = config.secret;

  const handler = NextAuth(createAuthOptions(authEnv, async (profile) => {
    const dbUser = await upsertGoogleUser(runtimeEnv, {
      sub: profile.sub,
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.picture,
    });
    await sessionCookie(dbUser);
  }));

  return handler(request, { params });
}

export { authRoute as GET, authRoute as POST };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
