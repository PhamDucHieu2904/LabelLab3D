"use client";

import Image from "next/image";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { Award, CalendarDays, Coins, Download, ImageIcon, LogIn, Mail, Ruler, UserPlus, UserRound } from "lucide-react";
import { numberLocale } from "@/lib/i18n/locale";
import type { UiMessages } from "@/lib/i18n/messages";
import type { CoinRegion } from "@/lib/payments/packages";
import { fetchAccountMeCached, fetchCheckInCached } from "@/lib/client/api-cache";
import { useAuthDialog } from "./AuthDialog";
import { useLocale } from "./LocaleProvider";
import styles from "./UserProfileCard.module.css";

type WalletEntry = { id: string; amount: number; kind: string; reference?: string; balance: number; createdAt: string };
type Badge = { id: string; slug?: string; name: string; description: string; awardedAt: string };
type AccountPayload = { user?: { name?: string; email?: string; avatarUrl?: string | null } | null };
type WalletPayload = { balance?: number; entries?: WalletEntry[]; badges?: Badge[] };
type CheckinPayload = { history?: Array<{ day: string; coins: number }>; completedCount?: number };
type UserProfileCardProps = {
  visitorRegion?: CoinRegion;
};

function entryLabel(entry: WalletEntry, pr: UiMessages["profile"]) {
  if (entry.kind === "welcome_bonus") return pr.entryWelcome;
  if (entry.kind === "promo_bonus") return pr.entryLaunchPromo;
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

function resolveDisplayBadge(badges: Badge[] | undefined, fallback: string): string {
  const notable = (badges ?? []).find(
    (b) => b.slug !== "first-checkin" && b.id !== "badge-first-checkin" && b.name.toLowerCase() !== "first check-in",
  );
  return notable?.name || fallback;
}

export default function UserProfileCard({
  visitorRegion = "vietnam",
}: UserProfileCardProps) {
  const { locale, t } = useLocale();
  const pr = t.profile;
  const numLocale = numberLocale(locale);
  const openAuth = useAuthDialog();
  const { data: session, status } = useSession();
  const [exporting, setExporting] = useState(false);
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

  async function downloadStatement() {
    if (exporting) return;
    setExporting(true);
    try {
      const response = await fetch(`/api/account/wallet/statement?lang=${locale}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) return;
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const today = new Date().toISOString().slice(0, 10);
      const fallbackName =
        locale === "vi"
          ? `hypermockup-sao-ke-coin-${today}.csv`
          : `hypermockup-coin-statement-${today}.csv`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = match?.[1] || fallbackName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      // Keep UI usable if download fails transiently.
    } finally {
      setExporting(false);
    }
  }

  const signedIn = Boolean(account) || status === "authenticated";
  const displayName = account?.name || (signedIn ? (session?.user?.name || session?.user?.email || pr.yourAccount) : pr.guestAccount);
  const displaySubtitle = account?.email || (signedIn ? (session?.user?.email || pr.signedIn) : pr.guestSubtitle);
  const avatarUrl = account?.avatarUrl || (status === "authenticated" ? (session?.user?.image || null) : null);
  const recentActivity: WalletEntry[] = account ? account.entries.slice(0, 5) : [];
  const badgeTitle = resolveDisplayBadge(account?.badges, pr.defaultBadge);

  return (
    <article className={`home-card ${styles.card}`} aria-label={pr.ariaLabel}>
      <div className={styles.heading}>
        <span className={styles.eyebrow}>{pr.eyebrow}</span>
        {signedIn && (
          <span className={styles.badgePill} title={`${pr.badges}: ${badgeTitle}`} aria-label={`${pr.badges}: ${badgeTitle}`}>
            <Award aria-hidden="true" />
            <span>{badgeTitle}</span>
          </span>
        )}
      </div>

      <div className={styles.identity}>
        <div className={`${styles.avatar} ${!signedIn ? styles.guestAvatar : styles.initialsAvatar}`}>
          {avatarUrl ? (
            <Image src={avatarUrl} alt="" fill sizes="56px" unoptimized />
          ) : signedIn ? (
            <span>{initialsFrom(displayName)}</span>
          ) : (
            <UserRound size={24} strokeWidth={1.8} aria-hidden="true" />
          )}
        </div>
        <div className={styles.identityText}>
          <h2>{displayName}</h2>
          <p title={displaySubtitle}>
            <Mail aria-hidden="true" />
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
                <Image src="/branding/hypermockup-coin.svg" alt="" width={22} height={22} />
                {(account?.balance ?? 0).toLocaleString(numLocale)}
              </dd>
            </div>
          </dl>

          <section className={styles.activity} aria-labelledby="recent-coin-usage-title">
            <div className={styles.activityHeader}>
              <h3 id="recent-coin-usage-title">{pr.recentActivity}</h3>
              <button
                type="button"
                className={styles.statementBtn}
                onClick={() => void downloadStatement()}
                disabled={exporting}
                aria-label={pr.downloadStatementAria}
                title={pr.downloadStatementAria}
              >
                <Download aria-hidden="true" />
                <span>{exporting ? pr.downloadingStatement : pr.downloadStatement}</span>
              </button>
            </div>
            {recentActivity.length > 0 ? (
              <ul className={styles.usageList}>
                {recentActivity.map((entry) => {
                  const isPositive = entry.amount > 0;
                  const isDieline = entry.reference?.startsWith("dieline:");
                  return (
                    <li className={styles.usageRow} key={entry.id}>
                      <span className={`${styles.usageIcon} ${isPositive ? styles.usageIconPositive : styles.usageIconSpend}`} aria-hidden="true">
                        {isPositive ? <Coins /> : isDieline ? <Ruler /> : <ImageIcon />}
                      </span>
                      <span className={styles.usageInfo}>
                        <span className={styles.usageDescription}>{entryLabel(entry, pr)}</span>
                        <span className={styles.usageWhen}>{relativeTime(entry.createdAt, pr)}</span>
                      </span>
                      <span className={`${styles.usageAmount} ${isPositive ? styles.positive : ""}`} aria-label={pr.coinsAria(entry.amount)}>
                        <span aria-hidden="true">{isPositive ? "+" : "−"}{Math.abs(entry.amount).toLocaleString(numLocale)}</span>
                        <Image src="/branding/hypermockup-coin.svg" alt="" width={15} height={15} />
                      </span>
                    </li>
                  );
                })}
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
                <Image src="/branding/hypermockup-coin.svg" alt="" width={22} height={22} />
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
