import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    {
      url: "https://hypermockup.com",
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: "https://hypermockup.com/about",
      lastModified,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: "https://hypermockup.com/contact",
      lastModified,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: "https://hypermockup.com/legal/terms",
      lastModified,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: "https://hypermockup.com/legal/privacy",
      lastModified,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: "https://hypermockup.com/legal/refund",
      lastModified,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: "https://hypermockup.com/legal/complaints",
      lastModified,
      changeFrequency: "monthly",
      priority: 0.4,
    },
  ];
}
