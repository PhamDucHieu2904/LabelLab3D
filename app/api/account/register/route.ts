import { hashPassword } from "@/lib/server/password";
import { randomId, nowIso } from "@/lib/server/db";
import { env, json, errorResponse, sessionCookie, assertSameOrigin } from "@/lib/server/http";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const body = await request.json().catch(() => ({})) as { email?: unknown; name?: unknown; password?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254 || !name || name.length > 120 || password.length < 12 || password.length > 128 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) throw new Error("INVALID_INPUT");
    const runtimeEnv = await env(), db = runtimeEnv.DB!;
    const id = randomId("usr"), now = nowIso();
    await db.prepare("INSERT INTO users (id,email,name,password_hash,role,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").bind(id, email, name, await hashPassword(password), "user", "active", now, now).run();
    await sessionCookie({ id, email, name, role: "user", status: "active" });
    return json({ user: { id, email, name, role: "user" } }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
