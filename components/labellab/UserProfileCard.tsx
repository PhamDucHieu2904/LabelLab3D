"use client";

import Image from "next/image";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { Award, Bell, CalendarDays, Coins, ImageIcon, LogIn, Settings2, Sparkles, UserPlus, UserRound } from "lucide-react";
import type { UserProfileSummary } from "@/lib/labellab/profile-preview";
import { useAuthDialog } from "./AuthDialog";
import styles from "./UserProfileCard.module.css";

type WalletEntry = { id: string; amount: number; kind: string; reference?: string; balance: number; createdAt: string };
type Badge = { id: string; name: string; description: string; awardedAt: string };
type AccountPayload = { user?: { name?: string; email?: string; avatarUrl?: string | null } | null };
type WalletPayload = { balance?: number; entries?: WalletEntry[]; badges?: Badge[] };
type CheckinPayload = { history?: Array<{ day: string; coins: number }>; completedCount?: number };
type UserProfileCardProps = {
  profile: UserProfileSummary;
  notificationCount: number;
};

function entryLabel(entry: WalletEntry) {
  if (entry.kind === "daily_checkin") return "Daily check-in";
  if (entry.kind === "purchase") return "Coin purchase";
  if (entry.kind === "admin_adjustment") return "Admin adjustment";
  if (entry.kind === "refund") return "Refund";
  if (entry.kind === "render" || entry.kind === "reservation") return "Image render";
  if (entry.kind === "reservation_release") return "Render refund";
  return entry.amount >= 0 ? "Coin reward" : "Coin spend";
}

function relativeTime(value: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "";
  const minutes = Math.max(1, Math.round((Date.now() - time) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function initialsFrom(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "LL";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export default function UserProfileCard({ profile, notificationCount }: UserProfileCardProps) {
  void profile;
  const openAuth = useAuthDialog();
  const { data: session, status } = useSession();
  const [account, setAccount] = useState<{
    name: string;
    email: string;
    avatarUrl?: string | null;
    balance: number;
    entries: WalletEntry[];
    badges: Badge[];
    daysLoggedIn: number;
  } | null>(null);

  useEffect(() => {
    let active = true;
    const loadAccount = async () => {
      try {
        const accountResponse = await fetch("/api/account/me", { credentials: "same-origin", cache: "no-store" });
        const accountPayload = accountResponse.ok ? await accountResponse.json() as AccountPayload : { user: null };
        if (!active) return;
        if (!accountPayload.user) {
          setAccount(null);
          return;
        }
        const [walletResponse, checkinResponse] = await Promise.all([
          fetch("/api/account/wallet", { credentials: "same-origin", cache: "no-store" }),
          fetch("/api/account/check-in", { credentials: "same-origin", cache: "no-store" }),
        ]);
        if (!active) return;
        const wallet = walletResponse.ok ? await walletResponse.json() as WalletPayload : {};
        const checkins = checkinResponse.ok ? await checkinResponse.json() as CheckinPayload : {};
        setAccount({
          name: accountPayload.user.name || "Your account",
          email: accountPayload.user.email || "",
          avatarUrl: accountPayload.user.avatarUrl ?? null,
          balance: Number(wallet.balance ?? 0),
          entries: wallet.entries ?? [],
          badges: wallet.badges ?? [],
          daysLoggedIn: Number(checkins.completedCount ?? checkins.history?.length ?? 0),
        });
      } catch {
        if (active) setAccount(null);
      }
    };
    const onChanged = () => { void loadAccount(); };
    void loadAccount();
    window.addEventListener("labellab-account-changed", onChanged);
    return () => {
      active = false;
      window.removeEventListener("labellab-account-changed", onChanged);
    };
  }, []);

  const signedIn = Boolean(account) || status === "authenticated";
  const displayName = account?.name || (status === "authenticated" ? (session?.user?.name || session?.user?.email || "Your account") : "Guest account");
  const displaySubtitle = account?.email || (status === "authenticated" ? (session?.user?.email || "Signed in") : "Sign in to sync coins & rewards");
  const avatarUrl = account?.avatarUrl || (status === "authenticated" ? (session?.user?.image || null) : null);
  const recentActivity: WalletEntry[] = account ? account.entries.slice(0, 3) : [];

  return (
    <article className={`home-card ${styles.card}`} aria-label="Your profile">
      <div className={styles.heading}>
        <span className={styles.eyebrow}>Your profile</span>
        <div className={styles.actions}>
          <a className={styles.iconButton} href="#home-updates" aria-label={`View ${notificationCount} notifications`}>
            <Bell aria-hidden="true" />
            {notificationCount > 0 && <span className={styles.notificationDot} aria-hidden="true" />}
          </a>
          <button
            className={styles.iconButton}
            type="button"
            aria-label={signedIn ? "Account details" : "Sign in"}
            onClick={() => { if (!signedIn) openAuth("login"); }}
          >
            <Settings2 aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className={styles.identity}>
        <div className={`${styles.avatar} ${!signedIn ? styles.guestAvatar : styles.initialsAvatar}`}>
          {avatarUrl ? (
            <Image src={avatarUrl} alt="" fill sizes="72px" unoptimized />
          ) : signedIn ? (
            <span>{initialsFrom(displayName)}</span>
          ) : (
            <UserRound size={30} strokeWidth={1.8} aria-hidden="true" />
          )}
        </div>
        <div className={styles.identityText}>
          <h2>{displayName}</h2>
          <p>
            <Sparkles aria-hidden="true" />
            <span>{displaySubtitle}</span>
          </p>
        </div>
      </div>

      {signedIn ? (
        <>
          <dl className={styles.stats}>
            <div className={styles.stat}>
              <dt><CalendarDays aria-hidden="true" />Days checked in</dt>
              <dd>{(account?.daysLoggedIn ?? 0).toLocaleString("en-US")}<span>days</span></dd>
            </div>
            <div className={`${styles.stat} ${styles.balance}`}>
              <dt>Coin balance</dt>
              <dd>
                <Image src="/branding/LLCoin.svg" alt="" width={28} height={28} />
                {(account?.balance ?? 0).toLocaleString("en-US")}
              </dd>
            </div>
          </dl>
          {account?.badges && account.badges.length > 0 && (
            <section className={styles.badges} aria-label="Badges">
              <h3><Award aria-hidden="true" />Badges</h3>
              <div className={styles.badgeList}>
                {account.badges.slice(0, 3).map((badge) => (
                  <span key={badge.id} title={badge.description}>{badge.name}</span>
                ))}
              </div>
            </section>
          )}
          <section className={styles.activity} aria-labelledby="recent-coin-usage-title">
            <h3 id="recent-coin-usage-title">Recent coin activity</h3>
            {recentActivity.length > 0 ? (
              <ul className={styles.usageList}>
                {recentActivity.map((entry) => (
                  <li className={styles.usageRow} key={entry.id}>
                    <span className={styles.usageDescription}>
                      {entry.amount >= 0 ? <Coins aria-hidden="true" /> : <ImageIcon aria-hidden="true" />}
                      {entryLabel(entry)}
                    </span>
                    <span className={styles.usageWhen}>{relativeTime(entry.createdAt)}</span>
                    <span className={`${styles.usageAmount} ${entry.amount > 0 ? styles.positive : ""}`} aria-label={`${entry.amount} coins`}>
                      <span aria-hidden="true">{entry.amount > 0 ? "+" : "−"}{Math.abs(entry.amount).toLocaleString("en-US")}</span>
                      <Image src="/branding/LLCoin.svg" alt="" width={18} height={18} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.empty}>Your recent coin activity will appear here.</p>
            )}
          </section>
        </>
      ) : (
        <>
          <dl className={styles.stats}>
            <div className={styles.stat}>
              <dt><CalendarDays aria-hidden="true" />Days checked in</dt>
              <dd className={styles.guestMetric}>—<span>Sign in</span></dd>
            </div>
            <div className={`${styles.stat} ${styles.balance}`}>
              <dt>Coin balance</dt>
              <dd className={styles.guestMetric}>
                <Image src="/branding/LLCoin.svg" alt="" width={24} height={24} />
                —
              </dd>
            </div>
          </dl>
          <section className={styles.guestPrompt} aria-label="Sign in to your account">
            <p>Sign in to claim daily coins, top up via VietQR, and sync your 3D studio balance.</p>
            <div className={styles.guestActions}>
              <button type="button" className={styles.guestLoginBtn} onClick={() => openAuth("login")}>
                <LogIn size={15} aria-hidden="true" />
                <span>Login</span>
              </button>
              <button type="button" className={styles.guestRegisterBtn} onClick={() => openAuth("register")}>
                <UserPlus size={15} aria-hidden="true" />
                <span>Create account</span>
              </button>
            </div>
          </section>
        </>
      )}
    </article>
  );
}
