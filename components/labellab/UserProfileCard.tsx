"use client";

import Image from "next/image";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { Bell, CalendarDays, ImageIcon, Settings2, Sparkles, Award } from "lucide-react";
import type { UserProfileSummary } from "@/lib/labellab/profile-preview";
import styles from "./UserProfileCard.module.css";

type WalletEntry = { id: string; amount: number; kind: string; reference?: string; balance: number; createdAt: string };
type Badge = { id: string; name: string; description: string; awardedAt: string };
type AccountPayload = { user?: { name?: string; email?: string } | null };
type WalletPayload = { balance?: number; entries?: WalletEntry[]; badges?: Badge[] };
type CheckinPayload = { history?: Array<{ day: string; coins: number }> };
type UserProfileCardProps = {
  profile: UserProfileSummary;
  notificationCount: number;
};

function entryLabel(entry: WalletEntry) {
  if (entry.kind === "daily_checkin") return "Daily check-in";
  if (entry.kind === "purchase") return "Coin purchase";
  if (entry.kind === "render") return "Image render";
  return entry.amount >= 0 ? "Coin reward" : "Coin spend";
}
function relativeTime(value: string) {
  const time = Date.parse(value); if (!Number.isFinite(time)) return "";
  const minutes = Math.max(1, Math.round((Date.now() - time) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60); if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24); return `${days}d ago`;
}

export default function UserProfileCard({ profile, notificationCount }: UserProfileCardProps) {
  const { data: session, status } = useSession();
  const [account, setAccount] = useState<{ name: string; email: string; balance: number; entries: WalletEntry[]; badges: Badge[]; daysLoggedIn: number } | null>(null);
  const loadAccount = () => {
    void Promise.all([
      fetch("/api/account/me", { credentials: "same-origin" }),
      fetch("/api/account/wallet", { credentials: "same-origin" }),
      fetch("/api/account/check-in", { credentials: "same-origin" }),
    ]).then(async ([accountResponse, walletResponse, checkinResponse]) => {
      const accountPayload = accountResponse.ok ? await accountResponse.json() as AccountPayload : { user: null };
      if (!accountPayload.user) { setAccount(null); return; }
      const wallet = walletResponse.ok ? await walletResponse.json() as WalletPayload : {};
      const checkins = checkinResponse.ok ? await checkinResponse.json() as CheckinPayload : {};
      setAccount({ name: accountPayload.user.name || "Your account", email: accountPayload.user.email || "", balance: Number(wallet.balance ?? 0), entries: wallet.entries ?? [], badges: wallet.badges ?? [], daysLoggedIn: checkins.history?.length ?? 0 });
    }).catch(() => setAccount(null));
  };
  useEffect(() => { loadAccount(); window.addEventListener("labellab-account-changed", loadAccount); return () => window.removeEventListener("labellab-account-changed", loadAccount); }, []);
  const signedIn = Boolean(account) || status === "authenticated";
  const name = account?.name || (status === "authenticated" ? (session?.user?.name || session?.user?.email || "Your account") : profile.name);
  const avatar = status === "authenticated" ? (session?.user?.image || profile.avatar) : profile.avatar;
  const recentUsage: WalletEntry[] = account ? account.entries.filter((entry) => entry.amount < 0).slice(0, 3) : [];
  return (
    <article className={`home-card ${styles.card}`} aria-label="Your profile">
      <div className={styles.heading}><span className={styles.eyebrow}>Your profile</span><div className={styles.actions}><a className={styles.iconButton} href="#home-updates" aria-label={`View ${notificationCount} notifications`}><Bell aria-hidden="true" />{notificationCount > 0 && <span className={styles.notificationDot} aria-hidden="true" />}</a><button className={styles.iconButton} type="button" aria-label="Profile settings"><Settings2 aria-hidden="true" /></button></div></div>
      <div className={styles.identity}><div className={styles.avatar}><Image src={avatar} alt="" fill sizes="72px" unoptimized={signedIn} /></div><div className={styles.identityText}><h2>{name}</h2><p><Sparkles aria-hidden="true" /><span>{account?.email || (status === "authenticated" ? session?.user?.email : profile.title)}</span></p></div></div>
      <dl className={styles.stats}><div className={styles.stat}><dt><CalendarDays aria-hidden="true" />Days logged in</dt><dd>{(account?.daysLoggedIn ?? profile.daysLoggedIn).toLocaleString("en-US")}<span>days</span></dd></div><div className={`${styles.stat} ${styles.balance}`}><dt>Coin balance</dt><dd><Image src="/branding/LLCoin.svg" alt="" width={28} height={28} />{(account?.balance ?? profile.coinBalance).toLocaleString("en-US")}</dd></div></dl>
      {account?.badges && account.badges.length > 0 && <section className={styles.badges} aria-label="Badges"><h3><Award aria-hidden="true" />Badges</h3><div className={styles.badgeList}>{account.badges.slice(0, 3).map((badge) => <span key={badge.id} title={badge.description}>{badge.name}</span>)}</div></section>}
      <section className={styles.activity} aria-labelledby="recent-coin-usage-title"><h3 id="recent-coin-usage-title">Recent coin activity</h3>{recentUsage.length > 0 ? <ul className={styles.usageList}>{recentUsage.map((entry) => <li className={styles.usageRow} key={entry.id}><span className={styles.usageDescription}><ImageIcon aria-hidden="true" />{entryLabel(entry)}</span><span className={styles.usageWhen}>{relativeTime(entry.createdAt)}</span><span className={`${styles.usageAmount} ${entry.amount > 0 ? styles.positive : ""}`} aria-label={`${entry.amount} coins`}><span aria-hidden="true">{entry.amount > 0 ? "+" : "−"}{Math.abs(entry.amount).toLocaleString("en-US")}</span><Image src="/branding/LLCoin.svg" alt="" width={18} height={18} /></span></li>)}</ul> : <p className={styles.empty}>Your recent coin activity will appear here.</p>}</section>
    </article>
  );
}


