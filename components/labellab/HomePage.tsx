"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  CalendarCheck,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Coins,
  Gift,
  Megaphone,
  MoreHorizontal,
  Settings2,
  Sparkles,
  Trophy,
  UserRound,
  Zap,
} from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import MovingGrid from "./MovingGrid";
import SiteHeader from "./SiteHeader";
import { LABELLAB_UPDATES } from "@/lib/labellab/updates";

const offers = [
  { coins: 200, price: "$4.90", discount: "15% off", note: "Starter" },
  { coins: 500, price: "$9.90", discount: "25% off", note: "Popular" },
  { coins: 1000, price: "$16.90", discount: "35% off", note: "Best value" },
] as const;

const noticeIcons = { pink: Gift, blue: Megaphone, mint: Sparkles } as const;

const week = [
  { day: "M", state: "claimed", reward: "+10" },
  { day: "T", state: "claimed", reward: "+10" },
  { day: "W", state: "claimed", reward: "+15" },
  { day: "T", state: "today", reward: "+20" },
  { day: "F", state: "locked", reward: "+20" },
  { day: "S", state: "locked", reward: "+25" },
  { day: "S", state: "locked", reward: "+50" },
] as const;

export default function HomePage() {
  const shellRef = useRef<HTMLElement>(null);
  const [selectedOffer, setSelectedOffer] = useState(1);
  const [claimed, setClaimed] = useState(false);
  const offer = offers[selectedOffer];

  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    // Scale design units rather than a composited page texture, so the complete
    // composition fits while the browser paints text at its final pixel size.
    const fitDesktop = (width: number, height: number) => {
      if (width <= 860 || width === 0 || height === 0) return;
      const scale = Math.min(1, width / 1920, height / 1080);
      shell.style.setProperty("--home-scale", String(scale));
    };

    const { width, height } = shell.getBoundingClientRect();
    fitDesktop(width, height);
    const observer = new ResizeObserver(([entry]) => {
      fitDesktop(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  return (
    <main className="home-shell" ref={shellRef}>
      <MovingGrid enabled />
      <div className="home-frame">
        <SiteHeader activePage="home" />

        <div className="home-dashboard">
          <h1 className="sr-only">Labellab 3D packaging mockup dashboard</h1>
          <section className="home-card home-showcase" aria-label="Featured 3D mockup">
            <div className="home-showcase-visual">
              <div className="home-showcase-topline">
                <span className="home-kicker"><Sparkles size={13} /> Featured model</span>
                <span className="home-glass-badge"><Zap size={12} /> Web optimized</span>
              </div>
              <div className="home-hero-halo" aria-hidden="true" />
              <div className="home-orbit-ring home-orbit-ring-one" aria-hidden="true" />
              <div className="home-orbit-ring home-orbit-ring-two" aria-hidden="true" />
              <Image
                className="home-hero-product"
                src="/models/bottles/glass-290-basil-poster.webp"
                alt="Basil Strawberry glass bottle mockup"
                width={640}
                height={640}
                priority
              />
              <div className="home-product-shadow" aria-hidden="true" />
              <div className="home-hero-caption">
                <div>
                  <span>Vinut web asset</span>
                  <strong>Basil Strawberry</strong>
                  <small>Glass bottle · 290 ml · Realistic liquid shader</small>
                </div>
                <span className="home-live-pill"><span /> Live</span>
              </div>
            </div>
            <div className="home-showcase-bottom">
              <div className="home-scene-row">
                <div>
                  <span className="home-section-eyebrow">Make it real</span>
                  <h2>Bring your next label to life.</h2>
                </div>
                <div className="home-scene-dots" aria-label="Featured mockup scenes">
                  <button className="is-active" type="button" aria-label="Basil Strawberry scene" />
                  <button type="button" aria-label="Mango can scene" />
                  <button type="button" aria-label="Aloe PET scene" />
                </div>
              </div>
              <Link className="home-showcase-action home-sheen" href="/studio#workspace">
                <span>Start a new mockup</span><ArrowRight size={21} />
              </Link>
            </div>
          </section>

          <section className="home-center-column" aria-label="Credits and updates">
            <article className="home-card home-balance-card">
              <div className="home-card-heading">
                <div>
                  <span className="home-section-eyebrow">Credits & offers</span>
                  <h2>Power your next render.</h2>
                </div>
                <span className="home-card-menu" aria-hidden="true"><MoreHorizontal size={18} /></span>
              </div>
              <div className="home-balance-row">
                <div>
                  <span className="home-muted-label">Your balance</span>
                  <strong className="home-balance-number" aria-live="polite">1,000</strong>
                  <span className="home-balance-unit"><Coins size={13} /> credits</span>
                </div>
                <div className="home-coin-art" aria-hidden="true"><CircleDollarSign size={55} /><Sparkles size={14} /></div>
              </div>
              <div className="home-offer-selector" role="group" aria-label="Choose a credit package">
                {offers.map((item, index) => (
                  <button
                    key={item.coins}
                    type="button"
                    className={selectedOffer === index ? "is-active" : ""}
                    aria-pressed={selectedOffer === index}
                    onClick={() => setSelectedOffer(index)}
                  >
                    <strong>{item.coins.toLocaleString()} <small>credits</small></strong>
                    <span>{item.discount}</span>
                  </button>
                ))}
              </div>
              <div className="home-balance-footer">
                <span><Trophy size={14} /> Save up to 35% today</span>
                <button className="home-small-cta home-sheen" type="button">
                  Top up {offer.coins.toLocaleString()} <ArrowRight size={15} />
                </button>
              </div>
            </article>

            <article className="home-card home-notices-card">
              <div className="home-card-heading">
                <div>
                  <span className="home-section-eyebrow">Stay in the loop</span>
                  <h2>Admin updates <span className="home-count-badge">3</span></h2>
                </div>
                <button className="home-text-action" type="button">View all <ChevronRight size={14} /></button>
              </div>
              <div className="home-notice-list">
                {LABELLAB_UPDATES.map(({ tone, title, time, unread }) => {
                  const Icon = noticeIcons[tone];
                  return (
                    <button className={`home-notice ${unread ? "is-unread" : ""}`} type="button" key={title}>
                      <span className={`home-notice-icon ${tone}`}><Icon size={16} /></span>
                      <span className="home-notice-copy"><strong>{title}</strong><small><Clock3 size={11} /> {time}</small></span>
                      {unread && <span className="home-unread-dot" aria-label="Unread" />}
                      <ChevronRight size={16} className="home-notice-arrow" />
                    </button>
                  );
                })}
              </div>
            </article>

            <article className="home-card home-promo-card">
              <Image src="/home/promo-banner-3d.jpg" alt="Colorful 3D packaging mockups" fill sizes="(max-width: 1240px) 70vw, 48vw" />
              <div className="home-promo-overlay" />
              <div className="home-promo-content">
                <span className="home-promo-tag"><Sparkles size={12} /> Limited event</span>
                <h2>Render more. Pay less.</h2>
                <p>Save 35% on credits with our weekend bundle.</p>
                <button type="button" className="home-promo-cta home-sheen">Explore offers <ArrowRight size={15} /></button>
              </div>
              <div className="home-promo-dots" aria-label="Promotion slides"><span className="is-active" /><span /><span /></div>
            </article>
          </section>

          <aside className="home-right-column" aria-label="Account and daily rewards">
            <article className="home-card home-profile-card">
              <div className="home-profile-heading">
                <span className="home-section-eyebrow">Your workspace</span>
                <button className="home-card-menu" type="button" aria-label="Profile settings"><Settings2 size={17} /></button>
              </div>
              <div className="home-profile-main">
                <div className="home-avatar-wrap">
                  <Image src="/home/avatar-female-3d.jpg" alt="User avatar" fill sizes="88px" />
                  <span className="home-avatar-status" />
                </div>
                <div>
                  <h2>Guest designer</h2>
                  <p><UserRound size={13} /> 12 days in the studio</p>
                </div>
              </div>
              <div className="home-profile-stats">
                <span><strong>24</strong><small>mockups</small></span>
                <span><strong>8.4k</strong><small>views</small></span>
                <span><strong>Lv. 04</strong><small>creator</small></span>
              </div>
              <button className="home-notification-cta home-sheen" type="button"><BellRing size={16} /> Notifications <span>3</span></button>
            </article>

            <article className="home-card home-checkin-card">
              <div className="home-checkin-heading">
                <div className="home-checkin-icon"><CalendarCheck size={22} /></div>
                <div><span className="home-section-eyebrow">Daily reward</span><h2>Check in & earn.</h2></div>
              </div>
              <div className="home-streak-line"><span><strong>3</strong> day streak</span><span>Next reward <b>+20</b></span></div>
              <div className="home-week" role="group" aria-label="Seven day check-in progress">
                {week.map((item, index) => (
                  <button key={`${item.day}-${index}`} className={`home-day ${item.state}`} type="button" aria-label={`${item.day}, ${item.reward} credits`}>
                    <span>{item.state === "claimed" ? <Check size={14} /> : item.state === "today" ? <Zap size={14} /> : item.day}</span>
                    <small>{item.day}</small>
                  </button>
                ))}
              </div>
              <button
                className={`home-checkin-cta home-sheen ${claimed ? "is-claimed" : ""}`}
                type="button"
                onClick={() => setClaimed(true)}
                aria-live="polite"
              >
                {claimed ? <><Check size={18} /> Reward claimed</> : <><CalendarCheck size={18} /> {"Claim today's +20"}</>}
              </button>
              <p className="home-checkin-note">Come back every day to build your streak and unlock bigger rewards.</p>
            </article>
          </aside>
        </div>
      </div>
    </main>
  );
}
