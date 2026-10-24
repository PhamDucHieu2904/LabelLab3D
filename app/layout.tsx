import type { Metadata } from "next";
import { Changa_One, Luckiest_Guy, Mona_Sans } from "next/font/google";
import "./globals.css";

const uiFont = Mona_Sans({
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: "variable",
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
  title: "Labellab — Bring your packaging to life",
  description:
    "Create realistic 3D packaging mockups. Explore materials, liquids and lighting, and bring your designs to life.",
  icons: {
    icon: "/branding/LLIcon.svg",
    apple: "/branding/LLIcon.svg",
  },
  openGraph: {
    images: [{ url: "/branding/LLIcon.svg", width: 125, height: 125, alt: "Labellab 3D" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${uiFont.variable} ${titleFont.variable} ${accentFont.variable}`}>
        {children}
      </body>
    </html>
  );
}
