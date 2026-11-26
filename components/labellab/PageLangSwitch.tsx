"use client";

import Link from "next/link";
import { useLocale } from "@/components/labellab/LocaleProvider";
import type { UiLocale } from "@/lib/i18n/locale";
import styles from "@/app/legal/legal.module.css";

export default function PageLangSwitch({
  basePath,
  locale,
}: {
  basePath: string;
  locale: UiLocale;
}) {
  const { setLocale } = useLocale();
  return (
    <div className={styles.langSwitch} role="group" aria-label={locale === "en" ? "Language switch" : "Chọn ngôn ngữ"}>
      <Link
        href={`${basePath}?lang=vi`}
        className={`${styles.langBtn} ${locale === "vi" ? styles.langBtnActive : ""}`}
        aria-current={locale === "vi" ? "true" : undefined}
        onClick={() => setLocale("vi")}
      >
        Tiếng Việt
      </Link>
      <Link
        href={`${basePath}?lang=en`}
        className={`${styles.langBtn} ${locale === "en" ? styles.langBtnActive : ""}`}
        aria-current={locale === "en" ? "true" : undefined}
        onClick={() => setLocale("en")}
      >
        English
      </Link>
    </div>
  );
}
