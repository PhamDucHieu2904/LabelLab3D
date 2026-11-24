"use client";

import { useMemo, type ChangeEvent } from "react";
import { Download, ImagePlus, Layers, Sparkles, Trash2, Type, Upload } from "lucide-react";
import type {
  PackagingArtworkState,
  PanelDesignOverlay,
  SolvedDieline,
} from "@/lib/packaging-cad/types";
import styles from "./PackagingStudio.module.css";

interface Props {
  solved: SolvedDieline;
  artwork: PackagingArtworkState;
  surface: "outside" | "inside";
  selectedPanelId: string;
  tone: "studio" | "pink" | "white";
  disabled?: boolean;
  onChangeSurface: (surface: "outside" | "inside") => void;
  onSelectPanel: (panelId: string) => void;
  onChangeArtwork: (next: PackagingArtworkState) => void;
  onDownloadDieline: (format: "svg" | "pdf" | "dxf") => void;
  onClearAll: () => void;
}

const MAX_BYTES = 15 * 1024 * 1024;

function overlayKey(surface: "outside" | "inside", panelId: string): string {
  return `${surface}:${panelId}`;
}

export default function PackagingArtworkPanel({
  solved,
  artwork,
  surface,
  selectedPanelId,
  tone,
  disabled = false,
  onChangeSurface,
  onSelectPanel,
  onChangeArtwork,
  onDownloadDieline,
  onClearAll,
}: Props) {
  const printablePanels = useMemo(
    () => solved.flatPanels.filter((p) => p.printable),
    [solved.flatPanels],
  );
  const activePanel = printablePanels.find((p) => p.id === selectedPanelId) ?? printablePanels[0];
  const activeKey = activePanel ? overlayKey(surface, activePanel.id) : "";
  const activeOverlay: PanelDesignOverlay = (activeKey && artwork.panelOverlays[activeKey]) || {
    panelId: activePanel?.id ?? "front-wall",
    surface,
    imageScale: 0.72,
    imageOffsetX: 0,
    imageOffsetY: 0,
    imageRotationDeg: 0,
    textColor: "#1e293b",
    textSizePct: 24,
  };

  const updateOverlay = (patch: Partial<PanelDesignOverlay>) => {
    if (!activePanel) return;
    const key = overlayKey(surface, activePanel.id);
    onChangeArtwork({
      ...artwork,
      panelOverlays: {
        ...artwork.panelOverlays,
        [key]: { ...activeOverlay, ...patch, panelId: activePanel.id, surface },
      },
    });
  };

  const handleFullDielineFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || file.size > MAX_BYTES) return;
    if (!file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    const prev = surface === "outside" ? artwork.outsideDielineUrl : artwork.insideDielineUrl;
    if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
    onChangeArtwork({
      ...artwork,
      mode: "dieline",
      ...(surface === "outside" ? { outsideDielineUrl: url } : { insideDielineUrl: url }),
    });
  };

  const handlePanelImageFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || file.size > MAX_BYTES || !file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    if (activeOverlay.imageUrl?.startsWith("blob:")) URL.revokeObjectURL(activeOverlay.imageUrl);
    updateOverlay({ imageUrl: url });
  };

  const fullUrl = surface === "outside" ? artwork.outsideDielineUrl : artwork.insideDielineUrl;

  return (
    <div className={`${styles.inspector} ${styles.artworkPanel}`} data-tone={tone}>
      {/* Mode Selector: Quick Panel Designer vs Pro Full Dieline */}
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>
          <Sparkles size={13} aria-hidden="true" /> Design Mode
        </span>
        <div className={styles.segmented} role="group" aria-label="Artwork workflow mode">
          <button
            type="button"
            aria-pressed={artwork.mode === "panel"}
            disabled={disabled}
            onClick={() => onChangeArtwork({ ...artwork, mode: "panel" })}
          >
            Quick Panels
          </button>
          <button
            type="button"
            aria-pressed={artwork.mode === "dieline"}
            disabled={disabled}
            onClick={() => onChangeArtwork({ ...artwork, mode: "dieline" })}
          >
            Full Dieline
          </button>
        </div>
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

      {/* MODE A: FULL DIELINE PRO UPLOAD */}
      {artwork.mode === "dieline" && (
        <section className={styles.inspectorSection}>
          <label className={styles.uploadDrop}>
            <Upload size={20} color="#2563eb" />
            <strong style={{ fontSize: 12 }}>
              {fullUrl ? `Replace ${surface} artwork` : `Upload ${surface} dieline artwork`}
            </strong>
            <span style={{ fontSize: 10.5, color: "var(--pkg-muted)" }}>
              PNG, JPG, WebP, SVG · Fits {Math.round(solved.blankBounds.width)} × {Math.round(solved.blankBounds.height)} mm
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              disabled={disabled}
              onChange={handleFullDielineFile}
            />
          </label>

          {fullUrl && (
            <button
              type="button"
              className={styles.dielineExportBtn}
              disabled={disabled}
              onClick={() => {
                if (fullUrl.startsWith("blob:")) URL.revokeObjectURL(fullUrl);
                onChangeArtwork({
                  ...artwork,
                  ...(surface === "outside" ? { outsideDielineUrl: undefined } : { insideDielineUrl: undefined }),
                });
              }}
            >
              <Trash2 size={12} /> Remove {surface} image
            </button>
          )}

          <div>
            <div style={{ fontSize: 10.5, color: "var(--pkg-muted)", marginBottom: 6 }}>
              Need a 1:1 mm template for Illustrator?
            </div>
            <div className={styles.dielineExportRow}>
              <button type="button" className={styles.dielineExportBtn} disabled={disabled} onClick={() => onDownloadDieline("svg")}>
                <Download size={12} /> SVG
              </button>
              <button type="button" className={styles.dielineExportBtn} disabled={disabled} onClick={() => onDownloadDieline("pdf")}>
                <Download size={12} /> PDF
              </button>
              <button type="button" className={styles.dielineExportBtn} disabled={disabled} onClick={() => onDownloadDieline("dxf")}>
                <Download size={12} /> DXF
              </button>
            </div>
          </div>
        </section>
      )}

      {/* MODE B: QUICK PANEL DESIGNER (NO ILLUSTRATOR NEEDED!) */}
      {artwork.mode === "panel" && activePanel && (
        <section className={styles.inspectorSection}>
          <div style={{ fontSize: 10.5, color: "var(--pkg-muted)" }}>
            Select a face below (or click it in 2D Split View) — text & logos automatically stay upright when folded!
          </div>

          <div className={styles.panelChipGrid} role="group" aria-label="Printable box faces">
            {printablePanels.map((panel) => {
              const key = overlayKey(surface, panel.id);
              const hasContent = Boolean(
                artwork.panelOverlays[key]?.fillColor ||
                  artwork.panelOverlays[key]?.imageUrl ||
                  artwork.panelOverlays[key]?.text?.trim(),
              );
              return (
                <button
                  key={panel.id}
                  type="button"
                  className={styles.panelChip}
                  aria-pressed={panel.id === activePanel.id}
                  disabled={disabled}
                  onClick={() => onSelectPanel(panel.id)}
                >
                  <span>{panel.label}</span>
                  {hasContent && <span style={{ width: 6, height: 6, borderRadius: 99, background: "#2563eb" }} />}
                </button>
              );
            })}
          </div>

          {/* Selected Panel Background Color */}
          <div className={styles.colorPairRow}>
            <label className={styles.colorMini}>
              <span>Face tint</span>
              <input
                type="color"
                value={activeOverlay.fillColor ?? (surface === "outside" ? solved.params.outsideColor : solved.params.insideColor)}
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

          {/* Selected Panel Logo / Artwork Upload */}
          <label className={styles.uploadDrop} style={{ padding: "10px 8px" }}>
            <ImagePlus size={18} color="#2563eb" />
            <strong style={{ fontSize: 11.5 }}>
              {activeOverlay.imageUrl ? `Replace logo on ${activePanel.shortCode}` : `Add logo / artwork to ${activePanel.shortCode}`}
            </strong>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              disabled={disabled}
              onChange={handlePanelImageFile}
            />
          </label>

          {activeOverlay.imageUrl && (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <div className={styles.sliderRow}>
                <div className={styles.sliderHead}>
                  <label htmlFor="panel-img-scale">Logo scale</label>
                  <output>{Math.round(activeOverlay.imageScale * 100)}%</output>
                </div>
                <input
                  id="panel-img-scale"
                  type="range"
                  className={styles.rangeInput}
                  min={0.15}
                  max={1.8}
                  step={0.02}
                  disabled={disabled}
                  value={activeOverlay.imageScale}
                  onChange={(e) => updateOverlay({ imageScale: Number(e.target.value) })}
                />
              </div>
              <div className={styles.sliderRow}>
                <div className={styles.sliderHead}>
                  <label htmlFor="panel-img-rot">Rotation</label>
                  <output>{activeOverlay.imageRotationDeg}°</output>
                </div>
                <input
                  id="panel-img-rot"
                  type="range"
                  className={styles.rangeInput}
                  min={-180}
                  max={180}
                  step={5}
                  disabled={disabled}
                  value={activeOverlay.imageRotationDeg}
                  onChange={(e) => updateOverlay({ imageRotationDeg: Number(e.target.value) })}
                />
              </div>
              <button
                type="button"
                className={styles.dielineExportBtn}
                disabled={disabled}
                onClick={() => {
                  if (activeOverlay.imageUrl?.startsWith("blob:")) URL.revokeObjectURL(activeOverlay.imageUrl);
                  updateOverlay({ imageUrl: undefined });
                }}
              >
                <Trash2 size={12} /> Remove face logo
              </button>
            </div>
          )}

          {/* Quick Brand Text */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className={styles.sectionTitle}>
              <Type size={12} aria-hidden="true" /> Quick brand label
            </span>
            <input
              type="text"
              className={styles.textField}
              placeholder={`e.g. LABELLAB · ${activePanel.shortCode}`}
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

      {/* Clear All */}
      {(artwork.outsideDielineUrl || artwork.insideDielineUrl || Object.keys(artwork.panelOverlays).length > 0) && (
        <button
          type="button"
          className={styles.dielineExportBtn}
          disabled={disabled}
          onClick={onClearAll}
        >
          <Trash2 size={12} /> Clear all box artwork
        </button>
      )}
    </div>
  );
}
