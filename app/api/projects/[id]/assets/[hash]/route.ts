import { isAssetAuthorizedForUserCloudProject } from "@/lib/server/cloud-projects";
import { env, errorResponse, sessionUser } from "@/lib/server/http";
import { getShareAsset } from "@/lib/server/share-assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; hash: string }> },
) {
  try {
    const user = await sessionUser();
    if (!user) throw new Error("FORBIDDEN");
    const { id, hash } = await context.params;
    const runtimeEnv = await env();
    const allowed = await isAssetAuthorizedForUserCloudProject(runtimeEnv, user.id, id, hash);
    if (!allowed) throw new Error("NOT_FOUND");
    const asset = await getShareAsset(runtimeEnv, hash);
    if (!asset) throw new Error("NOT_FOUND");

    const body = new Uint8Array(asset.bytes.byteLength);
    body.set(asset.bytes);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Length": String(asset.byteSize),
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
