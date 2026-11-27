"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { Bell, CheckCheck, Layers3, LogIn, LogOut, MessageSquareReply, ShieldCheck } from "lucide-react";
import type { UserNotificationItem } from "@/lib/server/notifications";
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

function formatNotificationTime(iso: string, locale: "vi" | "en"): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "";
  try {
    return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(ts));
  } catch {
    return "";
  }
}

export default function SiteHeader({ activePage, disabled = false, onOpenProjects, isLoggedIn, onLogin, onLogout }: SiteHeaderProps) {
  const { locale, setLocale, t } = useLocale();
  const openAuth = useAuthDialog();
  const { user } = useAccount();
  const { data: session, status } = useSession();
  const signedIn = isLoggedIn ?? (Boolean(user) || status === "authenticated");
  const accountLabel = signedIn ? t.header.logout : t.header.login;
  const AccountIcon = signedIn ? LogOut : LogIn;

  const [notifications, setNotifications] = useState<UserNotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingNotices, setLoadingNotices] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  const loadNotifications = useCallback(async () => {
    if (!signedIn) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    setLoadingNotices(true);
    try {
      const response = await fetch("/api/account/notifications", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) return;
      const data = (await response.json()) as {
        notifications?: UserNotificationItem[];
        unreadCount?: number;
      };
      setNotifications(data.notifications ?? []);
      setUnreadCount(Number(data.unreadCount ?? 0));
    } catch {
      // Keep header responsive if notifications fetch fails transiently.
    } finally {
      setLoadingNotices(false);
    }
  }, [signedIn]);

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
    const frame = requestAnimationFrame(() => {
      void loadNotifications();
    });
    const onAccountChanged = () => {
      void loadNotifications();
    };
    window.addEventListener("labellab-account-changed", onAccountChanged);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("labellab-account-changed", onAccountChanged);
    };
  }, [loadNotifications]);

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

  const markSingleRead = async (item: UserNotificationItem) => {
    setExpandedId((prev) => (prev === item.id ? null : item.id));
    if (item.readAt) return;
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => (n.id === item.id ? { ...n, readAt: now } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      await fetch("/api/account/notifications", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
    } catch {
      // Keep optimistic state.
    }
  };

  const markAllRead = async () => {
    if (unreadCount === 0) return;
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    setUnreadCount(0);
    try {
      await fetch("/api/account/notifications", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_all_read" }),
      });
    } catch {
      // Keep optimistic state.
    }
  };

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
          onToggle={(event) => {
            if (event.currentTarget.open && signedIn) {
              void loadNotifications();
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.currentTarget.open = false;
              event.currentTarget.querySelector("summary")?.focus();
            }
          }}
        >
          <summary className={styles.notificationButton} aria-label={t.header.openNotifications}>
            <Bell className={styles.icon} aria-hidden="true" />
            {signedIn && unreadCount > 0 && (
              <span className={styles.unreadCountBadge} aria-hidden="true">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </summary>
          <div className={styles.notificationPanel} role="region" aria-label={t.header.notificationsRegion}>
            <div className={styles.notificationHeader}>
              <strong>{t.header.adminUpdates}</strong>
              {signedIn && unreadCount > 0 && (
                <button
                  type="button"
                  className={styles.markReadBtn}
                  onClick={() => void markAllRead()}
                >
                  <CheckCheck size={13} aria-hidden="true" />
                  <span>{t.home.markAllRead}</span>
                </button>
              )}
            </div>

            {!signedIn ? (
              <div className={styles.notificationGuestBox}>
                <p>{t.header.notificationsLoginPrompt}</p>
                <button
                  type="button"
                  className={styles.notificationLoginBtn}
                  onClick={() => {
                    if (detailsRef.current) detailsRef.current.open = false;
                    openAuth("login");
                  }}
                >
                  <LogIn size={14} aria-hidden="true" />
                  <span>{t.header.login}</span>
                </button>
              </div>
            ) : loadingNotices && notifications.length === 0 ? (
              <p className={styles.notificationEmpty}>{t.header.notificationsLoading}</p>
            ) : notifications.length > 0 ? (
              <ul>
                {notifications.map((notice) => {
                  const unread = !notice.readAt;
                  const expanded = expandedId === notice.id;
                  const isReply = notice.kind === "feedback_reply";
                  return (
                    <li key={notice.id}>
                      <button
                        type="button"
                        className={`${styles.notificationItem} ${unread ? styles.notificationItemUnread : ""}`}
                        onClick={() => void markSingleRead(notice)}
                        aria-expanded={expanded}
                      >
                        <span className={styles.notificationMetaRow}>
                          <span className={`${styles.notificationTag} ${isReply ? styles.notificationTagReply : styles.notificationTagAdmin}`}>
                            {isReply ? <MessageSquareReply size={11} aria-hidden="true" /> : <ShieldCheck size={11} aria-hidden="true" />}
                            <span>{isReply ? t.header.notificationKindReply : t.header.notificationKindAdmin}</span>
                          </span>
                          <small>{formatNotificationTime(notice.createdAt, locale)}</small>
                        </span>
                        <span className={styles.notificationTitle}>
                          {unread && <span className={styles.notificationItemDot} aria-hidden="true" />}
                          <span>{notice.title}</span>
                        </span>
                        <p className={`${styles.notificationBody} ${expanded ? styles.notificationBodyExpanded : ""}`}>
                          {notice.body}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className={styles.notificationEmpty}>{t.header.notificationsEmpty}</p>
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
