import { hashPassword } from "@/lib/server/password";
import { authScope, assertLoginAllowed, clearLoginFailures, recordLoginFailure } from "@/lib/server/rate-limit";
import { constantTimeEqual, nowIso, randomId, requireDb } from "@/lib/server/db";
import { env, errorResponse, json, assertSameOrigin } from "@/lib/server/http";
import { headers } from "next/headers";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// One-time bootstrap for the first administrator. The token is a Cloudflare
// secret and is never stored in D1 or returned to the client.
export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const h = await headers();
    const ip = h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const runtimeEnv = await env();
    const scope = await authScope("admin-bootstrap", ip);
    await assertLoginAllowed(runtimeEnv, scope);
    const configured = String(runtimeEnv.ADMIN_BOOTSTRAP_TOKEN ?? "");
    const supplied = request.headers.get("x-admin-bootstrap-token") ?? "";
    if (configured.length < 32 || !(await constantTimeEqual(configured, supplied))) { await recordLoginFailure(runtimeEnv, scope); throw new Error("FORBIDDEN"); }
    await clearLoginFailures(runtimeEnv, scope);
    const body = await request.json().catch(() => ({})) as { email?: string; name?: string; password?: string };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254 || !name || name.length > 120 || password.length < 12 || password.length > 128 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) throw new Error("INVALID_INPUT");
    const db = requireDb(runtimeEnv), id = randomId("usr"), now = nowIso();
    const result = await db.prepare("INSERT INTO users (id,email,name,password_hash,role,status,created_at,updated_at) SELECT ?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM users WHERE role='admin')").bind(id, email, name, await hashPassword(password), "admin", "active", now, now).run();
    if ((result.meta?.changes as number | undefined) !== 1) throw new Error("BOOTSTRAP_CLOSED");
    return json({ created: true }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
