"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type DragEvent } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Box,
  ImagePlus,
  Move3d,
  Pause,
  Play,
  RotateCcw,
  SunMedium,
} from "lucide-react";
import {
  HERO_SHOWCASE_SCENES,
  type HeroLightMoodId,
  type HeroShowcaseScene,
} from "@/lib/labellab/hero-artwork";
import { createLocalArtwork, releaseLocalArtwork } from "@/lib/labellab/local-artwork";
import HomeModelDemo from "./HomeModelDemo";
import { useLocale } from "./LocaleProvider";
import styles from "./HomeHeroShowcase.module.css";

const LIGHT_MOOD_ORDER: readonly HeroLightMoodId[] = ["studio", "dramatic", "daylight"];

export default function HomeHeroShowcase() {
  const { locale, t } = useLocale();
  const [activeScene, setActiveScene] = useState<HeroShowcaseScene>(HERO_SHOWCASE_SCENES[0]);
  const [lightMood, setLightMood] = useState<HeroLightMoodId>("studio");
  const [boxFoldPlaying, setBoxFoldPlaying] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [customArtworkUrl, setCustomArtworkUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Revoke previous object URLs cleanly to prevent browser memory leaks.
  useEffect(() => {
    return () => {
      if (customArtworkUrl) releaseLocalArtwork(customArtworkUrl);
    };
  }, [customArtworkUrl]);

  const applyCustomLabelFile = useCallback((file: File | null | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    const nextUrl = createLocalArtwork(file);
    setCustomArtworkUrl((prev) => {
      if (prev) releaseLocalArtwork(prev);
      return nextUrl;
    });
    // If currently inspecting the CAD box, smoothly switch to Glass 290 mL so the label appears immediately.
    setActiveScene((prev) => (prev.kind === "packaging" ? HERO_SHOWCASE_SCENES[0] : prev));
    setHasInteracted(true);
  }, []);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    applyCustomLabelFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!dragActive) setDragActive(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDragActive(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    applyCustomLabelFile(event.dataTransfer.files?.[0]);
  };

  const cycleLightMood = () => {
    setLightMood((prev) => {
      const nextIndex = (LIGHT_MOOD_ORDER.indexOf(prev) + 1) % LIGHT_MOOD_ORDER.length;
      return LIGHT_MOOD_ORDER[nextIndex];
    });
  };

  const clearCustomArtwork = () => {
    setCustomArtworkUrl((prev) => {
      if (prev) releaseLocalArtwork(prev);
      return null;
    });
  };

  const lightMoodLabel =
    lightMood === "dramatic"
      ? t.home.lightMoodDramatic
      : lightMood === "daylight"
        ? t.home.lightMoodDaylight
        : t.home.lightMoodStudio;

  const activeBadge = locale === "vi" ? activeScene.badgeVi : activeScene.badgeEn;
  const activeSpec = locale === "vi" ? activeScene.specVi : activeScene.specEn;

  return (
    <section
      className={`home-card home-showcase ${styles.card}`}
      aria-label={t.home.showcaseAria}
      style={{ "--hero-accent": activeScene.accent } as CSSProperties}
    >
      <div
        className={`${styles.stage} ${dragActive ? styles.stageDragOver : ""}`}
        style={{ background: activeScene.stageGradient }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Atmospheric studio spotlight glow & minimal camera viewfinder corners */}
        <div
          className={styles.stageHalo}
          style={{ background: activeScene.haloGradient }}
          aria-hidden="true"
        />
        <div className={styles.stageFloorGlow} aria-hidden="true" />
        <div className={styles.viewfinder} aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>

        {/* Top Floating Studio HUD */}
        <div className={styles.topline}>
          <div className={styles.livePill}>
            <span className={styles.liveModel}>{activeBadge}</span>
          </div>

          <div className={styles.hudActions}>
            <button
              type="button"
              className={`${styles.hudBtn} ${styles.hudIconBtn} ${lightMood !== "studio" ? styles.hudBtnTint : ""}`}
              onClick={cycleLightMood}
              aria-label={`${t.home.switchLightAria}: ${lightMoodLabel}`}
              title={`${t.home.switchLightAria}: ${lightMoodLabel}`}
            >
              <SunMedium size={14} aria-hidden="true" />
            </button>

            {activeScene.kind === "packaging" ? (
              <button
                type="button"
                className={`${styles.hudBtn} ${boxFoldPlaying ? styles.hudBtnActive : ""}`}
                onClick={() => setBoxFoldPlaying((v) => !v)}
                aria-pressed={boxFoldPlaying}
              >
                {boxFoldPlaying ? <Pause size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}
                <span>{boxFoldPlaying ? t.home.foldPause : t.home.foldPlay}</span>
              </button>
            ) : customArtworkUrl ? (
              <button
                type="button"
                className={`${styles.hudBtn} ${styles.hudBtnActive}`}
                onClick={clearCustomArtwork}
                title={t.home.resetLabel}
              >
                <RotateCcw size={13} aria-hidden="true" />
                <span>{t.home.resetLabel}</span>
              </button>
            ) : (
              <button
                type="button"
                className={styles.hudBtn}
                onClick={() => fileInputRef.current?.click()}
                title={t.home.tryLabel}
              >
                <ImagePlus size={13} aria-hidden="true" />
                <span>{t.home.tryLabel}</span>
              </button>
            )}
          </div>
        </div>

        {/* Real-Time Interactive 3D Viewport */}
        <HomeModelDemo
          scene={activeScene}
          lightMood={lightMood}
          customArtworkUrl={customArtworkUrl}
          boxFoldPlaying={boxFoldPlaying}
          onUserInteract={() => setHasInteracted(true)}
        />

        {/* Drag-and-drop custom label overlay */}
        {dragActive && (
          <div className={styles.dropOverlay} aria-live="polite">
            <ImagePlus size={26} aria-hidden="true" />
            <strong>{t.home.dropLabelHint}</strong>
          </div>
        )}

        {/* Hidden file input for instant Try-Your-Label preview */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="sr-only"
          aria-label={t.home.tryLabel}
          onChange={handleFileChange}
        />

        {/* Floating bottom-stage micro-hint + 4-scene glass switcher dock */}
        <div className={styles.stageFooter}>
          <div className={`${styles.orbitHint} ${hasInteracted ? styles.orbitHintHidden : ""}`} aria-hidden="true">
            <Move3d size={13} />
            <span>
              {activeScene.kind === "packaging" ? t.home.dragOrbitBoxHint : t.home.dragOrbitHint}
            </span>
          </div>

          <div className={styles.sceneDock} role="group" aria-label={t.home.featuredModelsAria}>
            {HERO_SHOWCASE_SCENES.map((scene) => {
              const selected = scene.id === activeScene.id;
              const shortName = locale === "vi" ? scene.shortVi : scene.shortEn;
              const fullName = locale === "vi" ? scene.badgeVi : scene.badgeEn;
              return (
                <button
                  key={scene.id}
                  type="button"
                  className={`${styles.dockItem} ${selected ? styles.dockItemActive : ""}`}
                  aria-label={t.home.showModelDemo(fullName)}
                  aria-pressed={selected}
                  onClick={() => setActiveScene(scene)}
                >
                  <span className={styles.dockThumb}>
                    {scene.poster ? (
                      <img src={scene.poster} alt="" loading="eager" />
                    ) : (
                      <Box size={18} className={styles.dockBoxIcon} aria-hidden="true" />
                    )}
                  </span>
                  <span className={styles.dockLabel}>{shortName}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Crisp, high-contrast bottom editorial & CTA deck */}
      <div className={styles.bottom}>
        <div className={styles.headlineGroup}>
          <div className={styles.metaRow}>
            <span className={styles.eyebrow}>{t.home.eyebrow}</span>
            <span className={styles.specChip}>{activeSpec}</span>
          </div>

          <h2 className={styles.title}>{t.home.heroTitle}</h2>
        </div>

        <div className={styles.actions}>
          <Link className={`${styles.primaryCta} home-sheen`} href={activeScene.studioHref}>
            <span>{t.home.startMockup}</span>
            <ArrowRight size={20} className={styles.ctaArrow} aria-hidden="true" />
          </Link>

          <Link className={styles.secondaryCta} href="/studio?domain=packaging#workspace">
            <span className={styles.secondaryLeft}>
              <Box size={15} aria-hidden="true" />
              <span>{t.home.parametricCta}</span>
            </span>
            <ArrowRight size={15} className={styles.ctaArrow} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
