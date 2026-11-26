import { extendCloudProject } from "@/lib/server/cloud-projects";
import { assertSameOrigin, env, errorResponse, json, sessionUser } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await assertSameOrigin();
    const user = await sessionUser();
    if (!user) throw new Error("FORBIDDEN");
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      idempotencyKey?: unknown;
    };
    const runtimeEnv = await env();
    const result = await extendCloudProject(runtimeEnv, user.id, id, {
      idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
    });
    return json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
