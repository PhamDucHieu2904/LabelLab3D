import type { Metadata } from "next";
import { Changa_One, Luckiest_Guy, Mona_Sans } from "next/font/google";
import { AuthDialogProvider } from "@/components/labellab/AuthDialog";
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
    icon: "/branding/hypermockup-icon.svg",
    apple: "/branding/hypermockup-icon.svg",
  },
  openGraph: {
    title: "HyperMockup",
    description:
      "Create realistic 3D packaging and product mockups in your browser.",
    url: "https://hypermockup.com",
    siteName: "HyperMockup",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${uiFont.variable} ${titleFont.variable} ${accentFont.variable}`}>
        <AuthDialogProvider>{children}</AuthDialogProvider>
      </body>
    </html>
  );
}
