import { hashPassword } from "@/lib/server/password";
import { constantTimeEqual, nowIso, randomId, requireDb } from "@/lib/server/db";
import { env, errorResponse, json, assertSameOrigin } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One-time bootstrap for the first administrator. The token must be entered
// as a Cloudflare secret and is never stored in D1 or returned to the client.
export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const runtimeEnv = await env();
    const configured = String(runtimeEnv.ADMIN_BOOTSTRAP_TOKEN ?? "");
    const supplied = request.headers.get("x-admin-bootstrap-token") ?? "";
    if (configured.length < 32 || !(await constantTimeEqual(configured, supplied))) throw new Error("FORBIDDEN");
    const body = await request.json().catch(() => ({})) as { email?: string; name?: string; password?: string };
    const email = body.email?.trim().toLowerCase() ?? "", name = body.name?.trim() ?? "", password = body.password ?? "";
    if (!/^\S+@\S+\.\S+$/.test(email) || !name || name.length > 120 || password.length < 12 || password.length > 128) throw new Error("INVALID_INPUT");
    const db = requireDb(runtimeEnv);
    const count = await db.prepare("SELECT COUNT(*) AS count FROM users WHERE role='admin'").first<{ count: number }>();
    if (Number(count?.count ?? 0) > 0) throw new Error("BOOTSTRAP_CLOSED");
    const id = randomId("usr"), now = nowIso();
    await db.prepare("INSERT INTO users (id,email,name,password_hash,role,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").bind(id, email, name, await hashPassword(password), "admin", "active", now, now).run();
    return json({ created: true }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
