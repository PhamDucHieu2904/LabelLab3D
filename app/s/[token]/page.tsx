import type { Metadata } from "next";
import { cookies } from "next/headers";
import SharedProjectViewer from "@/components/share/SharedProjectViewer";
import { env } from "@/lib/server/http";
import { getPublicSharedProject, shareUnlockCookieName } from "@/lib/server/shares";
import type { PublicSharedProjectResponse } from "@/lib/share/contracts";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ token: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const baseRobots: Metadata["robots"] = {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  };
  try {
    const cookieJar = await cookies();
    const unlockCookie = cookieJar.get(shareUnlockCookieName(token))?.value ?? null;
    const data = await getPublicSharedProject(await env(), token, unlockCookie, { recordView: false });
    if (data.state === "ready") {
      const title = `${data.share.title} · 3D Review`;
      const desc =
        data.share.description ||
        `${data.share.brandName ? `${data.share.brandName} · ` : ""}Interactive 3D packaging review (${data.share.itemCount} ${data.share.itemCount === 1 ? "object" : "objects"}) on HyperMockup.`;
      const firstThumb = data.items.find((item) => item.thumbnailHash)?.thumbnailHash;
      return {
        title,
        description: desc,
        robots: baseRobots,
        openGraph: {
          title,
          description: desc,
          type: "website",
          ...(firstThumb ? { images: [{ url: `/api/share/public/${token}/assets/${firstThumb}` }] } : {}),
        },
      };
    }
    if (data.state === "locked") {
      return {
        title: "Protected 3D Client Review · HyperMockup",
        description: "Enter the passcode to inspect this interactive 3D mockup collection.",
        robots: baseRobots,
      };
    }
  } catch {
    // Fall back to safe generic metadata.
  }
  return {
    title: "3D Client Review · HyperMockup",
    description: "Interactive 3D packaging mockup review.",
    robots: baseRobots,
  };
}

export default async function SharedProjectPage({ params }: PageProps) {
  const { token } = await params;
  let initial: PublicSharedProjectResponse = { state: "not_found" };
  try {
    const cookieJar = await cookies();
    const unlockCookie = cookieJar.get(shareUnlockCookieName(token))?.value ?? null;
    initial = await getPublicSharedProject(await env(), token, unlockCookie, { recordView: true });
  } catch {
    initial = { state: "not_found" };
  }
  return <SharedProjectViewer token={token} initialData={initial} />;
}
