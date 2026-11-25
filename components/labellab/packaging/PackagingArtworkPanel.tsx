"use client";

import Image from "next/image";
import { useMemo } from "react";
import { Download, ImagePlus, Layers, MousePointerClick, Trash2, Type } from "lucide-react";
import type {
  PackagingArtworkState,
  PanelDesignOverlay,
  SolvedDieline,
} from "@/lib/packaging-cad/types";
import {
  getPanelUprightSizeMm,
  isInteractivePackagingPanel,
} from "@/lib/packaging-cad/artwork-composer";
import styles from "./PackagingStudio.module.css";

interface Props {
  solved: SolvedDieline;
  artwork: PackagingArtworkState;
  surface: "outside" | "inside";
  selectedPanelId: string;
  tone: "studio" | "pink" | "white";
  dielineCost?: number;
  disabled?: boolean;
  onChangeSurface: (surface: "outside" | "inside") => void;
  onSelectPanel: (panelId: string) => void;
  onOpenFaceEditor: (panelId: string, surface: "outside" | "inside") => void;
  onChangeArtwork: (next: PackagingArtworkState) => void;
  onRemoveFaceArtwork: (panelId: string, surface: "outside" | "inside") => void;
  onDownloadDieline: (format: "svg" | "pdf" | "dxf") => void;
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
  dielineCost = 20,
  disabled = false,
  onChangeSurface,
  onSelectPanel,
  onOpenFaceEditor,
  onChangeArtwork,
  onRemoveFaceArtwork,
  onDownloadDieline,
  onClearAll,
}: Props) {
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
          <strong>Click any face in 3D</strong> to edit its artwork directly. Each face has its own
          independent artwork &amp; saved history.
        </span>
      </div>

      {/* Dual-Surface Print Switch (Outside / Inside) */}
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>
          <Layers size={13} aria-hidden="true" /> Print Side
        </span>
        <div className={styles.segmented} role="group" aria-label="Print surface">
          <button
            type="button"
            aria-pressed={surface === "outside"}
            disabled={disabled}
            onClick={() => onChangeSurface("outside")}
          >
            Outside
          </button>
          <button
            type="button"
            aria-pressed={surface === "inside"}
            disabled={disabled}
            onClick={() => onChangeSurface("inside")}
          >
            Inside
          </button>
        </div>
      </div>

      {/* Per-Face Independent Artwork List */}
      <section className={styles.inspectorSection}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>
            Box Faces ({surface === "outside" ? "Outside" : "Inside"})
          </span>
          <span style={{ fontSize: 10, color: "var(--pkg-muted)" }}>{editablePanels.length} faces</span>
        </div>

        <div className={styles.faceList} role="list" aria-label="Independent box face artwork slots">
          {editablePanels.map((panel) => {
            const key = overlayKey(surface, panel.id);
            const ov = artwork.panelOverlays[key];
            const dims = getPanelUprightSizeMm(panel);
            const isSelected = activePanel?.id === panel.id;
            const hasFaceDesign = Boolean(ov?.imageUrl || ov?.fillColor || ov?.text?.trim());
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
                    <strong>{panel.label}</strong>
                    <small>
                      {dims.widthMm} × {dims.heightMm} mm
                      {ov?.artworkName ? ` · ${ov.artworkName}` : hasFaceDesign ? " · Custom" : " · Empty"}
                    </small>
                  </span>
                </button>
                <button
                  type="button"
                  className={styles.faceEditBtn}
                  disabled={disabled}
                  title={`Replace artwork on ${panel.label} (${surface})`}
                  onClick={() => {
                    onSelectPanel(panel.id);
                    onOpenFaceEditor(panel.id, surface);
                  }}
                >
                  <ImagePlus size={13} aria-hidden="true" />
                  <span>{ov?.imageUrl ? "Replace" : "Add"}</span>
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
              {activePanel.label} ({surface})
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
              ? `Edit / Replace ${activePanel.shortCode} artwork`
              : `Upload artwork for ${activePanel.shortCode}`}
          </button>

          {/* Selected Panel Background Color */}
          <div className={styles.colorPairRow}>
            <label className={styles.colorMini}>
              <span>Face tint</span>
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
              Reset tint
            </button>
          </div>

          {activeOverlay.imageUrl && (
            <button
              type="button"
              className={styles.dielineExportBtn}
              disabled={disabled}
              onClick={() => onRemoveFaceArtwork(activePanel.id, surface)}
            >
              <Trash2 size={12} /> Remove artwork from {activePanel.shortCode}
            </button>
          )}

          {/* Quick Brand Text for this face */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className={styles.sectionTitle}>
              <Type size={12} aria-hidden="true" /> Quick text on {activePanel.shortCode}
            </span>
            <input
              type="text"
              className={styles.textField}
              placeholder={`e.g. HYPERMOCKUP · ${activePanel.shortCode}`}
              maxLength={48}
              disabled={disabled}
              value={activeOverlay.text ?? ""}
              onChange={(e) => updateOverlay({ text: e.target.value })}
            />
            {activeOverlay.text?.trim() && (
              <div className={styles.colorPairRow}>
                <label className={styles.colorMini}>
                  <span>Text color</span>
                  <input
                    type="color"
                    value={activeOverlay.textColor ?? "#1e293b"}
                    disabled={disabled}
                    onChange={(e) => updateOverlay({ textColor: e.target.value })}
                  />
                </label>
                <div className={styles.sliderRow}>
                  <div className={styles.sliderHead}>
                    <label htmlFor="panel-text-sz">Size</label>
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

      {/* 1:1 mm Manufacturing CAD Dieline Export */}
      <section className={styles.inspectorSection}>
        <div className={styles.dielineCostRow}>
          <span>1:1 mm Dieline Export</span>
          <span
            className={styles.dielineCostBadge}
            aria-label={dielineCost === 0 ? "Free export" : `${dielineCost} coins per file`}
          >
            {dielineCost === 0 ? (
              "Free"
            ) : (
              <>
                <Image src="/branding/LLCoin.svg" alt="" width={12} height={12} aria-hidden="true" />
                <span>{dielineCost}</span>
              </>
            )}
          </span>
        </div>
        <div className={styles.dielineExportRow}>
          <button
            type="button"
            className={styles.dielineExportBtn}
            disabled={disabled}
            onClick={() => onDownloadDieline("svg")}
            title={`Download 1:1 mm SVG · ${dielineCost === 0 ? "Free" : `${dielineCost} coins`}`}
          >
            <Download size={12} /> SVG
          </button>
          <button
            type="button"
            className={styles.dielineExportBtn}
            disabled={disabled}
            onClick={() => onDownloadDieline("pdf")}
            title={`Download 1:1 mm PDF · ${dielineCost === 0 ? "Free" : `${dielineCost} coins`}`}
          >
            <Download size={12} /> PDF
          </button>
          <button
            type="button"
            className={styles.dielineExportBtn}
            disabled={disabled}
            onClick={() => onDownloadDieline("dxf")}
            title={`Download 1:1 mm DXF · ${dielineCost === 0 ? "Free" : `${dielineCost} coins`}`}
          >
            <Download size={12} /> DXF
          </button>
        </div>
      </section>

      {/* Clear All Faces */}
      {hasAnyArtwork && (
        <button
          type="button"
          className={styles.dielineExportBtn}
          disabled={disabled}
          onClick={onClearAll}
        >
          <Trash2 size={12} /> Clear all box faces
        </button>
      )}
    </div>
  );
}
