import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import PageLangSwitch from "@/components/labellab/PageLangSwitch";
import {
  CURRENT_POLICY_VERSION,
  isValidMoitUrl,
  type LegalOperatorInfo,
} from "@/lib/legal/policies";
import { env } from "@/lib/server/http";
import { extractOperatorInfo } from "@/lib/server/legal";
import { readServerLocale } from "@/lib/server/locale";
import { DEFAULT_SITE_SETTINGS, getLiveSiteSettings } from "@/lib/server/site-config";
import styles from "@/app/legal/legal.module.css";
import ContactActions from "./ContactActions";

export const dynamic = "force-dynamic";

async function loadOperatorInfo(): Promise<LegalOperatorInfo> {
  try {
    const runtimeEnv = await env();
    const settings = await getLiveSiteSettings(runtimeEnv);
    return extractOperatorInfo(settings);
  } catch {
    return extractOperatorInfo(DEFAULT_SITE_SETTINGS);
  }
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const [query, operator] = await Promise.all([searchParams, loadOperatorInfo()]);
  const locale = await readServerLocale(query.lang);
  return locale === "en"
    ? {
        title: `Contact & Support | ${operator.siteName}`,
        description: `Contact ${operator.siteName} directly at ${operator.contactEmail} for coin top-up support, 3D Studio bug reports, new model requests, or legal/privacy inquiries.`,
      }
    : {
        title: `Liên hệ & Hỗ trợ | ${operator.siteName}`,
        description: `Liên hệ trực tiếp ${operator.siteName} qua email ${operator.contactEmail} để hỗ trợ đơn nạp coin, báo lỗi 3D Studio, đề xuất mẫu bao bì mới hoặc yêu cầu pháp lý.`,
      };
}

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const [query, operator] = await Promise.all([searchParams, loadOperatorInfo()]);
  const locale = await readServerLocale(query.lang);
  const en = locale === "en";
  const hasMoit = isValidMoitUrl(operator.moitStatusUrl);

  const navItems = en
    ? [
        { href: `/about?lang=en`, label: "About", active: false },
        { href: `/contact?lang=en`, label: "Contact", active: true },
        { href: `/legal/terms?lang=en`, label: "Terms", active: false },
        { href: `/legal/privacy?lang=en`, label: "Privacy", active: false },
        { href: `/legal/refund?lang=en`, label: "Payment & Refunds", active: false },
        { href: `/legal/complaints?lang=en`, label: "Complaints & Takedown", active: false },
      ]
    : [
        { href: `/about?lang=vi`, label: "Giới thiệu", active: false },
        { href: `/contact?lang=vi`, label: "Liên hệ", active: true },
        { href: `/legal/terms?lang=vi`, label: "Điều khoản", active: false },
        { href: `/legal/privacy?lang=vi`, label: "Bảo mật", active: false },
        { href: `/legal/refund?lang=vi`, label: "Thanh toán & Hoàn tiền", active: false },
        { href: `/legal/complaints?lang=vi`, label: "Khiếu nại & Gỡ nội dung", active: false },
      ];

  const faqs = en
    ? [
        {
          q: "How quickly are coins credited after VietQR or Polar card payment?",
          a: "Coins are credited automatically within a few seconds after our server receives the signed SePay or Polar.sh webhook. If your balance has not updated after 5 minutes, email us with your order code and transfer receipt.",
        },
        {
          q: "Do purchased coins expire?",
          a: "No. Purchased coins do not expire while your account remains active. Coins are internal service credits for renders and CAD dieline exports and cannot be exchanged for cash.",
        },
        {
          q: "Can I use exported 3D renders and dielines for commercial work?",
          a: "Yes. All 3D models and CAD templates in HyperMockup are 100% original assets authored by us. You may use your exported renders and dielines for client work, e-commerce, and commercial printing (reselling raw 3D models is not permitted).",
        },
        {
          q: "How do I request a payment receipt or delete my personal data?",
          a: `For Vietnam VietQR orders, you can fill in the optional receipt details right inside the checkout dialog. For older orders, account data export, or permanent deletion under Vietnam PDP Law 91/2025/QH15, email ${operator.contactEmail} from your registered account email.`,
        },
      ]
    : [
        {
          q: "Chuyển khoản VietQR hoặc thanh toán thẻ xong bao lâu nhận được coin?",
          a: "Coin được cộng tự động sau vài giây ngay khi máy chủ nhận webhook xác nhận hợp lệ từ SePay hoặc Polar.sh. Nếu quá 5 phút chưa thấy cập nhật số dư, bạn hãy gửi mã đơn hàng và ảnh chụp giao dịch về email hỗ trợ để được kiểm tra ngay.",
        },
        {
          q: "Coin đã nạp có bị hết hạn sử dụng không?",
          a: "Không. Coin đã nạp không hết hạn khi tài khoản còn hoạt động. Coin là tín dụng sử dụng nội bộ cho tính năng render ảnh và xuất dieline CAD, không quy đổi thành tiền mặt.",
        },
        {
          q: "Ảnh render 3D và bản vẽ dieline có được dùng cho dự án thương mại không?",
          a: "Có. Toàn bộ tài sản 3D và mẫu CAD trên HyperMockup đều do tác giả tự dựng nguyên bản. Bạn được quyền sử dụng ảnh render và bản vẽ dieline cho dự án khách hàng, sàn TMĐT và in ấn thương mại (không được bán lại file mô hình 3D gốc).",
        },
        {
          q: "Làm sao yêu cầu lưu thông tin biên nhận hoặc xóa dữ liệu tài khoản?",
          a: `Với đơn nạp VietQR tại Việt Nam, bạn có thể nhập sẵn thông tin biên nhận ngay trong khung thanh toán. Nếu cần tra soát đơn cũ, trích xuất hoặc xóa vĩnh viễn dữ liệu cá nhân theo Luật 91/2025/QH15, vui lòng gửi email từ địa chỉ đã đăng ký tới ${operator.contactEmail}.`,
        },
      ];

  return (
    <main className={styles.page}>
      <article className={styles.card}>
        <div className={styles.topBar}>
          <Link className={styles.back} href="/">
            {en ? `← Back to ${operator.siteName}` : `← Quay lại ${operator.siteName}`}
          </Link>
          <PageLangSwitch basePath="/contact" locale={locale} />
        </div>

        <nav className={styles.docNav} aria-label={en ? "Information & Legal pages" : "Danh mục giới thiệu và pháp lý"}>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.docTab} ${item.active ? styles.docTabActive : ""}`}
              aria-current={item.active ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <p className={styles.eyebrow}>
          {operator.siteName.toUpperCase()} · {operator.domain.toUpperCase()} · {en ? "CONTACT & SUPPORT" : "LIÊN HỆ & HỖ TRỢ"}
        </p>
        <h1>{en ? "Contact HyperMockup" : "Liên hệ & Hỗ trợ người dùng"}</h1>
        <p className={styles.intro}>
          {en
            ? "Have a question about coin top-ups, spotted a 3D Studio bug, want to request a new packaging model, or need to submit a copyright/privacy notice? Reach us directly by email below."
            : "Cần hỗ trợ đơn nạp coin, báo lỗi 3D Studio, đề xuất thêm mẫu bao bì mới hoặc gửi yêu cầu bản quyền / dữ liệu cá nhân? Hãy gửi trực tiếp về email hỗ trợ chính thức của HyperMockup bên dưới."}
        </p>

        <ContactActions email={operator.contactEmail} locale={locale} />

        <section>
          <h2>{en ? "Frequently Asked Questions" : "Câu hỏi thường gặp"}</h2>
          <div className={styles.faqList}>
            {faqs.map((item) => (
              <details key={item.q} className={styles.faqItem}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <aside className={styles.operatorBox} aria-label={en ? "Website owner contact details" : "Thông tin liên hệ chủ sở hữu website"}>
          <h3>{en ? "Website Owner & Official Contact Details" : "Thông tin chủ sở hữu & đầu mối tiếp nhận"}</h3>
          <dl className={styles.operatorGrid}>
            <div>
              <dt>{en ? "Individual Owner" : "Chủ sở hữu cá nhân"}</dt>
              <dd>{operator.ownerName || (en ? "Configure in Admin → Legal & Tax" : "Cập nhật tại Admin → Pháp lý & Thuế")}</dd>
            </div>
            <div>
              <dt>{en ? "Personal Tax ID (MST)" : "Mã số thuế cá nhân"}</dt>
              <dd>{operator.ownerTaxId || (en ? "Pending configuration" : "Đang cập nhật")}</dd>
            </div>
            <div>
              <dt>{en ? "Support & Feedback Email" : "Email hỗ trợ & phản hồi"}</dt>
              <dd>
                <a href={`mailto:${operator.contactEmail}`} style={{ color: "#9c2552", textDecoration: "underline" }}>
                  {operator.contactEmail}
                </a>
              </dd>
            </div>
            <div>
              <dt>{en ? "Support Phone" : "Điện thoại hỗ trợ"}</dt>
              <dd>{operator.ownerPhone || (en ? "Pending configuration" : "Đang cập nhật")}</dd>
            </div>
            <div>
              <dt>{en ? "Contact Address" : "Địa chỉ liên hệ"}</dt>
              <dd>{operator.ownerAddress || (en ? "Vietnam (pending full address)" : "Việt Nam (đang cập nhật địa chỉ)")}</dd>
            </div>
            <div>
              <dt>{en ? "Official Website" : "Tên miền chính thức"}</dt>
              <dd>https://{operator.domain}</dd>
            </div>
          </dl>
          {hasMoit && (
            <a
              href={operator.moitStatusUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.moitBadge}
            >
              <ShieldCheck size={16} aria-hidden="true" />
              <span>{en ? "Notified to Vietnam MOIT (online.gov.vn)" : "Đã thông báo Bộ Công Thương (online.gov.vn)"}</span>
            </a>
          )}
        </aside>

        <p className={styles.note}>
          {en
            ? `HyperMockup · Policy Version ${CURRENT_POLICY_VERSION} · Support email: ${operator.contactEmail}`
            : `HyperMockup · Phiên bản chính sách ${CURRENT_POLICY_VERSION} · Email hỗ trợ: ${operator.contactEmail}`}
        </p>
      </article>
    </main>
  );
}
