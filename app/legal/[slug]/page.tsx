import type { Metadata } from "next";
import Link from "next/link";
import styles from "../legal.module.css";

const pages = {
  terms: {
    title: "Terms of Service · Điều khoản sử dụng",
    intro:
      "These Terms govern your access to HyperMockup (hypermockup.com), our 3D packaging and product mockup studio, and internal rendering credits (Coins).",
    sections: [
      [
        "1. Service & Internal Credits (Coins)",
        "HyperMockup provides browser-based 3D mockup rendering and packaging studio tools. Coins are prepaid internal studio credits used exclusively to unlock exports and platform features on hypermockup.com. Coins are not legal tender, cryptocurrency, or an investment asset, have no cash value, and cannot be redeemed for cash, resold, or transferred between accounts.",
      ],
      [
        "2. Pricing, Billing & Delivery",
        "Coin pack prices, currencies (VND or USD), and credit quantities are clearly displayed before purchase. Coins are credited automatically to your account wallet only after server-verified payment confirmation via signed webhooks from our payment providers (SePay VietQR for Vietnam domestic transfers, or Polar.sh as Merchant of Record for international USD transactions).",
      ],
      [
        "3. Acceptable Use & Intellectual Property",
        "You retain full ownership of artwork and designs you upload to HyperMockup. You agree not to abuse automated endpoints, attempt payment fraud, reverse-engineer or bypass credit accounting, or upload unlawful content. We may suspend accounts involved in fraudulent or abusive activity.",
      ],
      [
        "4. Contact",
        "Questions regarding these Terms can be sent to labellab3d@gmail.com with your account email and order reference.",
      ],
    ],
  },
  privacy: {
    title: "Privacy Policy · Chính sách bảo mật",
    intro:
      "This Privacy Policy explains how HyperMockup (hypermockup.com) collects, uses, and protects your information when you sign in, render 3D mockups, or purchase Coin packs.",
    sections: [
      [
        "1. Data We Collect",
        "We collect only the minimum data needed to operate your account and orders: your name, email address, authentication metadata (Google OpenID Connect subject and profile image if using Google Sign-In, or salted password hash for email accounts), wallet ledger history, and payment order references. HyperMockup never stores raw credit card numbers or CVV codes.",
      ],
      [
        "2. Payment Processors & Email Delivery",
        "Domestic VND VietQR payments are verified through SePay; international USD card, Apple Pay, and Google Pay purchases are processed by Polar.sh as Merchant of Record (including applicable VAT/sales tax compliance). One-time verification codes (OTP) for registration and password reset are delivered via our transactional email provider.",
      ],
      [
        "3. Artwork Privacy & Data Storage",
        "Uploaded label textures are processed in your browser WebGL studio for 3D rendering. Account, wallet, and order records are stored securely on Cloudflare D1 with HttpOnly, Secure, SameSite session cookies.",
      ],
      [
        "4. Your Rights & Contact",
        "You may request access, correction, or deletion of your account data at any time by emailing labellab3d@gmail.com from your registered email address.",
      ],
    ],
  },
  refund: {
    title: "Payment & Refund Policy · Chính sách thanh toán và hoàn tiền",
    intro:
      "This policy covers Coin pack purchases made on HyperMockup (hypermockup.com) via Vietnam VietQR (SePay) and International USD checkout (Polar.sh).",
    sections: [
      [
        "1. Verified Order Processing",
        "All orders are confirmed automatically by signed server-to-server webhooks. For Vietnam VietQR transfers, please keep the exact amount and transfer description so SePay credits your account automatically. For international USD payments, Polar.sh acts as Merchant of Record and handles payment processing, receipts, and sales tax/VAT.",
      ],
      [
        "2. Eligible Refund Cases",
        "We issue refunds for verified duplicate charges, technical failures where payment was captured but Coins were not credited, or unused Coin packs requested within 7 days of purchase where no Coins from that pack have been spent. Once Coins have been consumed for 3D exports or studio services, used credits are non-refundable except where required by applicable law.",
      ],
      [
        "3. How to Request Support or a Refund",
        "Email labellab3d@gmail.com with your registered account email, Order ID (e.g., LL...), payment date, and payment provider (SePay or Polar). Verified refunds are processed back to the original payment method, and the corresponding unspent Coins are deducted from your wallet ledger.",
      ],
    ],
  },
} as const;

export function generateStaticParams() {
  return Object.keys(pages).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = pages[slug as keyof typeof pages] ?? pages.terms;
  return {
    title: `${page.title} | HyperMockup`,
    description: page.intro,
  };
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = pages[slug as keyof typeof pages] ?? pages.terms;

  return (
    <main className={styles.page}>
      <article className={styles.card}>
        <Link className={styles.back} href="/">← Back to HyperMockup</Link>
        <p className={styles.eyebrow}>HYPERMOCKUP · HYPERMOCKUP.COM</p>
        <h1>{page.title}</h1>
        <p className={styles.intro}>{page.intro}</p>
        {page.sections.map(([heading, body]) => (
          <section key={heading}>
            <h2>{heading}</h2>
            <p>{body}</p>
          </section>
        ))}
        <p className={styles.note}>Effective November 2026 · Support: labellab3d@gmail.com · Website: https://hypermockup.com</p>
      </article>
    </main>
  );
}
