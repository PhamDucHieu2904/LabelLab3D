"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  Check,
  ChevronRight,
  Clock3,
  Gift,
  Megaphone,
  Sparkles,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import MovingGrid from "./MovingGrid";
import SiteHeader from "./SiteHeader";
import CoinPricing from "./CoinPricing";
import UserProfileCard from "./UserProfileCard";
import { useAuthDialog } from "./AuthDialog";
import HomeModelDemo from "./HomeModelDemo";
import LegalFooter, { type PublicLegalInfo } from "./LegalFooter";
import { useLocale } from "./LocaleProvider";
import { fetchAccountMeCached, fetchCheckInCached, fetchSiteConfigCached } from "@/lib/client/api-cache";
import { FEATURED_MODELS } from "@/lib/labellab/catalog";
import type { CoinRegion } from "@/lib/payments/packages";

const noticeIcons = { pink: Gift, blue: Megaphone, mint: Sparkles } as const;

type LiveAnnouncement = {
  id: string;
  tone: "pink" | "blue" | "mint";
  title: string;
  body: string;
  time: string;
  url: string;
  unread: boolean;
};

type CheckInState = {
  enabled: boolean;
  claimed: boolean;
  schedule: number[];
  streak: number;
  nextDayIndex: number;
  todayReward: number;
};

const DEFAULT_SCHEDULE = [10, 10, 10, 20, 10, 10, 30];

export default function HomePage({ initialLegal }: { initialLegal?: Partial<PublicLegalInfo> }) {
  const { t } = useLocale();
  const [checkIn, setCheckIn] = useState<CheckInState>({
    enabled: true,
    claimed: false,
    schedule: DEFAULT_SCHEDULE,
    streak: 0,
    nextDayIndex: 0,
    todayReward: DEFAULT_SCHEDULE[0],
  });
  const [liveAnnouncements, setLiveAnnouncements] = useState<LiveAnnouncement[] | null>(null);
  const [visitorRegion, setVisitorRegion] = useState<CoinRegion>("vietnam");
  const [checkinBusy, setCheckinBusy] = useState(false);
  const [featuredModel, setFeaturedModel] = useState(FEATURED_MODELS[0]);
  const openAuth = useAuthDialog();

  const defaultAnnouncements = useMemo<LiveAnnouncement[]>(
    () =>
      t.home.defaultUpdates.map((item, idx) => ({
        id: `default-${idx}`,
        tone: item.tone,
        title: item.title,
        body: item.title,
        time: item.time,
        url: "/studio",
        unread: item.unread,
      })),
    [t.home.defaultUpdates],
  );
  const announcements = liveAnnouncements ?? defaultAnnouncements;

  const loadLiveHomeData = useCallback(async () => {
    try {
      const [cfg, me] = await Promise.all([
        fetchSiteConfigCached<{
          announcements?: LiveAnnouncement[];
          checkIn?: { enabled: boolean; schedule: number[]; reward: number };
          visitor?: { region?: CoinRegion };
        }>(),
        fetchAccountMeCached<{ user?: { id?: string } | null }>(),
      ]);
      const signedIn = Boolean(me?.user);
      const checkInRes = signedIn
        ? await fetchCheckInCached<{
            claimed?: boolean;
            streak?: number;
            nextDayIndex?: number;
            todayReward?: number;
            config?: { enabled: boolean; schedule: number[]; reward: number };
          }>()
        : { ok: false, data: null };

      if (cfg) {
        if (Array.isArray(cfg.announcements)) {
          setLiveAnnouncements(cfg.announcements);
        }
        if (cfg.visitor?.region === "international" || cfg.visitor?.region === "vietnam") {
          setVisitorRegion(cfg.visitor.region);
        }
        if (cfg.checkIn && !checkInRes.ok) {
          const schedule = cfg.checkIn.schedule.length > 0 ? cfg.checkIn.schedule : DEFAULT_SCHEDULE;
          setCheckIn((prev) => ({
            ...prev,
            enabled: cfg.checkIn!.enabled,
            claimed: false,
            streak: 0,
            nextDayIndex: 0,
            schedule,
            todayReward: schedule[0] ?? cfg.checkIn!.reward,
          }));
        }
      }
      if (checkInRes.ok && checkInRes.data) {
        const payload = checkInRes.data;
        const schedule = payload.config?.schedule?.length ? payload.config.schedule : DEFAULT_SCHEDULE;
        setCheckIn({
          enabled: payload.config?.enabled ?? true,
          claimed: Boolean(payload.claimed),
          schedule,
          streak: Number(payload.streak ?? 0),
          nextDayIndex: Number(payload.nextDayIndex ?? 0),
          todayReward: Number(payload.todayReward ?? schedule[0] ?? 10),
        });
      }
    } catch {
      // Keep page interactive if live config fetch fails transiently.
    }
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => { void loadLiveHomeData(); });
    const onChanged = () => { void loadLiveHomeData(); };
    window.addEventListener("labellab-account-changed", onChanged);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("labellab-account-changed", onChanged);
    };
  }, [loadLiveHomeData]);

  const claimCheckIn = async () => {
    if (checkinBusy || checkIn.claimed || !checkIn.enabled) return;
    setCheckinBusy(true);
    try {
      const response = await fetch("/api/account/check-in", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (response.status === 401 || response.status === 403) {
        openAuth("login");
        return;
      }
      if (!response.ok) throw new Error("check-in failed");
      const payload = await response.json() as { claimed?: boolean; coins?: number; streak?: number };
      if (payload.claimed) {
        setCheckIn((prev) => ({
          ...prev,
          claimed: true,
          streak: Number(payload.streak ?? prev.streak + 1),
          todayReward: Number(payload.coins ?? prev.todayReward),
        }));
        window.dispatchEvent(new Event("labellab-account-changed"));
      }
    } catch {
      // Keep the UI usable when the account service is unavailable.
    } finally {
      setCheckinBusy(false);
    }
  };

  const baseDayCoins = checkIn.schedule[0] ?? 10;
  const weekItems = checkIn.schedule.slice(0, 7).map((coins, index) => {
    const isBonus = index === 6 || (coins > baseDayCoins && index > 0);
    return {
      day: t.home.dayLabel(index + 1),
      coins,
      reward: isBonus ? `+${coins}` : String(coins),
      icon: isBonus ? "gift" as const : "coin" as const,
    };
  });

  return (
    <main className="home-shell">
      <MovingGrid enabled />
      <div className="home-frame">
        <SiteHeader activePage="home" />

        <div className="home-dashboard">
          <h1 className="sr-only">{t.home.srTitle}</h1>
          <section className="home-card home-showcase" aria-label={t.home.showcaseAria}>
            <div className="home-showcase-visual">
              <div className="home-showcase-topline">
                <span className="home-glass-badge"><Zap size={12} /> {t.home.webOptimized}</span>
              </div>
              <div className="home-hero-halo" aria-hidden="true" />
              <div className="home-orbit-ring home-orbit-ring-one" aria-hidden="true" />
              <div className="home-orbit-ring home-orbit-ring-two" aria-hidden="true" />
              <HomeModelDemo model={featuredModel} />
            </div>
            <div className="home-showcase-bottom">
              <div className="home-scene-row">
                <div>
                  <span className="home-section-eyebrow">{t.home.eyebrow}</span>
                  <h2>{t.home.heroTitle}</h2>
                </div>
                <div className="home-scene-dots" role="group" aria-label={t.home.featuredModelsAria}>
                  {FEATURED_MODELS.map((model) => (
                    <button
                      key={model.id}
                      className={model.id === featuredModel.id ? "is-active" : ""}
                      type="button"
                      aria-label={t.home.showModelDemo(model.name)}
                      aria-pressed={model.id === featuredModel.id}
                      onClick={() => setFeaturedModel(model)}
                    />
                  ))}
                </div>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                <Link className="home-showcase-action home-sheen" href="/studio#workspace">
                  <span>{t.home.startMockup}</span><ArrowRight size={21} />
                </Link>
                <Link
                  href="/studio?domain=packaging#workspace"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 16px",
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.34)",
                    background: "rgba(255,255,255,0.14)",
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 650,
                    textDecoration: "none",
                  }}
                >
                  <span>{t.home.parametricCta}</span>
                  <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          </section>

          <section className="home-center-column" aria-label={t.home.centerColumnAria}>
            <CoinPricing />

            <article className="home-card home-notices-card" id="home-updates">
              <div className="home-card-heading">
                <div>
                  <h2>{t.home.updatesHeading} <span className="home-count-badge">{announcements.length}</span></h2>
                </div>
                <Link className="home-text-action" href="/studio">{t.home.openStudio} <ChevronRight size={14} /></Link>
              </div>
              <div className="home-notice-list">
                {announcements.length > 0 ? announcements.slice(0, 3).map(({ id, tone, title, time, unread, url }) => {
                  const Icon = noticeIcons[tone] ?? Sparkles;
                  const safeHref = url.startsWith("/") ? url : "/studio";
                  return (
                    <Link className={`home-notice ${unread ? "is-unread" : ""}`} href={safeHref} key={id}>
                      <span className={`home-notice-icon ${tone}`}><Icon size={16} /></span>
                      <span className="home-notice-copy"><strong>{title}</strong><small><Clock3 size={11} /> {time}</small></span>
                      {unread && <span className="home-unread-dot" aria-label={t.home.unreadLabel} />}
                      <ChevronRight size={16} className="home-notice-arrow" />
                    </Link>
                  );
                }) : (
                  <p style={{ margin: "10px 0", color: "#8a5c6f", fontSize: 14 }}>{t.home.noAnnouncements}</p>
                )}
              </div>
            </article>

            <article className="home-card home-promo-card">
              <Image src="/home/promo-banner-3d.jpg" alt={t.home.promoAlt} fill loading="eager" sizes="(max-width: 1240px) 70vw, 48vw" />
              <div className="home-promo-overlay" />
              <div className="home-promo-content">
                <span className="home-promo-tag"><Sparkles size={12} /> {t.home.promoTag}</span>
                <h2>{t.home.promoTitle}</h2>
                <p>{visitorRegion === "international" ? t.home.promoDescInternational : t.home.promoDescVietnam}</p>
                <Link href="/studio#workspace" className="home-promo-cta home-sheen">{t.home.promoCta} <ArrowRight size={15} /></Link>
              </div>
              <div className="home-promo-dots" aria-label={t.home.promoDotsAria}><span className="is-active" /><span /><span /></div>
            </article>
          </section>

          <aside className="home-right-column" aria-label={t.home.rightColumnAria}>
            <UserProfileCard notificationCount={announcements.length} visitorRegion={visitorRegion} />

            <article className="home-card home-checkin-card">
              <div className="home-checkin-heading">
                <h2>{t.home.checkinTitle}</h2>
                <p>
                  {!checkIn.enabled
                    ? t.home.checkinPausedDesc
                    : checkIn.streak > 0
                      ? t.home.checkinStreakDesc(checkIn.streak)
                      : t.home.checkinDefaultDesc}
                </p>
              </div>
              <div className="home-week" role="group" aria-label={t.home.checkinGroupAria}>
                {weekItems.map((item, index) => {
                  const isToday = index === checkIn.nextDayIndex;
                  const isCompleted = index < checkIn.nextDayIndex || (isToday && checkIn.claimed);
                  return (
                    <div className={`home-day-wrap ${isToday ? "today" : ""}`} key={`${index}`}>
                      <button
                        className={`home-day ${isToday ? "today" : ""} ${item.icon === "gift" ? "is-bonus" : ""}`}
                        type="button"
                        aria-label={t.home.dayAria(item.day, item.coins, isCompleted)}
                        onClick={() => { if (isToday && !checkIn.claimed && checkIn.enabled) void claimCheckIn(); }}
                      >
                        <span className={`home-day-icon ${item.icon === "gift" ? "is-gift" : ""}`}>
                          {isCompleted ? (
                            <Check size={20} aria-hidden="true" />
                          ) : item.icon === "gift" ? (
                            <Gift size={22} aria-hidden="true" />
                          ) : (
                            <Image src="/branding/LLCoin.svg" alt="" width={28} height={28} />
                          )}
                        </span>
                        <strong className="home-day-reward">{item.reward}</strong>
                      </button>
                      <small>{isToday ? t.home.today : item.day}</small>
                    </div>
                  );
                })}
              </div>
              <button
                className={`home-checkin-cta home-sheen ${checkIn.claimed ? "is-claimed" : ""}`}
                type="button"
                onClick={() => void claimCheckIn()}
                disabled={checkinBusy || !checkIn.enabled}
                aria-live="polite"
              >
                {!checkIn.enabled ? (
                  <>{t.home.checkinPausedCta}</>
                ) : checkIn.claimed ? (
                  <><Check size={18} /> {t.home.checkinClaimedCta(checkIn.todayReward)}</>
                ) : (
                  <><CalendarCheck size={18} /> {t.home.checkinClaimCta(checkIn.todayReward)}</>
                )}
              </button>
            </article>
          </aside>
        </div>

        <LegalFooter initialLegal={initialLegal} />
      </div>
    </main>
  );
}
