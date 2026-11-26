import { deleteCloudProject, updateCloudProject } from "@/lib/server/cloud-projects";
import { assertSameOrigin, env, errorResponse, json, sessionUser } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await assertSameOrigin();
    const user = await sessionUser();
    if (!user) throw new Error("FORBIDDEN");
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      name?: unknown;
      description?: unknown;
      brandName?: unknown;
      autoRenew?: unknown;
    };
    const runtimeEnv = await env();
    const project = await updateCloudProject(runtimeEnv, user.id, id, {
      name: typeof body.name === "string" ? body.name : undefined,
      description: typeof body.description === "string" ? body.description : undefined,
      brandName: typeof body.brandName === "string" ? body.brandName : undefined,
      autoRenew: typeof body.autoRenew === "boolean" ? body.autoRenew : undefined,
    });
    return json({ project });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await assertSameOrigin();
    const user = await sessionUser();
    if (!user) throw new Error("FORBIDDEN");
    const { id } = await context.params;
    const runtimeEnv = await env();
    await deleteCloudProject(runtimeEnv, user.id, id);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
