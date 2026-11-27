import type { Metadata } from "next";
import type { UiLocale } from "@/lib/i18n/locale";

export const SITE_URL = "https://hypermockup.com";
export const SITE_NAME = "HyperMockup";
export const SITE_CONTACT_EMAIL = "hypermockup@gmail.com";
export const OG_IMAGE_PATH = "/branding/og-hypermockup.jpg";
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
export const SEO_LAST_MODIFIED_ISO = "2026-11-27T05:00:00.000Z";

export const INDEXABLE_ROBOTS: NonNullable<Metadata["robots"]> = {
  index: true,
  follow: true,
  googleBot: {
    index: true,
    follow: true,
    "max-image-preview": "large",
    "max-snippet": -1,
    "max-video-preview": -1,
  },
};

export const NOINDEX_ROBOTS: NonNullable<Metadata["robots"]> = {
  index: false,
  follow: false,
  nocache: true,
  googleBot: {
    index: false,
    follow: false,
  },
};

export function getGoogleSiteVerification(): string | undefined {
  const token = (
    process.env.GOOGLE_SITE_VERIFICATION ||
    process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ||
    ""
  ).trim();
  return token.length > 0 ? token : undefined;
}

export function buildAbsoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return normalized === "/" ? SITE_URL : `${SITE_URL}${normalized}`;
}

export function buildOgImage(alt: string) {
  return {
    url: OG_IMAGE_PATH,
    width: OG_IMAGE_WIDTH,
    height: OG_IMAGE_HEIGHT,
    alt,
    type: "image/jpeg",
  };
}

export function buildRootMetadata(locale: UiLocale): Metadata {
  const en = locale === "en";
  const defaultTitle = en
    ? "HyperMockup — Online 3D Packaging Mockup Studio & 1:1 mm CAD Dielines"
    : "HyperMockup — Tạo Mockup Bao Bì 3D & Dieline CAD 1:1 mm Online";
  const description = en
    ? "Create photorealistic 3D packaging mockups for glass bottles, cans, and parametric CAD boxes in your browser. Export up to 8K PNG renders, 1:1 mm PDF/SVG/DXF dielines, and live 3D share links."
    : "Tạo mockup bao bì 3D chai thủy tinh, lon nhôm, hộp giấy tham số (mm) ngay trên trình duyệt. Render PNG tới 8K, xuất khuôn bế CAD 1:1 PDF/SVG/DXF và chia sẻ link 3D.";
  const ogAlt = en
    ? "HyperMockup — 3D packaging mockups for bottles, cans, and parametric CAD boxes"
    : "HyperMockup — Studio tạo mockup bao bì 3D chai lọ, lon nhôm và hộp CAD 1:1 mm";
  const googleVerification = getGoogleSiteVerification();

  return {
    metadataBase: new URL(SITE_URL),
    applicationName: SITE_NAME,
    title: {
      default: defaultTitle,
      template: `%s | ${SITE_NAME}`,
    },
    description,
    keywords: en
      ? [
          "3D packaging mockup",
          "online 3D mockup generator",
          "3D bottle mockup",
          "aluminum can mockup 3D",
          "parametric box CAD",
          "1:1 mm dieline generator",
          "FEFCO 0201 box dieline",
          "packaging mockup studio",
          "3D mockup share link",
          "HyperMockup",
        ]
      : [
          "tạo mockup 3D online",
          "mockup bao bì 3D",
          "mockup chai lọ 3D",
          "mockup lon nhôm 3D",
          "mockup hộp giấy 3D",
          "xuất dieline CAD 1:1 mm",
          "khuôn bế hộp FEFCO",
          "render ảnh mockup 8K",
          "chia sẻ mockup 3D",
          "HyperMockup",
        ],
    authors: [{ name: SITE_NAME, url: SITE_URL }],
    creator: SITE_NAME,
    publisher: SITE_NAME,
    category: "Design",
    alternates: {
      canonical: "/",
    },
    robots: INDEXABLE_ROBOTS,
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [
        { url: "/branding/icon-48.png", sizes: "48x48", type: "image/png" },
        { url: "/branding/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/branding/icon-512.png", sizes: "512x512", type: "image/png" },
        { url: "/branding/hypermockup-icon.svg?v=2", type: "image/svg+xml" },
      ],
      shortcut: "/branding/icon-48.png",
      apple: [{ url: "/branding/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
    openGraph: {
      title: defaultTitle,
      description,
      url: SITE_URL,
      siteName: SITE_NAME,
      type: "website",
      locale: en ? "en_US" : "vi_VN",
      alternateLocale: en ? ["vi_VN"] : ["en_US"],
      images: [buildOgImage(ogAlt)],
    },
    twitter: {
      card: "summary_large_image",
      title: defaultTitle,
      description,
      images: [OG_IMAGE_PATH],
    },
    ...(googleVerification ? { verification: { google: googleVerification } } : {}),
  };
}

export type BilingualPageMetaOptions = {
  title: string;
  description: string;
  path: string;
  locale: UiLocale;
  explicitLang?: string;
  includeHreflang?: boolean;
};

export function buildPageMetadata({
  title,
  description,
  path,
  locale,
  explicitLang,
  includeHreflang = false,
}: BilingualPageMetaOptions): Metadata {
  const en = locale === "en";
  const normalizedLang = explicitLang === "vi" || explicitLang === "en" ? explicitLang : null;
  const canonical = includeHreflang && normalizedLang ? `${path}?lang=${normalizedLang}` : path;
  const fullTitle = `${title} | ${SITE_NAME}`;
  const ogUrl = buildAbsoluteUrl(canonical);

  return {
    title,
    description,
    alternates: {
      canonical,
      ...(includeHreflang
        ? {
            languages: {
              vi: `${path}?lang=vi`,
              en: `${path}?lang=en`,
              "x-default": path,
            },
          }
        : {}),
    },
    openGraph: {
      title: fullTitle,
      description,
      url: ogUrl,
      siteName: SITE_NAME,
      type: "website",
      locale: en ? "en_US" : "vi_VN",
      alternateLocale: en ? ["vi_VN"] : ["en_US"],
      images: [buildOgImage(fullTitle)],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [OG_IMAGE_PATH],
    },
  };
}

export function buildRootJsonLd(locale: UiLocale) {
  const en = locale === "en";
  const description = en
    ? "Browser-based 3D packaging mockup studio and parametric millimeter CAD dieline generator for bottles, aluminum cans, folding cartons, and beverage trays."
    : "Nền tảng tạo mockup bao bì 3D trực tuyến và xuất khuôn bế CAD tham số tỉ lệ 1:1 (mm) cho chai thủy tinh, lon nhôm, hộp giấy và khay trưng bày.";

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        email: SITE_CONTACT_EMAIL,
        logo: {
          "@type": "ImageObject",
          url: `${SITE_URL}/branding/icon-512.png`,
          width: 512,
          height: 512,
        },
        contactPoint: [
          {
            "@type": "ContactPoint",
            contactType: "customer support",
            email: SITE_CONTACT_EMAIL,
            availableLanguage: ["Vietnamese", "English"],
          },
        ],
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: SITE_NAME,
        alternateName: ["HyperMockup 3D", "HyperMockup Studio"],
        url: SITE_URL,
        inLanguage: ["vi-VN", "en-US"],
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_URL}/#app`,
        name: en ? "HyperMockup 3D Packaging Studio" : "HyperMockup — Studio Mockup Bao Bì 3D",
        url: `${SITE_URL}/studio`,
        applicationCategory: "DesignApplication",
        applicationSubCategory: "3D Packaging Mockup & CAD Dieline Studio",
        operatingSystem: "Web Browser",
        browserRequirements: "Requires WebGL2",
        inLanguage: ["vi", "en"],
        description,
        image: `${SITE_URL}${OG_IMAGE_PATH}`,
        screenshot: `${SITE_URL}${OG_IMAGE_PATH}`,
        creator: { "@id": `${SITE_URL}/#organization` },
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: en ? "USD" : "VND",
          availability: "https://schema.org/InStock",
          description: en
            ? "Free starter and daily check-in coins; optional pay-as-you-go coin packs with no subscription."
            : "Tặng coin khởi đầu và điểm danh miễn phí mỗi ngày; nạp thêm coin linh hoạt theo nhu cầu, không thuê bao.",
        },
        featureList: en
          ? [
              "Real-time WebGL PBR 3D mockups for glass bottles, aluminum cans, and PET containers",
              "Parametric millimeter CAD boxes and beverage trays (FEFCO 0201, tuck-end, display trays)",
              "1:1 mm print-ready dieline export to PDF, SVG, and DXF",
              "High-resolution PNG renders up to 8K with transparent background",
              "Interactive 3D share links for client packaging review",
            ]
          : [
              "Mockup 3D PBR thời gian thực cho chai thủy tinh, lon nhôm, chai nhựa PET/PP",
              "Hộp giấy và khay trưng bày CAD tham số theo milimét (FEFCO 0201, nắp gài, vách ngăn)",
              "Xuất bản vẽ khuôn bế dieline tỉ lệ 1:1 (mm) chuẩn in PDF, SVG, DXF",
              "Render ảnh PNG độ phân giải cao tới 8K hỗ trợ tách nền trong suốt",
              "Chia sẻ link xem mockup 3D tương tác trực tiếp cho khách hàng duyệt mẫu",
            ],
      },
    ],
  };
}

export function buildBreadcrumbJsonLd(items: ReadonlyArray<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: buildAbsoluteUrl(item.path),
    })),
  };
}

export function buildFaqJsonLd(faqs: ReadonlyArray<{ q: string; a: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };
}

export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
