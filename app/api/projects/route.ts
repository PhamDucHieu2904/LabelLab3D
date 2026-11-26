import { CLOUD_PROJECT_LIMITS } from "@/lib/projects/contracts";
import {
  listUserCloudProjects,
  saveCloudProjectItems,
} from "@/lib/server/cloud-projects";
import { assertSameOrigin, env, errorResponse, json, sessionUser } from "@/lib/server/http";
import type { UploadedShareAssetInput } from "@/lib/server/shares";
import { getLiveSiteSettings } from "@/lib/server/site-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function parseMultipartProject(request: Request): Promise<{
  manifest: Record<string, unknown>;
  assets: UploadedShareAssetInput[];
}> {
  const form = await request.formData();
  const manifestRaw = form.get("manifest");
  if (typeof manifestRaw !== "string" || !manifestRaw.trim()) {
    throw new Error("INVALID_INPUT");
  }
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
    if (value.size === 0 || value.size > CLOUD_PROJECT_LIMITS.maxAssetBytes) {
      throw new Error("ASSET_TOO_LARGE");
    }
    totalBytes += value.size;
    if (totalBytes > CLOUD_PROJECT_LIMITS.maxTotalBytes) {
      throw new Error("PAYLOAD_TOO_LARGE");
    }
    const bytes = new Uint8Array(await value.arrayBuffer());
    assets.push({ expectedHash, bytes });
  }

  return { manifest: manifest as Record<string, unknown>, assets };
}

export async function GET() {
  try {
    const user = await sessionUser();
    if (!user) throw new Error("FORBIDDEN");
    const runtimeEnv = await env();
    const [projects, settings] = await Promise.all([
      listUserCloudProjects(runtimeEnv, user.id, { includeGlobalSweep: true }),
      getLiveSiteSettings(runtimeEnv),
    ]);
    return json({
      projects,
      extendCost: settings.projectExtendCost,
      limits: CLOUD_PROJECT_LIMITS,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const user = await sessionUser();
    if (!user) throw new Error("FORBIDDEN");
    const runtimeEnv = await env();
    const { manifest, assets } = await parseMultipartProject(request);

    const result = await saveCloudProjectItems(runtimeEnv, user.id, {
      projectId: typeof manifest.projectId === "string" && manifest.projectId.trim() ? manifest.projectId.trim() : undefined,
      name: typeof manifest.name === "string" ? manifest.name : undefined,
      description: typeof manifest.description === "string" ? manifest.description : undefined,
      brandName: typeof manifest.brandName === "string" ? manifest.brandName : undefined,
      autoRenew: typeof manifest.autoRenew === "boolean" ? manifest.autoRenew : undefined,
      items: Array.isArray(manifest.items) ? manifest.items : [],
      assets,
    });

    return json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
