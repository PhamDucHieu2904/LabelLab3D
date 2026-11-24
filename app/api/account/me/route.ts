import { env, sessionUser, json, errorResponse } from "@/lib/server/http";
import { requireDb } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await sessionUser();
    if (!user) return json({ user: null });
    let avatarUrl: string | null = null;
    try {
      const linked = await requireDb(await env()).prepare(
        "SELECT avatar_url AS avatarUrl FROM oauth_accounts WHERE user_id=? ORDER BY updated_at DESC LIMIT 1",
      ).bind(user.id).first<{ avatarUrl: string | null }>();
      avatarUrl = linked?.avatarUrl ?? null;
    } catch {
      // Safe fallback before 0006_auth_verification.sql is applied on a local D1 instance.
      avatarUrl = null;
    }
    return json({ user: { id: user.id, email: user.email, name: user.name, role: user.role, avatarUrl } });
  } catch (error) {
    return errorResponse(error);
  }
}
