"use client";

import { useEffect, useRef, useState } from "react";
import { Box, Check, Gauge, Globe2 } from "lucide-react";
import {
  QUALITY_PREFERENCE_OPTIONS,
  type QualityPreference,
  type QualityRuntimeReport,
} from "@/lib/mockup/quality-tier";
import { useLocale } from "./LocaleProvider";
import styles from "./ViewportDisplayRail.module.css";

interface Props {
  sceneMode: "website" | "studio";
  styleTone: "pink" | "white" | "dark";
  qualityPreference: QualityPreference;
  qualityReport: QualityRuntimeReport | null;
  disabled?: boolean;
  onSwitchSceneMode: (mode: "website" | "studio") => void;
  onToggleStyle: () => void;
  onChangeQuality: (next: QualityPreference) => void;
}

const QUALITY_SHORT_CODE: Record<QualityPreference, string> = {
  auto: "AUTO",
  low: "LOW",
  medium: "MED",
  high: "HIGH",
  ultra: "ULTRA",
};

/**
 * Compact vertical right-rail dock grouping Viewport Display & Graphics controls
 * (Scene 1/2, Pink/White preview style, and 3D render quality flyout) directly
 * beneath the Fullscreen button so the top bar stays single-row and airy.
 */
export default function ViewportDisplayRail({
  sceneMode,
  styleTone,
  qualityPreference,
  qualityReport,
  disabled = false,
  onSwitchSceneMode,
  onToggleStyle,
  onChangeQuality,
}: Props) {
  const { t } = useLocale();
  const vp = t.studio.viewport;
  const [qualityOpen, setQualityOpen] = useState(false);
  const qualityWrapRef = useRef<HTMLDivElement>(null);

  const studio = sceneMode === "studio";
  const whiteStyle = styleTone === "white";
  const darkStyle = styleTone === "dark";
  const visualTone: "neutral" | "pink" | "white" | "dark" = studio ? "neutral" : styleTone;

  useEffect(() => {
    if (!qualityOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !qualityWrapRef.current?.contains(event.target)
      ) {
        setQualityOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setQualityOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [qualityOpen]);

  const effectiveTierLabel = qualityReport
    ? `${qualityReport.effectiveTier[0].toUpperCase()}${qualityReport.effectiveTier.slice(1)}`
    : null;

  const qualityTooltip = qualityReport
    ? `Graphics quality · ${qualityPreference === "auto" ? `Auto (${effectiveTierLabel})` : QUALITY_SHORT_CODE[qualityPreference]} · ${qualityReport.idleMsaa}x MSAA`
    : "3D preview graphics quality";

  return (
    <div
      className={styles.railDock}
      data-tone={visualTone}
      aria-label="Viewport display and graphics controls"
    >
      {/* Scene 1 / Scene 2 Vertical Switcher */}
      <div className={styles.sceneGroup} role="group" aria-label="Choose scene">
        <button
          type="button"
          className={styles.railBtn}
          aria-pressed={!studio}
          aria-label="Scene 1"
          title={vp.scene1Title}
          disabled={disabled}
          onClick={() => onSwitchSceneMode("website")}
        >
          <Globe2 size={16} aria-hidden="true" />
          <span className={styles.microLabel}>S1</span>
        </button>
        <button
          type="button"
          className={styles.railBtn}
          aria-pressed={studio}
          aria-label="Scene 2"
          title={vp.scene2Title}
          disabled={disabled}
          onClick={() => onSwitchSceneMode("studio")}
        >
          <Box size={16} aria-hidden="true" />
          <span className={styles.microLabel}>S2</span>
        </button>
      </div>

      {/* Preview Theme Swatch (Scene 1 only: White -> Pink -> Dark) */}
      {!studio && (
        <>
          <span className={styles.divider} aria-hidden="true" />
          <button
            type="button"
            className={styles.railBtn}
            aria-label={darkStyle ? vp.styleDark : whiteStyle ? vp.styleWhite : vp.stylePink}
            title={
              whiteStyle
                ? vp.styleToggleToPink
                : darkStyle
                  ? vp.styleToggleToWhite
                  : vp.styleToggleToDark
            }
            disabled={disabled}
            onClick={onToggleStyle}
          >
            <span
              className={`${styles.styleDot} ${darkStyle ? styles.styleDotDark : whiteStyle ? styles.styleDotWhite : styles.styleDotPink}`}
              aria-hidden="true"
            />
            <span className={styles.microLabel}>
              {darkStyle ? vp.styleDark : whiteStyle ? vp.styleWhite : vp.stylePink}
            </span>
          </button>
        </>
      )}

      <span className={styles.divider} aria-hidden="true" />

      {/* 3D Graphics Quality Flyout Trigger */}
      <div className={styles.qualityWrap} ref={qualityWrapRef}>
        <button
          type="button"
          className={`${styles.railBtn} ${styles.qualityBtn}`}
          aria-haspopup="menu"
          aria-expanded={qualityOpen}
          aria-label={vp.graphicsQuality}
          title={qualityTooltip}
          disabled={disabled}
          onClick={() => setQualityOpen((prev) => !prev)}
        >
          <Gauge size={16} aria-hidden="true" />
          <span className={styles.qualityCode}>{QUALITY_SHORT_CODE[qualityPreference]}</span>
        </button>

        {qualityOpen && (
          <div
            className={styles.qualityPopover}
            data-tone={visualTone}
            role="menu"
            aria-label={vp.graphicsQuality}
          >
            <div className={styles.popoverHeader}>
              <strong>{vp.graphicsQuality}</strong>
              {qualityReport && (
                <span className={styles.popoverBadge}>
                  {qualityReport.effectiveTier.toUpperCase()} · {qualityReport.idleMsaa}× MSAA
                </span>
              )}
            </div>
            <div className={styles.popoverList}>
              {QUALITY_PREFERENCE_OPTIONS.map((opt) => {
                const selected = qualityPreference === opt.id;
                const label =
                  opt.id === "auto"
                    ? vp.qualityAuto(effectiveTierLabel ?? undefined)
                    : opt.id === "low"
                      ? vp.qualityLow
                      : opt.id === "medium"
                        ? vp.qualityMedium
                        : opt.id === "high"
                          ? vp.qualityHigh
                          : vp.qualityUltra;
                const description =
                  opt.id === "auto"
                    ? vp.qualityDescAuto
                    : opt.id === "low"
                      ? vp.qualityDescLow
                      : opt.id === "medium"
                        ? vp.qualityDescMedium
                        : opt.id === "high"
                          ? vp.qualityDescHigh
                          : vp.qualityDescUltra;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    className={`${styles.popoverOption} ${selected ? styles.popoverOptionActive : ""}`}
                    onClick={() => {
                      onChangeQuality(opt.id);
                      setQualityOpen(false);
                    }}
                  >
                    <span className={styles.optionText}>
                      <strong>{label}</strong>
                      <small>{description}</small>
                    </span>
                    <span className={styles.optionCheck} aria-hidden="true">
                      {selected && <Check size={14} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
