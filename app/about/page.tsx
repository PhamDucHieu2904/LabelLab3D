import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Box, Coins, Mail, ShieldCheck, Sparkles, Verified } from "lucide-react";
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
        title: `About | ${operator.siteName}`,
        description:
          "Learn about HyperMockup — browser-based 3D packaging mockup & parametric mm CAD dieline studio built with 100% original commercial 3D assets.",
      }
    : {
        title: `Giới thiệu | ${operator.siteName}`,
        description:
          "Tìm hiểu về HyperMockup — nền tảng tạo mockup bao bì 3D & xuất dieline CAD (mm) ngay trên trình duyệt với 100% tài sản 3D nguyên bản.",
      };
}

export default async function AboutPage({
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
        { href: `/about?lang=en`, label: "About", active: true },
        { href: `/contact?lang=en`, label: "Contact", active: false },
        { href: `/legal/terms?lang=en`, label: "Terms", active: false },
        { href: `/legal/privacy?lang=en`, label: "Privacy", active: false },
        { href: `/legal/refund?lang=en`, label: "Payment & Refunds", active: false },
        { href: `/legal/complaints?lang=en`, label: "Complaints & Takedown", active: false },
      ]
    : [
        { href: `/about?lang=vi`, label: "Giới thiệu", active: true },
        { href: `/contact?lang=vi`, label: "Liên hệ", active: false },
        { href: `/legal/terms?lang=vi`, label: "Điều khoản", active: false },
        { href: `/legal/privacy?lang=vi`, label: "Bảo mật", active: false },
        { href: `/legal/refund?lang=vi`, label: "Thanh toán & Hoàn tiền", active: false },
        { href: `/legal/complaints?lang=vi`, label: "Khiếu nại & Gỡ nội dung", active: false },
      ];

  const features = en
    ? [
        {
          Icon: Verified,
          title: "100% Original Commercial 3D Assets",
          body: "Every 3D bottle, packaging container, studio scene, and parametric CAD template is authored originally by the HyperMockup creator — safe for client presentations, e-commerce listings, and commercial campaigns.",
        },
        {
          Icon: Sparkles,
          title: "Real-Time PBR Rendering in Browser",
          body: "Preview glass, aluminum, matte plastic, and studio lighting instantaneously in WebGL without installing heavy desktop 3D software, then export crisp PNG renders up to 8K.",
        },
        {
          Icon: Box,
          title: "Parametric CAD Boxes & 1:1 mm Dielines",
          body: "Enter exact millimeter dimensions (L × W × H) for folding cartons and trays, inspect the folded 3D structure in real time, and export print-ready SVG, PDF, or DXF dielines.",
        },
        {
          Icon: Coins,
          title: "Simple Pay-As-You-Go Coins",
          body: "No forced monthly subscriptions. Start with free welcome & daily check-in coins (10 coins = 1 standard 2K render). Domestic payments use VND via SePay VietQR; international payments use USD via Polar.sh (Merchant of Record).",
        },
      ]
    : [
        {
          Icon: Verified,
          title: "100% Tài sản 3D nguyên bản, an tâm thương mại",
          body: "Toàn bộ mô hình chai, bao bì 3D, ánh sáng studio và mẫu hộp CAD đều do chính tác giả HyperMockup tự xây dựng — yên tâm sử dụng ảnh render cho bài thuyết trình khách hàng, sàn TMĐT và chiến dịch thương mại.",
        },
        {
          Icon: Sparkles,
          title: "Render PBR thời gian thực trên trình duyệt",
          body: "Xem trước trực tiếp chất liệu thủy tinh, kim loại, nhựa nhám và ánh sáng studio bằng WebGL mà không cần cài phần mềm 3D nặng, hỗ trợ xuất ảnh PNG sắc nét lên tới 8K.",
        },
        {
          Icon: Box,
          title: "Hộp CAD tham số & Dieline tỉ lệ 1:1 (mm)",
          body: "Nhập chính xác kích thước milimét (Dài × Rộng × Cao) cho hộp và khay, xem mô phỏng gấp 3D tức thì và xuất file khuôn bế SVG, PDF hoặc DXF chuẩn in ấn.",
        },
        {
          Icon: Coins,
          title: "Nạp coin linh hoạt, không ép gia hạn tháng",
          body: "Không gói thuê bao ràng buộc. Nhận coin miễn phí khi tạo tài khoản và điểm danh mỗi ngày (10 coins = 1 ảnh render 2K). Thanh toán nội địa bằng VND qua VietQR SePay và quốc tế bằng USD qua Polar.sh (MoR).",
        },
      ];

  return (
    <main className={styles.page}>
      <article className={styles.card}>
        <div className={styles.topBar}>
          <Link className={styles.back} href="/">
            {en ? `← Back to ${operator.siteName}` : `← Quay lại ${operator.siteName}`}
          </Link>
          <PageLangSwitch basePath="/about" locale={locale} />
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
          {operator.siteName.toUpperCase()} · {operator.domain.toUpperCase()} · {en ? "ABOUT US" : "GIỚI THIỆU"}
        </p>
        <h1>
          {en
            ? "Browser-based 3D packaging mockups & CAD dielines."
            : "Nền tảng mockup bao bì 3D & dieline CAD trực tuyến."}
        </h1>
        <p className={styles.intro}>
          {en
            ? "HyperMockup helps packaging designers, beverage & cosmetic brands, and print studios turn flat label artwork into photorealistic 3D renders and accurate millimeter dielines in minutes — right inside a modern browser."
            : "HyperMockup giúp nhà thiết kế bao bì, thương hiệu đồ uống – mỹ phẩm và xưởng in biến thiết kế nhãn phẳng thành ảnh mockup 3D chân thực cùng khuôn bế milimét chính xác chỉ trong vài phút, ngay trên trình duyệt web."}
        </p>

        <div className={styles.featureGrid}>
          {features.map(({ Icon, title, body }) => (
            <div key={title} className={styles.featureCard}>
              <span className={styles.featureIcon}>
                <Icon size={20} aria-hidden="true" />
              </span>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>

        <section>
          <h2>{en ? "How HyperMockup Operates" : "Mô hình vận hành & Minh bạch bản quyền"}</h2>
          <p>
            {en
              ? `${operator.siteName} (https://${operator.domain}) is developed and operated independently by an individual creator in Vietnam. All 3D geometry, studio lighting rigs, and parametric CAD templates provided in the catalog are original works owned by the operator. Artwork and labels uploaded by users remain 100% the property of the respective users.`
              : `${operator.siteName} (https://${operator.domain}) được phát triển và vận hành độc lập theo mô hình cá nhân kinh doanh tại Việt Nam. Toàn bộ mô hình 3D, ánh sáng studio và mẫu CAD tham số trong thư viện là tài sản nguyên bản thuộc bản quyền của chủ sở hữu website. Thiết kế nhãn và artwork do người dùng tải lên hoàn toàn thuộc quyền sở hữu của người dùng.`}
          </p>
          <p>
            {en
              ? "To comply with Vietnam foreign exchange regulations and global tax rules, domestic Vietnam visitors pay strictly in VND via SePay VietQR, while customers outside Vietnam check out in USD via Polar.sh acting as Merchant of Record."
              : "Nhằm tuân thủ quy định quản lý ngoại hối tại Việt Nam và nghĩa vụ thuế quốc tế, khách hàng tại Việt Nam thanh toán hoàn toàn bằng VND qua VietQR SePay, trong khi khách hàng ngoài Việt Nam thanh toán bằng USD qua cổng Polar.sh với vai trò Merchant of Record."}
          </p>
        </section>

        <div className={styles.disclaimerBox}>
          <h2>{en ? "Disclaimer & Limitation of Liability" : "Tuyên bố giới hạn trách nhiệm"}</h2>
          <p>
            {en
              ? "3D renders and parametric CAD dielines generated on HyperMockup are provided to accelerate visual prototyping and prepress preparation. Before mass production, users and print houses are responsible for running physical print proofs and verifying material thickness, bleed, and tolerances. Users are solely responsible for ensuring they hold lawful rights to any logos, trademarks, or artwork uploaded into Studio."
              : "Ảnh render 3D và bản vẽ khuôn bế CAD tạo từ HyperMockup nhằm hỗ trợ trực quan hóa thiết kế và chuẩn bị chế bản nhanh. Trước khi in ấn hoặc sản xuất hàng loạt, người dùng và nhà in có trách nhiệm kiểm tra mẫu thử thực tế (proof), định lượng giấy, tràn lề và dung sai vật liệu. Người dùng tự chịu trách nhiệm pháp lý về bản quyền đối với mọi logo, nhãn hiệu hoặc hình ảnh tự tải lên Studio."}
          </p>
        </div>

        <div className={styles.ctaRow}>
          <Link href="/studio#workspace" className={styles.ctaPrimary}>
            <span>{en ? "Open Mockup Studio" : "Mở Mockup Studio"}</span>
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <Link href={`/contact?lang=${locale}`} className={styles.ctaSecondary}>
            <Mail size={16} aria-hidden="true" />
            <span>{en ? "Contact & Support" : "Liên hệ & Hỗ trợ"}</span>
          </Link>
        </div>

        <aside className={styles.operatorBox} aria-label={en ? "Website owner information" : "Thông tin chủ sở hữu website"}>
          <h3>{en ? "Website Owner Information (Individual Operator · Vietnam)" : "Thông tin chủ sở hữu website (Cá nhân kinh doanh · Việt Nam)"}</h3>
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
            ? `HyperMockup · Policy Version ${CURRENT_POLICY_VERSION} · Official support email: ${operator.contactEmail}`
            : `HyperMockup · Phiên bản chính sách ${CURRENT_POLICY_VERSION} · Email hỗ trợ chính thức: ${operator.contactEmail}`}
        </p>
      </article>
    </main>
  );
}
