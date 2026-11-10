import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
import { authOptions, googleAuthConfig } from "@/lib/auth/options";

const handler = NextAuth(authOptions);
type RouteContext = { params: Promise<{ nextauth: string[] }> };

async function authRoute(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  if (!googleAuthConfig) {
    // Keep the public editor usable before OAuth is configured. No fabricated
    // session, fallback secret, or broken provider redirect in that state.
    const publicRead = request.method === "GET" && params.nextauth.length === 1
      && ["session", "providers"].includes(params.nextauth[0]);
    return Response.json(publicRead ? {} : { error: "Authentication is not configured." }, {
      status: publicRead ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
  return handler(request, { params });
}

export { authRoute as GET, authRoute as POST };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
