import { SHARE_LIMITS } from "@/lib/share/contracts";
import { assertSameOrigin, env, errorResponse, json, sessionUser } from "@/lib/server/http";
import {
  createSharedProject,
  type UploadedShareAssetInput,
} from "@/lib/server/shares";
import { getLiveSiteSettings } from "@/lib/server/site-config";
import { commitCoins, releaseCoins, reserveCoins } from "@/lib/server/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function parseMultipartShare(request: Request): Promise<{
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
    if (value.size === 0 || value.size > SHARE_LIMITS.maxAssetBytes) {
      throw new Error("ASSET_TOO_LARGE");
    }
    totalBytes += value.size;
    if (totalBytes > SHARE_LIMITS.maxTotalBytes) {
      throw new Error("PAYLOAD_TOO_LARGE");
    }
    const bytes = new Uint8Array(await value.arrayBuffer());
    assets.push({ expectedHash, bytes });
  }

  return { manifest: manifest as Record<string, unknown>, assets };
}

export async function POST(request: Request) {
  let reservedKey = "";
  let userId = "";
  let runtimeEnv: Awaited<ReturnType<typeof env>> | undefined;
  try {
    await assertSameOrigin();
    const user = await sessionUser();
    if (!user) throw new Error("FORBIDDEN");
    userId = user.id;
    runtimeEnv = await env();

    const { manifest, assets } = await parseMultipartShare(request);
    const settings = await getLiveSiteSettings(runtimeEnv);
    const shareCost = Math.max(0, Math.floor(settings.shareCost));

    const rawIdem = typeof manifest.idempotencyKey === "string" ? manifest.idempotencyKey.trim() : "";
    const idempotencyKey = /^reserve_[A-Za-z0-9_-]{16,120}$/.test(rawIdem)
      ? rawIdem
      : `reserve_${crypto.randomUUID().replaceAll("-", "")}`;

    if (shareCost > 0) {
      const refSuffix =
        typeof manifest.localProjectId === "string" && /^[A-Za-z0-9._-]{1,80}$/.test(manifest.localProjectId)
          ? manifest.localProjectId
          : "project";
      await reserveCoins(runtimeEnv, {
        userId: user.id,
        amount: shareCost,
        idempotencyKey,
        reference: `share:${refSuffix}`,
      });
      reservedKey = idempotencyKey;
    }

    const share = await createSharedProject(runtimeEnv, user.id, {
      localProjectId: typeof manifest.localProjectId === "string" ? manifest.localProjectId : undefined,
      title: typeof manifest.title === "string" ? manifest.title : "",
      description: typeof manifest.description === "string" ? manifest.description : undefined,
      brandName: typeof manifest.brandName === "string" ? manifest.brandName : undefined,
      passcode: typeof manifest.passcode === "string" ? manifest.passcode : undefined,
      expiresAt: manifest.expiresAt === null || typeof manifest.expiresAt === "string" ? manifest.expiresAt : undefined,
      options: manifest.options && typeof manifest.options === "object" ? (manifest.options as Record<string, unknown>) : undefined,
      items: Array.isArray(manifest.items) ? manifest.items : [],
      assets,
    });

    if (reservedKey) {
      await commitCoins(runtimeEnv, { userId: user.id, idempotencyKey: reservedKey });
      reservedKey = "";
    }

    return json({ share, chargedCoins: shareCost }, { status: 201 });
  } catch (error) {
    if (reservedKey && runtimeEnv && userId) {
      await releaseCoins(runtimeEnv, { userId, idempotencyKey: reservedKey }).catch(() => {});
    }
    return errorResponse(error);
  }
}
