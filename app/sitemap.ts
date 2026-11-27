import type { MetadataRoute } from "next";
import { SEO_LAST_MODIFIED_ISO, SITE_URL } from "@/lib/seo/site";

function bilingualAlternates(path: string) {
  return {
    languages: {
      vi: `${SITE_URL}${path}?lang=vi`,
      en: `${SITE_URL}${path}?lang=en`,
    },
  };
}

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date(SEO_LAST_MODIFIED_ISO);
  return [
    {
      url: SITE_URL,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/studio`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.95,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
      alternates: bilingualAlternates("/about"),
    },
    {
      url: `${SITE_URL}/contact`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.75,
      alternates: bilingualAlternates("/contact"),
    },
    {
      url: `${SITE_URL}/legal/terms`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.4,
      alternates: bilingualAlternates("/legal/terms"),
    },
    {
      url: `${SITE_URL}/legal/privacy`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.4,
      alternates: bilingualAlternates("/legal/privacy"),
    },
    {
      url: `${SITE_URL}/legal/refund`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.4,
      alternates: bilingualAlternates("/legal/refund"),
    },
    {
      url: `${SITE_URL}/legal/complaints`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.4,
      alternates: bilingualAlternates("/legal/complaints"),
    },
  ];
}
