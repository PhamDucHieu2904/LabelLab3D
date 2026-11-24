"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  Download,
  Layers,
  RotateCcw,
  Ruler,
  Sliders,
  Sparkles,
  Wrench,
} from "lucide-react";
import type {
  BoardMaterialPreset,
  PackagingParams,
  PackagingPartGroup,
  PackagingTemplateDefinition,
  SolvedDieline,
} from "@/lib/packaging-cad/types";
import { BOARD_MATERIAL_PRESETS, getBoardMaterialPreset } from "@/lib/packaging-cad/materials/paper-presets";
import styles from "./PackagingStudio.module.css";

interface Props {
  template: PackagingTemplateDefinition;
  params: PackagingParams;
  solved: SolvedDieline;
  tone: "studio" | "pink" | "white";
  disabled?: boolean;
  onChange: (patch: Partial<PackagingParams>, interactive?: boolean) => void;
  onReset: () => void;
  onHoverPart: (part: PackagingPartGroup | null) => void;
  onDownloadDieline: (format: "svg" | "pdf" | "dxf") => void;
}

export default function PackagingInspector({
  template,
  params,
  solved,
  tone,
  disabled = false,
  onChange,
  onReset,
  onHoverPart,
  onDownloadDieline,
}: Props) {
  const [proCadMode, setProCadMode] = useState(false);

  const selectMaterial = (preset: BoardMaterialPreset) => {
    onChange({
      materialId: preset.id,
      thicknessMm: preset.thicknessMm,
      bendAllowanceK: preset.bendAllowanceK,
      outsideColor: preset.outsideColor,
      insideColor: preset.insideColor,
      outsideRoughness: preset.outsideRoughness,
      outsideMetalness: preset.outsideMetalness,
      insideRoughness: preset.insideRoughness,
    });
  };

  const oppositeMode = params.dimensionMode === "inner" ? "Outer" : "Inner";
  const oppositeDims = params.dimensionMode === "inner" ? solved.outerMm : solved.innerMm;
  const f = template.features;

  return (
    <div
      className={styles.inspector}
      data-tone={tone}
      onMouseLeave={() => onHoverPart(null)}
    >
      {/* TIER 1: ESSENTIAL DIMENSIONS & QUICK PRESETS */}
      <section className={styles.inspectorSection}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>
            <Ruler size={14} aria-hidden="true" />
            Dimensions (mm)
          </h3>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div className={styles.segmented} role="group" aria-label="Dimension reference mode">
              <button
                type="button"
                aria-pressed={params.dimensionMode === "inner"}
                disabled={disabled}
                onClick={() => onChange({ dimensionMode: "inner" })}
                title="Clear interior space inside the box"
              >
                Inner
              </button>
              <button
                type="button"
                aria-pressed={params.dimensionMode === "outer"}
                disabled={disabled}
                onClick={() => onChange({ dimensionMode: "outer" })}
                title="Overall exterior shipping footprint"
              >
                Outer
              </button>
            </div>
            <button
              type="button"
              className={styles.dockIconBtn}
              onClick={onReset}
              disabled={disabled}
              title="Reset dimensions & material to template defaults"
              aria-label="Reset packaging parameters"
            >
              <RotateCcw size={13} />
            </button>
          </div>
        </div>

        <div className={styles.dimStack}>
          {([
            {
              key: "lengthMm" as const,
              code: "L",
              label: "Length",
              part: "length" as const,
              min: template.minDimensions.length,
              max: template.maxDimensions.length,
            },
            {
              key: "widthMm" as const,
              code: "W",
              label: "Width",
              part: "width" as const,
              min: template.minDimensions.width,
              max: template.maxDimensions.width,
            },
            {
              key: "heightMm" as const,
              code: "H",
              label: "Height",
              part: "height" as const,
              min: template.minDimensions.height,
              max: template.maxDimensions.height,
            },
          ]).map((axis) => (
            <div
              key={axis.key}
              className={styles.dimCard}
              onMouseEnter={() => onHoverPart(axis.part)}
              onFocus={() => onHoverPart(axis.part)}
              onBlur={() => onHoverPart(null)}
            >
              <div className={styles.dimCardTop}>
                <label htmlFor={`pkg-${axis.key}`}>
                  <span className={styles.dimAxisBadge}>{axis.code}</span>
                  <span>{axis.label}</span>
                </label>
                <div className={styles.dimInputRow}>
                  <input
                    id={`pkg-${axis.key}`}
                    type="number"
                    min={axis.min}
                    max={axis.max}
                    step={1}
                    disabled={disabled}
                    value={Math.round(params[axis.key])}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isFinite(n)) onChange({ [axis.key]: Math.max(axis.min, Math.min(axis.max, n)) });
                    }}
                  />
                  <span>mm</span>
                </div>
              </div>
              <input
                type="range"
                className={styles.rangeInput}
                aria-label={`${axis.label} millimetres`}
                min={axis.min}
                max={axis.max}
                step={1}
                disabled={disabled}
                value={params[axis.key]}
                onChange={(e) => onChange({ [axis.key]: Number(e.target.value) }, true)}
                onPointerUp={() => onChange({}, false)}
              />
            </div>
          ))}
        </div>

        <div className={styles.specSummary}>
          <div>
            <span>{oppositeMode} size</span>
            <strong>
              {Math.round(oppositeDims.length)}×{Math.round(oppositeDims.width)}×{Math.round(oppositeDims.height)} mm
            </strong>
          </div>
          <div>
            <span>Flat blank · Est. weight</span>
            <strong>
              {Math.round(solved.blankBounds.width)}×{Math.round(solved.blankBounds.height)} mm · {solved.estimatedWeightG}g
            </strong>
          </div>
        </div>

        {/* Quick Size Presets (including Beverage Auto-Fit presets) */}
        <div className={styles.presetChips} role="group" aria-label="Quick size presets">
          {template.sizePresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={styles.presetChip}
              disabled={disabled}
              title={preset.detail}
              onClick={() => {
                const matPatch = preset.materialId
                  ? (() => {
                      const m = getBoardMaterialPreset(preset.materialId);
                      return {
                        materialId: m.id,
                        thicknessMm: m.thicknessMm,
                        outsideColor: m.outsideColor,
                        insideColor: m.insideColor,
                        outsideRoughness: m.outsideRoughness,
                      };
                    })()
                  : {};
                onChange({
                  lengthMm: preset.lengthMm,
                  widthMm: preset.widthMm,
                  heightMm: preset.heightMm,
                  ...(preset.dimensionMode ? { dimensionMode: preset.dimensionMode } : {}),
                  ...matPatch,
                });
              }}
            >
              <span>{preset.label}</span>
              {preset.beverageFit && <span className={styles.presetChipFit}>Fit</span>}
            </button>
          ))}
        </div>

        {solved.clampNotices.map((notice) => (
          <div key={notice} className={styles.clampNotice} role="status">
            <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{notice}</span>
          </div>
        ))}
      </section>

      {/* TIER 1B: BOARD MATERIAL SWATCHES */}
      <section
        className={styles.inspectorSection}
        onMouseEnter={() => onHoverPart("material")}
        onMouseLeave={() => onHoverPart(null)}
      >
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>
            <Layers size={14} aria-hidden="true" />
            Board & Material
          </h3>
          <span style={{ fontSize: 10, color: "var(--pkg-muted)" }}>{params.thicknessMm.toFixed(2)} mm</span>
        </div>
        <div className={styles.materialGrid} role="group" aria-label="Packaging board materials">
          {BOARD_MATERIAL_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={styles.materialCard}
              aria-pressed={params.materialId === preset.id}
              disabled={disabled}
              title={preset.description}
              onClick={() => selectMaterial(preset)}
            >
              <span className={styles.materialSwatch} style={{ background: preset.swatchGradient }} />
              <span className={styles.materialInfo}>
                <strong>{preset.shortName}</strong>
                <small>{preset.thicknessMm} mm · {preset.gsm}gsm</small>
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* TIER 2: STRUCTURE, LOCKS & CUTOUTS */}
      <section className={styles.inspectorSection}>
        <details className={styles.accordion} open>
          <summary>
            <span className={styles.sectionTitle}>
              <Sliders size={13} aria-hidden="true" />
              Structure & Cutouts
            </span>
            <ChevronDown size={14} aria-hidden="true" />
          </summary>
          <div className={styles.accordionBody}>
            {f.lockTabs && (
              <div
                onMouseEnter={() => onHoverPart("locks")}
                onMouseLeave={() => onHoverPart(null)}
                style={{ display: "flex", flexDirection: "column", gap: 8 }}
              >
                <div className={styles.sectionHeader}>
                  <span style={{ fontSize: 11, fontWeight: 550 }}>Lock tabs per side</span>
                  <div className={styles.segmented}>
                    <button
                      type="button"
                      aria-pressed={params.lockTabCount === 1}
                      disabled={disabled}
                      onClick={() => onChange({ lockTabCount: 1 })}
                    >
                      1 Tab
                    </button>
                    <button
                      type="button"
                      aria-pressed={params.lockTabCount === 2}
                      disabled={disabled}
                      onClick={() => onChange({ lockTabCount: 2 })}
                    >
                      2 Tabs
                    </button>
                  </div>
                </div>
                <div className={styles.sliderRow}>
                  <div className={styles.sliderHead}>
                    <label htmlFor="pkg-lock-tab-w">Lock tab width</label>
                    <output>{Math.round(params.lockTabWidthMm)} mm</output>
                  </div>
                  <input
                    id="pkg-lock-tab-w"
                    type="range"
                    className={styles.rangeInput}
                    min={12}
                    max={90}
                    step={1}
                    disabled={disabled}
                    value={params.lockTabWidthMm}
                    onChange={(e) => onChange({ lockTabWidthMm: Number(e.target.value) }, true)}
                    onPointerUp={() => onChange({}, false)}
                  />
                </div>
              </div>
            )}

            {f.tuckStyle && (
              <div
                onMouseEnter={() => onHoverPart("lid")}
                onMouseLeave={() => onHoverPart(null)}
                style={{ display: "flex", flexDirection: "column", gap: 8 }}
              >
                <div className={styles.sectionHeader}>
                  <span style={{ fontSize: 11, fontWeight: 550 }}>Tuck style</span>
                  <div className={styles.segmented}>
                    <button
                      type="button"
                      aria-pressed={params.tuckStyle === "reverse"}
                      disabled={disabled}
                      onClick={() => onChange({ tuckStyle: "reverse" })}
                    >
                      Reverse
                    </button>
                    <button
                      type="button"
                      aria-pressed={params.tuckStyle === "straight"}
                      disabled={disabled}
                      onClick={() => onChange({ tuckStyle: "straight" })}
                    >
                      Straight
                    </button>
                  </div>
                </div>
                <div className={styles.sliderRow}>
                  <div className={styles.sliderHead}>
                    <label htmlFor="pkg-tuck-len">Tuck flap length</label>
                    <output>{Math.round(params.tuckFlapLengthMm)} mm</output>
                  </div>
                  <input
                    id="pkg-tuck-len"
                    type="range"
                    className={styles.rangeInput}
                    min={10}
                    max={36}
                    step={1}
                    disabled={disabled}
                    value={params.tuckFlapLengthMm}
                    onChange={(e) => onChange({ tuckFlapLengthMm: Number(e.target.value) }, true)}
                  />
                </div>
              </div>
            )}

            {f.flapGap && (
              <div
                className={styles.sliderRow}
                onMouseEnter={() => onHoverPart("lid")}
                onMouseLeave={() => onHoverPart(null)}
              >
                <div className={styles.sliderHead}>
                  <label htmlFor="pkg-flap-gap">Top & bottom flap gap</label>
                  <output>{params.flapGapMm.toFixed(1)} mm</output>
                </div>
                <input
                  id="pkg-flap-gap"
                  type="range"
                  className={styles.rangeInput}
                  min={0}
                  max={25}
                  step={0.5}
                  disabled={disabled}
                  value={params.flapGapMm}
                  onChange={(e) => onChange({ flapGapMm: Number(e.target.value) }, true)}
                />
              </div>
            )}

            {f.dustFlapTaper && (
              <div
                className={styles.sliderRow}
                onMouseEnter={() => onHoverPart("flaps")}
                onMouseLeave={() => onHoverPart(null)}
              >
                <div className={styles.sliderHead}>
                  <label htmlFor="pkg-taper">Corner dust flap taper</label>
                  <output>{params.dustFlapTaperDeg}°</output>
                </div>
                <input
                  id="pkg-taper"
                  type="range"
                  className={styles.rangeInput}
                  min={0}
                  max={20}
                  step={1}
                  disabled={disabled}
                  value={params.dustFlapTaperDeg}
                  onChange={(e) => onChange({ dustFlapTaperDeg: Number(e.target.value) }, true)}
                />
              </div>
            )}

            {f.thumbNotch && (
              <label
                className={styles.switchRow}
                onMouseEnter={() => onHoverPart("height")}
                onMouseLeave={() => onHoverPart(null)}
              >
                <span>Thumb opening notch</span>
                <input
                  type="checkbox"
                  checked={params.thumbNotch}
                  disabled={disabled}
                  onChange={(e) => onChange({ thumbNotch: e.target.checked })}
                />
              </label>
            )}

            {f.displayScoop && (
              <div
                onMouseEnter={() => onHoverPart("height")}
                onMouseLeave={() => onHoverPart(null)}
              >
                <label className={styles.switchRow}>
                  <span>Front retail display scoop</span>
                  <input
                    type="checkbox"
                    checked={params.displayScoop}
                    disabled={disabled}
                    onChange={(e) => onChange({ displayScoop: e.target.checked, ...(e.target.checked ? { windowCutout: false } : {}) })}
                  />
                </label>
                {params.displayScoop && (
                  <div className={styles.sliderRow}>
                    <div className={styles.sliderHead}>
                      <label htmlFor="pkg-scoop-depth">Scoop depth</label>
                      <output>{Math.round(params.displayScoopDepthMm)} mm</output>
                    </div>
                    <input
                      id="pkg-scoop-depth"
                      type="range"
                      className={styles.rangeInput}
                      min={8}
                      max={90}
                      step={1}
                      disabled={disabled}
                      value={params.displayScoopDepthMm}
                      onChange={(e) => onChange({ displayScoopDepthMm: Number(e.target.value) }, true)}
                    />
                  </div>
                )}
              </div>
            )}

            {f.handHoles && (
              <div
                onMouseEnter={() => onHoverPart("width")}
                onMouseLeave={() => onHoverPart(null)}
              >
                <label className={styles.switchRow}>
                  <span>Side carry hand holes</span>
                  <input
                    type="checkbox"
                    checked={params.handHoles}
                    disabled={disabled}
                    onChange={(e) => onChange({ handHoles: e.target.checked })}
                  />
                </label>
                {params.handHoles && (
                  <div className={styles.sliderRow}>
                    <div className={styles.sliderHead}>
                      <label htmlFor="pkg-hh-w">Handle width</label>
                      <output>{Math.round(params.handHoleWidthMm)} mm</output>
                    </div>
                    <input
                      id="pkg-hh-w"
                      type="range"
                      className={styles.rangeInput}
                      min={36}
                      max={110}
                      step={2}
                      disabled={disabled}
                      value={params.handHoleWidthMm}
                      onChange={(e) => onChange({ handHoleWidthMm: Number(e.target.value) }, true)}
                    />
                  </div>
                )}
              </div>
            )}

            {f.windowCutout && !params.displayScoop && (
              <div
                onMouseEnter={() => onHoverPart("lid")}
                onMouseLeave={() => onHoverPart(null)}
              >
                <label className={styles.switchRow}>
                  <span>Display window cutout</span>
                  <input
                    type="checkbox"
                    checked={params.windowCutout}
                    disabled={disabled}
                    onChange={(e) => onChange({ windowCutout: e.target.checked })}
                  />
                </label>
                {params.windowCutout && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                    <div className={styles.sliderRow}>
                      <div className={styles.sliderHead}>
                        <label htmlFor="pkg-win-w">Window width</label>
                        <output>{Math.round(params.windowWidthMm)} mm</output>
                      </div>
                      <input
                        id="pkg-win-w"
                        type="range"
                        className={styles.rangeInput}
                        min={20}
                        max={Math.max(40, Math.round(params.lengthMm - 28))}
                        step={2}
                        disabled={disabled}
                        value={params.windowWidthMm}
                        onChange={(e) => onChange({ windowWidthMm: Number(e.target.value) }, true)}
                      />
                    </div>
                    <div className={styles.sliderRow}>
                      <div className={styles.sliderHead}>
                        <label htmlFor="pkg-win-h">Window height</label>
                        <output>{Math.round(params.windowHeightMm)} mm</output>
                      </div>
                      <input
                        id="pkg-win-h"
                        type="range"
                        className={styles.rangeInput}
                        min={16}
                        max={Math.max(36, Math.round(Math.max(params.widthMm, params.heightMm) - 24))}
                        step={2}
                        disabled={disabled}
                        value={params.windowHeightMm}
                        onChange={(e) => onChange({ windowHeightMm: Number(e.target.value) }, true)}
                      />
                    </div>
                    <label className={styles.switchRow}>
                      <span>Clear PET window film</span>
                      <input
                        type="checkbox"
                        checked={params.windowFilm}
                        disabled={disabled}
                        onChange={(e) => onChange({ windowFilm: e.target.checked })}
                      />
                    </label>
                  </div>
                )}
              </div>
            )}

            {/* Outside / Inside surface color & finish */}
            <div className={styles.colorPairRow}>
              <label className={styles.colorMini}>
                <span>Outside</span>
                <input
                  type="color"
                  value={params.outsideColor}
                  disabled={disabled}
                  onChange={(e) => onChange({ outsideColor: e.target.value })}
                />
              </label>
              <label className={styles.colorMini}>
                <span>Inside</span>
                <input
                  type="color"
                  value={params.insideColor}
                  disabled={disabled}
                  onChange={(e) => onChange({ insideColor: e.target.value })}
                />
              </label>
            </div>
            <div className={styles.sliderRow}>
              <div className={styles.sliderHead}>
                <label htmlFor="pkg-out-rough">Print finish (Gloss ↔ Matte)</label>
                <output>{Math.round(params.outsideRoughness * 100)}%</output>
              </div>
              <input
                id="pkg-out-rough"
                type="range"
                className={styles.rangeInput}
                min={0.08}
                max={0.96}
                step={0.02}
                disabled={disabled}
                value={params.outsideRoughness}
                onChange={(e) => onChange({ outsideRoughness: Number(e.target.value) })}
              />
            </div>
          </div>
        </details>
      </section>

      {/* TIER 3: PRO CAD ENGINEERING MODE */}
      <section className={styles.inspectorSection}>
        <div className={styles.sectionHeader}>
          <label className={styles.switchRow} style={{ flex: 1 }}>
            <span className={styles.sectionTitle}>
              <Wrench size={13} aria-hidden="true" />
              Pro CAD Mode
              <span className={styles.proCadBadge}>
                <Sparkles size={9} /> Eng
              </span>
            </span>
            <input
              type="checkbox"
              checked={proCadMode}
              disabled={disabled}
              onChange={(e) => setProCadMode(e.target.checked)}
            />
          </label>
        </div>

        {proCadMode && (
          <div className={styles.accordion} style={{ padding: 10, display: "flex", flexDirection: "column", gap: 9 }}>
            <div className={styles.sliderRow}>
              <div className={styles.sliderHead}>
                <label htmlFor="pkg-thick">Exact board caliper (t)</label>
                <output>{params.thicknessMm.toFixed(2)} mm</output>
              </div>
              <input
                id="pkg-thick"
                type="range"
                className={styles.rangeInput}
                min={0.3}
                max={6.0}
                step={0.05}
                disabled={disabled}
                value={params.thicknessMm}
                onChange={(e) => onChange({ thicknessMm: Number(e.target.value) }, true)}
                onPointerUp={() => onChange({}, false)}
              />
            </div>

            <div className={styles.sectionHeader}>
              <span style={{ fontSize: 11, fontWeight: 550 }}>Flute direction</span>
              <div className={styles.segmented}>
                <button
                  type="button"
                  aria-pressed={params.fluteDirection === "along-L"}
                  disabled={disabled}
                  onClick={() => onChange({ fluteDirection: "along-L" })}
                >
                  Along L
                </button>
                <button
                  type="button"
                  aria-pressed={params.fluteDirection === "along-W"}
                  disabled={disabled}
                  onClick={() => onChange({ fluteDirection: "along-W" })}
                >
                  Along W
                </button>
              </div>
            </div>

            <div className={styles.sliderRow}>
              <div className={styles.sliderHead}>
                <label htmlFor="pkg-clearance">Lock & fold clearance</label>
                <output>{params.slotClearanceMm.toFixed(2)} mm</output>
              </div>
              <input
                id="pkg-clearance"
                type="range"
                className={styles.rangeInput}
                min={0.1}
                max={1.2}
                step={0.05}
                disabled={disabled}
                value={params.slotClearanceMm}
                onChange={(e) => onChange({ slotClearanceMm: Number(e.target.value) }, true)}
              />
            </div>

            <div className={styles.sliderRow}>
              <div className={styles.sliderHead}>
                <label htmlFor="pkg-bleed">Print bleed margin</label>
                <output>{params.bleedMm.toFixed(1)} mm</output>
              </div>
              <input
                id="pkg-bleed"
                type="range"
                className={styles.rangeInput}
                min={0}
                max={10}
                step={0.5}
                disabled={disabled}
                value={params.bleedMm}
                onChange={(e) => onChange({ bleedMm: Number(e.target.value) })}
              />
            </div>

            <label className={styles.switchRow}>
              <span>Show crease guidelines</span>
              <input
                type="checkbox"
                checked={params.showCreaseLines}
                disabled={disabled}
                onChange={(e) => onChange({ showCreaseLines: e.target.checked })}
              />
            </label>

            <div className={styles.specSummary}>
              <div>
                <span>Net sheet area</span>
                <strong>{solved.blankAreaM2.toFixed(3)} m²</strong>
              </div>
              <div>
                <span>Panels / Creases</span>
                <strong>{solved.flatPanels.length} panels · {solved.creaseSegments.length} folds</strong>
              </div>
            </div>
          </div>
        )}

        {/* 1:1 mm Production Dieline Vector Export */}
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 650, marginBottom: 6, color: "var(--pkg-muted)" }}>
            Download 1:1 mm Dieline Vector
          </div>
          <div className={styles.dielineExportRow}>
            <button
              type="button"
              className={styles.dielineExportBtn}
              disabled={disabled}
              onClick={() => onDownloadDieline("svg")}
              title="Scalable Vector Graphics 1:1 mm (Illustrator / Inkscape)"
            >
              <Download size={12} /> SVG
            </button>
            <button
              type="button"
              className={styles.dielineExportBtn}
              disabled={disabled}
              onClick={() => onDownloadDieline("pdf")}
              title="True Vector PDF 1:1 mm with Cut/Crease/Bleed"
            >
              <Download size={12} /> PDF
            </button>
            <button
              type="button"
              className={styles.dielineExportBtn}
              disabled={disabled}
              onClick={() => onDownloadDieline("dxf")}
              title="AutoCAD DXF R12 (mm) for CNC die-cutters"
            >
              <Download size={12} /> DXF
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
