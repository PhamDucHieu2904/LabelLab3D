import { env, errorResponse, json } from "@/lib/server/http";
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
    const [management, coinPackages, settings] = await Promise.all([
      loadManagementData(runtimeEnv),
      getLiveCoinPackages(runtimeEnv),
      getLiveSiteSettings(runtimeEnv),
    ]);
    const polarCfg = readPolarConfig(runtimeEnv);
    const sepayQr = readSepayQrConfig(runtimeEnv);
    const sepayGw = readSepayConfig(runtimeEnv);
    return json({
      checkIn: extractCheckInConfig(management),
      announcements: extractLiveAnnouncements(management),
      coinPackages: coinPackages.filter((pkg) => pkg.enabled),
      payments: {
        vietnamEnabled: Boolean(sepayQr || (sepayGw.merchantId && sepayGw.secretKey && sepayGw.ipnSecret)),
        internationalEnabled: Boolean(polarCfg),
        internationalSandbox: polarCfg?.environment === "sandbox",
      },
      settings: {
        name: settings.name,
        domain: settings.domain,
        contact: settings.contact,
        locale: settings.locale,
        maintenance: settings.maintenance,
        registrations: settings.registrations,
        renderCost: settings.renderCost,
        freeDownloads: settings.freeDownloads,
        resolutions: settings.resolutions,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
