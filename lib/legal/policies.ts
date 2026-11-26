import type { CoinRegion } from "@/lib/payments/packages";

export const CURRENT_POLICY_VERSION = "2026-11-26";
export const LEGAL_SLUGS = ["terms", "privacy", "refund", "complaints"] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];
export type LegalLocale = "vi" | "en";

export type LegalOperatorInfo = {
  siteName: string;
  domain: string;
  contactEmail: string;
  ownerName: string;
  ownerTaxId: string;
  ownerAddress: string;
  ownerPhone: string;
  moitStatusUrl: string;
  retentionDays: number;
};

export type LegalSection = {
  heading: string;
  paragraphs: string[];
};

export type LegalDocument = {
  slug: LegalSlug;
  title: string;
  shortLabel: string;
  intro: string;
  sections: LegalSection[];
};

export type MarketAccess = {
  country: string;
  region: CoinRegion;
  allowVietnamCheckout: boolean;
  allowInternationalCheckout: boolean;
  allowRegionSwitch: boolean;
  fxNotice: string;
};

export function isValidMoitUrl(value: string): boolean {
  const trimmed = value.trim();
  return Boolean(trimmed && /^https?:\/\/(?:www\.)?online\.gov\.vn\/[^\s]+$/i.test(trimmed));
}

/**
 * Mask middle digits of a personal identification / tax ID (e.g. 12-digit CCCD)
 * when displayed publicly on the website footer and legal pages so the owner's
 * full ID number is never exposed to scrapers or bad actors.
 */
export function maskTaxId(taxId: string, mask = true): string {
  const cleaned = String(taxId ?? "").trim();
  if (!cleaned || !mask) return cleaned;
  if (cleaned.length >= 8) {
    return `${cleaned.slice(0, 3)}•••••${cleaned.slice(-4)}`;
  }
  if (cleaned.length >= 5) {
    return `${cleaned.slice(0, 2)}•••${cleaned.slice(-2)}`;
  }
  return "•".repeat(cleaned.length);
}

export const VIETNAM_INDIVIDUAL_TAX_THRESHOLD_VND = 1_000_000_000;

export type AnnualTaxOrderRow = {
  currency: string;
  amount: number;
  status: string;
  createdAt: string;
};

export type AnnualTaxSummary = {
  year: number;
  thresholdVnd: number;
  usdToVndRate: number;
  sepayVnd: number;
  polarUsd: number;
  polarVndEstimated: number;
  totalEstimatedVnd: number;
  remainingToThresholdVnd: number;
  percentOfThreshold: number;
  paidOrderCount: number;
  level: "safe" | "warning" | "exceeded";
};

export function vietnamYearOf(isoDate: string): number {
  const ms = Date.parse(isoDate);
  if (!Number.isFinite(ms)) return 0;
  return new Date(ms + 7 * 3_600_000).getUTCFullYear();
}

export function computeAnnualTaxSummary(
  orders: readonly AnnualTaxOrderRow[],
  options: { year: number; usdToVndRate: number; thresholdVnd?: number },
): AnnualTaxSummary {
  const thresholdVnd = options.thresholdVnd ?? VIETNAM_INDIVIDUAL_TAX_THRESHOLD_VND;
  const usdToVndRate = Number.isFinite(options.usdToVndRate) && options.usdToVndRate > 0 ? options.usdToVndRate : 25_500;
  let sepayVnd = 0;
  let polarCents = 0;
  let paidOrderCount = 0;

  for (const order of orders) {
    if (order.status !== "paid") continue;
    if (vietnamYearOf(order.createdAt) !== options.year) continue;
    paidOrderCount += 1;
    if (order.currency === "VND") {
      sepayVnd += Math.max(0, Number(order.amount) || 0);
    } else {
      polarCents += Math.max(0, Number(order.amount) || 0);
    }
  }

  const polarUsd = Math.round(polarCents) / 100;
  const polarVndEstimated = Math.round(polarUsd * usdToVndRate);
  const totalEstimatedVnd = sepayVnd + polarVndEstimated;
  const remainingToThresholdVnd = Math.max(0, thresholdVnd - totalEstimatedVnd);
  const percentOfThreshold = Math.round((totalEstimatedVnd / thresholdVnd) * 1000) / 10;
  const level: AnnualTaxSummary["level"] =
    totalEstimatedVnd >= thresholdVnd ? "exceeded" : percentOfThreshold >= 80 ? "warning" : "safe";

  return {
    year: options.year,
    thresholdVnd,
    usdToVndRate,
    sepayVnd,
    polarUsd,
    polarVndEstimated,
    totalEstimatedVnd,
    remainingToThresholdVnd,
    percentOfThreshold,
    paidOrderCount,
    level,
  };
}

export function normalizeCountryCode(raw: string | null | undefined): string {
  const cleaned = String(raw ?? "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(cleaned) && cleaned !== "XX" && cleaned !== "T1") {
    return cleaned;
  }
  return "VN";
}

/**
 * Enforce Circular 32/2013/TT-NHNN (Vietnam FX restriction) and protect 0% export
 * provenance for Polar.sh:
 * - Visitors in Vietnam (VN) are locked to VND via SePay VietQR.
 * - Visitors outside Vietnam are served USD via Polar.sh Merchant of Record.
 * - Admins retain a preview toggle so the owner can inspect both flows.
 */
export function resolveMarketAccess(countryInput: string | null | undefined, isAdmin = false): MarketAccess {
  const country = normalizeCountryCode(countryInput);
  if (isAdmin) {
    return {
      country,
      region: country === "VN" ? "vietnam" : "international",
      allowVietnamCheckout: true,
      allowInternationalCheckout: true,
      allowRegionSwitch: true,
      fxNotice:
        "Chế độ xem trước quản trị viên: Khách truy cập tại Việt Nam mặc định chỉ nhìn thấy bảng giá VND (SePay VietQR) theo Thông tư 32/2013/TT-NHNN.",
    };
  }
  if (country === "VN") {
    return {
      country,
      region: "vietnam",
      allowVietnamCheckout: true,
      allowInternationalCheckout: false,
      allowRegionSwitch: false,
      fxNotice:
        "Giá niêm yết bằng Đồng Việt Nam (VND) theo quy định quản lý ngoại hối tại Việt Nam, đã bao gồm nghĩa vụ thuế theo quy định (nếu có).",
    };
  }
  return {
    country,
    region: "international",
    allowVietnamCheckout: false,
    allowInternationalCheckout: true,
    allowRegionSwitch: false,
    fxNotice:
      "International USD pricing applies exclusively to customers residing and consuming services outside Vietnam. Applicable VAT/Sales Tax is handled by Polar.sh as Merchant of Record.",
  };
}

export type OrderReceiptInput = {
  buyerName?: unknown;
  taxCode?: unknown;
  address?: unknown;
  email?: unknown;
};

export type SanitizedOrderReceipt = {
  buyerName: string;
  taxCode: string;
  address: string;
  email: string;
};

export function sanitizeOrderReceipt(input: unknown): SanitizedOrderReceipt | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as OrderReceiptInput;
  const buyerName = typeof raw.buyerName === "string" ? raw.buyerName.trim().slice(0, 160) : "";
  const taxCode = typeof raw.taxCode === "string" ? raw.taxCode.replace(/[^\dA-Za-z-]/g, "").slice(0, 32) : "";
  const address = typeof raw.address === "string" ? raw.address.trim().slice(0, 260) : "";
  const email = typeof raw.email === "string" ? raw.email.trim().toLowerCase().slice(0, 254) : "";
  if (!buyerName && !taxCode && !address && !email) return null;
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return null;
  return { buyerName, taxCode, address, email };
}

function ownerLineVi(op: LegalOperatorInfo): string {
  const name = op.ownerName || "[Chủ sở hữu cá nhân — đang cập nhật trong Admin → Pháp lý & Thuế]";
  const tax = op.ownerTaxId || "[Đang cập nhật Mã số thuế cá nhân]";
  const address = op.ownerAddress || "[Đang cập nhật địa chỉ liên hệ tại Việt Nam]";
  const phone = op.ownerPhone || "[Đang cập nhật số điện thoại hỗ trợ]";
  return `Chủ sở hữu website (cá nhân kinh doanh tại Việt Nam): ${name} · Mã số thuế cá nhân: ${tax} · Địa chỉ liên hệ: ${address} · Điện thoại: ${phone} · Email hỗ trợ: ${op.contactEmail}.`;
}

function ownerLineEn(op: LegalOperatorInfo): string {
  const name = op.ownerName || "[Individual Operator — pending configuration in Admin → Legal & Tax]";
  const tax = op.ownerTaxId || "[Personal Tax ID pending]";
  const address = op.ownerAddress || "[Vietnam contact address pending]";
  const phone = op.ownerPhone || "[Support phone pending]";
  return `Website Operator (Individual business operator in Vietnam): ${name} · Personal Tax ID: ${tax} · Contact Address: ${address} · Phone: ${phone} · Support Email: ${op.contactEmail}.`;
}

export function buildLegalDocuments(op: LegalOperatorInfo, locale: LegalLocale): Record<LegalSlug, LegalDocument> {
  const domainUrl = `https://${op.domain}`;
  const retention = Math.max(7, Math.min(730, op.retentionDays || 90));

  if (locale === "en") {
    return {
      terms: {
        slug: "terms",
        shortLabel: "Terms of Service",
        title: "Terms of Service & General Trading Conditions",
        intro: `These Terms govern your access to and use of ${op.siteName} (${op.domain}), our browser-based 3D packaging mockup studio, parametric CAD dieline tools, and prepaid internal rendering credits (Coins). By creating an account or purchasing Coins, you agree to these Terms.`,
        sections: [
          {
            heading: "1. Operator Identity & Scope of Service",
            paragraphs: [
              ownerLineEn(op),
              `${op.siteName} operates as a direct digital service platform providing browser-based WebGL 3D product mockup previews, high-resolution image rendering, and 1:1 mm parametric packaging CAD dieline exports. Using the 3D studio requires a modern browser with WebGL2 enabled and adequate GPU/memory resources.`,
            ],
          },
          {
            heading: "2. Internal Studio Credits (Coins) — Closed-Loop Utility",
            paragraphs: [
              `Coins are prepaid internal service credits usable exclusively inside ${op.domain} to unlock high-resolution renders (5 / 10 / 20 / 40 Coins for 1K / 2K / 4K / 8K exports, scaled from live studio pricing) and parametric 1:1 mm CAD dieline exports (default 20 Coins).`,
              "Coins operate strictly within a closed-loop platform. Under Vietnam's Law on Digital Technology Industry (No. 71/2025/QH15) and Decree 52/2024/ND-CP, Coins are NOT legal tender, NOT virtual currency or cryptocurrency, NOT a financial/investment asset, and NOT a payment instrument for third-party goods or services. Coins have no cash value, cannot be redeemed for cash (except eligible order refunds), cannot be transferred between accounts, and cannot be traded outside the platform.",
              "Purchased Coins do not expire while your account remains active and in good standing. Promotional or free Coins (such as welcome bonuses or daily check-in rewards) have no monetary value and may be subject to campaign limits.",
            ],
          },
          {
            heading: "3. Pricing, Regional Currency & Tax Compliance",
            paragraphs: [
              "Vietnam customers: Prices are displayed strictly in Vietnamese Dong (VND) and settled via domestic VietQR bank transfer (SePay) in compliance with Circular 32/2013/TT-NHNN. Displayed VND prices include applicable tax obligations (if any) under Vietnam's tax regime for individual operators.",
              "International customers (outside Vietnam): Prices are displayed in US Dollars (USD) and processed by Polar.sh acting as Merchant of Record (MoR). Polar.sh calculates, collects, and remits applicable foreign VAT, GST, or Sales Tax on international orders. International USD checkout is exclusively for customers residing and consuming services outside Vietnam.",
              "Server-verified pricing applies to every order. Coins are credited automatically only after server-verified signed webhooks confirm payment settlement.",
            ],
          },
          {
            heading: "4. Intellectual Property & Commercial Output License",
            paragraphs: [
              `Platform IP: All 3D packaging models, geometries, shaders, lighting presets, parametric CAD generators, UI components, and source code on ${op.domain} are the exclusive intellectual property of the individual operator of ${op.siteName}.`,
              "Your Artwork: You retain 100% ownership of all label designs, graphics, and textures you upload or load into the studio. You represent and warrant that your artwork does not infringe third-party copyrights, trademarks, or violate Vietnamese law (including the Cybersecurity Law, Advertising Law, and IP Law).",
              "Commercial Output License: Upon completing a paid export (spending Coins for watermark-free PNG renders or CAD dielines), we grant you a worldwide, perpetual, non-exclusive commercial license to use the exported images and dielines for marketing, e-commerce listings, packaging print production, and client presentations. Free watermarked previews are for evaluation only; stripping watermarks without entitlement is prohibited.",
              "Prohibited Actions: You may not extract, download, redistribute, or resell our underlying 3D model files (.glb), reverse-engineer or bypass Coin reservations/accounting, scrape endpoints, create automated fake accounts to farm daily rewards, or use the platform to build a competing mockup library.",
            ],
          },
          {
            heading: "5. Rewards, Promotions & Account Security",
            paragraphs: [
              "Daily check-in rewards, welcome bonuses, and package tier bonuses follow fixed, transparent rules displayed in the UI—never random gambling or unregistered lottery mechanics. We reserve the right to revoke fraudulent bonus Coins or suspend accounts abusing automation, multi-accounting, or payment chargebacks.",
              "You are responsible for safeguarding your login credentials and email account. If you suspect unauthorized access, reset your password immediately and notify support.",
            ],
          },
          {
            heading: "6. Service Availability, Liability & Governing Law",
            paragraphs: [
              "We strive for reliable service availability and transparent maintenance windows. If a server/credit reservation fails during export, reserved Coins are automatically released back to your wallet ledger. Nothing in these Terms excludes or limits statutory consumer rights guaranteed under Vietnam's Law on Protection of Consumer Rights (No. 19/2023/QH15).",
              `These Terms are governed by the laws of the Socialist Republic of Vietnam. Any dispute shall first be resolved through good-faith negotiation via ${op.contactEmail}; if unresolved, either party may submit the dispute to a competent People's Court in Vietnam.`,
            ],
          },
        ],
      },
      privacy: {
        slug: "privacy",
        shortLabel: "Privacy Policy",
        title: "Privacy & Personal Data Protection Policy",
        intro: `This Policy explains how ${op.siteName} (${op.domain}) collects, processes, stores, transfers, and protects personal data in compliance with Vietnam's Law on Personal Data Protection (No. 91/2025/QH15, effective January 1, 2026) and related regulations.`,
        sections: [
          {
            heading: "1. Data Controller & Contact",
            paragraphs: [
              ownerLineEn(op),
              `All privacy inquiries, consent withdrawals, and data subject requests can be sent directly to ${op.contactEmail}.`,
            ],
          },
          {
            heading: "2. Categories of Personal Data Collected",
            paragraphs: [
              "Account & Authentication Data: Display name, email address, salted PBKDF2 password hash (for email accounts), or Google OpenID Connect subject ID and profile avatar URL (when you choose Google Sign-In), plus consent timestamps and policy version.",
              "Wallet & Payment Records: Coin ledger entries, daily check-in dates, order codes, package amounts, payment provider transaction references, and optional payment receipt/invoice details (buyer name, tax code, address, email) if you enter them.",
              "We NEVER collect, see, or store raw credit card numbers, CVV codes, or banking passwords.",
              "Technical & Analytics Data: Session cookies (HttpOnly, Secure, SameSite=Lax), IP address checks (used strictly for rate-limiting, fraud prevention, regional currency routing, and excluded-IP filtering), User-Agent strings, and aggregate visit/studio telemetry events if analytics consent is active. Browser localStorage stores your local studio presets (up to 20 saves) only on your own device.",
              "Artwork Privacy: Label artwork files loaded in the 3D studio are processed locally inside your browser WebGL session as temporary Blob URLs and are NOT uploaded to or stored on our servers.",
            ],
          },
          {
            heading: "3. Purpose & Legal Basis of Processing",
            paragraphs: [
              "We process personal data solely to: (a) create and secure your account and deliver 6-digit OTP verification/reset emails; (b) process Coin orders, verify webhooks, maintain an immutable wallet ledger, and handle refunds or receipts; (c) enforce rate limits, anti-fraud protections, and regional legal compliance; (d) improve studio reliability when analytics is enabled; and (e) comply with mandatory statutory obligations under Vietnamese tax and e-commerce law.",
              "Processing relies on your explicit affirmative opt-in consent (recorded upon registration/checkout), contractual necessity to deliver the service you requested, and mandatory legal obligations.",
            ],
          },
          {
            heading: "4. Third-Party Processors & Cross-Border Data Transfer",
            paragraphs: [
              "To operate a fast global web application, personal data is processed by trusted infrastructure and payment partners, several of which host servers outside Vietnam (constituting cross-border personal data transfer under Law 91/2025/QH15):",
              "• Cloudflare, Inc. (USA / Global edge network): Application hosting (Workers) and primary database storage (Cloudflare D1) for accounts, wallet ledgers, orders, and consent logs.",
              "• Google LLC (USA): Optional Google OAuth 2.0 / OpenID Connect identity verification when you choose Continue with Google.",
              "• Brevo or Resend (EU / USA): Transactional delivery of 6-digit OTP verification and password-reset emails.",
              "• SePay (Vietnam): Verification of domestic VND VietQR bank transfers.",
              "• Polar.sh (International Merchant of Record): Processing international USD card, Apple Pay, and Google Pay payments, receipts, and foreign VAT/Sales Tax compliance.",
              "We never sell or rent your personal data to third-party advertisers or data brokers.",
            ],
          },
          {
            heading: "5. Storage Security & Retention Periods",
            paragraphs: [
              "All traffic is encrypted over HTTPS/TLS. Passwords are hashed using PBKDF2-SHA256 with unique salts; sessions use HttpOnly, Secure, SameSite cookies; payment webhooks verify cryptographic signatures/API keys with constant-time comparison and idempotency keys.",
              `Retention: Account profile data is retained while your account remains active. Payment orders, wallet ledger entries, and legal consent records are retained for at least 3 years (or longer where required by Vietnam's Law on E-Commerce 122/2025/QH15 and tax administration laws). Aggregate visit telemetry is retained for up to ${retention} days.`,
            ],
          },
          {
            heading: "6. Your Statutory Rights Under Law 91/2025/QH15",
            paragraphs: [
              "As a data subject, you have the right to: be informed; give or withdraw consent at any time; access and obtain a copy of your personal data; request rectification of inaccurate data; request deletion/erasure of your account; request restriction of processing; and lodge complaints or seek legal remedies.",
              `How to exercise your rights: Email ${op.contactEmail} from your registered email address (or provide account verification). We respond to and process valid requests within 72 hours. Note that deleting an account permanently forfeits any remaining unspent Coins and cannot erase statutory payment/tax records that we are legally required to retain for 3 years.`,
            ],
          },
        ],
      },
      refund: {
        slug: "refund",
        shortLabel: "Payment & Refunds",
        title: "Payment, Digital Delivery, Receipt & Refund Policy",
        intro: `This policy sets out transparent payment procedures, digital delivery rules, tax/receipt handling, and refund conditions on ${op.siteName} (${domainUrl}) in accordance with Vietnam's Law on Protection of Consumer Rights (No. 19/2023/QH15) and Law on E-Commerce (No. 122/2025/QH15).`,
        sections: [
          {
            heading: "1. Supported Payment Channels by Region",
            paragraphs: [
              "Vietnam Domestic Orders (VND via SePay VietQR): Customers located in Vietnam pay exclusively in VND via bank transfer / VietQR verified automatically through SePay. Please keep the exact VND amount and exact transfer code (e.g., LL...) so the server credits your wallet immediately.",
              "International Orders (USD via Polar.sh Merchant of Record): Customers located outside Vietnam pay in USD via Visa, Mastercard, Apple Pay, or Google Pay through Polar.sh. Polar.sh acts as Merchant of Record, handling card security, payment receipts, and applicable foreign Sales Tax / VAT / GST.",
              "Handling Transfer Errors (VietQR): If you accidentally enter the wrong transfer description, transfer an incorrect amount, or transfer after the 15-minute QR timer expired, please email support with your bank transfer receipt/screenshot and Order Code. We manually reconcile verified transfers within 24–48 business hours.",
            ],
          },
          {
            heading: "2. Automatic Digital Delivery",
            paragraphs: [
              "Coins are delivered digitally and credited directly to your account wallet within seconds after our server verifies the signed webhook from SePay or Polar.sh. Rendered PNG mockups and parametric CAD dielines (SVG/PDF/DXF) are delivered immediately via direct browser download upon export completion.",
              "Atomic Export Protection: Before starting a paid export, the system places a temporary Coin reservation. If export fails due to a technical error, reserved Coins are automatically released back to your balance.",
            ],
          },
          {
            heading: "3. Individual Operator Tax & Receipt Information",
            paragraphs: [
              ownerLineEn(op),
              `${op.siteName} is operated by an individual business operator in Vietnam complying with applicable Vietnamese tax regulations (including Decree 68/2026/ND-CP and Decree 141/2026/ND-CP). Displayed VND prices are final and transparent.`,
              "Domestic buyers may optionally enter receipt/invoice contact details (name/organization, tax code if applicable, address, email) during SePay checkout. Electronic receipts/confirmations are sent by email; statutory e-invoices are issued in accordance with applicable individual-operator revenue thresholds and Vietnamese tax law. International buyers receive official tax invoices/receipts directly from Polar.sh.",
            ],
          },
          {
            heading: "4. Eligible Refund Cases",
            paragraphs: [
              "We grant full refunds in the following verified cases:",
              "• Duplicate Charges: You were accidentally charged twice for the same Coin order.",
              "• Undelivered Payment: Funds were captured by our bank or Polar.sh, but Coins were not credited and could not be reconciled within 48 hours.",
              "• Unused Coin Pack (7-Day Cooling-Off): You request a refund within 7 calendar days of purchase AND zero (0) Coins from that purchased pack have been spent.",
              "• Severe Unresolved Technical Defect: A verified platform-side defect prevents you from using the advertised paid export features on a supported WebGL2 browser and cannot be resolved by us within 72 hours.",
              "• Statutory Consumer Rights: Any other circumstance required under Article 38 of Vietnam's Law on Protection of Consumer Rights 19/2023/QH15.",
            ],
          },
          {
            heading: "5. Non-Refundable Cases & Processing Timeline",
            paragraphs: [
              "Refunds generally do not apply to: Coins already spent on completed, defect-free exports; free/promotional bonus Coins (welcome bonus, daily check-in); incompatibility caused by unsupported devices or disabled WebGL already disclosed prior to purchase; or accounts terminated for confirmed fraud or payment abuse.",
              `How to request a refund: Email ${op.contactEmail} with your registered email, Order ID (LL...), payment date, payment channel (SePay or Polar.sh), and reason. We verify requests within 1–3 business days and process approved refunds back to the original payment method within 5–7 business days (deducting the corresponding unspent Coins from your wallet ledger).`,
            ],
          },
        ],
      },
      complaints: {
        slug: "complaints",
        shortLabel: "Complaints & IP",
        title: "Complaint Resolution & Copyright Takedown Policy",
        intro: `This policy establishes clear, timely procedures for resolving customer complaints, payment disputes, and intellectual property notices on ${op.siteName} (${op.domain}), in compliance with Vietnam's Law on E-Commerce (122/2025/QH15), Law on Consumer Protection (19/2023/QH15), and Decree 17/2023/ND-CP.`,
        sections: [
          {
            heading: "1. Official Support & Complaint Channels",
            paragraphs: [
              ownerLineEn(op),
              `Primary Complaint Channel: Email ${op.contactEmail} with subject "[Complaint/Dispute] + Order ID / Account Email". Support hours: Monday – Saturday, 08:30 – 17:30 (UTC+7, Vietnam time).`,
            ],
          },
          {
            heading: "2. Four-Step Complaint Resolution Procedure",
            paragraphs: [
              "Step 1 — Submission: The customer sends details of the issue along with supporting evidence (Order Code, bank transfer receipt or Polar receipt, screenshots, browser/device details).",
              "Step 2 — Acknowledgement (Within 24 Hours): We confirm receipt of the complaint and assign a tracking reference.",
              "Step 3 — Investigation & Resolution (1–7 Business Days): We inspect Cloudflare D1 payment logs, webhook signatures, and wallet ledger entries, then deliver a written resolution (Coin credit reconciliation, technical fix, or approved refund).",
              "Step 4 — Escalation: If the parties cannot reach a mutually satisfactory settlement, either party has the right to refer the dispute to Vietnam consumer protection authorities or a competent People's Court in Vietnam in accordance with law.",
            ],
          },
          {
            heading: "3. Intellectual Property Notice & Takedown (Decree 17/2023/ND-CP)",
            paragraphs: [
              `All 3D models, CAD generators, and software on ${op.domain} are original works owned by the operator of ${op.siteName}. User label artwork is processed locally in the user's browser and not hosted publicly.`,
              `If you believe any content published on ${op.domain} infringes your copyright, trademark, or related rights under Vietnam's Intellectual Property Law, please send a written notice to ${op.contactEmail} containing: (a) claimant identity and contact details; (b) proof of IP ownership; (c) exact URL/identification of the allegedly infringing item; and (d) a good-faith declaration of accuracy. Valid notices are reviewed and acted upon within 24–72 hours.`,
            ],
          },
        ],
      },
    };
  }

  return {
    terms: {
      slug: "terms",
      shortLabel: "Điều khoản sử dụng",
      title: "Điều Khoản Sử Dụng & Điều Kiện Giao Dịch Chung",
      intro: `Văn bản này quy định điều kiện giao dịch chung và quyền, nghĩa vụ giữa bạn và chủ sở hữu website ${op.siteName} (${op.domain}) khi truy cập, đăng ký tài khoản, sử dụng công cụ tạo mockup 3D / thiết kế bao bì Parametric CAD và mua gói tín dụng nội bộ (Coin).`,
      sections: [
        {
          heading: "1. Thông tin chủ sở hữu website & Phạm vi dịch vụ",
          paragraphs: [
            ownerLineVi(op),
            `${op.siteName} là nền tảng thương mại điện tử kinh doanh trực tiếp cung cấp công cụ trình duyệt tạo mockup bao bì 3D (WebGL/Three.js), xuất ảnh độ phân giải cao và xuất bản vẽ kỹ thuật dieline bao bì tỷ lệ 1:1 mm (SVG/PDF/DXF). Để sử dụng mượt mà, thiết bị của khách hàng cần trình duyệt hiện đại có hỗ trợ WebGL2.`,
          ],
        },
        {
          heading: "2. Bản chất của Coin (Tín dụng render nội bộ — Hệ thống đóng)",
          paragraphs: [
            `Coin là đơn vị tín dụng sử dụng dịch vụ nội bộ trả trước, chỉ có giá trị sử dụng duy nhất trong hệ sinh thái ${op.domain} để mở khóa lượt xuất ảnh render chất lượng cao (5 / 10 / 20 / 40 Coin tương ứng 1K / 2K / 4K / 8K theo biểu phí trực tiếp trên hệ thống) và xuất file dieline CAD 1:1 mm (mặc định 20 Coin).`,
            "Theo Luật Công nghiệp công nghệ số số 71/2025/QH15 và Nghị định 52/2024/NĐ-CP: Coin KHÔNG phải là tiền tệ hợp pháp, KHÔNG phải tiền ảo/tài sản mã hóa, KHÔNG phải tài sản đầu tư và KHÔNG phải phương tiện thanh toán cho hàng hóa/dịch vụ của bên thứ ba. Coin không có giá trị quy đổi ra tiền mặt (ngoại trừ các trường hợp hoàn tiền đơn hàng hợp lệ theo Chính sách hoàn tiền), không được chuyển nhượng giữa các tài khoản và không được mua bán ngoài hệ thống.",
            "Coin khách hàng đã mua (nạp tiền thật) KHÔNG có thời hạn hết hạn trong suốt thời gian tài khoản còn hoạt động hợp lệ. Coin tặng miễn phí (thưởng chào mừng, điểm danh hằng ngày, khuyến mại) không có giá trị quy đổi tiền mặt và tuân theo thể lệ từng thời kỳ.",
          ],
        },
        {
          heading: "3. Bảng giá, Đồng tiền thanh toán & Tuân thủ thuế",
          paragraphs: [
            "Khách hàng tại Việt Nam: Mọi mức giá được niêm yết duy nhất bằng Đồng Việt Nam (VND) và thanh toán qua chuyển khoản VietQR (xác thực tự động qua SePay) tuân thủ đúng Thông tư 32/2013/TT-NHNN về hạn chế sử dụng ngoại hối. Giá VND niêm yết là mức giá cuối cùng, đã bao gồm nghĩa vụ thuế theo quy định đối với cá nhân kinh doanh (nếu có).",
            "Khách hàng quốc tế (cư trú và tiêu dùng dịch vụ ngoài lãnh thổ Việt Nam): Mức giá niêm yết bằng USD và được xử lý thông qua đối tác Polar.sh với vai trò Merchant of Record (MoR — đơn vị thu hộ và kê khai thuế VAT/Sales Tax/GST tại quốc gia người mua).",
            "Mọi giao dịch chỉ được ghi nhận và cộng Coin sau khi máy chủ xác thực chữ ký webhook thanh toán thành công từ cổng thanh toán.",
          ],
        },
        {
          heading: "4. Quyền Sở hữu trí tuệ & Giấy phép thương mại cho file xuất ra",
          paragraphs: [
            `Quyền sở hữu của ${op.siteName}: Toàn bộ mô hình 3D bao bì, hình học, vật liệu/shader, bộ sinh CAD Parametric, mã nguồn và giao diện trên ${op.domain} là tài sản trí tuệ hợp pháp thuộc quyền sở hữu của chủ sở hữu cá nhân ${op.siteName}.`,
            "Quyền sở hữu Artwork của khách hàng: Bạn giữ 100% quyền sở hữu đối với mọi thiết kế nhãn mác, đồ họa mà bạn mở trong studio. Bạn cam kết và tự chịu trách nhiệm pháp lý rằng artwork của mình không xâm phạm bản quyền, nhãn hiệu, quyền sở hữu trí tuệ của bên thứ ba và không vi phạm pháp luật Việt Nam (Luật An ninh mạng, Luật Quảng cáo, Luật Sở hữu trí tuệ).",
            "Giấy phép thương mại đầu ra (Commercial Output License): Khi bạn hoàn tất xuất file trả phí (trừ Coin hợp lệ để nhận ảnh PNG không watermark hoặc file CAD dieline 1:1 mm), chủ sở hữu cấp cho bạn quyền sử dụng thương mại toàn cầu, vĩnh viễn, không độc quyền đối với file ảnh/dieline đã xuất (phục vụ quảng cáo, bán hàng thương mại điện tử, in ấn sản xuất bao bì, trình bày cho khách hàng của agency). Bản xem trước miễn phí có dấu watermark chỉ dùng để đánh giá thử; nghiêm cấm hành vi tẩy xóa watermark trái phép.",
            "Hành vi bị nghiêm cấm: Nghiêm cấm trích xuất/tải trái phép file mô hình 3D gốc (.glb), phân phối/bán lại tài nguyên 3D gốc để xây dựng nền tảng cạnh tranh, can thiệp/vượt qua cơ chế tính Coin, tạo tài khoản ảo trục lợi điểm danh, hoặc tấn công/cào dữ liệu hệ thống.",
          ],
        },
        {
          heading: "5. Chương trình điểm danh, khuyến mại & An toàn tài khoản",
          paragraphs: [
            "Các cơ chế thưởng chào mừng, điểm danh chuỗi 7 ngày và tặng thêm % Coin theo gói nạp đều áp dụng tỷ lệ cố định, minh bạch, công khai trước khi tham gia (không mang tính may rủi/cá cược). Chúng tôi có quyền thu hồi Coin gian lận hoặc tạm khóa tài khoản nếu phát hiện hành vi gian lận thanh toán, hoàn tiền ác ý (chargeback fraud) hoặc dùng công cụ tự động trục lợi.",
            "Khách hàng có trách nhiệm bảo mật mật khẩu và hộp thư email đăng ký. Nếu phát hiện truy cập trái phép, vui lòng đổi mật khẩu ngay và báo qua kênh hỗ trợ.",
          ],
        },
        {
          heading: "6. Chất lượng dịch vụ, Giới hạn trách nhiệm & Luật áp dụng",
          paragraphs: [
            "Hệ thống áp dụng cơ chế tạm giữ Coin (reservation) trước khi xuất file: nếu quá trình xuất gặp sự cố kỹ thuật, số Coin tạm giữ sẽ tự động hoàn trả lại ví của bạn. Không nội dung nào trong Điều khoản này nhằm loại bỏ hoặc hạn chế các quyền hợp pháp bắt buộc của người tiêu dùng theo Luật Bảo vệ quyền lợi người tiêu dùng số 19/2023/QH15.",
            `Điều khoản này được điều chỉnh và giải thích theo pháp luật nước Cộng hòa Xã hội Chủ nghĩa Việt Nam. Mọi tranh chấp phát sinh ưu tiên giải quyết bằng thương lượng thiện chí qua ${op.contactEmail}; trường hợp không đạt thỏa thuận, các bên có quyền đưa ra Tòa án nhân dân có thẩm quyền tại Việt Nam giải quyết.`,
          ],
        },
      ],
    },
    privacy: {
      slug: "privacy",
      shortLabel: "Bảo mật dữ liệu",
      title: "Chính Sách Bảo Mật & Bảo Vệ Dữ Liệu Cá Nhân",
      intro: `Chính sách này giải thích minh bạch cách ${op.siteName} (${op.domain}) thu thập, xử lý, lưu trữ, chuyển giao và bảo vệ dữ liệu cá nhân của bạn theo đúng Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 (có hiệu lực từ ngày 01/01/2026) và Luật Thương mại điện tử số 122/2025/QH15.`,
      sections: [
        {
          heading: "1. Bên kiểm soát dữ liệu cá nhân & Đầu mối liên hệ",
          paragraphs: [
            ownerLineVi(op),
            `Mọi yêu cầu liên quan đến dữ liệu cá nhân (rút lại sự đồng ý, tra cứu, chỉnh sửa, xóa tài khoản) xin gửi về email: ${op.contactEmail}.`,
          ],
        },
        {
          heading: "2. Các loại dữ liệu cá nhân được thu thập",
          paragraphs: [
            "Dữ liệu tài khoản & định danh: Tên hiển thị, địa chỉ email, chuỗi băm mật khẩu (PBKDF2-SHA256 kèm salt, không lưu mật khẩu thô), hoặc mã định danh Google OpenID Connect & ảnh đại diện (nếu bạn chọn đăng nhập bằng Google), kèm thời điểm và phiên bản điều khoản bạn đã đồng ý.",
            "Dữ liệu ví Coin & giao dịch: Lịch sử cộng/trừ Coin, lịch sử ngày điểm danh, mã đơn hàng, giá trị gói nạp, mã đối chiếu từ cổng thanh toán, và thông tin biên nhận/hóa đơn tùy chọn (tên người mua/đơn vị, mã số thuế, địa chỉ, email) nếu bạn chủ động cung cấp khi thanh toán.",
            "Hệ thống TUYỆT ĐỐI KHÔNG thu thập, xử lý hay lưu trữ số thẻ ngân hàng, mã CVV hoặc mật khẩu ngân hàng của bạn.",
            "Dữ liệu kỹ thuật & phân tích truy cập: Cookie phiên đăng nhập (HttpOnly, Secure, SameSite=Lax), địa chỉ IP dùng cho giới hạn tần suất chống tấn công (rate limit), phân vùng tiền tệ tuân thủ pháp luật ngoại hối và lọc bot; chuỗi User-Agent và lượt truy cập tổng hợp (khi bạn đồng ý cookie phân tích). Trình duyệt lưu tối đa 20 thiết lập dự án cục bộ trong localStorage trên chính máy của bạn.",
            "Quyền riêng tư đối với Artwork nhãn mác: Hình ảnh nhãn sản phẩm bạn mở trong Studio 3D được xử lý cục bộ trên trình duyệt bằng WebGL (Blob URL tạm thời), KHÔNG tự động tải lên hay lưu trữ trên máy chủ của chúng tôi.",
          ],
        },
        {
          heading: "3. Mục đích & Cơ sở pháp lý xử lý dữ liệu",
          paragraphs: [
            "Dữ liệu cá nhân chỉ được sử dụng cho các mục đích cụ thể sau: (a) tạo lập, xác thực OTP 6 chữ số và bảo vệ tài khoản của bạn; (b) xử lý đơn nạp Coin, đối soát webhook thanh toán, hạch toán ví Coin, xuất biên nhận/hóa đơn và xử lý hoàn tiền/khiếu nại; (c) bảo mật hệ thống, ngăn chặn gian lận và tuân thủ quy định quản lý ngoại hối; (d) thống kê vận hành nhằm nâng cao hiệu năng khi có sự đồng ý của bạn; và (e) thực hiện nghĩa vụ lưu trữ bắt buộc theo pháp luật thuế và thương mại điện tử Việt Nam.",
            "Việc xử lý dữ liệu dựa trên sự đồng ý rõ ràng (tích chọn chủ động) của bạn khi đăng ký/giao dịch, sự cần thiết để thực hiện dịch vụ bạn yêu cầu và nghĩa vụ luật định.",
          ],
        },
        {
          heading: "4. Các bên thứ ba tiếp nhận dữ liệu & Thông báo chuyển dữ liệu ra nước ngoài",
          paragraphs: [
            "Để đảm bảo tốc độ truy cập, gửi mã OTP và xác thực thanh toán an toàn, một số dữ liệu cá nhân cần thiết được xử lý thông qua các đối tác hạ tầng đặt máy chủ ở nước ngoài (cấu thành hoạt động chuyển dữ liệu cá nhân xuyên biên giới theo Luật 91/2025/QH15):",
            "• Cloudflare, Inc. (Hoa Kỳ / Mạng biên toàn cầu): Hạ tầng vận hành ứng dụng (Workers) và cơ sở dữ liệu (Cloudflare D1) lưu tài khoản, sổ cái Coin, đơn hàng và lịch sử đồng ý pháp lý.",
            "• Google LLC (Hoa Kỳ): Xác thực đăng nhập OAuth 2.0 / OpenID Connect khi bạn chọn Tiếp tục với Google.",
            "• Brevo hoặc Resend (Châu Âu / Hoa Kỳ): Gửi email giao dịch chứa mã xác minh OTP và đặt lại mật khẩu.",
            "• SePay (Việt Nam): Xác thực giao dịch chuyển khoản VietQR nội địa bằng VND.",
            "• Polar.sh (Quốc tế): Xử lý thanh toán USD và thuế tiêu dùng quốc tế cho khách hàng ngoài lãnh thổ Việt Nam.",
            "Chúng tôi cam kết KHÔNG bán, cho thuê hoặc chia sẻ dữ liệu cá nhân của bạn cho bất kỳ bên quảng cáo hay môi giới dữ liệu nào.",
          ],
        },
        {
          heading: "5. Biện pháp bảo mật & Thời gian lưu trữ dữ liệu",
          paragraphs: [
            "Toàn bộ kết nối được mã hóa HTTPS/TLS; mật khẩu băm một chiều PBKDF2-SHA256; phiên đăng nhập bảo vệ bằng cookie HttpOnly, Secure, SameSite; mọi webhook thanh toán đều xác thực chữ ký mật mã/API key và chống phát lại (idempotency).",
            `Thời hạn lưu trữ: Thông tin tài khoản được lưu trong suốt thời gian tài khoản hoạt động. Dữ liệu giao dịch thanh toán, sổ cái ví Coin và bằng chứng đồng ý pháp lý được lưu trữ tối thiểu 03 năm theo yêu cầu của Luật Thương mại điện tử 122/2025/QH15 và pháp luật thuế Việt Nam. Dữ liệu thống kê truy cập tổng hợp lưu tối đa ${retention} ngày.`,
          ],
        },
        {
          heading: "6. Quyền của chủ thể dữ liệu theo Luật 91/2025/QH15",
          paragraphs: [
            "Bạn có đầy đủ các quyền theo pháp luật Việt Nam gồm: Quyền được biết; Quyền đồng ý và rút lại sự đồng ý bất cứ lúc nào; Quyền truy cập, xem và nhận bản sao dữ liệu cá nhân; Quyền yêu cầu chỉnh sửa dữ liệu sai sót; Quyền yêu cầu xóa tài khoản/xóa dữ liệu; Quyền hạn chế hoặc phản đối xử lý dữ liệu; Quyền khiếu nại, tố cáo và khởi kiện.",
            `Cách thực hiện quyền: Gửi yêu cầu từ email đã đăng ký tới ${op.contactEmail}. Chúng tôi tiếp nhận và phản hồi/xử lý yêu cầu hợp lệ trong vòng 72 giờ. Lưu ý: Khi xóa tài khoản vĩnh viễn, số dư Coin chưa sử dụng (nếu không thuộc diện hoàn tiền hợp lệ) sẽ bị hủy; đồng thời chứng từ giao dịch thanh toán vẫn có thể được lưu tối thiểu 03 năm theo nghĩa vụ bắt buộc của pháp luật thuế và TMĐT.`,
          ],
        },
      ],
    },
    refund: {
      slug: "refund",
      shortLabel: "Thanh toán & Hoàn tiền",
      title: "Chính Sách Thanh Toán, Giao Nhận Số, Hóa Đơn & Hoàn Tiền",
      intro: `Chính sách này quy định rõ phương thức thanh toán, giao nhận dịch vụ số, chứng từ/hóa đơn và các trường hợp hoàn tiền tại ${op.siteName} (${domainUrl}) theo Luật Bảo vệ quyền lợi người tiêu dùng số 19/2023/QH15 và Luật Thương mại điện tử số 122/2025/QH15.`,
      sections: [
        {
          heading: "1. Phương thức thanh toán theo khu vực",
          paragraphs: [
            "Khách hàng tại Việt Nam (Thanh toán VND qua SePay VietQR): Hiển thị và thanh toán duy nhất bằng Đồng Việt Nam (VND) thông qua mã QR chuyển khoản ngân hàng xác thực tự động bởi SePay. Quý khách vui lòng giữ nguyên chính xác số tiền VND và nội dung chuyển khoản (mã đơn LL...) để hệ thống tự động cộng Coin sau vài giây.",
            "Khách hàng quốc tế ngoài lãnh thổ Việt Nam (Thanh toán USD qua Polar.sh): Áp dụng độc quyền cho người dùng cư trú và sử dụng dịch vụ ngoài lãnh thổ Việt Nam. Thanh toán bằng thẻ Visa/Mastercard, Apple Pay, Google Pay qua đối tác Polar.sh (Merchant of Record).",
            "Xử lý sự cố chuyển khoản VietQR (sai nội dung / sai số tiền / quá hạn 15 phút): Nếu bạn đã chuyển tiền nhưng quên ghi đúng mã đơn, chuyển nhầm số tiền hoặc chuyển sau khi QR hết hạn, vui lòng gửi ảnh biên lai chuyển khoản kèm Mã đơn hàng và email tài khoản về bộ phận hỗ trợ. Chúng tôi sẽ đối soát thủ công sao kê ngân hàng và cộng Coin hoặc hoàn tiền thừa trong vòng 24–48 giờ làm việc.",
          ],
        },
        {
          heading: "2. Chính sách giao nhận dịch vụ số",
          paragraphs: [
            "Do bản chất là dịch vụ phần mềm trực tuyến và tín dụng số, Coin được giao nhận hoàn toàn tự động qua mạng và cộng trực tiếp vào ví tài khoản của bạn ngay sau khi máy chủ xác nhận thanh toán thành công (thường trong vòng 5–60 giây).",
            "Các tệp ảnh render PNG và bản vẽ dieline CAD (SVG/PDF/DXF) được giao ngay bằng cơ chế tải trực tiếp trên trình duyệt. Nếu quá trình xuất file gặp lỗi hệ thống, số Coin tạm giữ sẽ được hoàn lại ví tự động.",
          ],
        },
        {
          heading: "3. Quy định về Thuế, Biên nhận & Hóa đơn điện tử (Cá nhân kinh doanh)",
          paragraphs: [
            ownerLineVi(op),
            `${op.siteName} được vận hành dưới hình thức cá nhân kinh doanh tại Việt Nam, thực hiện đầy đủ nghĩa vụ đăng ký, kê khai và nộp thuế theo quy định pháp luật hiện hành (bao gồm Nghị định 68/2026/NĐ-CP, Nghị định 141/2026/NĐ-CP về ngưỡng doanh thu và chính sách thuế hộ/cá nhân kinh doanh, cùng Nghị định 254/2026/NĐ-CP về hóa đơn điện tử).`,
            "Giá gói Coin niêm yết bằng VND là giá cuối cùng, minh bạch trước khi khách hàng xác nhận thanh toán. Khách hàng trong nước có thể tùy chọn nhập thông tin nhận biên nhận/chứng từ giao dịch (Họ tên/Tên đơn vị, Mã số thuế nếu có, Địa chỉ, Email) ngay trong cửa sổ thanh toán VietQR. Việc phát hành hóa đơn điện tử thực hiện đúng theo ngưỡng doanh thu bắt buộc và quy định của cơ quan thuế đối với cá nhân kinh doanh. Khách hàng quốc tế nhận hóa đơn/biên lai thuế trực tiếp từ Polar.sh.",
          ],
        },
        {
          heading: "4. Các trường hợp được hoàn tiền 100%",
          paragraphs: [
            "Chúng tôi cam kết hoàn tiền 100% đối với các trường hợp đã xác minh sau đây:",
            "• Giao dịch trùng lặp: Khách hàng bị trừ tiền 02 lần cho cùng một đơn nạp Coin.",
            "• Lỗi không cộng Coin: Tiền đã vào tài khoản nhận thanh toán/Polar.sh nhưng hệ thống không cộng Coin và không thể đối soát khắc phục trong vòng 48 giờ.",
            "• Gói Coin chưa sử dụng trong vòng 07 ngày: Khách hàng gửi yêu cầu hoàn tiền trong vòng 07 ngày kể từ thời điểm thanh toán thành công VÀ chưa sử dụng bất kỳ 01 Coin nào thuộc gói đã mua.",
            "• Lỗi kỹ thuật nghiêm trọng từ hệ thống: Tính năng xuất render/dieline trả phí bị lỗi hệ thống không thể hoạt động trên trình duyệt WebGL2 hợp lệ mà chúng tôi không khắc phục được trong vòng 72 giờ.",
            "• Các trường hợp khác theo quyền đơn phương chấm dứt hợp đồng của người tiêu dùng tại Điều 38 Luật Bảo vệ quyền lợi người tiêu dùng số 19/2023/QH15.",
          ],
        },
        {
          heading: "5. Trường hợp không áp dụng hoàn tiền & Thời gian xử lý",
          paragraphs: [
            "Không hoàn tiền đối với: Số Coin đã được tiêu thụ để xuất thành công ảnh mockup hoặc file dieline đúng mô tả; Coin tặng miễn phí/khuyến mại (thưởng chào mừng, điểm danh); lỗi phát sinh do thiết bị/trình duyệt của người dùng không hỗ trợ WebGL2 đã được thông báo trước; hoặc tài khoản bị khóa do gian lận, vi phạm nghiêm trọng Điều khoản sử dụng.",
            `Quy trình & thời hạn hoàn tiền: Gửi yêu cầu về ${op.contactEmail} kèm email tài khoản, Mã đơn hàng (LL...), ngày thanh toán, kênh thanh toán (SePay hoặc Polar.sh) và ảnh biên lai. Chúng tôi xác minh trong 01–03 ngày làm việc và hoàn tiền về đúng tài khoản ngân hàng/phương thức thanh toán gốc trong 05–07 ngày làm việc (đồng thời khấu trừ số Coin chưa sử dụng tương ứng trên sổ cái ví).`,
          ],
        },
      ],
    },
    complaints: {
      slug: "complaints",
      shortLabel: "Khiếu nại & Bản quyền",
      title: "Chính Sách Giải Quyết Khiếu Nại & Xử Lý Vi Phạm Bản Quyền",
      intro: `Chính sách này quy định quy trình tiếp nhận, xử lý khiếu nại khách hàng và thông báo gỡ bỏ nội dung vi phạm quyền sở hữu trí tuệ tại ${op.siteName} (${op.domain}), tuân thủ Luật Thương mại điện tử 122/2025/QH15, Luật Bảo vệ quyền lợi người tiêu dùng 19/2023/QH15 và Nghị định 17/2023/NĐ-CP.`,
      sections: [
        {
          heading: "1. Kênh tiếp nhận phản ánh & khiếu nại chính thức",
          paragraphs: [
            ownerLineVi(op),
            `Kênh tiếp nhận chính thức: Gửi email tới ${op.contactEmail} với tiêu đề "[Khiếu nại] + Mã đơn hàng / Email tài khoản" hoặc gọi trực tiếp số điện thoại hỗ trợ niêm yết ở chân trang. Thời gian làm việc: Thứ 2 – Thứ 7, 08:30 – 17:30 (Giờ Việt Nam, UTC+7).`,
          ],
        },
        {
          heading: "2. Quy trình 04 bước giải quyết khiếu nại",
          paragraphs: [
            "Bước 1 — Tiếp nhận yêu cầu: Khách hàng gửi mô tả chi tiết sự cố kèm chứng từ liên quan (Mã đơn hàng LL..., ảnh chụp biên lai chuyển khoản hoặc biên lai Polar, ảnh chụp màn hình lỗi).",
            "Bước 2 — Xác nhận tiếp nhận (Trong vòng 24 giờ): Chủ sở hữu gửi phản hồi xác nhận đã tiếp nhận hồ sơ khiếu nại và mã theo dõi.",
            "Bước 3 — Xác minh & Đưa ra phương án xử lý (01–07 ngày làm việc): Kiểm tra dữ liệu đơn hàng, chữ ký webhook, sao kê ngân hàng và sổ cái ví Coin trên hệ thống, sau đó thông báo kết quả xử lý bằng văn bản qua email (cộng bù Coin, khắc phục kỹ thuật hoặc hoàn tiền theo chính sách).",
            "Bước 4 — Giải quyết tranh chấp cấp cao hơn: Trường hợp thương lượng không đạt thỏa thuận, một trong hai bên có quyền đưa vụ việc ra cơ quan bảo vệ quyền lợi người tiêu dùng hoặc Tòa án nhân dân có thẩm quyền tại Việt Nam giải quyết theo quy định pháp luật.",
          ],
        },
        {
          heading: "3. Quy trình thông báo & gỡ bỏ vi phạm Sở hữu trí tuệ (Nghị định 17/2023/NĐ-CP)",
          paragraphs: [
            `Toàn bộ mô hình 3D, mã nguồn và công cụ CAD trên ${op.domain} đều là sản phẩm sở hữu hợp pháp của chủ sở hữu ${op.siteName}. Ảnh nhãn người dùng sử dụng trong Studio được xử lý cục bộ trên trình duyệt, không xuất bản công khai.`,
            `Nếu cá nhân hoặc tổ chức cho rằng bất kỳ nội dung nào hiển thị công khai trên ${op.domain} xâm phạm quyền tác giả, quyền liên quan hoặc nhãn hiệu theo Luật Sở hữu trí tuệ Việt Nam, vui lòng gửi thông báo bằng văn bản tới ${op.contactEmail} kèm: (a) thông tin định danh và liên hệ của chủ thể quyền; (b) tài liệu chứng minh quyền sở hữu trí tuệ hợp pháp; (c) đường dẫn/vị trí chính xác của nội dung bị cho là vi phạm; và (d) cam kết chịu trách nhiệm về tính chính xác của thông báo. Mọi yêu cầu hợp lệ sẽ được xác minh và xử lý trong vòng 24–72 giờ.`,
          ],
        },
      ],
    },
  };
}
