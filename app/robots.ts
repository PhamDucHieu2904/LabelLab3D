import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo/site";

const BLOCKED_AI_AND_SCRAPER_BOTS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "anthropic-ai",
  "Claude-Web",
  "CCBot",
  "Bytespider",
  "Google-Extended",
  "Amazonbot",
  "AhrefsBot",
  "SemrushBot",
  "PetalBot",
  "MJ12bot",
  "DotBot",
  "BLEXBot",
  "DataForSeoBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      ...BLOCKED_AI_AND_SCRAPER_BOTS.map((userAgent) => ({
        userAgent,
        disallow: "/",
      })),
      {
        userAgent: "*",
        allow: ["/", "/studio", "/about", "/contact", "/legal/"],
        disallow: ["/admin", "/api/", "/payment/", "/s/"],
      },
    ],
    host: SITE_URL,
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
