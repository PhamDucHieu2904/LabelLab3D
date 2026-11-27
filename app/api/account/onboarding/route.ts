import { assertSameOrigin, env, errorResponse, json, sessionUser } from "@/lib/server/http";
import { setStudioTourStatus } from "@/lib/server/onboarding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const user = await sessionUser();
    if (!user) {
      return json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const body = (await request.json().catch(() => ({}))) as { status?: unknown };
    const status = body.status === "skipped" ? "skipped" : "completed";
    await setStudioTourStatus(await env(), user.id, status);
    return json({ ok: true, status });
  } catch (error) {
    return errorResponse(error);
  }
}
