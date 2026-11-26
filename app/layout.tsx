import type { Metadata } from "next";
import { Changa_One, Luckiest_Guy, Mona_Sans } from "next/font/google";
import { AuthDialogProvider } from "@/components/labellab/AuthDialog";
import CookieConsentBanner from "@/components/labellab/CookieConsentBanner";
import { LocaleProvider } from "@/components/labellab/LocaleProvider";
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

export const metadata: Metadata = {
  metadataBase: new URL("https://hypermockup.com"),
  title: "HyperMockup",
  description:
    "HyperMockup — Create realistic 3D packaging and product mockups with real-time materials, lighting, and high-resolution renders.",
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [{ url: "/branding/hypermockup-icon.svg?v=2", type: "image/svg+xml" }],
    shortcut: "/branding/hypermockup-icon.svg?v=2",
    apple: "/branding/hypermockup-icon.svg?v=2",
  },
  openGraph: {
    title: "HyperMockup",
    description:
      "Create realistic 3D packaging and product mockups in your browser.",
    url: "https://hypermockup.com",
    siteName: "HyperMockup",
    type: "website",
    images: [{ url: "/branding/hypermockup-icon.svg", width: 358, height: 358, alt: "HyperMockup" }],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const initialLocale = await readServerLocale();
  return (
    <html lang={initialLocale}>
      <body className={`${uiFont.variable} ${titleFont.variable} ${accentFont.variable}`}>
        <LocaleProvider initialLocale={initialLocale}>
          <AuthDialogProvider>
            {children}
            <CookieConsentBanner />
          </AuthDialogProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
