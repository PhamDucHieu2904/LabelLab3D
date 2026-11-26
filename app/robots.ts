import type { MetadataRoute } from "next";

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
        allow: "/",
        disallow: ["/admin", "/api/", "/payment/", "/studio", "/s/"],
      },
    ],
    sitemap: "https://hypermockup.com/sitemap.xml",
  };
}
