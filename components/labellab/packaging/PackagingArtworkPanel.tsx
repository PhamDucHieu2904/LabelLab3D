"use client";

import { useMemo } from "react";
import { ImagePlus, Layers, MousePointerClick, Trash2, Type } from "lucide-react";
import type {
  PackagingArtworkState,
  PanelDesignOverlay,
  SolvedDieline,
} from "@/lib/packaging-cad/types";
import {
  getPanelUprightSizeMm,
  isInteractivePackagingPanel,
} from "@/lib/packaging-cad/artwork-composer";
import { useLocale } from "../LocaleProvider";
import styles from "./PackagingStudio.module.css";

interface Props {
  solved: SolvedDieline;
  artwork: PackagingArtworkState;
  surface: "outside" | "inside";
  selectedPanelId: string;
  tone: "studio" | "pink" | "white" | "dark";
  disabled?: boolean;
  onChangeSurface: (surface: "outside" | "inside") => void;
  onSelectPanel: (panelId: string) => void;
  onOpenFaceEditor: (panelId: string, surface: "outside" | "inside") => void;
  onChangeArtwork: (next: PackagingArtworkState) => void;
  onRemoveFaceArtwork: (panelId: string, surface: "outside" | "inside") => void;
  onClearAll: () => void;
}

function overlayKey(surface: "outside" | "inside", panelId: string): string {
  return `${surface}:${panelId}`;
}

/**
 * Pure Per-Face Independent Artwork Manager (Pacdora-style).
 * Every face owns its own artwork, crop frame, tint, text, and isolated artwork history —
 * never sharing a single artwork across faces or replacing the full box at once.
 */
export default function PackagingArtworkPanel({
  solved,
  artwork,
  surface,
  selectedPanelId,
  tone,
  disabled = false,
  onChangeSurface,
  onSelectPanel,
  onOpenFaceEditor,
  onChangeArtwork,
  onRemoveFaceArtwork,
  onClearAll,
}: Props) {
  const { t } = useLocale();
  const pkg = t.studio.packaging;

  const editablePanels = useMemo(
    () => solved.flatPanels.filter((p) => isInteractivePackagingPanel(p)),
    [solved.flatPanels],
  );
  const activePanel = editablePanels.find((p) => p.id === selectedPanelId) ?? editablePanels[0];
  const activeKey = activePanel ? overlayKey(surface, activePanel.id) : "";
  const activeOverlay: PanelDesignOverlay = (activeKey && artwork.panelOverlays[activeKey]) || {
    panelId: activePanel?.id ?? "front-wall",
    surface,
    imageScale: 1,
    imageOffsetX: 0,
    imageOffsetY: 0,
    imageRotationDeg: 0,
    textColor: "#1e293b",
    textSizePct: 24,
  };
  const activeDims = activePanel ? getPanelUprightSizeMm(activePanel) : null;
  const boardColor = surface === "outside" ? solved.params.outsideColor : solved.params.insideColor;
  const surfaceLabel = surface === "outside" ? pkg.outsideLabel : pkg.insideLabel;

  const updateOverlay = (patch: Partial<PanelDesignOverlay>) => {
    if (!activePanel) return;
    const key = overlayKey(surface, activePanel.id);
    onChangeArtwork({
      ...artwork,
      mode: "panel",
      panelOverlays: {
        ...artwork.panelOverlays,
        [key]: { ...activeOverlay, ...patch, panelId: activePanel.id, surface },
      },
    });
  };

  const hasAnyArtwork = Object.values(artwork.panelOverlays).some(
    (ov) => Boolean(ov.fillColor || ov.imageUrl || ov.text?.trim()),
  );

  return (
    <div className={`${styles.inspector} ${styles.artworkPanel}`} data-tone={tone}>
      {/* Interactive 3D Direct-Click Tip */}
      <div className={styles.interactiveTipCard}>
        <MousePointerClick size={15} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          <strong>{pkg.artworkTipLead}</strong>
          {pkg.artworkTipBody}
        </span>
      </div>

      {/* Dual-Surface Print Switch (Outside / Inside) */}
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>
          <Layers size={13} aria-hidden="true" /> {pkg.printSide}
        </span>
        <div className={styles.segmented} role="group" aria-label={pkg.printSide}>
          <button
            type="button"
            aria-pressed={surface === "outside"}
            disabled={disabled}
            onClick={() => onChangeSurface("outside")}
          >
            {pkg.outsideLabel}
          </button>
          <button
            type="button"
            aria-pressed={surface === "inside"}
            disabled={disabled}
            onClick={() => onChangeSurface("inside")}
          >
            {pkg.insideLabel}
          </button>
        </div>
      </div>

      {/* Per-Face Independent Artwork List */}
      <section className={styles.inspectorSection}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>{pkg.boxFacesTitle(surface)}</span>
          <span style={{ fontSize: 10, color: "var(--pkg-muted)" }}>
            {pkg.faceCount(editablePanels.length)}
          </span>
        </div>

        <div className={styles.faceList} role="list" aria-label={pkg.boxFacesTitle(surface)}>
          {editablePanels.map((panel) => {
            const key = overlayKey(surface, panel.id);
            const ov = artwork.panelOverlays[key];
            const dims = getPanelUprightSizeMm(panel);
            const isSelected = activePanel?.id === panel.id;
            const hasFaceDesign = Boolean(ov?.imageUrl || ov?.fillColor || ov?.text?.trim());
            const faceName = pkg.faceLabel(panel.label);
            return (
              <div
                key={panel.id}
                role="listitem"
                className={`${styles.faceRowCard} ${isSelected ? styles.faceRowCardActive : ""}`}
              >
                <button
                  type="button"
                  className={styles.faceRowMain}
                  disabled={disabled}
                  aria-pressed={isSelected}
                  onClick={() => onSelectPanel(panel.id)}
                >
                  <span
                    className={styles.faceRowThumb}
                    style={{ backgroundColor: ov?.fillColor ?? boardColor }}
                  >
                    {ov?.imageUrl ? (
                      <img src={ov.imageUrl} alt="" />
                    ) : (
                      <span>{panel.shortCode}</span>
                    )}
                  </span>
                  <span className={styles.faceRowMeta}>
                    <strong>{faceName}</strong>
                    <small>
                      {dims.widthMm} × {dims.heightMm} mm
                      {ov?.artworkName
                        ? ` · ${ov.artworkName}`
                        : hasFaceDesign
                          ? ` · ${pkg.faceCustom}`
                          : ` · ${pkg.faceEmpty}`}
                    </small>
                  </span>
                </button>
                <button
                  type="button"
                  className={styles.faceEditBtn}
                  disabled={disabled}
                  title={`${faceName} (${surfaceLabel})`}
                  onClick={() => {
                    onSelectPanel(panel.id);
                    onOpenFaceEditor(panel.id, surface);
                  }}
                >
                  <ImagePlus size={13} aria-hidden="true" />
                  <span>{ov?.imageUrl ? pkg.btnReplace : pkg.btnAdd}</span>
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Active Face Independent Properties */}
      {activePanel && activeDims && (
        <section className={styles.inspectorSection}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>
              {pkg.faceLabel(activePanel.label)} ({surfaceLabel})
            </span>
            <span style={{ fontSize: 10, color: "var(--pkg-muted)", fontVariantNumeric: "tabular-nums" }}>
              {activeDims.widthMm} × {activeDims.heightMm} mm
            </span>
          </div>

          <button
            type="button"
            className={styles.comboAutoFitBtn}
            disabled={disabled}
            onClick={() => onOpenFaceEditor(activePanel.id, surface)}
          >
            <ImagePlus size={14} aria-hidden="true" />
            {activeOverlay.imageUrl
              ? pkg.replaceFaceArt(activePanel.shortCode)
              : pkg.uploadFaceArt(activePanel.shortCode)}
          </button>

          {/* Selected Panel Background Color */}
          <div className={styles.colorPairRow}>
            <label className={styles.colorMini}>
              <span>{pkg.faceTint}</span>
              <input
                type="color"
                value={activeOverlay.fillColor ?? boardColor}
                disabled={disabled}
                onChange={(e) => updateOverlay({ fillColor: e.target.value })}
              />
            </label>
            <button
              type="button"
              className={styles.dielineExportBtn}
              disabled={disabled || !activeOverlay.fillColor}
              onClick={() => updateOverlay({ fillColor: undefined })}
            >
              {pkg.resetTint}
            </button>
          </div>

          {activeOverlay.imageUrl && (
            <button
              type="button"
              className={styles.dielineExportBtn}
              disabled={disabled}
              onClick={() => onRemoveFaceArtwork(activePanel.id, surface)}
            >
              <Trash2 size={12} /> {pkg.removeFaceArt(activePanel.shortCode)}
            </button>
          )}

          {/* Quick Brand Text for this face */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className={styles.sectionTitle}>
              <Type size={12} aria-hidden="true" /> {pkg.quickTextOn(activePanel.shortCode)}
            </span>
            <input
              type="text"
              className={styles.textField}
              placeholder={pkg.textPlaceholder(activePanel.shortCode)}
              maxLength={48}
              disabled={disabled}
              value={activeOverlay.text ?? ""}
              onChange={(e) => updateOverlay({ text: e.target.value })}
            />
            {activeOverlay.text?.trim() && (
              <div className={styles.colorPairRow}>
                <label className={styles.colorMini}>
                  <span>{pkg.textColor}</span>
                  <input
                    type="color"
                    value={activeOverlay.textColor ?? "#1e293b"}
                    disabled={disabled}
                    onChange={(e) => updateOverlay({ textColor: e.target.value })}
                  />
                </label>
                <div className={styles.sliderRow}>
                  <div className={styles.sliderHead}>
                    <label htmlFor="panel-text-sz">{pkg.textSize}</label>
                    <output>{activeOverlay.textSizePct ?? 24}%</output>
                  </div>
                  <input
                    id="panel-text-sz"
                    type="range"
                    className={styles.rangeInput}
                    min={10}
                    max={48}
                    step={1}
                    disabled={disabled}
                    value={activeOverlay.textSizePct ?? 24}
                    onChange={(e) => updateOverlay({ textSizePct: Number(e.target.value) })}
                  />
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Clear All Faces */}
      {hasAnyArtwork && (
        <button
          type="button"
          className={styles.dielineExportBtn}
          disabled={disabled}
          onClick={onClearAll}
        >
          <Trash2 size={12} /> {pkg.clearAllFaces}
        </button>
      )}
    </div>
  );
}
