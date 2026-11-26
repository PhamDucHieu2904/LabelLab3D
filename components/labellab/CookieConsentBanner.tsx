"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchSiteConfigCached } from "@/lib/client/api-cache";
import { useLocale } from "./LocaleProvider";
import styles from "./CookieConsentBanner.module.css";

export const ANALYTICS_CONSENT_KEY = "hypermockup.analytics_consent.v1";

export function readAnalyticsConsent(): "all" | "essential" | null {
  if (typeof window === "undefined") return null;
  try {
    const val = window.localStorage.getItem(ANALYTICS_CONSENT_KEY);
    return val === "all" || val === "essential" ? val : null;
  } catch {
    return null;
  }
}

export default function CookieConsentBanner() {
  const { locale, t } = useLocale();
  const c = t.cookie;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (readAnalyticsConsent()) return;
    let active = true;
    void fetchSiteConfigCached<{ legal?: { consentRequired?: boolean; analyticsEnabled?: boolean } }>()
      .then((payload) => {
        if (!active || !payload?.legal) return;
        if (payload.legal.consentRequired && payload.legal.analyticsEnabled) {
          setVisible(true);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const choose = (choice: "essential" | "all") => {
    try {
      window.localStorage.setItem(ANALYTICS_CONSENT_KEY, choice);
    } catch {
      // Ignore storage errors in private browsing.
    }
    setVisible(false);
    window.dispatchEvent(new CustomEvent("hypermockup-consent-changed", { detail: choice }));
    if (choice === "all") {
      void fetch("/api/legal/consent", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consentType: "cookies", analyticsAccepted: true }),
      }).catch(() => undefined);
    }
  };

  if (!visible) return null;

  return (
    <aside className={styles.banner} role="dialog" aria-label={c.ariaLabel}>
      <strong className={styles.title}>{c.title}</strong>
      <p className={styles.copy}>
        {c.copyPrefix}
        <Link href={`/legal/privacy?lang=${locale}`}>{c.privacyLink}</Link>.
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.essentialBtn} onClick={() => choose("essential")}>
          {c.essentialBtn}
        </button>
        <button type="button" className={styles.acceptBtn} onClick={() => choose("all")}>
          {c.acceptBtn}
        </button>
      </div>
    </aside>
  );
}
