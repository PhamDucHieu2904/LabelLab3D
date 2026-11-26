"use client";

import Image from "next/image";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { Award, Bell, CalendarDays, Coins, ImageIcon, LogIn, Settings2, Sparkles, UserPlus, UserRound } from "lucide-react";
import { numberLocale } from "@/lib/i18n/locale";
import type { UiMessages } from "@/lib/i18n/messages";
import type { CoinRegion } from "@/lib/payments/packages";
import { fetchAccountMeCached, fetchCheckInCached } from "@/lib/client/api-cache";
import { useAuthDialog } from "./AuthDialog";
import { useLocale } from "./LocaleProvider";
import styles from "./UserProfileCard.module.css";

type WalletEntry = { id: string; amount: number; kind: string; reference?: string; balance: number; createdAt: string };
type Badge = { id: string; name: string; description: string; awardedAt: string };
type AccountPayload = { user?: { name?: string; email?: string; avatarUrl?: string | null } | null };
type WalletPayload = { balance?: number; entries?: WalletEntry[]; badges?: Badge[] };
type CheckinPayload = { history?: Array<{ day: string; coins: number }>; completedCount?: number };
type UserProfileCardProps = {
  notificationCount: number;
  visitorRegion?: CoinRegion;
};

function entryLabel(entry: WalletEntry, pr: UiMessages["profile"]) {
  if (entry.kind === "welcome_bonus") return pr.entryWelcome;
  if (entry.kind === "daily_checkin") return pr.entryCheckin;
  if (entry.kind === "purchase") return pr.entryPurchase;
  if (entry.kind === "admin_adjustment") return pr.entryAdmin;
  if (entry.kind === "refund") return pr.entryRefund;
  if (entry.kind === "render" || entry.kind === "reservation") {
    return entry.reference?.startsWith("dieline:") ? pr.entryDieline : pr.entryRender;
  }
  if (entry.kind === "reservation_release") {
    return entry.reference?.startsWith("dieline:") ? pr.entryDielineRefund : pr.entryRenderRefund;
  }
  return entry.amount >= 0 ? pr.entryReward : pr.entrySpend;
}

function relativeTime(value: string, pr: UiMessages["profile"]) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "";
  const minutes = Math.max(1, Math.round((Date.now() - time) / 60000));
  if (minutes < 60) return pr.minutesAgo(minutes);
  const hours = Math.round(minutes / 60);
  if (hours < 24) return pr.hoursAgo(hours);
  const days = Math.round(hours / 24);
  return pr.daysAgo(days);
}

function initialsFrom(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "HM";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export default function UserProfileCard({
  notificationCount,
  visitorRegion = "vietnam",
}: UserProfileCardProps) {
  const { locale, t } = useLocale();
  const pr = t.profile;
  const numLocale = numberLocale(locale);
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
        const accountPayload = (await fetchAccountMeCached<AccountPayload>()) ?? { user: null };
        if (!active) return;
        if (!accountPayload.user) {
          setAccount(null);
          return;
        }
        const [walletResponse, checkinResult] = await Promise.all([
          fetch("/api/account/wallet", { credentials: "same-origin", cache: "no-store" }),
          fetchCheckInCached<CheckinPayload>(),
        ]);
        if (!active) return;
        const wallet = walletResponse.ok ? await walletResponse.json() as WalletPayload : {};
        const checkins = checkinResult.ok && checkinResult.data ? checkinResult.data : {};
        setAccount({
          name: accountPayload.user.name || "",
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
  const displayName = account?.name || (signedIn ? (session?.user?.name || session?.user?.email || pr.yourAccount) : pr.guestAccount);
  const displaySubtitle = account?.email || (signedIn ? (session?.user?.email || pr.signedIn) : pr.guestSubtitle);
  const avatarUrl = account?.avatarUrl || (status === "authenticated" ? (session?.user?.image || null) : null);
  const recentActivity: WalletEntry[] = account ? account.entries.slice(0, 3) : [];

  return (
    <article className={`home-card ${styles.card}`} aria-label={pr.ariaLabel}>
      <div className={styles.heading}>
        <span className={styles.eyebrow}>{pr.eyebrow}</span>
        <div className={styles.actions}>
          <a className={styles.iconButton} href="#home-updates" aria-label={pr.viewNotificationsAria(notificationCount)}>
            <Bell aria-hidden="true" />
            {notificationCount > 0 && <span className={styles.notificationDot} aria-hidden="true" />}
          </a>
          <button
            className={styles.iconButton}
            type="button"
            aria-label={signedIn ? pr.accountDetailsAria : pr.signInAria}
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
              <dt><CalendarDays aria-hidden="true" />{pr.daysCheckedIn}</dt>
              <dd>{(account?.daysLoggedIn ?? 0).toLocaleString(numLocale)}<span>{pr.daysUnit}</span></dd>
            </div>
            <div className={`${styles.stat} ${styles.balance}`}>
              <dt>{pr.coinBalance}</dt>
              <dd>
                <Image src="/branding/LLCoin.svg" alt="" width={28} height={28} />
                {(account?.balance ?? 0).toLocaleString(numLocale)}
              </dd>
            </div>
          </dl>
          {account?.badges && account.badges.length > 0 && (
            <section className={styles.badges} aria-label={pr.badges}>
              <h3><Award aria-hidden="true" />{pr.badges}</h3>
              <div className={styles.badgeList}>
                {account.badges.slice(0, 3).map((badge) => (
                  <span key={badge.id} title={badge.description}>{badge.name}</span>
                ))}
              </div>
            </section>
          )}
          <section className={styles.activity} aria-labelledby="recent-coin-usage-title">
            <h3 id="recent-coin-usage-title">{pr.recentActivity}</h3>
            {recentActivity.length > 0 ? (
              <ul className={styles.usageList}>
                {recentActivity.map((entry) => (
                  <li className={styles.usageRow} key={entry.id}>
                    <span className={styles.usageDescription}>
                      {entry.amount >= 0 ? <Coins aria-hidden="true" /> : <ImageIcon aria-hidden="true" />}
                      {entryLabel(entry, pr)}
                    </span>
                    <span className={styles.usageWhen}>{relativeTime(entry.createdAt, pr)}</span>
                    <span className={`${styles.usageAmount} ${entry.amount > 0 ? styles.positive : ""}`} aria-label={pr.coinsAria(entry.amount)}>
                      <span aria-hidden="true">{entry.amount > 0 ? "+" : "−"}{Math.abs(entry.amount).toLocaleString(numLocale)}</span>
                      <Image src="/branding/LLCoin.svg" alt="" width={18} height={18} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.empty}>{pr.emptyActivity}</p>
            )}
          </section>
        </>
      ) : (
        <>
          <dl className={styles.stats}>
            <div className={styles.stat}>
              <dt><CalendarDays aria-hidden="true" />{pr.daysCheckedIn}</dt>
              <dd className={styles.guestMetric}>—<span>{pr.signInShort}</span></dd>
            </div>
            <div className={`${styles.stat} ${styles.balance}`}>
              <dt>{pr.coinBalance}</dt>
              <dd className={styles.guestMetric}>
                <Image src="/branding/LLCoin.svg" alt="" width={24} height={24} />
                —
              </dd>
            </div>
          </dl>
          <section className={styles.guestPrompt} aria-label={pr.guestPromptAria}>
            <p>{visitorRegion === "international" ? pr.guestPromptInternational : pr.guestPromptVietnam}</p>
            <div className={styles.guestActions}>
              <button type="button" className={styles.guestLoginBtn} onClick={() => openAuth("login")}>
                <LogIn size={15} aria-hidden="true" />
                <span>{pr.login}</span>
              </button>
              <button type="button" className={styles.guestRegisterBtn} onClick={() => openAuth("register")}>
                <UserPlus size={15} aria-hidden="true" />
                <span>{pr.createAccount}</span>
              </button>
            </div>
          </section>
        </>
      )}
    </article>
  );
}
