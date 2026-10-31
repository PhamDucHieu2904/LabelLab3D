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
import { useState } from "react";
import MovingGrid from "./MovingGrid";
import SiteHeader from "./SiteHeader";
import CoinPricing from "./CoinPricing";
import UserProfileCard from "./UserProfileCard";
import HomeModelDemo from "./HomeModelDemo";
import { FEATURED_MODELS } from "@/lib/labellab/catalog";
import { LABELLAB_UPDATES } from "@/lib/labellab/updates";
import { PROFILE_PREVIEW } from "@/lib/labellab/profile-preview";

const noticeIcons = { pink: Gift, blue: Megaphone, mint: Sparkles } as const;

const week = [
  { day: "Day 1", reward: "20", icon: "coin" },
  { day: "Day 2", reward: "+110", icon: "gift" },
  { day: "Day 3", reward: "45", icon: "coin" },
  { day: "Day 4", reward: "45", icon: "coin" },
  { day: "Day 5", reward: "+80", icon: "gift" },
  { day: "Day 6", reward: "70", icon: "coin" },
  { day: "Day 7", reward: "70", icon: "coin" },
] as const;

export default function HomePage() {
  const [claimed, setClaimed] = useState(false);
  const [featuredModel, setFeaturedModel] = useState(FEATURED_MODELS[0]);

  return (
    <main className="home-shell">
      <MovingGrid enabled />
      <div className="home-frame">
        <SiteHeader activePage="home" />

        <div className="home-dashboard">
          <h1 className="sr-only">Labellab 3D packaging mockup dashboard</h1>
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
              <Link className="home-showcase-action home-sheen" href="/studio#workspace">
                <span>Start a new mockup</span><ArrowRight size={21} />
              </Link>
            </div>
          </section>

          <section className="home-center-column" aria-label="Coin packages and updates">
            <CoinPricing />

            <article className="home-card home-notices-card" id="home-updates">
              <div className="home-card-heading">
                <div>
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
              <Image src="/home/promo-banner-3d.jpg" alt="Colorful 3D packaging mockups" fill loading="eager" sizes="(max-width: 1240px) 70vw, 48vw" />
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
            <UserProfileCard profile={PROFILE_PREVIEW} notificationCount={LABELLAB_UPDATES.length} />

            <article className="home-card home-checkin-card">
              <div className="home-checkin-heading">
                <h2>Daily check-in</h2>
                <p>Earn coins every day you check in</p>
              </div>
              <div className="home-week" role="group" aria-label="Seven day check-in progress">
                {week.map((item, index) => (
                  <div className={`home-day-wrap ${index === 0 ? "today" : ""}`} key={`${item.day}-${index}`}>
                    <button
                      className={`home-day ${index === 0 ? "today" : ""} ${item.icon === "gift" ? "is-bonus" : ""}`}
                      type="button"
                      aria-label={`${item.day}, ${item.reward} coins`}
                    >
                      <span className={`home-day-icon ${item.icon === "gift" ? "is-gift" : ""}`}>
                        {item.icon === "gift" ? <Gift size={22} aria-hidden="true" /> : <Image src="/branding/LLCoin.svg" alt="" width={28} height={28} />}
                      </span>
                      <strong className="home-day-reward">{item.reward}</strong>
                    </button>
                    <small>{index === 0 ? "Today" : item.day}</small>
                  </div>
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
            </article>
          </aside>
        </div>
      </div>
    </main>
  );
}
