import { requireDb, randomId, sha256, nowIso, type AppEnv } from "./db";

const SESSION_DAYS = 30;

export type AuthUser = { id: string; email: string; name: string; role: "user" | "admin"; status: "active" | "locked" };

export async function createSession(env: AppEnv, user: AuthUser) {
  const db = requireDb(env), rawToken = randomId("sess");
  const tokenHash = await sha256(rawToken), expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  await db.prepare("INSERT INTO sessions (id,user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?)").bind(randomId("session"), user.id, tokenHash, expiresAt, nowIso()).run();
  return { token: rawToken, expiresAt };
}

export async function getSessionUser(env: AppEnv, rawToken: string | null): Promise<AuthUser | null> {
  if (!rawToken) return null;
  const row = await requireDb(env).prepare("SELECT u.id,u.email,u.name,u.role,u.status FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.status='active'").bind(await sha256(rawToken), nowIso()).first<AuthUser>();
  return row ?? null;
}

export async function revokeSession(env: AppEnv, rawToken: string | null) {
  if (rawToken) await requireDb(env).prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha256(rawToken)).run();
}

export function requireRole(user: AuthUser | null, role: "user" | "admin") {
  if (!user || user.status !== "active" || (role === "admin" && user.role !== "admin")) throw new Error("FORBIDDEN");
  return user;
}
