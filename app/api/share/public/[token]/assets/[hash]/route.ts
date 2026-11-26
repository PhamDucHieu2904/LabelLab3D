import { cookies } from "next/headers";
import { env } from "@/lib/server/http";
import { getShareAsset } from "@/lib/server/share-assets";
import { authorizeShareAssetRead, shareUnlockCookieName } from "@/lib/server/shares";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ token: string; hash: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { token, hash } = await context.params;
    const runtimeEnv = await env();
    const unlockCookie = (await cookies()).get(shareUnlockCookieName(token))?.value ?? null;
    const access = await authorizeShareAssetRead(runtimeEnv, token, hash, unlockCookie);
    if (!access.allowed) {
      return new Response("Not Found", {
        status: access.isProtected ? 403 : 404,
        headers: {
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex, nofollow",
        },
      });
    }

    const asset = await getShareAsset(runtimeEnv, hash);
    if (!asset) {
      return new Response("Not Found", {
        status: 404,
        headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
      });
    }

    const body = new Uint8Array(asset.bytes.byteLength);
    body.set(asset.bytes);

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Length": String(body.byteLength),
        "Cache-Control": access.isProtected
          ? "private, max-age=3600"
          : "public, max-age=3600, stale-while-revalidate=86400",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch {
    return new Response("Error", { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
