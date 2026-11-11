import { requireRole, type AuthUser } from "./auth";
import { env, sessionUser } from "./http";

export async function requireAdmin(): Promise<{ env: Awaited<ReturnType<typeof env>>; user: AuthUser }> {
  const runtimeEnv = await env();
  const user = requireRole(await sessionUser(), "admin");
  return { env: runtimeEnv, user };
}
