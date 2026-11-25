"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BookmarkCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  ImagePlus,
  Layers,
  Milk,
  RotateCcw,
  Ruler,
  Sliders,
  Sparkles,
  Upload,
  Wand2,
  Wrench,
} from "lucide-react";
import type {
  BoardMaterialPreset,
  BottlePackConfig,
  PackagingFinishTarget,
  PackagingParams,
  PackagingPartGroup,
  PackagingTemplateDefinition,
  SolvedDieline,
} from "@/lib/packaging-cad/types";
import {
  BOARD_MATERIAL_PRESETS,
  getBoardMaterialPreset,
  getPackagingFinishPreset,
  PACKAGING_FINISH_PRESETS,
} from "@/lib/packaging-cad/materials/paper-presets";
import {
  computeBottlePackLayout,
  getBeverageFootprintMm,
  PACK_GRID_PRESETS,
  type BeverageFootprintMm,
} from "@/lib/packaging-cad/pack-layout";
import { getLabModel, LAB_MODELS } from "@/lib/labellab/catalog";
import type { CustomProjectRecord } from "@/lib/labellab/project-store";
import styles from "./PackagingStudio.module.css";

interface Props {
  template: PackagingTemplateDefinition;
  params: PackagingParams;
  solved: SolvedDieline;
  bottlePack: BottlePackConfig;
  activeBeverageModelId: string;
  hasActiveBeverageArtwork: boolean;
  savedBottleProjects: readonly CustomProjectRecord[];
  projectThumbnails: Record<string, string>;
  hasPackLabelOverride: boolean;
  hasCustomFinishMask?: boolean;
  finishMaskName?: string;
  measuredFootprints: Record<string, BeverageFootprintMm>;
  tone: "studio" | "pink" | "white";
  dielineCost?: number;
  disabled?: boolean;
  onChange: (patch: Partial<PackagingParams>, interactive?: boolean) => void;
  onChangeBottlePack: (patch: Partial<BottlePackConfig>) => void;
  onAutoFitBottlePack: () => void;
  onOpenBottleLabelEditor: () => void;
  onClearPackLabelOverride: () => void;
  onUploadFinishMask?: (file: File) => void;
  onClearFinishMask?: () => void;
  onGoCustomizeBottle: () => void;
  onReset: () => void;
  onHoverPart: (part: PackagingPartGroup | null) => void;
  onDownloadDieline: (format: "svg" | "pdf" | "dxf") => void;
}

const PACK_MODEL_GROUPS: ReadonlyArray<{
  label: string;
  category: "can" | "glass" | "pet" | "pp";
}> = [
  { label: "Aluminum Cans", category: "can" },
  { label: "Glass Bottles", category: "glass" },
  { label: "PET Bottles", category: "pet" },
  { label: "PP Bottles", category: "pp" },
];

export default function PackagingInspector({
  template,
  params,
  solved,
  bottlePack,
  activeBeverageModelId,
  hasActiveBeverageArtwork,
  savedBottleProjects,
  projectThumbnails,
  hasPackLabelOverride,
  hasCustomFinishMask = false,
  finishMaskName,
  measuredFootprints,
  tone,
  dielineCost = 20,
  disabled = false,
  onChange,
  onChangeBottlePack,
  onAutoFitBottlePack,
  onOpenBottleLabelEditor,
  onClearPackLabelOverride,
  onUploadFinishMask,
  onClearFinishMask,
  onGoCustomizeBottle,
  onReset,
  onHoverPart,
  onDownloadDieline,
}: Props) {
  const [proCadMode, setProCadMode] = useState(false);
  const finishMaskInputRef = useRef<HTMLInputElement | null>(null);
  const activeFinishPreset = getPackagingFinishPreset(params.finishMode);
  const [packSourceTab, setPackSourceTab] = useState<"projects" | "catalog">(
    bottlePack.customProjectId ? "projects" : "catalog",
  );

  const activeCustomProject = bottlePack.customProjectId
    ? savedBottleProjects.find((p) => p.id === bottlePack.customProjectId)
    : undefined;
  const selectedBottle = getLabModel(activeCustomProject?.settings.modelId ?? bottlePack.modelId);
  const bottleFootprint =
    measuredFootprints[selectedBottle.id] ??
    getBeverageFootprintMm(selectedBottle.id, selectedBottle.asset.volumeMl);
  const packLayout = bottlePack.enabled
    ? computeBottlePackLayout(solved, bottleFootprint, bottlePack)
    : null;
  const syncedWithActiveStudio = !activeCustomProject && selectedBottle.id === activeBeverageModelId;
  const selectValue = activeCustomProject ? `project:${activeCustomProject.id}` : selectedBottle.id;
  const activeThumb =
    (activeCustomProject ? projectThumbnails[activeCustomProject.id] : undefined) ??
    selectedBottle.poster;

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

      {/* EXCLUSIVE COMBO: PACK YOUR BOTTLES / CANS INSIDE BOX OR TRAY */}
      {f.bottlePacking !== false && (
        <section className={styles.inspectorSection}>
          <div className={styles.comboCard}>
            <label className={styles.switchRow} style={{ minHeight: 24 }}>
              <span className={styles.sectionTitle}>
                <Milk size={14} aria-hidden="true" color="#d53660" />
                Pack Your Bottles
                <span className={styles.comboBadge}>Combo</span>
              </span>
              <input
                type="checkbox"
                aria-label="Pack bottles or cans inside this box"
                checked={bottlePack.enabled}
                disabled={disabled}
                onChange={(e) => onChangeBottlePack({ enabled: e.target.checked })}
              />
            </label>

            {!bottlePack.enabled ? (
              <p style={{ margin: 0, fontSize: 10.5, lineHeight: 1.45, color: "var(--pkg-muted)" }}>
                Mount real 3D LabelLab bottles or cans with your custom label directly inside this{" "}
                {template.shortName.toLowerCase()} and auto-fit exact mm dimensions.
              </p>
            ) : (
              <>
                {/* Source Tabs: Saved Custom Projects vs Standard Beverage Catalog */}
                <div className={styles.comboSourceSwitch} role="group" aria-label="Bottle pack source">
                  <button
                    type="button"
                    aria-pressed={packSourceTab === "projects"}
                    disabled={disabled}
                    onClick={() => setPackSourceTab("projects")}
                  >
                    <BookmarkCheck size={12} aria-hidden="true" />
                    <span>My Projects ({savedBottleProjects.length})</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={packSourceTab === "catalog"}
                    disabled={disabled}
                    onClick={() => setPackSourceTab("catalog")}
                  >
                    <span>Catalog</span>
                  </button>
                </div>

                {packSourceTab === "projects" ? (
                  savedBottleProjects.length > 0 ? (
                    <div className={styles.customProjectList} role="group" aria-label="Saved custom bottle and can projects">
                      {savedBottleProjects.map((project) => {
                        const base = getLabModel(project.settings.modelId);
                        const active = activeCustomProject?.id === project.id;
                        const thumb = projectThumbnails[project.id] || base.poster;
                        return (
                          <button
                            key={project.id}
                            type="button"
                            className={`${styles.customProjectCard} ${active ? styles.customProjectCardActive : ""}`}
                            aria-pressed={active}
                            disabled={disabled}
                            onClick={() =>
                              onChangeBottlePack({
                                customProjectId: project.id,
                                modelId: project.settings.modelId,
                                packLabelArtworkId: undefined,
                              })
                            }
                          >
                            {thumb && <img src={thumb} alt="" className={styles.customProjectThumb} />}
                            <span className={styles.customProjectMeta}>
                              <strong>{project.name}</strong>
                              <small>
                                {base.name} · {base.volume}
                              </small>
                              <span className={styles.customProjectDots}>
                                <i title={`Liquid ${project.settings.liquidColor}`} style={{ backgroundColor: project.settings.liquidColor }} />
                                <i title={`Cap ${project.settings.capColor}`} style={{ backgroundColor: project.settings.capColor }} />
                                <i title={`Body ${project.settings.bodyColor}`} style={{ backgroundColor: project.settings.bodyColor }} />
                                {project.artworkBlob && <span className={styles.customProjectTag}>Custom label</span>}
                              </span>
                            </span>
                            {active && <Check size={14} color="#2563eb" aria-hidden="true" />}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        className={styles.dielineExportBtn}
                        disabled={disabled}
                        onClick={onGoCustomizeBottle}
                      >
                        <ArrowUpRight size={12} aria-hidden="true" /> Customize new bottle in Bottles &amp; Cans
                      </button>
                    </div>
                  ) : (
                    <div className={styles.customProjectEmpty}>
                      <span>
                        No custom projects yet. Customize any bottle or can in{" "}
                        <strong>Bottles &amp; Cans</strong>, click <strong>Save project</strong>, and select
                        it right here!
                      </span>
                      <button
                        type="button"
                        className={styles.comboAutoFitBtn}
                        disabled={disabled}
                        onClick={onGoCustomizeBottle}
                      >
                        <ArrowUpRight size={13} aria-hidden="true" /> Go customize in Bottles &amp; Cans
                      </button>
                    </div>
                  )
                ) : (
                  <div className={styles.comboModelRow}>
                    {activeThumb && (
                      <img
                        src={activeThumb}
                        alt=""
                        className={styles.comboModelThumb}
                      />
                    )}
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                      <select
                        className={styles.comboSelect}
                        aria-label="Choose bottle, can, or saved custom project to pack inside"
                        disabled={disabled}
                        value={selectValue}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw.startsWith("project:")) {
                            const pid = raw.slice("project:".length);
                            const found = savedBottleProjects.find((p) => p.id === pid);
                            if (found) {
                              onChangeBottlePack({
                                customProjectId: found.id,
                                modelId: found.settings.modelId,
                                packLabelArtworkId: undefined,
                              });
                              return;
                            }
                          }
                          onChangeBottlePack({
                            customProjectId: undefined,
                            modelId: raw,
                            packLabelArtworkId: undefined,
                          });
                        }}
                      >
                        {savedBottleProjects.length > 0 && (
                          <optgroup label="★ My Custom Projects">
                            {savedBottleProjects.map((project) => {
                              const base = getLabModel(project.settings.modelId);
                              return (
                                <option key={project.id} value={`project:${project.id}`}>
                                  ★ {project.name} ({base.volume})
                                </option>
                              );
                            })}
                          </optgroup>
                        )}
                        {PACK_MODEL_GROUPS.map((group) => {
                          const items = LAB_MODELS.filter((m) => m.category === group.category);
                          if (!items.length) return null;
                          return (
                            <optgroup key={group.category} label={group.label}>
                              {items.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name} ({m.volume})
                                </option>
                              ))}
                            </optgroup>
                          );
                        })}
                      </select>
                      <div className={styles.comboMetaLine}>
                        <span>
                          Ø {Math.round(bottleFootprint.diameterXMm)} × {Math.round(bottleFootprint.heightMm)} mm
                        </span>
                        {activeCustomProject ? (
                          <span className={styles.comboSyncTag}>Custom: {activeCustomProject.name}</span>
                        ) : syncedWithActiveStudio ? (
                          <span className={styles.comboSyncTag}>
                            {hasActiveBeverageArtwork ? "Your label synced" : "Active Studio model"}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}

                {packSourceTab === "projects" && activeCustomProject && (
                  <div className={styles.comboMetaLine}>
                    <span>
                      Ø {Math.round(bottleFootprint.diameterXMm)} × {Math.round(bottleFootprint.heightMm)} mm
                    </span>
                    <span className={styles.comboSyncTag}>Active: {activeCustomProject.name}</span>
                  </div>
                )}

                {/* Quick Replace Bottle Label for ALL bottles in tray */}
                <div className={styles.comboLabelRow}>
                  <button
                    type="button"
                    className={styles.comboLabelBtn}
                    disabled={disabled}
                    onClick={onOpenBottleLabelEditor}
                    title="Click any bottle label in 3D or use this button to replace artwork across all packed bottles"
                  >
                    <ImagePlus size={13} aria-hidden="true" />
                    <span>
                      Replace label (all {bottlePack.cols * bottlePack.rows} pcs)
                    </span>
                  </button>
                  {hasPackLabelOverride && (
                    <button
                      type="button"
                      className={styles.comboResetLink}
                      disabled={disabled}
                      onClick={onClearPackLabelOverride}
                      title="Revert tray label override"
                    >
                      Reset
                    </button>
                  )}
                </div>

                {/* Quick Pack Count Grid Presets */}
                <div className={styles.comboGridPills} role="group" aria-label="Pack quantity grid presets">
                  {PACK_GRID_PRESETS.map((preset) => {
                    const active = bottlePack.cols === preset.cols && bottlePack.rows === preset.rows;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        className={styles.comboGridBtn}
                        aria-pressed={active}
                        disabled={disabled}
                        onClick={() => onChangeBottlePack({ cols: preset.cols, rows: preset.rows })}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>

                {/* Custom Columns × Rows Steppers */}
                <div className={styles.comboStepperRow}>
                  <div className={styles.comboStepper}>
                    <span>Cols (L)</span>
                    <div className={styles.comboStepperControls}>
                      <button
                        type="button"
                        aria-label="Decrease columns"
                        disabled={disabled || bottlePack.cols <= 1}
                        onClick={() => onChangeBottlePack({ cols: Math.max(1, bottlePack.cols - 1) })}
                      >
                        −
                      </button>
                      <strong>{bottlePack.cols}</strong>
                      <button
                        type="button"
                        aria-label="Increase columns"
                        disabled={disabled || bottlePack.cols >= 6}
                        onClick={() => onChangeBottlePack({ cols: Math.min(6, bottlePack.cols + 1) })}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className={styles.comboStepper}>
                    <span>Rows (W)</span>
                    <div className={styles.comboStepperControls}>
                      <button
                        type="button"
                        aria-label="Decrease rows"
                        disabled={disabled || bottlePack.rows <= 1}
                        onClick={() => onChangeBottlePack({ rows: Math.max(1, bottlePack.rows - 1) })}
                      >
                        −
                      </button>
                      <strong>{bottlePack.rows}</strong>
                      <button
                        type="button"
                        aria-label="Increase rows"
                        disabled={disabled || bottlePack.rows >= 4}
                        onClick={() => onChangeBottlePack({ rows: Math.min(4, bottlePack.rows + 1) })}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                {/* Fit Diagnostics & Auto-Fit CTA */}
                {packLayout && (
                  <div className={packLayout.fitsAll ? styles.comboFitOk : styles.comboFitWarn} role="status">
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                      {packLayout.fitsAll ? (
                        <CheckCircle2 size={13} style={{ flexShrink: 0 }} />
                      ) : (
                        <AlertTriangle size={13} style={{ flexShrink: 0 }} />
                      )}
                      {packLayout.fitsAll
                        ? `${packLayout.itemCount}× fit cleanly inside`
                        : `Tight by ${[
                            packLayout.overflowLengthMm > 0.8 ? `+${Math.ceil(packLayout.overflowLengthMm)}mm L` : "",
                            packLayout.overflowWidthMm > 0.8 ? `+${Math.ceil(packLayout.overflowWidthMm)}mm W` : "",
                            packLayout.overflowHeightMm > 0.8 ? `+${Math.ceil(packLayout.overflowHeightMm)}mm H` : "",
                          ]
                            .filter(Boolean)
                            .join(" · ")}`}
                    </span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{packLayout.itemCount} pcs</span>
                  </div>
                )}

                <button
                  type="button"
                  className={styles.comboAutoFitBtn}
                  disabled={disabled}
                  onClick={onAutoFitBottlePack}
                >
                  <Wand2 size={13} /> Auto-Fit Box to {bottlePack.cols * bottlePack.rows}× {selectedBottle.volume}
                </button>

                <div className={styles.sliderRow}>
                  <div className={styles.sliderHead}>
                    <label htmlFor="pkg-bottle-gap">Bottle spacing</label>
                    <output>{bottlePack.spacingMm.toFixed(1)} mm</output>
                  </div>
                  <input
                    id="pkg-bottle-gap"
                    type="range"
                    className={styles.rangeInput}
                    min={0}
                    max={14}
                    step={0.5}
                    disabled={disabled}
                    value={bottlePack.spacingMm}
                    onChange={(e) => onChangeBottlePack({ spacingMm: Number(e.target.value) })}
                  />
                </div>

                <div className={styles.sliderRow}>
                  <div className={styles.sliderHead}>
                    <label htmlFor="pkg-bottle-yaw">Label facing angle</label>
                    <output>{Math.round(bottlePack.facingYawDeg)}°</output>
                  </div>
                  <input
                    id="pkg-bottle-yaw"
                    type="range"
                    className={styles.rangeInput}
                    min={-180}
                    max={180}
                    step={5}
                    disabled={disabled}
                    value={bottlePack.facingYawDeg}
                    onChange={(e) => onChangeBottlePack({ facingYawDeg: Number(e.target.value) })}
                  />
                </div>

                <label className={styles.switchRow}>
                  <span>Auto-resize box on grid change</span>
                  <input
                    type="checkbox"
                    checked={bottlePack.autoFitOnChange}
                    disabled={disabled}
                    onChange={(e) => onChangeBottlePack({ autoFitOnChange: e.target.checked })}
                  />
                </label>

                <label className={styles.switchRow}>
                  <span>Natural hand-packed angle variance</span>
                  <input
                    type="checkbox"
                    checked={bottlePack.organicJitter}
                    disabled={disabled}
                    onChange={(e) => onChangeBottlePack({ organicJitter: e.target.checked })}
                  />
                </label>
              </>
            )}
          </div>
        </section>
      )}

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

      {/* TIER 1C: LUXURY PRINT FINISHES — COLLAPSIBLE ACCORDION (SPOT UV, HOT FOIL & EMBOSS/DEBOSS) */}
      <section className={styles.inspectorSection}>
        <details className={`${styles.accordion} ${styles.finishAccordion}`}>
          <summary>
            <span className={styles.sectionTitle}>
              <Sparkles size={13} aria-hidden="true" color="#d97706" />
              Print Finish
              {params.finishMode === "none" ? (
                <span className={styles.finishBadge}>Spot UV · Foil</span>
              ) : (
                <span className={styles.finishActivePill}>
                  <span
                    className={styles.finishMiniDot}
                    style={{ background: activeFinishPreset.swatchGradient }}
                    aria-hidden="true"
                  />
                  {activeFinishPreset.shortName}
                </span>
              )}
            </span>
            <ChevronDown size={14} className={styles.accordionChevron} aria-hidden="true" />
          </summary>

          <div className={`${styles.accordionBody} ${styles.finishBody}`}>
            <div className={styles.finishGrid} role="group" aria-label="Special print finish presets">
            {PACKAGING_FINISH_PRESETS.map((preset) => {
              const active = params.finishMode === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  className={styles.finishChip}
                  aria-pressed={active}
                  disabled={disabled}
                  title={preset.description}
                  onClick={() =>
                    onChange({
                      finishMode: preset.id,
                      ...(preset.id !== "none" ? { finishRelief: preset.defaultRelief } : {}),
                    })
                  }
                >
                  <span className={styles.finishSwatchDot} style={{ background: preset.swatchGradient }} />
                  <span>{preset.shortName}</span>
                </button>
              );
            })}
          </div>

          {params.finishMode !== "none" ? (
            <>
              <div className={styles.sectionHeader} style={{ marginTop: 2 }}>
                <span style={{ fontSize: 10.5, fontWeight: 600 }}>Apply area</span>
                <div className={styles.segmented} role="group" aria-label="Finish mask target">
                  {(
                    [
                      { id: "auto-artwork", label: "Auto Art" },
                      { id: "brand-frame", label: "Frame" },
                      { id: "full-surface", label: "Full" },
                    ] as ReadonlyArray<{ id: PackagingFinishTarget; label: string }>
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={!hasCustomFinishMask && params.finishTarget === item.id}
                      disabled={disabled}
                      onClick={() => {
                        if (hasCustomFinishMask) onClearFinishMask?.();
                        onChange({ finishTarget: item.id });
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.sliderRow}>
                <div className={styles.sliderHead}>
                  <label htmlFor="pkg-finish-relief">
                    Tactile relief ({params.finishRelief > 0.05 ? "Emboss ↑" : params.finishRelief < -0.05 ? "Deboss ↓" : "Flat"})
                  </label>
                  <output>{Math.round(params.finishRelief * 100)}%</output>
                </div>
                <input
                  id="pkg-finish-relief"
                  type="range"
                  className={styles.rangeInput}
                  min={-1}
                  max={1}
                  step={0.05}
                  disabled={disabled}
                  value={params.finishRelief}
                  onChange={(e) => onChange({ finishRelief: Number(e.target.value) })}
                />
              </div>

              <div className={styles.sliderRow}>
                <div className={styles.sliderHead}>
                  <label htmlFor="pkg-finish-intensity">Finish strength</label>
                  <output>{Math.round(params.finishIntensity * 100)}%</output>
                </div>
                <input
                  id="pkg-finish-intensity"
                  type="range"
                  className={styles.rangeInput}
                  min={0.2}
                  max={1}
                  step={0.02}
                  disabled={disabled}
                  value={params.finishIntensity}
                  onChange={(e) => onChange({ finishIntensity: Number(e.target.value) })}
                />
              </div>

              {!hasCustomFinishMask && params.finishTarget === "auto-artwork" && (
                <div className={styles.sliderRow}>
                  <div className={styles.sliderHead}>
                    <label htmlFor="pkg-finish-thresh">Artwork mask sensitivity</label>
                    <output>{Math.round(params.finishThreshold * 100)}%</output>
                  </div>
                  <input
                    id="pkg-finish-thresh"
                    type="range"
                    className={styles.rangeInput}
                    min={0.1}
                    max={0.9}
                    step={0.05}
                    disabled={disabled}
                    value={params.finishThreshold}
                    onChange={(e) => onChange({ finishThreshold: Number(e.target.value) })}
                  />
                </div>
              )}

              {params.finishTarget !== "full-surface" && (
                <label className={styles.switchRow}>
                  <span>Invert finish mask</span>
                  <input
                    type="checkbox"
                    checked={params.finishInvertMask}
                    disabled={disabled}
                    onChange={(e) => onChange({ finishInvertMask: e.target.checked })}
                  />
                </label>
              )}

              {onUploadFinishMask && (
                <div className={styles.finishMaskRow}>
                  <input
                    ref={finishMaskInputRef}
                    type="file"
                    accept="image/png,image/svg+xml,image/jpeg,image/webp"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) onUploadFinishMask(file);
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    className={styles.finishMaskBtn}
                    disabled={disabled}
                    onClick={() => finishMaskInputRef.current?.click()}
                    title="Upload a black-and-white separation mask (white = Foil / Spot UV, black = matte paper)"
                  >
                    <Upload size={12} aria-hidden="true" />
                    <span>
                      {hasCustomFinishMask
                        ? `Mask: ${finishMaskName || "Custom B&W"}`
                        : "Upload B&W Foil/UV Mask"}
                    </span>
                  </button>
                  {hasCustomFinishMask && onClearFinishMask && (
                    <button
                      type="button"
                      className={styles.comboResetLink}
                      disabled={disabled}
                      onClick={onClearFinishMask}
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}

              <p className={styles.finishHint}>
                {activeFinishPreset.description} Standing still automatically refines studio softbox shadows &amp; highlights.
              </p>
            </>
          ) : (
            <p className={styles.finishHint}>
              Add raised Spot UV lacquer, 24K Gold / Silver / Rose Gold / Holo hot foil stamping &amp; tactile emboss relief.
            </p>
          )}
          </div>
        </details>
      </section>

      {/* TIER 2: STRUCTURE, LOCKS & CUTOUTS */}
      <section className={styles.inspectorSection}>
        <details className={styles.accordion}>
          <summary>
            <span className={styles.sectionTitle}>
              <Sliders size={13} aria-hidden="true" />
              Structure & Cutouts
            </span>
            <ChevronDown size={14} className={styles.accordionChevron} aria-hidden="true" />
          </summary>
          <div className={styles.accordionBody}>
            {f.carrierPack && (
              <div
                onMouseEnter={() => onHoverPart("dividers")}
                onMouseLeave={() => onHoverPart(null)}
                style={{ display: "flex", flexDirection: "column", gap: 8 }}
              >
                <div className={styles.sectionHeader}>
                  <span style={{ fontSize: 11, fontWeight: 550 }}>Carrier pack layout</span>
                  <div className={styles.segmented} role="group" aria-label="Beverage carrier cell layout">
                    {(["4-pack", "6-pack", "8-pack"] as const).map((layout) => (
                      <button
                        key={layout}
                        type="button"
                        aria-pressed={params.carrierPack === layout}
                        disabled={disabled}
                        onClick={() => onChange({ carrierPack: layout })}
                      >
                        {layout === "4-pack" ? "4-Pk" : layout === "6-pack" ? "6-Pk" : "8-Pk"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {f.dividerGrid && (
              <label
                className={styles.switchRow}
                onMouseEnter={() => onHoverPart("dividers")}
                onMouseLeave={() => onHoverPart(null)}
              >
                <span>Internal cell dividers</span>
                <input
                  type="checkbox"
                  checked={params.dividerGrid}
                  disabled={disabled}
                  onChange={(e) => onChange({ dividerGrid: e.target.checked })}
                />
              </label>
            )}

            {f.lidDepth && (
              <div
                className={styles.sliderRow}
                onMouseEnter={() => onHoverPart("lid")}
                onMouseLeave={() => onHoverPart(null)}
              >
                <div className={styles.sliderHead}>
                  <label htmlFor="pkg-lid-depth">Telescoping lid skirt depth</label>
                  <output>{Math.round(params.lidDepthMm)} mm</output>
                </div>
                <input
                  id="pkg-lid-depth"
                  type="range"
                  className={styles.rangeInput}
                  min={16}
                  max={Math.max(24, Math.round(params.heightMm))}
                  step={1}
                  disabled={disabled}
                  value={Math.min(params.lidDepthMm, params.heightMm)}
                  onChange={(e) => onChange({ lidDepthMm: Number(e.target.value) }, true)}
                  onPointerUp={() => onChange({}, false)}
                />
              </div>
            )}

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
          <div className={styles.dielineCostRow}>
            <span>Download 1:1 mm Dieline Vector</span>
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
              title={`Scalable Vector Graphics 1:1 mm (Illustrator / Inkscape) · ${dielineCost === 0 ? "Free" : `${dielineCost} coins`}`}
            >
              <Download size={12} /> SVG
            </button>
            <button
              type="button"
              className={styles.dielineExportBtn}
              disabled={disabled}
              onClick={() => onDownloadDieline("pdf")}
              title={`True Vector PDF 1:1 mm with Cut/Crease/Bleed · ${dielineCost === 0 ? "Free" : `${dielineCost} coins`}`}
            >
              <Download size={12} /> PDF
            </button>
            <button
              type="button"
              className={styles.dielineExportBtn}
              disabled={disabled}
              onClick={() => onDownloadDieline("dxf")}
              title={`AutoCAD DXF R12 (mm) for CNC die-cutters · ${dielineCost === 0 ? "Free" : `${dielineCost} coins`}`}
            >
              <Download size={12} /> DXF
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
