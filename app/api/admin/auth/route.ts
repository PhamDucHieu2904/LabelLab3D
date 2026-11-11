import { verifyPassword } from "@/lib/server/password";
import { env, json, errorResponse, sessionCookie, sessionUser, assertSameOrigin } from "@/lib/server/http";
import { authScope, assertLoginAllowed, clearLoginFailures, recordLoginFailure } from "@/lib/server/rate-limit";
import { headers } from "next/headers";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET() { try { const user = await sessionUser(); return json({ authenticated: !!user && user.role === "admin", user: user?.role === "admin" ? user : null }); } catch (e) { return errorResponse(e); } }
export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const body = await request.json().catch(() => ({})) as { email?: string; password?: string };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254 || password.length > 256) throw new Error("INVALID_INPUT");
    const h = await headers(); const ip = h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const runtimeEnv = await env(); const scope = await authScope(`admin:${email}`, ip); await assertLoginAllowed(runtimeEnv, scope);
    const row = await runtimeEnv.DB!.prepare("SELECT id,email,name,role,status,password_hash FROM users WHERE email=? AND role='admin'").bind(email).first<{ id: string; email: string; name: string; role: "admin"; status: "active" | "locked"; password_hash: string | null }>();
    if (!row?.password_hash || row.status !== "active" || !(await verifyPassword(password, row.password_hash))) { await recordLoginFailure(runtimeEnv, scope); throw new Error("INVALID_CREDENTIALS"); }
    await clearLoginFailures(runtimeEnv, scope); await sessionCookie(row);
    return json({ authenticated: true, user: { id: row.id, email: row.email, name: row.name, role: row.role } });
  } catch (e) { return errorResponse(e); }
}
