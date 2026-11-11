"use client";

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
  return (
    <header className={styles.header} inert={disabled}>
      <Link className={styles.wordmark} href="/" aria-label="Labellab home">
        <Image src="/branding/LLLogo.svg" alt="Labellab 3D" width={208} height={44} priority />
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
