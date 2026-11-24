import { headers } from "next/headers";
import { nowIso, requireDb } from "@/lib/server/db";
import { verifyAndConsumeCode } from "@/lib/server/email-verification";
import { assertSameOrigin, env, errorResponse, json, sessionCookie } from "@/lib/server/http";
import { hashPassword } from "@/lib/server/password";
import { authScope, clearLoginFailures } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const body = await request.json().catch(() => ({})) as {
      email?: unknown;
      verificationCode?: unknown;
      password?: unknown;
    };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const verificationCode = typeof body.verificationCode === "string" ? body.verificationCode.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (
      !/^\S+@\S+\.\S+$/.test(email) || email.length > 254
      || password.length < 12 || password.length > 128
      || !/[A-Za-z]/.test(password) || !/\d/.test(password)
    ) {
      throw new Error("INVALID_INPUT");
    }

    const runtimeEnv = await env();
    const db = requireDb(runtimeEnv);
    await verifyAndConsumeCode(runtimeEnv, { email, purpose: "reset", code: verificationCode });

    const user = await db.prepare(
      "SELECT id,email,name,role,status FROM users WHERE email=?",
    ).bind(email).first<{ id: string; email: string; name: string; role: "user" | "admin"; status: "active" | "locked" }>();
    if (!user || user.status !== "active") throw new Error("FORBIDDEN");

    const now = nowIso();
    const passwordHash = await hashPassword(password);
    await db.batch([
      db.prepare("UPDATE users SET password_hash=?,email_verified_at=COALESCE(email_verified_at,?),updated_at=? WHERE id=?").bind(passwordHash, now, now, user.id),
      // Revoke all previously issued sessions after a password reset.
      db.prepare("DELETE FROM sessions WHERE user_id=?").bind(user.id),
    ]);

    const requestHeaders = await headers();
    const ip = requestHeaders.get("cf-connecting-ip") ?? requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    await clearLoginFailures(runtimeEnv, await authScope(email, ip));
    await sessionCookie(user);
    return json({ ok: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (error) {
    return errorResponse(error);
  }
}
