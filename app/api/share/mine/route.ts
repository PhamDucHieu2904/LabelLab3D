import { env, errorResponse, json, sessionUser } from "@/lib/server/http";
import { listUserSharedProjects } from "@/lib/server/shares";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await sessionUser();
    if (!user) throw new Error("FORBIDDEN");
    const shares = await listUserSharedProjects(await env(), user.id);
    return json({ shares });
  } catch (error) {
    return errorResponse(error);
  }
}
