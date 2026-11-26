import { deleteCloudProjectItem } from "@/lib/server/cloud-projects";
import { assertSameOrigin, env, errorResponse, json, sessionUser } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    await assertSameOrigin();
    const user = await sessionUser();
    if (!user) throw new Error("FORBIDDEN");
    const { id, itemId } = await context.params;
    const runtimeEnv = await env();
    const result = await deleteCloudProjectItem(runtimeEnv, user.id, id, itemId);
    return json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
