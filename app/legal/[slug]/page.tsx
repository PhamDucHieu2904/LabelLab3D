import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import {
  buildLegalDocuments,
  CURRENT_POLICY_VERSION,
  isValidMoitUrl,
  LEGAL_SLUGS,
  type LegalOperatorInfo,
  type LegalSlug,
} from "@/lib/legal/policies";
import { env } from "@/lib/server/http";
import { extractOperatorInfo } from "@/lib/server/legal";
import { readServerLocale } from "@/lib/server/locale";
import { DEFAULT_SITE_SETTINGS, getLiveSiteSettings } from "@/lib/server/site-config";
import LegalLangSwitch from "./LegalLangSwitch";
import styles from "../legal.module.css";

export const dynamic = "force-dynamic";

function resolveSlug(raw: string): LegalSlug {
  if (raw === "payment") return "refund";
  return (LEGAL_SLUGS as readonly string[]).includes(raw) ? (raw as LegalSlug) : "terms";
}

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
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const [{ slug }, query, operator] = await Promise.all([params, searchParams, loadOperatorInfo()]);
  const docSlug = resolveSlug(slug);
  const locale = await readServerLocale(query.lang);
  const docs = buildLegalDocuments(operator, locale);
  const page = docs[docSlug];
  return {
    title: `${page.title} | ${operator.siteName}`,
    description: page.intro,
  };
}

export default async function LegalPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const [{ slug }, query, operator] = await Promise.all([params, searchParams, loadOperatorInfo()]);
  const docSlug = resolveSlug(slug);
  const locale = await readServerLocale(query.lang);
  const docs = buildLegalDocuments(operator, locale);
  const page = docs[docSlug];
  const hasMoit = isValidMoitUrl(operator.moitStatusUrl);

  return (
    <main className={styles.page}>
      <article className={styles.card}>
        <div className={styles.topBar}>
          <Link className={styles.back} href="/">
            {locale === "en" ? `← Back to ${operator.siteName}` : `← Quay lại ${operator.siteName}`}
          </Link>
          <LegalLangSwitch docSlug={docSlug} locale={locale} />
        </div>

        <nav className={styles.docNav} aria-label={locale === "en" ? "Information & Legal documents" : "Danh mục giới thiệu và pháp lý"}>
          <Link href={`/about?lang=${locale}`} className={styles.docTab}>
            {locale === "en" ? "About" : "Giới thiệu"}
          </Link>
          <Link href={`/contact?lang=${locale}`} className={styles.docTab}>
            {locale === "en" ? "Contact" : "Liên hệ"}
          </Link>
          {LEGAL_SLUGS.map((itemSlug) => (
            <Link
              key={itemSlug}
              href={`/legal/${itemSlug}?lang=${locale}`}
              className={`${styles.docTab} ${itemSlug === docSlug ? styles.docTabActive : ""}`}
              aria-current={itemSlug === docSlug ? "page" : undefined}
            >
              {docs[itemSlug].shortLabel}
            </Link>
          ))}
        </nav>

        <p className={styles.eyebrow}>
          {operator.siteName.toUpperCase()} · {operator.domain.toUpperCase()} · {locale === "en" ? "VIETNAM COMPLIANCE" : "PHÁP LÝ VIỆT NAM"}
        </p>
        <h1>{page.title}</h1>
        <p className={styles.intro}>{page.intro}</p>

        {page.sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.paragraphs.map((paragraph, index) => (
              <p key={`${section.heading}-${index}`}>{paragraph}</p>
            ))}
          </section>
        ))}

        <aside className={styles.operatorBox} aria-label={locale === "en" ? "Website operator identity" : "Thông tin chủ sở hữu website"}>
          <h3>{locale === "en" ? "Website Owner Information (Individual Operator · Vietnam)" : "Thông tin chủ sở hữu website (Cá nhân kinh doanh · Việt Nam)"}</h3>
          <dl className={styles.operatorGrid}>
            <div>
              <dt>{locale === "en" ? "Individual Owner" : "Chủ sở hữu cá nhân"}</dt>
              <dd>{operator.ownerName || (locale === "en" ? "Configure in Admin → Legal & Tax" : "Cập nhật tại Admin → Pháp lý & Thuế")}</dd>
            </div>
            <div>
              <dt>{locale === "en" ? "Personal Tax ID (MST)" : "Mã số thuế cá nhân"}</dt>
              <dd>{operator.ownerTaxId || (locale === "en" ? "Pending configuration" : "Đang cập nhật")}</dd>
            </div>
            <div>
              <dt>{locale === "en" ? "Support Phone" : "Điện thoại hỗ trợ"}</dt>
              <dd>{operator.ownerPhone || (locale === "en" ? "Pending configuration" : "Đang cập nhật")}</dd>
            </div>
            <div>
              <dt>{locale === "en" ? "Support & Legal Email" : "Email hỗ trợ & pháp lý"}</dt>
              <dd>
                <a href={`mailto:${operator.contactEmail}`} style={{ color: "#9c2552", textDecoration: "underline" }}>
                  {operator.contactEmail}
                </a>
              </dd>
            </div>
            <div>
              <dt>{locale === "en" ? "Contact Address" : "Địa chỉ liên hệ"}</dt>
              <dd>{operator.ownerAddress || (locale === "en" ? "Vietnam (pending full address)" : "Việt Nam (đang cập nhật địa chỉ)")}</dd>
            </div>
            <div>
              <dt>{locale === "en" ? "Website Domain" : "Tên miền chính thức"}</dt>
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
              <span>{locale === "en" ? "Notified to Vietnam MOIT (online.gov.vn)" : "Đã thông báo Bộ Công Thương (online.gov.vn)"}</span>
            </a>
          )}
        </aside>

        <p className={styles.note}>
          {locale === "en"
            ? `Policy Version ${CURRENT_POLICY_VERSION} · Effective November 2026 · Support: ${operator.contactEmail} · Website: https://${operator.domain}`
            : `Phiên bản chính sách ${CURRENT_POLICY_VERSION} · Hiệu lực từ 11/2026 · Hỗ trợ: ${operator.contactEmail} · Website: https://${operator.domain}`}
        </p>
      </article>
    </main>
  );
}
