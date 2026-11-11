import { verifyPassword } from "@/lib/server/password";
import { env, json, errorResponse, sessionCookie, assertSameOrigin } from "@/lib/server/http";
import { authScope, assertLoginAllowed, clearLoginFailures, recordLoginFailure } from "@/lib/server/rate-limit";
import { headers } from "next/headers";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const body = await request.json().catch(() => ({})) as { email?: string; password?: string };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254 || password.length > 256) throw new Error("INVALID_INPUT");
    const h = await headers(); const ip = h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const runtimeEnv = await env(); const scope = await authScope(email, ip); await assertLoginAllowed(runtimeEnv, scope);
    const user = await runtimeEnv.DB!.prepare("SELECT id,email,name,role,status,password_hash FROM users WHERE email=?").bind(email).first<{ id: string; email: string; name: string; role: "user" | "admin"; status: "active" | "locked"; password_hash: string | null }>();
    if (!user?.password_hash || user.status !== "active" || !(await verifyPassword(password, user.password_hash))) { await recordLoginFailure(runtimeEnv, scope); throw new Error("INVALID_CREDENTIALS"); }
    await clearLoginFailures(runtimeEnv, scope); await sessionCookie(user);
    return json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (e) { return errorResponse(e); }
}
