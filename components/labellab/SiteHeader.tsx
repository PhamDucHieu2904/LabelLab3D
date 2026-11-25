"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { Bell, Layers3, LogIn, LogOut } from "lucide-react";
import { LABELLAB_UPDATES } from "@/lib/labellab/updates";
import { useAccount, useAuthDialog } from "./AuthDialog";
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
  const openAuth = useAuthDialog();
  const { user } = useAccount();
  const { data: session, status } = useSession();
  const signedIn = isLoggedIn ?? (Boolean(user) || status === "authenticated");
  const accountLabel = signedIn ? "Log out" : "Login";
  const AccountIcon = signedIn ? LogOut : LogIn;

  useEffect(() => {
    const kind = activePage === "studio" ? "studio_session" : "pageview";
    const key = `ll_visit_${kind}`;
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
  }, [activePage]);
  return (
    <header className={styles.header} inert={disabled}>
      <Link className={styles.wordmark} href="/" aria-label="HyperMockup home">
        <Image src="/branding/hypermockup-logo.svg" alt="HyperMockup" width={220} height={32} priority unoptimized />
      </Link>
      <nav className={styles.nav} aria-label="Main navigation">
        <Link href="/" aria-current={activePage === "home" ? "page" : undefined}>Home</Link>
        <Link href="/studio#workspace" aria-current={activePage === "studio" ? "page" : undefined}>Mockup Studio</Link>
      </nav>
      <div className={styles.actions}>
        <Link
          className={styles.projects}
          href="/studio?panel=projects#workspace"
          aria-label="My projects"
          onClick={(event) => {
            if (onOpenProjects && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
              event.preventDefault();
              onOpenProjects();
            }
          }}
        >
          <Layers3 className={styles.icon} aria-hidden="true" /><span>My projects</span>
        </Link>
        <details className={styles.notifications} onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.currentTarget.open = false;
            event.currentTarget.querySelector("summary")?.focus();
          }
        }}>
          <summary className={styles.notificationButton} aria-label="Open notifications">
            <Bell className={styles.icon} aria-hidden="true" /><i aria-hidden="true" />
          </summary>
          <div className={styles.notificationPanel} role="region" aria-label="Notifications">
            <strong>Admin updates</strong>
            <ul>
              {LABELLAB_UPDATES.map((notice) => (
                <li key={notice.title}><span>{notice.title}</span><small>{notice.time}</small></li>
              ))}
            </ul>
          </div>
        </details>
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
