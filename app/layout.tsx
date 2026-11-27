import type { Metadata } from "next";
import { Changa_One, Luckiest_Guy, Mona_Sans } from "next/font/google";
import { AuthDialogProvider } from "@/components/labellab/AuthDialog";
import CookieConsentBanner from "@/components/labellab/CookieConsentBanner";
import { LocaleProvider } from "@/components/labellab/LocaleProvider";
import { GuideDialogProvider } from "@/components/labellab/UserGuideModal";
import { buildRootJsonLd, buildRootMetadata, serializeJsonLd } from "@/lib/seo/site";
import { readServerLocale } from "@/lib/server/locale";
import "./globals.css";

const uiFont = Mona_Sans({
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: "variable",
  axes: ["wdth"],
  display: "swap",
  variable: "--font-mona-sans",
});

const titleFont = Changa_One({
  subsets: ["latin"],
  weight: "400",
  style: "normal",
  display: "swap",
  variable: "--font-changa-one",
});

const accentFont = Luckiest_Guy({
  subsets: ["latin", "latin-ext"],
  weight: "400",
  style: "normal",
  display: "swap",
  variable: "--font-luckiest-guy",
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = await readServerLocale();
  return buildRootMetadata(locale);
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const initialLocale = await readServerLocale();
  const rootJsonLd = serializeJsonLd(buildRootJsonLd(initialLocale));
  return (
    <html lang={initialLocale}>
      <body className={`${uiFont.variable} ${titleFont.variable} ${accentFont.variable}`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: rootJsonLd }}
        />
        <LocaleProvider initialLocale={initialLocale}>
          <AuthDialogProvider>
            <GuideDialogProvider>
              {children}
              <CookieConsentBanner />
            </GuideDialogProvider>
          </AuthDialogProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
