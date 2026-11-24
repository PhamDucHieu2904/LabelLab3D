import { headers } from "next/headers";
import { requireDb } from "@/lib/server/db";
import { assertSameOrigin, env, errorResponse, json } from "@/lib/server/http";
import { issueVerificationCode, type VerificationPurpose } from "@/lib/server/email-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const body = await request.json().catch(() => ({})) as { email?: unknown; purpose?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const purpose: VerificationPurpose = body.purpose === "reset" ? "reset" : "register";
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) throw new Error("INVALID_INPUT");

    const runtimeEnv = await env();
    const db = requireDb(runtimeEnv);
    const existing = await db.prepare("SELECT id,status FROM users WHERE email=?").bind(email).first<{ id: string; status: string }>();

    if (purpose === "register" && existing) {
      throw new Error("EMAIL_EXISTS");
    }
    if (purpose === "reset" && (!existing || existing.status !== "active")) {
      // Avoid disclosing whether an email is registered on password reset while
      // keeping the response shape identical.
      return json({ ok: true, cooldownSeconds: 60 });
    }

    const requestHeaders = await headers();
    const ip = requestHeaders.get("cf-connecting-ip") ?? requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const result = await issueVerificationCode(runtimeEnv, { email, purpose, ip });
    return json({ ok: true, cooldownSeconds: result.cooldownSeconds });
  } catch (error) {
    return errorResponse(error);
  }
}
