"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Gift,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import MovingGrid from "./MovingGrid";
import SiteHeader from "./SiteHeader";
import CoinPricing from "./CoinPricing";
import UserProfileCard from "./UserProfileCard";
import { useAuthDialog } from "./AuthDialog";
import HomeHeroShowcase from "./HomeHeroShowcase";
import HomeFeedbackCard from "./HomeFeedbackCard";
import SystemUpdatesCard from "./SystemUpdatesCard";
import LegalFooter, { type PublicLegalInfo } from "./LegalFooter";
import { useLocale } from "./LocaleProvider";
import { fetchAccountMeCached, fetchCheckInCached, fetchSiteConfigCached } from "@/lib/client/api-cache";
import {
  DEFAULT_PUBLIC_ANNOUNCEMENTS,
  useAnnouncementReadState,
  type PublicAnnouncement,
} from "@/lib/client/announcements";
import type { CoinRegion } from "@/lib/payments/packages";

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
  const [liveAnnouncements, setLiveAnnouncements] = useState<PublicAnnouncement[] | null>(null);
  const [visitorRegion, setVisitorRegion] = useState<CoinRegion>("vietnam");
  const [currentUser, setCurrentUser] = useState<{ name: string; email: string } | null>(null);
  const [checkinBusy, setCheckinBusy] = useState(false);
  const openAuth = useAuthDialog();

  const announcements = liveAnnouncements ?? DEFAULT_PUBLIC_ANNOUNCEMENTS;
  const { unreadCount, isUnread, markRead, markAllRead } = useAnnouncementReadState(announcements);

  const loadLiveHomeData = useCallback(async () => {
    try {
      const [cfg, me] = await Promise.all([
        fetchSiteConfigCached<{
          announcements?: PublicAnnouncement[];
          checkIn?: { enabled: boolean; schedule: number[]; reward: number };
          visitor?: { region?: CoinRegion };
        }>(),
        fetchAccountMeCached<{ user?: { id?: string; name?: string; email?: string } | null }>(),
      ]);
      const signedIn = Boolean(me?.user);
      setCurrentUser(
        me?.user
          ? { name: me.user.name || "", email: me.user.email || "" }
          : null,
      );
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
          <HomeHeroShowcase />

          <section className="home-center-column" aria-label={t.home.centerColumnAria}>
            <CoinPricing />

            <SystemUpdatesCard
              announcements={announcements}
              unreadCount={unreadCount}
              isUnread={isUnread}
              onMarkRead={markRead}
              onMarkAllRead={markAllRead}
            />

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
            <UserProfileCard visitorRegion={visitorRegion} />

            <article className="home-card home-checkin-card" id="home-checkin">
              <div className="home-checkin-heading">
                <div className="home-checkin-title-row">
                  <h2>{t.home.checkinTitle}</h2>
                  <span
                    className={`home-checkin-status ${!checkIn.enabled ? "is-paused" : checkIn.claimed ? "is-claimed" : "is-ready"}`}
                    aria-live="polite"
                  >
                    {!checkIn.enabled ? (
                      t.home.checkinPausedBadge
                    ) : checkIn.claimed ? (
                      <><Check size={12} aria-hidden="true" /> {t.home.checkinClaimedBadge(checkIn.todayReward)}</>
                    ) : (
                      t.home.checkinTapTodayBadge(checkIn.todayReward)
                    )}
                  </span>
                </div>
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
                  const isClaimable = isToday && !checkIn.claimed && checkIn.enabled && !checkinBusy;
                  return (
                    <div className={`home-day-wrap ${isToday ? "today" : ""} ${isCompleted ? "claimed" : ""}`} key={`${index}`}>
                      <button
                        className={`home-day ${isToday ? "today" : ""} ${isCompleted ? "claimed" : ""} ${isClaimable ? "is-claimable" : ""} ${item.icon === "gift" ? "is-bonus" : ""}`}
                        type="button"
                        aria-label={t.home.dayAria(item.day, item.coins, isCompleted)}
                        title={isClaimable ? t.home.checkinClaimCta(item.coins) : undefined}
                        onClick={() => { if (isClaimable) void claimCheckIn(); }}
                      >
                        <span className={`home-day-icon ${item.icon === "gift" ? "is-gift" : ""}`}>
                          {isCompleted ? (
                            <Check size={20} aria-hidden="true" />
                          ) : item.icon === "gift" ? (
                            <Gift size={22} aria-hidden="true" />
                          ) : (
                            <Image src="/branding/hypermockup-coin.svg" alt="" width={28} height={28} />
                          )}
                        </span>
                        <strong className="home-day-reward">{item.reward}</strong>
                      </button>
                      <small>{isToday ? t.home.today : item.day}</small>
                    </div>
                  );
                })}
              </div>
            </article>

            <HomeFeedbackCard user={currentUser} />
          </aside>
        </div>

        <LegalFooter initialLegal={initialLegal} />
      </div>
    </main>
  );
}
