"use client";

import Image from "next/image";
import { useSession } from "next-auth/react";
import { Bell, CalendarDays, ImageIcon, Settings2, Sparkles } from "lucide-react";
import type { UserProfileSummary } from "@/lib/labellab/profile-preview";
import styles from "./UserProfileCard.module.css";

type UserProfileCardProps = {
  profile: UserProfileSummary;
  notificationCount: number;
};

export default function UserProfileCard({ profile, notificationCount }: UserProfileCardProps) {
  const { data: session, status } = useSession();
  const signedIn = status === "authenticated";
  const name = signedIn ? (session.user?.name || session.user?.email || "Your account") : profile.name;
  const avatar = signedIn ? (session.user?.image || profile.avatar) : profile.avatar;
  const recentUsage = signedIn ? [] : profile.recentUsage;
  return (
    <article className={`home-card ${styles.card}`} aria-label="Your profile">
      <div className={styles.heading}>
        <span className={styles.eyebrow}>Your profile</span>
        <div className={styles.actions}>
          <a className={styles.iconButton} href="#home-updates" aria-label={`View ${notificationCount} notifications`}>
            <Bell aria-hidden="true" />
            {notificationCount > 0 && <span className={styles.notificationDot} aria-hidden="true" />}
          </a>
          <button className={styles.iconButton} type="button" aria-label="Profile settings">
            <Settings2 aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className={styles.identity}>
        <div className={styles.avatar}>
          <Image src={avatar} alt="" fill sizes="72px" unoptimized={signedIn} />
        </div>
        <div className={styles.identityText}>
          <h2>{name}</h2>
          <p><Sparkles aria-hidden="true" /><span>{signedIn ? session.user?.email : profile.title}</span></p>
        </div>
      </div>

      <dl className={styles.stats}>
        <div className={styles.stat}>
          <dt><CalendarDays aria-hidden="true" />Days logged in</dt>
          <dd>{signedIn ? "—" : profile.daysLoggedIn.toLocaleString("en-US")}<span>days</span></dd>
        </div>
        <div className={`${styles.stat} ${styles.balance}`}>
          <dt>Coin balance</dt>
          <dd><Image src="/branding/LLCoin.svg" alt="" width={28} height={28} />{signedIn ? "—" : profile.coinBalance.toLocaleString("en-US")}</dd>
        </div>
      </dl>

      <section className={styles.activity} aria-labelledby="recent-coin-usage-title">
        <h3 id="recent-coin-usage-title">Recent coin usage</h3>
        {recentUsage.length > 0 ? (
          <ul className={styles.usageList}>
            {recentUsage.slice(0, 3).map((entry) => (
              <li className={styles.usageRow} key={entry.id}>
                <span className={styles.usageDescription}><ImageIcon aria-hidden="true" />{entry.description}</span>
                <span className={styles.usageWhen}>{entry.when}</span>
                <span className={styles.usageAmount} aria-label={`${entry.coins} coins spent`}>
                  <span aria-hidden="true">−{entry.coins.toLocaleString("en-US")}</span>
                  <Image src="/branding/LLCoin.svg" alt="" width={18} height={18} />
                </span>
              </li>
            ))}
          </ul>
        ) : <p className={styles.empty}>Your recent coin usage will appear here.</p>}
      </section>
    </article>
  );
}
