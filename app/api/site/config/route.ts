import { headers } from "next/headers";
import { CURRENT_POLICY_VERSION, isValidMoitUrl, resolveMarketAccess } from "@/lib/legal/policies";
import { env, errorResponse, json, sessionUser } from "@/lib/server/http";
import { extractOperatorInfo } from "@/lib/server/legal";
import { readPolarConfig } from "@/lib/server/polar";
import { readSepayConfig, readSepayQrConfig } from "@/lib/server/sepay";
import {
  extractCheckInConfig,
  extractLiveAnnouncements,
  getLiveCoinPackages,
  getLiveSiteSettings,
  loadManagementData,
} from "@/lib/server/site-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const runtimeEnv = await env();
    const [management, coinPackages, settings, reqHeaders, currentUser] = await Promise.all([
      loadManagementData(runtimeEnv),
      getLiveCoinPackages(runtimeEnv),
      getLiveSiteSettings(runtimeEnv),
      headers(),
      sessionUser().catch(() => null),
    ]);
    const polarCfg = readPolarConfig(runtimeEnv);
    const sepayQr = readSepayQrConfig(runtimeEnv);
    const sepayGw = readSepayConfig(runtimeEnv);
    const countryHeader = reqHeaders.get("cf-ipcountry") ?? reqHeaders.get("x-vercel-ip-country") ?? "VN";
    const market = resolveMarketAccess(countryHeader, currentUser?.role === "admin");
    const operator = extractOperatorInfo(settings);

    return json({
      checkIn: extractCheckInConfig(management),
      announcements: extractLiveAnnouncements(management),
      coinPackages: coinPackages.filter((pkg) => pkg.enabled),
      visitor: market,
      payments: {
        vietnamEnabled: Boolean(sepayQr || (sepayGw.merchantId && sepayGw.secretKey && sepayGw.ipnSecret)),
        internationalEnabled: Boolean(polarCfg) && market.allowInternationalCheckout,
        internationalSandbox: polarCfg?.environment === "sandbox",
      },
      legal: {
        policyVersion: CURRENT_POLICY_VERSION,
        ownerName: operator.ownerName,
        ownerTaxId: operator.ownerTaxId,
        ownerAddress: operator.ownerAddress,
        ownerPhone: operator.ownerPhone,
        contactEmail: operator.contactEmail,
        domain: operator.domain,
        moitStatusUrl: isValidMoitUrl(operator.moitStatusUrl) ? operator.moitStatusUrl : "",
        consentRequired: settings.consent,
        analyticsEnabled: settings.analytics,
      },
      settings: {
        name: settings.name,
        domain: settings.domain,
        contact: settings.contact,
        locale: settings.locale,
        maintenance: settings.maintenance,
        registrations: settings.registrations,
        renderCost: settings.renderCost,
        dielineCost: settings.dielineCost,
        shareCost: settings.shareCost,
        projectExtendCost: settings.projectExtendCost,
        freeDownloads: settings.freeDownloads,
        resolutions: settings.resolutions,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
