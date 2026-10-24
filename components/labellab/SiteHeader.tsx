"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Bell, Layers3 } from "lucide-react";
import { LABELLAB_UPDATES } from "@/lib/labellab/updates";
import styles from "./SiteHeader.module.css";

type SiteHeaderProps = {
  activePage: "home" | "studio";
  disabled?: boolean;
  onOpenProjects?: () => void;
};

export default function SiteHeader({ activePage, disabled = false, onOpenProjects }: SiteHeaderProps) {
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
        <span className={styles.preview}><span /> Early preview</span>
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
        <Link className={styles.start} href="/studio#workspace" aria-label="Start designing">
          <span>Start designing</span><ArrowRight className={styles.icon} aria-hidden="true" />
        </Link>
      </div>
    </header>
  );
}
