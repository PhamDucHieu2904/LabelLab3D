import { SHARE_LIMITS, type ShareStatus } from "@/lib/share/contracts";
import { assertSameOrigin, env, errorResponse, json, sessionUser } from "@/lib/server/http";
import {
  deleteSharedProject,
  updateSharedProject,
  type UploadedShareAssetInput,
} from "@/lib/server/shares";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

async function readPatchPayload(request: Request): Promise<{
  manifest: Record<string, unknown>;
  assets: UploadedShareAssetInput[];
}> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const manifestRaw = form.get("manifest");
    if (typeof manifestRaw !== "string" || !manifestRaw.trim()) throw new Error("INVALID_INPUT");
    let manifest: unknown;
    try {
      manifest = JSON.parse(manifestRaw);
    } catch {
      throw new Error("INVALID_INPUT");
    }
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
      throw new Error("INVALID_INPUT");
    }
    const assets: UploadedShareAssetInput[] = [];
    let totalBytes = 0;
    for (const [key, value] of form.entries()) {
      if (!key.startsWith("asset:")) continue;
      const expectedHash = key.slice("asset:".length).trim().toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(expectedHash)) throw new Error("INVALID_INPUT");
      if (!(value instanceof Blob)) throw new Error("INVALID_INPUT");
      if (value.size === 0 || value.size > SHARE_LIMITS.maxAssetBytes) {
        throw new Error("ASSET_TOO_LARGE");
      }
      totalBytes += value.size;
      if (totalBytes > SHARE_LIMITS.maxTotalBytes) {
        throw new Error("PAYLOAD_TOO_LARGE");
      }
      assets.push({ expectedHash, bytes: new Uint8Array(await value.arrayBuffer()) });
    }
    return { manifest: manifest as Record<string, unknown>, assets };
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("INVALID_INPUT");
  }
  return { manifest: body as Record<string, unknown>, assets: [] };
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await assertSameOrigin();
    const user = await sessionUser();
    if (!user) throw new Error("FORBIDDEN");
    const { id } = await context.params;
    if (!id || id.length > 100) throw new Error("INVALID_INPUT");

    const { manifest, assets } = await readPatchPayload(request);
    const status: ShareStatus | undefined =
      manifest.status === "active" || manifest.status === "paused" || manifest.status === "revoked"
        ? manifest.status
        : undefined;

    const share = await updateSharedProject(await env(), user.id, id, {
      ...(typeof manifest.title === "string" ? { title: manifest.title } : {}),
      ...(typeof manifest.description === "string" ? { description: manifest.description } : {}),
      ...(typeof manifest.brandName === "string" ? { brandName: manifest.brandName } : {}),
      ...(manifest.passcode === null || typeof manifest.passcode === "string"
        ? { passcode: manifest.passcode }
        : {}),
      ...(status ? { status } : {}),
      ...(manifest.expiresAt === null || typeof manifest.expiresAt === "string"
        ? { expiresAt: manifest.expiresAt }
        : {}),
      ...(manifest.options && typeof manifest.options === "object"
        ? { options: manifest.options as Record<string, unknown> }
        : {}),
      ...(Array.isArray(manifest.items) ? { items: manifest.items, assets } : {}),
    });

    return json({ share });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await assertSameOrigin();
    const user = await sessionUser();
    if (!user) throw new Error("FORBIDDEN");
    const { id } = await context.params;
    if (!id || id.length > 100) throw new Error("INVALID_INPUT");
    await deleteSharedProject(await env(), user.id, id);
    return json({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
