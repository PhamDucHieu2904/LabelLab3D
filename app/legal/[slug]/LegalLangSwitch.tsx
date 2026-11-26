"use client";

import Link from "next/link";
import { useLocale } from "@/components/labellab/LocaleProvider";
import type { LegalLocale, LegalSlug } from "@/lib/legal/policies";
import styles from "../legal.module.css";

export default function LegalLangSwitch({
  docSlug,
  locale,
}: {
  docSlug: LegalSlug;
  locale: LegalLocale;
}) {
  const { setLocale } = useLocale();
  return (
    <div className={styles.langSwitch} role="group" aria-label={locale === "en" ? "Language switch" : "Chọn ngôn ngữ"}>
      <Link
        href={`/legal/${docSlug}?lang=vi`}
        className={`${styles.langBtn} ${locale === "vi" ? styles.langBtnActive : ""}`}
        aria-current={locale === "vi" ? "true" : undefined}
        onClick={() => setLocale("vi")}
      >
        Tiếng Việt
      </Link>
      <Link
        href={`/legal/${docSlug}?lang=en`}
        className={`${styles.langBtn} ${locale === "en" ? styles.langBtnActive : ""}`}
        aria-current={locale === "en" ? "true" : undefined}
        onClick={() => setLocale("en")}
      >
        English
      </Link>
    </div>
  );
}
