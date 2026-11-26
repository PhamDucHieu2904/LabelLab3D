"use client";

import {
  Box,
  Columns2,
  FileCode2,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Ruler,
  Tag,
} from "lucide-react";
import { useLocale } from "../LocaleProvider";
import styles from "./PackagingStudio.module.css";

export type PackagingViewMode = "3d" | "split" | "2d";

export interface PackagingCameraViewPreset {
  readonly id: string;
  readonly label: string;
  readonly yawDeg: number;
  readonly pitchDeg: number;
  readonly fov?: number;
}

export const PACKAGING_CAMERA_PRESETS: readonly PackagingCameraViewPreset[] = Object.freeze([
  { id: "iso", label: "3/4", yawDeg: 34, pitchDeg: 28, fov: 32 },
  { id: "front", label: "Front", yawDeg: 0, pitchDeg: 14, fov: 30 },
  { id: "top", label: "Top", yawDeg: 0, pitchDeg: 86, fov: 28 },
  { id: "side", label: "Side", yawDeg: 90, pitchDeg: 16, fov: 30 },
  { id: "inside", label: "Inside", yawDeg: -38, pitchDeg: 46, fov: 34 },
]);

interface Props {
  foldProgress: number;
  foldPlaying: boolean;
  viewMode: PackagingViewMode;
  showDimensions: boolean;
  showFaceLabels: boolean;
  activeCameraId: string;
  disabled?: boolean;
  onFoldChange: (progress: number) => void;
  onToggleFoldPlay: () => void;
  onViewModeChange: (mode: PackagingViewMode) => void;
  onToggleDimensions: () => void;
  onToggleFaceLabels: () => void;
  onSelectCamera: (preset: PackagingCameraViewPreset) => void;
  onZoom: (factor: number) => void;
  onResetCamera: () => void;
}

export default function PackagingBottomDock({
  foldProgress,
  foldPlaying,
  viewMode,
  showDimensions,
  showFaceLabels,
  activeCameraId,
  disabled = false,
  onFoldChange,
  onToggleFoldPlay,
  onViewModeChange,
  onToggleDimensions,
  onToggleFaceLabels,
  onSelectCamera,
  onZoom,
  onResetCamera,
}: Props) {
  const { t } = useLocale();
  const vp = t.studio.viewport;
  const pct = Math.round(foldProgress * 100);

  return (
    <div className={styles.bottomDock} role="toolbar" aria-label="Packaging folding and view controls">
      {/* Folding Kinematics Pill (Open <-> Close + Play Animation) */}
      <div className={styles.dockPill}>
        <button
          type="button"
          className={styles.dockIconBtn}
          aria-pressed={foldPlaying}
          aria-label={foldPlaying ? "Pause folding animation" : "Play folding animation"}
          title={foldPlaying ? "Pause fold animation" : "Play open/close fold animation"}
          disabled={disabled}
          onClick={onToggleFoldPlay}
        >
          {foldPlaying ? <Pause size={14} /> : <Play size={14} />}
        </button>

        <div className={styles.foldControl}>
          <button
            type="button"
            className={`${styles.foldTag} ${pct <= 2 ? styles.foldTagActive : ""}`}
            disabled={disabled}
            onClick={() => onFoldChange(0)}
            title={vp.foldOpen}
          >
            {vp.foldOpen}
          </button>
          <input
            type="range"
            className={styles.foldSlider}
            aria-label="Fold progress from flat open to closed box"
            min={0}
            max={1}
            step={0.005}
            disabled={disabled}
            value={foldProgress}
            onChange={(e) => onFoldChange(Number(e.target.value))}
          />
          <button
            type="button"
            className={`${styles.foldTag} ${pct >= 98 ? styles.foldTagActive : ""}`}
            disabled={disabled}
            onClick={() => onFoldChange(1)}
            title={vp.foldClose}
          >
            {vp.foldClose}
          </button>
          <span className={styles.foldPct}>{pct}%</span>
        </div>

        <span className={styles.dockDivider} />

        {/* View Mode: 3D | Split 2D/3D | 2D Dieline */}
        <button
          type="button"
          className={styles.dockIconBtn}
          aria-pressed={viewMode === "3d"}
          disabled={disabled}
          onClick={() => onViewModeChange("3d")}
          title="3D"
        >
          <Box size={14} /> <span>3D</span>
        </button>
        <button
          type="button"
          className={styles.dockIconBtn}
          aria-pressed={viewMode === "split"}
          disabled={disabled}
          onClick={() => onViewModeChange("split")}
          title={vp.viewSplit}
        >
          <Columns2 size={14} /> <span>{vp.viewSplit}</span>
        </button>
        <button
          type="button"
          className={styles.dockIconBtn}
          aria-pressed={viewMode === "2d"}
          disabled={disabled}
          onClick={() => onViewModeChange("2d")}
          title="2D Millimetre Dieline Blueprint"
        >
          <FileCode2 size={14} /> <span>2D</span>
        </button>

        <span className={styles.dockDivider} />

        {/* CAD Overlay toggles */}
        <button
          type="button"
          className={styles.dockIconBtn}
          aria-pressed={showDimensions}
          disabled={disabled}
          onClick={onToggleDimensions}
          title="Toggle 3D millimetre dimension rulers"
        >
          <Ruler size={14} /> <span>mm</span>
        </button>
        <button
          type="button"
          className={styles.dockIconBtn}
          aria-pressed={showFaceLabels}
          disabled={disabled}
          onClick={onToggleFaceLabels}
          title={vp.faces}
        >
          <Tag size={14} /> <span>{vp.faces}</span>
        </button>
      </div>

      {/* Camera Angles & Zoom Pill */}
      {viewMode !== "2d" && (
        <div className={styles.dockPill}>
          {PACKAGING_CAMERA_PRESETS.map((preset) => {
            const label =
              preset.id === "iso"
                ? vp.camIso
                : preset.id === "front"
                  ? vp.camFront
                  : preset.id === "top"
                    ? vp.camTop
                    : preset.id === "side"
                      ? vp.camSide
                      : preset.id === "inside"
                        ? vp.camInside
                        : preset.label;
            return (
              <button
                key={preset.id}
                type="button"
                className={styles.dockIconBtn}
                aria-pressed={activeCameraId === preset.id}
                disabled={disabled}
                onClick={() => onSelectCamera(preset)}
              >
                {label}
              </button>
            );
          })}
          <span className={styles.dockDivider} />
          <button
            type="button"
            className={styles.dockIconBtn}
            aria-label={vp.zoomOut}
            disabled={disabled}
            onClick={() => onZoom(1 / 1.15)}
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            className={styles.dockIconBtn}
            aria-label={vp.zoomIn}
            disabled={disabled}
            onClick={() => onZoom(1.15)}
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            className={styles.dockIconBtn}
            aria-label={vp.reset}
            title={vp.reset}
            disabled={disabled}
            onClick={onResetCamera}
          >
            <RotateCcw size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
