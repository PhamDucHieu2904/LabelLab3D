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
import { useCallback, useEffect, useState } from "react";
import MovingGrid from "./MovingGrid";
import SiteHeader from "./SiteHeader";
import CoinPricing from "./CoinPricing";
import UserProfileCard from "./UserProfileCard";
import { useAuthDialog } from "./AuthDialog";
import HomeModelDemo from "./HomeModelDemo";
import { FEATURED_MODELS } from "@/lib/labellab/catalog";
import { LABELLAB_UPDATES } from "@/lib/labellab/updates";
import { PROFILE_PREVIEW } from "@/lib/labellab/profile-preview";

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

const DEFAULT_ANNOUNCEMENTS: LiveAnnouncement[] = LABELLAB_UPDATES.map((item, idx) => ({
  id: `default-${idx}`,
  tone: item.tone,
  title: item.title,
  body: item.title,
  time: item.time,
  url: "/studio",
  unread: item.unread,
}));

export default function HomePage() {
  const [checkIn, setCheckIn] = useState<CheckInState>({
    enabled: true,
    claimed: false,
    schedule: DEFAULT_SCHEDULE,
    streak: 0,
    nextDayIndex: 0,
    todayReward: DEFAULT_SCHEDULE[0],
  });
  const [announcements, setAnnouncements] = useState<LiveAnnouncement[]>(DEFAULT_ANNOUNCEMENTS);
  const [checkinBusy, setCheckinBusy] = useState(false);
  const [featuredModel, setFeaturedModel] = useState(FEATURED_MODELS[0]);
  const openAuth = useAuthDialog();

  const loadLiveHomeData = useCallback(async () => {
    try {
      const [configRes, checkInRes] = await Promise.all([
        fetch("/api/site/config", { cache: "no-store" }),
        fetch("/api/account/check-in", { credentials: "same-origin", cache: "no-store" }),
      ]);
      if (configRes.ok) {
        const cfg = await configRes.json() as {
          announcements?: LiveAnnouncement[];
          checkIn?: { enabled: boolean; schedule: number[]; reward: number };
        };
        if (Array.isArray(cfg.announcements)) {
          setAnnouncements(cfg.announcements);
        }
        if (cfg.checkIn && !checkInRes.ok) {
          const schedule = cfg.checkIn.schedule.length > 0 ? cfg.checkIn.schedule : DEFAULT_SCHEDULE;
          setCheckIn((prev) => ({
            ...prev,
            enabled: cfg.checkIn!.enabled,
            schedule,
            todayReward: schedule[0] ?? cfg.checkIn!.reward,
          }));
        }
      }
      if (checkInRes.ok) {
        const payload = await checkInRes.json() as {
          claimed?: boolean;
          streak?: number;
          nextDayIndex?: number;
          todayReward?: number;
          config?: { enabled: boolean; schedule: number[]; reward: number };
        };
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
      day: `Day ${index + 1}`,
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
          <h1 className="sr-only">HyperMockup 3D packaging mockup dashboard</h1>
          <section className="home-card home-showcase" aria-label="Featured 3D mockup">
            <div className="home-showcase-visual">
              <div className="home-showcase-topline">
                <span className="home-glass-badge"><Zap size={12} /> Web optimized</span>
              </div>
              <div className="home-hero-halo" aria-hidden="true" />
              <div className="home-orbit-ring home-orbit-ring-one" aria-hidden="true" />
              <div className="home-orbit-ring home-orbit-ring-two" aria-hidden="true" />
              <HomeModelDemo model={featuredModel} />
            </div>
            <div className="home-showcase-bottom">
              <div className="home-scene-row">
                <div>
                  <span className="home-section-eyebrow">Make it real</span>
                  <h2>Bring your next label to life.</h2>
                </div>
                <div className="home-scene-dots" role="group" aria-label="Featured mockup models">
                  {FEATURED_MODELS.map((model) => (
                    <button
                      key={model.id}
                      className={model.id === featuredModel.id ? "is-active" : ""}
                      type="button"
                      aria-label={`Show ${model.name} 3D demo`}
                      aria-pressed={model.id === featuredModel.id}
                      onClick={() => setFeaturedModel(model)}
                    />
                  ))}
                </div>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                <Link className="home-showcase-action home-sheen" href="/studio#workspace">
                  <span>Start a new mockup</span><ArrowRight size={21} />
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
                  <span>Parametric Boxes &amp; Trays (mm CAD)</span>
                  <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          </section>

          <section className="home-center-column" aria-label="Coin packages and updates">
            <CoinPricing />

            <article className="home-card home-notices-card" id="home-updates">
              <div className="home-card-heading">
                <div>
                  <h2>Admin updates <span className="home-count-badge">{announcements.length}</span></h2>
                </div>
                <Link className="home-text-action" href="/studio">Open Studio <ChevronRight size={14} /></Link>
              </div>
              <div className="home-notice-list">
                {announcements.length > 0 ? announcements.slice(0, 3).map(({ id, tone, title, time, unread, url }) => {
                  const Icon = noticeIcons[tone] ?? Sparkles;
                  const safeHref = url.startsWith("/") ? url : "/studio";
                  return (
                    <Link className={`home-notice ${unread ? "is-unread" : ""}`} href={safeHref} key={id}>
                      <span className={`home-notice-icon ${tone}`}><Icon size={16} /></span>
                      <span className="home-notice-copy"><strong>{title}</strong><small><Clock3 size={11} /> {time}</small></span>
                      {unread && <span className="home-unread-dot" aria-label="Unread" />}
                      <ChevronRight size={16} className="home-notice-arrow" />
                    </Link>
                  );
                }) : (
                  <p style={{ margin: "10px 0", color: "#8a5c6f", fontSize: 14 }}>No announcements right now.</p>
                )}
              </div>
            </article>

            <article className="home-card home-promo-card">
              <Image src="/home/promo-banner-3d.jpg" alt="Colorful 3D packaging mockups" fill loading="eager" sizes="(max-width: 1240px) 70vw, 48vw" />
              <div className="home-promo-overlay" />
              <div className="home-promo-content">
                <span className="home-promo-tag"><Sparkles size={12} /> Studio 3D</span>
                <h2>Render more. Pay less.</h2>
                <p>Instant VietQR coin top-up with automatic credit confirmation.</p>
                <Link href="/studio#workspace" className="home-promo-cta home-sheen">Open Studio <ArrowRight size={15} /></Link>
              </div>
              <div className="home-promo-dots" aria-label="Promotion slides"><span className="is-active" /><span /><span /></div>
            </article>
          </section>

          <aside className="home-right-column" aria-label="Account and daily rewards">
            <UserProfileCard profile={PROFILE_PREVIEW} notificationCount={announcements.length} />

            <article className="home-card home-checkin-card">
              <div className="home-checkin-heading">
                <h2>Daily check-in</h2>
                <p>
                  {!checkIn.enabled
                    ? "Daily check-in is temporarily paused"
                    : checkIn.streak > 0
                      ? `${checkIn.streak}-day streak · Missing a day resets to Day 1`
                      : "Check in daily — missing a day resets to Day 1"}
                </p>
              </div>
              <div className="home-week" role="group" aria-label="Seven day check-in progress">
                {weekItems.map((item, index) => {
                  const isToday = index === checkIn.nextDayIndex;
                  const isCompleted = index < checkIn.nextDayIndex || (isToday && checkIn.claimed);
                  return (
                    <div className={`home-day-wrap ${isToday ? "today" : ""}`} key={`${item.day}-${index}`}>
                      <button
                        className={`home-day ${isToday ? "today" : ""} ${item.icon === "gift" ? "is-bonus" : ""}`}
                        type="button"
                        aria-label={`${item.day}, ${item.coins} coins${isCompleted ? ", claimed" : ""}`}
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
                      <small>{isToday ? "Today" : item.day}</small>
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
                  <>Check-in paused</>
                ) : checkIn.claimed ? (
                  <><Check size={18} /> {`Reward claimed (+${checkIn.todayReward})`}</>
                ) : (
                  <><CalendarCheck size={18} /> {`Claim today's +${checkIn.todayReward}`}</>
                )}
              </button>
            </article>
          </aside>
        </div>
      </div>
    </main>
  );
}
