"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { Bell, CheckCheck, Layers3, LogIn, LogOut } from "lucide-react";
import { fetchSiteConfigCached } from "@/lib/client/api-cache";
import {
  DEFAULT_PUBLIC_ANNOUNCEMENTS,
  localizeAnnouncement,
  OPEN_ANNOUNCEMENT_EVENT,
  useAnnouncementReadState,
  type PublicAnnouncement,
} from "@/lib/client/announcements";
import { useAccount, useAuthDialog } from "./AuthDialog";
import { readAnalyticsConsent } from "./CookieConsentBanner";
import { useLocale } from "./LocaleProvider";
import styles from "./SiteHeader.module.css";

type SiteHeaderProps = {
  activePage: "home" | "studio";
  disabled?: boolean;
  onOpenProjects?: () => void;
  isLoggedIn?: boolean;
  onLogin?: () => void;
  onLogout?: () => void;
};

export default function SiteHeader({ activePage, disabled = false, onOpenProjects, isLoggedIn, onLogin, onLogout }: SiteHeaderProps) {
  const { locale, setLocale, t } = useLocale();
  const openAuth = useAuthDialog();
  const { user } = useAccount();
  const { data: session, status } = useSession();
  const signedIn = isLoggedIn ?? (Boolean(user) || status === "authenticated");
  const accountLabel = signedIn ? t.header.logout : t.header.login;
  const AccountIcon = signedIn ? LogOut : LogIn;
  const [announcements, setAnnouncements] = useState<PublicAnnouncement[]>(DEFAULT_PUBLIC_ANNOUNCEMENTS);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const { unreadCount, isUnread, markRead, markAllRead } = useAnnouncementReadState(announcements);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && detailsRef.current?.open) {
        detailsRef.current.open = false;
        detailsRef.current.querySelector("summary")?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const el = detailsRef.current;
      if (el?.open && !el.contains(event.target as Node | null)) {
        el.open = false;
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  useEffect(() => {
    let active = true;
    void fetchSiteConfigCached<{ announcements?: PublicAnnouncement[] }>()
      .then((cfg) => {
        if (active && Array.isArray(cfg?.announcements)) {
          setAnnouncements(cfg.announcements);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const kind = activePage === "studio" ? "studio_session" : "pageview";
    const key = `ll_visit_${kind}`;
    const sendTelemetry = () => {
      if (readAnalyticsConsent() !== "all") return;
      try {
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, "1");
      } catch {
        // Ignore storage access errors in private browsing.
      }
      void fetch("/api/telemetry/visit", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, path: activePage === "studio" ? "/studio" : "/" }),
      }).catch(() => undefined);
    };
    sendTelemetry();
    const onConsent = () => sendTelemetry();
    window.addEventListener("hypermockup-consent-changed", onConsent);
    return () => window.removeEventListener("hypermockup-consent-changed", onConsent);
  }, [activePage]);

  return (
    <header className={styles.header} inert={disabled}>
      <Link className={styles.wordmark} href="/" aria-label={t.header.brandAria}>
        <Image src="/branding/hypermockup-logo.svg" alt="HyperMockup" width={220} height={32} priority unoptimized />
      </Link>
      <nav className={styles.nav} aria-label={t.header.navAria}>
        <Link href="/" aria-current={activePage === "home" ? "page" : undefined}>{t.header.home}</Link>
        <Link href="/studio#workspace" aria-current={activePage === "studio" ? "page" : undefined}>{t.header.studio}</Link>
      </nav>
      <div className={styles.actions}>
        <Link
          className={styles.projects}
          href="/studio?panel=projects#workspace"
          aria-label={t.header.myProjects}
          onClick={(event) => {
            if (onOpenProjects && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
              event.preventDefault();
              onOpenProjects();
            }
          }}
        >
          <Layers3 className={styles.icon} aria-hidden="true" /><span>{t.header.myProjects}</span>
        </Link>
        <details
          ref={detailsRef}
          className={styles.notifications}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.currentTarget.open = false;
              event.currentTarget.querySelector("summary")?.focus();
            }
          }}
        >
          <summary className={styles.notificationButton} aria-label={t.header.openNotifications}>
            <Bell className={styles.icon} aria-hidden="true" />
            {unreadCount > 0 && <i aria-hidden="true" />}
          </summary>
          <div className={styles.notificationPanel} role="region" aria-label={t.header.notificationsRegion}>
            <div className={styles.notificationHeader}>
              <strong>{t.header.adminUpdates}</strong>
              {unreadCount > 0 && (
                <button
                  type="button"
                  className={styles.markReadBtn}
                  onClick={() => markAllRead(announcements)}
                >
                  <CheckCheck size={13} aria-hidden="true" />
                  <span>{t.home.markAllRead}</span>
                </button>
              )}
            </div>
            {announcements.length > 0 ? (
              <ul>
                {announcements.slice(0, 5).map((notice) => {
                  const localized = localizeAnnouncement(notice, locale);
                  const unread = isUnread(notice);
                  return (
                    <li key={notice.id}>
                      {activePage === "home" ? (
                        <button
                          type="button"
                          className={`${styles.notificationItem} ${unread ? styles.notificationItemUnread : ""}`}
                          onClick={() => {
                            markRead(notice);
                            if (detailsRef.current) detailsRef.current.open = false;
                            window.dispatchEvent(new CustomEvent(OPEN_ANNOUNCEMENT_EVENT, { detail: { id: notice.id } }));
                          }}
                        >
                          <span className={styles.notificationTitle}>
                            {unread && <span className={styles.notificationItemDot} aria-hidden="true" />}
                            <span>{localized.title}</span>
                          </span>
                          <p className={styles.notificationBody}>{localized.body}</p>
                          <small>{notice.time}</small>
                        </button>
                      ) : (
                        <Link
                          href={localized.href}
                          className={`${styles.notificationItem} ${unread ? styles.notificationItemUnread : ""}`}
                          onClick={() => {
                            markRead(notice);
                            if (detailsRef.current) detailsRef.current.open = false;
                          }}
                        >
                          <span className={styles.notificationTitle}>
                            {unread && <span className={styles.notificationItemDot} aria-hidden="true" />}
                            <span>{localized.title}</span>
                          </span>
                          <p className={styles.notificationBody}>{localized.body}</p>
                          <small>{notice.time}</small>
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className={styles.notificationEmpty}>{t.home.noAnnouncements}</p>
            )}
          </div>
        </details>
        <div className={styles.langSwitch} role="group" aria-label={t.header.langSwitchAria}>
          <button
            type="button"
            className={locale === "vi" ? styles.langActive : undefined}
            aria-pressed={locale === "vi"}
            aria-label={t.header.switchToVi}
            onClick={() => setLocale("vi")}
          >
            VI
          </button>
          <button
            type="button"
            className={locale === "en" ? styles.langActive : undefined}
            aria-pressed={locale === "en"}
            aria-label={t.header.switchToEn}
            onClick={() => setLocale("en")}
          >
            EN
          </button>
        </div>
        {signedIn && (user || session?.user) && (
          <span className={styles.accountName} title={user?.name || session?.user?.name || user?.email || session?.user?.email || undefined}>
            {user?.name || session?.user?.name || user?.email || session?.user?.email}
          </span>
        )}
        <button
          className={styles.start}
          type="button"
          aria-label={accountLabel}
          onClick={signedIn ? (onLogout ?? (() => { void fetch("/api/account/logout", { method: "POST", credentials: "same-origin" }).finally(() => { void signOut({ redirect: false }); window.dispatchEvent(new Event("labellab-account-changed")); }); }))
            : (onLogin ?? (() => openAuth("login")))}
        >
          <span>{accountLabel}</span><AccountIcon className={styles.icon} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
