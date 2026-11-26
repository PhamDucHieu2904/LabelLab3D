import ComingSoon from "@/components/labellab/ComingSoon";
import HomePage from "@/components/labellab/HomePage";
import DesktopViewport from "@/components/labellab/DesktopViewport";
import type { PublicLegalInfo } from "@/components/labellab/LegalFooter";
import { isValidMoitUrl } from "@/lib/legal/policies";
import { env } from "@/lib/server/http";
import { extractOperatorInfo } from "@/lib/server/legal";
import { shouldShowComingSoon } from "@/lib/server/launch-gate";
import { DEFAULT_SITE_SETTINGS, getLiveSiteSettings } from "@/lib/server/site-config";

export const dynamic = "force-dynamic";

async function loadInitialLegal(): Promise<PublicLegalInfo> {
  try {
    const settings = await getLiveSiteSettings(await env());
    const operator = extractOperatorInfo(settings);
    return {
      ownerName: operator.ownerName,
      ownerTaxId: operator.ownerTaxId,
      ownerAddress: operator.ownerAddress,
      ownerPhone: operator.ownerPhone,
      contactEmail: operator.contactEmail,
      domain: operator.domain,
      moitStatusUrl: isValidMoitUrl(operator.moitStatusUrl) ? operator.moitStatusUrl : "",
    };
  } catch {
    return {
      ownerName: DEFAULT_SITE_SETTINGS.ownerName,
      ownerTaxId: DEFAULT_SITE_SETTINGS.ownerTaxId,
      ownerAddress: DEFAULT_SITE_SETTINGS.ownerAddress,
      ownerPhone: DEFAULT_SITE_SETTINGS.ownerPhone,
      contactEmail: DEFAULT_SITE_SETTINGS.contact,
      domain: DEFAULT_SITE_SETTINGS.domain,
      moitStatusUrl: "",
    };
  }
}

export default async function Home() {
  if (await shouldShowComingSoon()) {
    return <ComingSoon />;
  }
  const initialLegal = await loadInitialLegal();
  return (
    <DesktopViewport>
      <HomePage initialLegal={initialLegal} />
    </DesktopViewport>
  );
}
