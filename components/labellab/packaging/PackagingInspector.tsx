"use client";

import { useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BookmarkCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  ImagePlus,
  Layers,
  Milk,
  Package,
  RotateCcw,
  Ruler,
  Shuffle,
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
  canPackRetailBoxes,
  computeBottlePackLayout,
  DEFAULT_PACKABLE_BOX_TEMPLATE_ID,
  getBeverageFootprintMm,
  getPackableRetailBoxTemplates,
  getRetailBoxFootprintMm,
  isPackableRetailBoxTemplate,
  PACK_GRID_PRESETS,
  snapPackedBoxYawDeg,
  type BeverageFootprintMm,
} from "@/lib/packaging-cad/pack-layout";
import {
  createDefaultPackagingParams,
  getPackagingTemplate,
} from "@/lib/packaging-cad/templates/registry";
import { getLabModel, LAB_MODELS } from "@/lib/labellab/catalog";
import type { CustomProjectRecord } from "@/lib/labellab/project-store";
import { useLocale } from "../LocaleProvider";
import styles from "./PackagingStudio.module.css";

export type PackagingInspectorSection = "size" | "pack" | "material" | "structure" | "procad";

interface Props {
  template: PackagingTemplateDefinition;
  params: PackagingParams;
  solved: SolvedDieline;
  bottlePack: BottlePackConfig;
  activeBeverageModelId: string;
  hasActiveBeverageArtwork: boolean;
  savedBottleProjects: readonly CustomProjectRecord[];
  savedRetailBoxProjects?: readonly CustomProjectRecord[];
  loadedPackedBoxName?: string;
  loadedPackedBoxParams?: PackagingParams;
  projectThumbnails: Record<string, string>;
  hasPackLabelOverride: boolean;
  hasCustomFinishMask?: boolean;
  finishMaskName?: string;
  measuredFootprints: Record<string, BeverageFootprintMm>;
  tone: "studio" | "pink" | "white" | "dark";
  /** When provided, renders only the selected sidebar section cleanly. */
  activeSection?: PackagingInspectorSection;
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
}

export default function PackagingInspector({
  template,
  params,
  solved,
  bottlePack,
  activeBeverageModelId,
  hasActiveBeverageArtwork,
  savedBottleProjects,
  savedRetailBoxProjects = [],
  loadedPackedBoxName,
  loadedPackedBoxParams,
  projectThumbnails,
  hasPackLabelOverride,
  hasCustomFinishMask = false,
  finishMaskName,
  measuredFootprints,
  tone,
  activeSection,
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
}: Props) {
  const { t } = useLocale();
  const pkg = t.studio.packaging;
  const finishMaskInputRef = useRef<HTMLInputElement | null>(null);
  const activeFinishPreset = getPackagingFinishPreset(params.finishMode);
  const showSection = (section: PackagingInspectorSection) =>
    !activeSection || activeSection === section;
  const supportsBoxPacking = canPackRetailBoxes(template.id);
  const isPackingBox = bottlePack.itemKind === "box" && supportsBoxPacking;
  const packableRetailBoxTemplates = getPackableRetailBoxTemplates();
  const totalSavedProjectsCount =
    savedBottleProjects.length + (supportsBoxPacking ? savedRetailBoxProjects.length : 0);

  const [packSourceTab, setPackSourceTab] = useState<"projects" | "catalog">(
    bottlePack.customProjectId || (supportsBoxPacking && bottlePack.boxProjectId)
      ? "projects"
      : "catalog",
  );

  const packModelGroups: ReadonlyArray<{
    label: string;
    category: "can" | "glass" | "pet" | "pp";
  }> = [
    { label: pkg.groupCans, category: "can" },
    { label: pkg.groupGlass, category: "glass" },
    { label: pkg.groupPet, category: "pet" },
    { label: pkg.groupPp, category: "pp" },
  ];

  const activeCustomProject = !isPackingBox && bottlePack.customProjectId
    ? savedBottleProjects.find((p) => p.id === bottlePack.customProjectId)
    : undefined;
  const activeCustomBoxProject =
    isPackingBox && bottlePack.boxProjectId
      ? savedRetailBoxProjects.find((p) => p.id === bottlePack.boxProjectId)
      : undefined;
  const activeBoxTemplateId =
    activeCustomBoxProject?.packagingParams?.templateId ??
    (loadedPackedBoxParams && isPackableRetailBoxTemplate(loadedPackedBoxParams.templateId)
      ? loadedPackedBoxParams.templateId
      : bottlePack.boxTemplateId && isPackableRetailBoxTemplate(bottlePack.boxTemplateId)
        ? bottlePack.boxTemplateId
        : DEFAULT_PACKABLE_BOX_TEMPLATE_ID);
  const activeBoxTemplate = getPackagingTemplate(activeBoxTemplateId);
  const activeBoxParams =
    activeCustomBoxProject?.packagingParams ??
    loadedPackedBoxParams ??
    createDefaultPackagingParams(activeBoxTemplateId);

  const selectedBottle = getLabModel(activeCustomProject?.settings.modelId ?? bottlePack.modelId);
  const bottleFootprint =
    measuredFootprints[selectedBottle.id] ??
    getBeverageFootprintMm(selectedBottle.id, selectedBottle.asset.volumeMl);
  const activeItemFootprint = isPackingBox
    ? getRetailBoxFootprintMm(activeBoxParams)
    : bottleFootprint;
  const packLayout = bottlePack.enabled
    ? computeBottlePackLayout(solved, activeItemFootprint, bottlePack)
    : null;
  const syncedWithActiveStudio =
    !isPackingBox && !activeCustomProject && selectedBottle.id === activeBeverageModelId;
  const selectValue = isPackingBox
    ? activeCustomBoxProject
      ? `box-project:${activeCustomBoxProject.id}`
      : `box-template:${activeBoxTemplateId}`
    : activeCustomProject
      ? `project:${activeCustomProject.id}`
      : selectedBottle.id;
  const activeThumb = isPackingBox
    ? activeCustomBoxProject
      ? projectThumbnails[activeCustomBoxProject.id]
      : undefined
    : (activeCustomProject ? projectThumbnails[activeCustomProject.id] : undefined) ??
      selectedBottle.poster;
  const activeBoxDisplayName =
    activeCustomBoxProject?.name ?? loadedPackedBoxName ?? activeBoxTemplate.shortName;
  const snappedBoxYaw = snapPackedBoxYawDeg(bottlePack.facingYawDeg);

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

  const oppositeDims = params.dimensionMode === "inner" ? solved.outerMm : solved.innerMm;
  const f = template.features;

  return (
    <div
      className={styles.inspector}
      data-tone={tone}
      onMouseLeave={() => onHoverPart(null)}
    >
      {/* TIER 1: ESSENTIAL DIMENSIONS & QUICK PRESETS */}
      {showSection("size") && (
      <section className={styles.inspectorSection}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>
            <Ruler size={14} aria-hidden="true" />
            {pkg.dimensionsTitle}
          </h3>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div className={styles.segmented} role="group" aria-label={pkg.dimensionsTitle}>
              <button
                type="button"
                aria-pressed={params.dimensionMode === "inner"}
                disabled={disabled}
                onClick={() => onChange({ dimensionMode: "inner" })}
                title={pkg.innerTitle}
              >
                {pkg.inner}
              </button>
              <button
                type="button"
                aria-pressed={params.dimensionMode === "outer"}
                disabled={disabled}
                onClick={() => onChange({ dimensionMode: "outer" })}
                title={pkg.outerTitle}
              >
                {pkg.outer}
              </button>
            </div>
            <button
              type="button"
              className={styles.dockIconBtn}
              onClick={onReset}
              disabled={disabled}
              title={pkg.resetParamsTitle}
              aria-label={pkg.resetParamsTitle}
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
              label: pkg.length,
              part: "length" as const,
              min: template.minDimensions.length,
              max: template.maxDimensions.length,
            },
            {
              key: "widthMm" as const,
              code: "W",
              label: pkg.width,
              part: "width" as const,
              min: template.minDimensions.width,
              max: template.maxDimensions.width,
            },
            {
              key: "heightMm" as const,
              code: "H",
              label: pkg.height,
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
                aria-label={`${axis.label} (mm)`}
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
            <span>{pkg.oppositeSize(params.dimensionMode)}</span>
            <strong>
              {Math.round(oppositeDims.length)}×{Math.round(oppositeDims.width)}×{Math.round(oppositeDims.height)} mm
            </strong>
          </div>
          <div>
            <span>{pkg.blankAndWeight}</span>
            <strong>
              {Math.round(solved.blankBounds.width)}×{Math.round(solved.blankBounds.height)} mm · {solved.estimatedWeightG}g
            </strong>
          </div>
        </div>

        {/* Quick Size Presets (including Beverage Auto-Fit presets) */}
        <div className={styles.presetChips} role="group" aria-label={pkg.dimensionsTitle}>
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
              {preset.beverageFit && <span className={styles.presetChipFit}>{pkg.fitBadge}</span>}
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
      )}

      {/* EXCLUSIVE COMBO: PACK YOUR BOTTLES / CANS INSIDE BOX OR TRAY */}
      {showSection("pack") && f.bottlePacking !== false && (
        <section className={styles.inspectorSection}>
          <div className={styles.comboCard}>
            <label className={styles.switchRow} style={{ minHeight: 24 }}>
              <span className={styles.sectionTitle}>
                <Milk size={14} aria-hidden="true" color="#d53660" />
                {pkg.packTitle}
                <span className={styles.comboBadge}>{pkg.packComboBadge}</span>
              </span>
              <input
                type="checkbox"
                aria-label={pkg.packTitle}
                checked={bottlePack.enabled}
                disabled={disabled}
                onChange={(e) => onChangeBottlePack({ enabled: e.target.checked })}
              />
            </label>

            {!bottlePack.enabled ? (
              <p style={{ margin: 0, fontSize: 10.5, lineHeight: 1.45, color: "var(--pkg-muted)" }}>
                {supportsBoxPacking
                  ? pkg.packIntroWithBoxes(template.shortName.toLowerCase())
                  : pkg.packIntro(template.shortName.toLowerCase())}
              </p>
            ) : (
              <>
                {/* Source Tabs: Saved Custom Projects vs Standard Catalog */}
                <div className={styles.comboSourceSwitch} role="group" aria-label={pkg.packTitle}>
                  <button
                    type="button"
                    aria-pressed={packSourceTab === "projects"}
                    disabled={disabled}
                    onClick={() => setPackSourceTab("projects")}
                  >
                    <BookmarkCheck size={12} aria-hidden="true" />
                    <span>{pkg.myProjectsTab(totalSavedProjectsCount)}</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={packSourceTab === "catalog"}
                    disabled={disabled}
                    onClick={() => setPackSourceTab("catalog")}
                  >
                    <span>{pkg.catalogTab}</span>
                  </button>
                </div>

                {packSourceTab === "projects" ? (
                  totalSavedProjectsCount > 0 ? (
                    <div className={styles.customProjectList} role="group" aria-label={pkg.myCustomProjectsGroup}>
                      {supportsBoxPacking && savedRetailBoxProjects.length > 0 && (
                        <>
                          <div
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              letterSpacing: "0.02em",
                              color: "var(--pkg-muted)",
                              padding: "2px 2px 0",
                            }}
                          >
                            {pkg.savedRetailBoxesGroup}
                          </div>
                          {savedRetailBoxProjects.map((project) => {
                            const pParams = project.packagingParams;
                            if (!pParams) return null;
                            const boxTpl = getPackagingTemplate(pParams.templateId);
                            const active = isPackingBox && activeCustomBoxProject?.id === project.id;
                            const thumb = projectThumbnails[project.id];
                            return (
                              <button
                                key={project.id}
                                type="button"
                                className={`${styles.customProjectCard} ${active ? styles.customProjectCardActive : ""}`}
                                aria-pressed={active}
                                disabled={disabled}
                                onClick={() =>
                                  onChangeBottlePack({
                                    itemKind: "box",
                                    boxProjectId: project.id,
                                    boxTemplateId: pParams.templateId,
                                    customProjectId: undefined,
                                    packLabelArtworkId: undefined,
                                    facingYawDeg: 0,
                                  })
                                }
                              >
                                {thumb ? (
                                  <img src={thumb} alt="" className={styles.customProjectThumb} />
                                ) : (
                                  <span
                                    className={styles.customProjectThumb}
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      color: "var(--pkg-muted)",
                                    }}
                                  >
                                    <Package size={16} aria-hidden="true" />
                                  </span>
                                )}
                                <span className={styles.customProjectMeta}>
                                  <strong>{project.name}</strong>
                                  <small>
                                    {boxTpl.code} · {Math.round(pParams.lengthMm)}×{Math.round(pParams.widthMm)}×
                                    {Math.round(pParams.heightMm)} mm
                                  </small>
                                  <span className={styles.customProjectDots}>
                                    <i title={pParams.outsideColor} style={{ backgroundColor: pParams.outsideColor }} />
                                    <i title={pParams.insideColor} style={{ backgroundColor: pParams.insideColor }} />
                                    {project.packagingArtwork && (
                                      <span className={styles.customProjectTag}>{pkg.boxArtworkTag}</span>
                                    )}
                                  </span>
                                </span>
                                {active && <Check size={14} color="#2563eb" aria-hidden="true" />}
                              </button>
                            );
                          })}
                        </>
                      )}

                      {savedBottleProjects.length > 0 && (
                        <>
                          {supportsBoxPacking && savedRetailBoxProjects.length > 0 && (
                            <div
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                letterSpacing: "0.02em",
                                color: "var(--pkg-muted)",
                                padding: "4px 2px 0",
                              }}
                            >
                              {pkg.savedBottlesGroup}
                            </div>
                          )}
                          {savedBottleProjects.map((project) => {
                            const base = getLabModel(project.settings.modelId);
                            const active = !isPackingBox && activeCustomProject?.id === project.id;
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
                                    itemKind: "beverage",
                                    customProjectId: project.id,
                                    boxProjectId: undefined,
                                    boxTemplateId: undefined,
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
                                    <i title={project.settings.liquidColor} style={{ backgroundColor: project.settings.liquidColor }} />
                                    <i title={project.settings.capColor} style={{ backgroundColor: project.settings.capColor }} />
                                    <i title={project.settings.bodyColor} style={{ backgroundColor: project.settings.bodyColor }} />
                                    {project.artworkBlob && <span className={styles.customProjectTag}>{pkg.customLabelTag}</span>}
                                  </span>
                                </span>
                                {active && <Check size={14} color="#2563eb" aria-hidden="true" />}
                              </button>
                            );
                          })}
                        </>
                      )}

                      <button
                        type="button"
                        className={styles.dielineExportBtn}
                        disabled={disabled}
                        onClick={onGoCustomizeBottle}
                      >
                        <ArrowUpRight size={12} aria-hidden="true" /> {pkg.customizeNewBottle}
                      </button>
                    </div>
                  ) : (
                    <div className={styles.customProjectEmpty}>
                      <span>
                        {pkg.noCustomProjectsLead}
                        <strong>{pkg.noCustomProjectsHighlight1}</strong>
                        {pkg.noCustomProjectsMid}
                        <strong>{pkg.noCustomProjectsHighlight2}</strong>
                        {supportsBoxPacking ? pkg.noCustomProjectsTailOuter : pkg.noCustomProjectsTail}
                      </span>
                      <button
                        type="button"
                        className={styles.comboAutoFitBtn}
                        disabled={disabled}
                        onClick={onGoCustomizeBottle}
                      >
                        <ArrowUpRight size={13} aria-hidden="true" /> {pkg.goCustomizeBottle}
                      </button>
                    </div>
                  )
                ) : (
                  <div className={styles.comboModelRow}>
                    {activeThumb ? (
                      <img
                        src={activeThumb}
                        alt=""
                        className={styles.comboModelThumb}
                      />
                    ) : isPackingBox ? (
                      <span
                        className={styles.comboModelThumb}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "var(--pkg-muted)",
                        }}
                      >
                        <Package size={18} aria-hidden="true" />
                      </span>
                    ) : null}
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                      <select
                        className={styles.comboSelect}
                        aria-label={pkg.packTitle}
                        disabled={disabled}
                        value={selectValue}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw.startsWith("box-project:")) {
                            const pid = raw.slice("box-project:".length);
                            const found = savedRetailBoxProjects.find((p) => p.id === pid);
                            if (found?.packagingParams) {
                              onChangeBottlePack({
                                itemKind: "box",
                                boxProjectId: found.id,
                                boxTemplateId: found.packagingParams.templateId,
                                customProjectId: undefined,
                                packLabelArtworkId: undefined,
                                facingYawDeg: 0,
                              });
                              return;
                            }
                          }
                          if (raw.startsWith("box-template:")) {
                            const tid = raw.slice("box-template:".length);
                            onChangeBottlePack({
                              itemKind: "box",
                              boxTemplateId: tid,
                              boxProjectId: undefined,
                              customProjectId: undefined,
                              packLabelArtworkId: undefined,
                              facingYawDeg: 0,
                            });
                            return;
                          }
                          if (raw.startsWith("project:")) {
                            const pid = raw.slice("project:".length);
                            const found = savedBottleProjects.find((p) => p.id === pid);
                            if (found) {
                              onChangeBottlePack({
                                itemKind: "beverage",
                                customProjectId: found.id,
                                boxProjectId: undefined,
                                boxTemplateId: undefined,
                                modelId: found.settings.modelId,
                                packLabelArtworkId: undefined,
                              });
                              return;
                            }
                          }
                          onChangeBottlePack({
                            itemKind: "beverage",
                            customProjectId: undefined,
                            boxProjectId: undefined,
                            boxTemplateId: undefined,
                            modelId: raw,
                            packLabelArtworkId: undefined,
                          });
                        }}
                      >
                        {supportsBoxPacking && savedRetailBoxProjects.length > 0 && (
                          <optgroup label={pkg.savedRetailBoxesGroup}>
                            {savedRetailBoxProjects.map((project) => {
                              const p = project.packagingParams;
                              if (!p) return null;
                              const bt = getPackagingTemplate(p.templateId);
                              return (
                                <option key={project.id} value={`box-project:${project.id}`}>
                                  ★ {project.name} ({bt.code} · {Math.round(p.lengthMm)}×{Math.round(p.widthMm)})
                                </option>
                              );
                            })}
                          </optgroup>
                        )}
                        {savedBottleProjects.length > 0 && (
                          <optgroup label={pkg.myCustomProjectsGroup}>
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
                        {supportsBoxPacking && (
                          <optgroup label={pkg.groupRetailBoxes}>
                            {packableRetailBoxTemplates.map((bt) => (
                              <option key={bt.id} value={`box-template:${bt.id}`}>
                                {bt.shortName} ({bt.code} · {bt.defaultDimensions.length}×{bt.defaultDimensions.width}×
                                {bt.defaultDimensions.height})
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {packModelGroups.map((group) => {
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
                          {isPackingBox
                            ? `${Math.round(activeItemFootprint.diameterXMm)} × ${Math.round(activeItemFootprint.diameterZMm)} × ${Math.round(activeItemFootprint.heightMm)} mm`
                            : `Ø ${Math.round(bottleFootprint.diameterXMm)} × ${Math.round(bottleFootprint.heightMm)} mm`}
                        </span>
                        {isPackingBox ? (
                          <span className={styles.comboSyncTag}>
                            {activeCustomBoxProject
                              ? pkg.customTag(activeCustomBoxProject.name)
                              : activeBoxTemplate.code}
                          </span>
                        ) : activeCustomProject ? (
                          <span className={styles.comboSyncTag}>{pkg.customTag(activeCustomProject.name)}</span>
                        ) : syncedWithActiveStudio ? (
                          <span className={styles.comboSyncTag}>
                            {hasActiveBeverageArtwork ? pkg.labelSyncedTag : pkg.activeStudioModelTag}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}

                {packSourceTab === "projects" && (activeCustomProject || activeCustomBoxProject) && (
                  <div className={styles.comboMetaLine}>
                    <span>
                      {isPackingBox
                        ? `${Math.round(activeItemFootprint.diameterXMm)} × ${Math.round(activeItemFootprint.diameterZMm)} × ${Math.round(activeItemFootprint.heightMm)} mm`
                        : `Ø ${Math.round(bottleFootprint.diameterXMm)} × ${Math.round(bottleFootprint.heightMm)} mm`}
                    </span>
                    <span className={styles.comboSyncTag}>
                      {pkg.activeTag(
                        isPackingBox
                          ? activeBoxDisplayName
                          : activeCustomProject!.name,
                      )}
                    </span>
                  </div>
                )}

                {/* Quick Replace Bottle Label for ALL bottles in tray (beverage mode only) */}
                {!isPackingBox && (
                  <div className={styles.comboLabelRow}>
                    <button
                      type="button"
                      className={styles.comboLabelBtn}
                      disabled={disabled}
                      onClick={onOpenBottleLabelEditor}
                      title={pkg.replaceAllLabelsTitle}
                    >
                      <ImagePlus size={13} aria-hidden="true" />
                      <span>{pkg.replaceAllLabels(bottlePack.cols * bottlePack.rows)}</span>
                    </button>
                    {hasPackLabelOverride && (
                      <button
                        type="button"
                        className={styles.comboResetLink}
                        disabled={disabled}
                        onClick={onClearPackLabelOverride}
                        title={pkg.resetLabelTitle}
                      >
                        {pkg.resetShort}
                      </button>
                    )}
                  </div>
                )}

                {/* Quick Pack Count Grid Presets */}
                <div className={styles.comboGridPills} role="group" aria-label={pkg.packTitle}>
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
                        {pkg.gridPresetLabel(preset.cols, preset.rows, preset.label)}
                      </button>
                    );
                  })}
                </div>

                {/* Custom Columns × Rows Steppers */}
                <div className={styles.comboStepperRow}>
                  <div className={styles.comboStepper}>
                    <span>{pkg.colsLabel}</span>
                    <div className={styles.comboStepperControls}>
                      <button
                        type="button"
                        aria-label="-"
                        disabled={disabled || bottlePack.cols <= 1}
                        onClick={() => onChangeBottlePack({ cols: Math.max(1, bottlePack.cols - 1) })}
                      >
                        −
                      </button>
                      <strong>{bottlePack.cols}</strong>
                      <button
                        type="button"
                        aria-label="+"
                        disabled={disabled || bottlePack.cols >= 6}
                        onClick={() => onChangeBottlePack({ cols: Math.min(6, bottlePack.cols + 1) })}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className={styles.comboStepper}>
                    <span>{pkg.rowsLabel}</span>
                    <div className={styles.comboStepperControls}>
                      <button
                        type="button"
                        aria-label="-"
                        disabled={disabled || bottlePack.rows <= 1}
                        onClick={() => onChangeBottlePack({ rows: Math.max(1, bottlePack.rows - 1) })}
                      >
                        −
                      </button>
                      <strong>{bottlePack.rows}</strong>
                      <button
                        type="button"
                        aria-label="+"
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
                        ? pkg.fitCleanly(packLayout.itemCount)
                        : pkg.tightBy(
                            [
                              packLayout.overflowLengthMm > 0.8 ? `+${Math.ceil(packLayout.overflowLengthMm)}mm L` : "",
                              packLayout.overflowWidthMm > 0.8 ? `+${Math.ceil(packLayout.overflowWidthMm)}mm W` : "",
                              packLayout.overflowHeightMm > 0.8 ? `+${Math.ceil(packLayout.overflowHeightMm)}mm H` : "",
                            ]
                              .filter(Boolean)
                              .join(" · "),
                          )}
                    </span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>
                      {pkg.packCountUnit(packLayout.itemCount)}
                    </span>
                  </div>
                )}

                <button
                  type="button"
                  className={styles.comboAutoFitBtn}
                  disabled={disabled}
                  onClick={onAutoFitBottlePack}
                >
                  <Wand2 size={13} />{" "}
                  {pkg.autoFitCta(
                    bottlePack.cols * bottlePack.rows,
                    isPackingBox ? activeBoxDisplayName : selectedBottle.volume,
                  )}
                </button>

                <div className={styles.sliderRow}>
                  <div className={styles.sliderHead}>
                    <label htmlFor="pkg-bottle-gap">{pkg.bottleSpacing}</label>
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

                {isPackingBox ? (
                  <div className={styles.sliderRow}>
                    <div className={styles.sliderHead}>
                      <span>{pkg.boxOrientation}</span>
                      <output>{snappedBoxYaw === -90 ? "270°" : `${snappedBoxYaw}°`}</output>
                    </div>
                    <div className={styles.segmented} role="group" aria-label={pkg.boxOrientation}>
                      {[
                        { deg: 0, label: "0°" },
                        { deg: 90, label: "90°" },
                        { deg: 180, label: "180°" },
                        { deg: -90, label: "270°" },
                      ].map((opt) => (
                        <button
                          key={opt.deg}
                          type="button"
                          aria-pressed={snappedBoxYaw === opt.deg}
                          disabled={disabled}
                          onClick={() => onChangeBottlePack({ facingYawDeg: opt.deg })}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className={styles.sliderRow}>
                    <div className={styles.sliderHead}>
                      <label htmlFor="pkg-bottle-yaw">{pkg.labelFacingAngle}</label>
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
                )}

                {!isPackingBox && template.id === "fefco-0201-rsc" && (
                  <label className={styles.switchRow}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span>{t.studio.library.honeycombDividers}</span>
                      {bottlePack.honeycombDividers && bottlePack.cols * bottlePack.rows > 1 && (
                        <span className={styles.comboSyncTag}>
                          {t.studio.library.honeycombCells(bottlePack.cols * bottlePack.rows)}
                        </span>
                      )}
                    </span>
                    <input
                      type="checkbox"
                      aria-label={t.studio.library.honeycombDividers}
                      checked={Boolean(bottlePack.honeycombDividers)}
                      disabled={disabled}
                      onChange={(e) => onChangeBottlePack({ honeycombDividers: e.target.checked })}
                    />
                  </label>
                )}

                {!isPackingBox && template.id === "fefco-0427-mailer" && (
                  <label className={styles.switchRow}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span>{t.studio.library.productInsert}</span>
                      {bottlePack.productInsert && (
                        <span className={styles.comboSyncTag}>
                          {t.studio.library.productInsertSlots(bottlePack.cols * bottlePack.rows)}
                        </span>
                      )}
                    </span>
                    <input
                      type="checkbox"
                      aria-label={t.studio.library.productInsert}
                      checked={Boolean(bottlePack.productInsert)}
                      disabled={disabled}
                      onChange={(e) => onChangeBottlePack({ productInsert: e.target.checked })}
                    />
                  </label>
                )}

                <label className={styles.switchRow}>
                  <span>{pkg.autoResizeOnGrid}</span>
                  <input
                    type="checkbox"
                    checked={bottlePack.autoFitOnChange}
                    disabled={disabled}
                    onChange={(e) => onChangeBottlePack({ autoFitOnChange: e.target.checked })}
                  />
                </label>

                {!isPackingBox && (
                  <div className={styles.switchRow}>
                    <label htmlFor="pkg-organic-jitter" style={{ display: "inline-flex", alignItems: "center", gap: 6, flex: 1, cursor: "pointer" }}>
                      <span>{pkg.organicJitter}</span>
                    </label>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      {bottlePack.organicJitter && (
                        <button
                        type="button"
                        className={styles.dockIconBtn}
                        style={{ minWidth: 24, height: 24, padding: "0 5px" }}
                        disabled={disabled}
                        title={pkg.rerollAngles}
                        aria-label={pkg.rerollAngles}
                        onClick={() =>
                          onChangeBottlePack({
                            jitterSeed: Math.floor(Math.random() * 100000),
                          })
                        }
                      >
                        <Shuffle size={12} aria-hidden="true" />
                      </button>
                    )}
                    <input
                      id="pkg-organic-jitter"
                      type="checkbox"
                      checked={bottlePack.organicJitter}
                      disabled={disabled}
                      onChange={(e) =>
                        onChangeBottlePack(
                          e.target.checked
                            ? { organicJitter: true, jitterSeed: Math.floor(Math.random() * 100000) }
                            : { organicJitter: false },
                        )
                      }
                    />
                  </div>
                </div>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {/* TIER 1B & 1C: BOARD MATERIAL SWATCHES, SURFACE FINISH & LUXURY PRINT FINISHES */}
      {showSection("material") && (
      <>
      <section
        className={styles.inspectorSection}
        onMouseEnter={() => onHoverPart("material")}
        onMouseLeave={() => onHoverPart(null)}
      >
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>
            <Layers size={14} aria-hidden="true" />
            {pkg.boardMaterialTitle}
          </h3>
          <span style={{ fontSize: 10, color: "var(--pkg-muted)" }}>{params.thicknessMm.toFixed(2)} mm</span>
        </div>
        <div className={styles.materialGrid} role="group" aria-label={pkg.boardMaterialTitle}>
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

        {/* Outside / Inside surface color & finish */}
        <div className={styles.colorPairRow}>
          <label className={styles.colorMini}>
            <span>{pkg.outsideLabel}</span>
            <input
              type="color"
              value={params.outsideColor}
              disabled={disabled}
              onChange={(e) => onChange({ outsideColor: e.target.value })}
            />
          </label>
          <label className={styles.colorMini}>
            <span>{pkg.insideLabel}</span>
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
            <label htmlFor="pkg-out-rough">{pkg.surfaceFinish}</label>
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
      </section>

      {/* TIER 1C: LUXURY PRINT FINISHES — COLLAPSIBLE ACCORDION (SPOT UV, HOT FOIL & EMBOSS/DEBOSS) */}
      <section className={styles.inspectorSection}>
        <details className={`${styles.accordion} ${styles.finishAccordion}`}>
          <summary>
            <span className={styles.sectionTitle}>
              <Sparkles size={13} aria-hidden="true" color="#d97706" />
              {pkg.printFinishTitle}
              {params.finishMode === "none" ? (
                <span className={styles.finishBadge}>{pkg.printFinishBadge}</span>
              ) : (
                <span className={styles.finishActivePill}>
                  <span
                    className={styles.finishMiniDot}
                    style={{ background: activeFinishPreset.swatchGradient }}
                    aria-hidden="true"
                  />
                  {pkg.finishPresetLabel(activeFinishPreset.id, activeFinishPreset.shortName)}
                </span>
              )}
            </span>
            <ChevronDown size={14} className={styles.accordionChevron} aria-hidden="true" />
          </summary>

          <div className={`${styles.accordionBody} ${styles.finishBody}`}>
            <div className={styles.finishGrid} role="group" aria-label={pkg.printFinishTitle}>
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
                  <span>{pkg.finishPresetLabel(preset.id, preset.shortName)}</span>
                </button>
              );
            })}
          </div>

          {params.finishMode !== "none" ? (
            <>
              <div className={styles.sectionHeader} style={{ marginTop: 2 }}>
                <span style={{ fontSize: 10.5, fontWeight: 600 }}>{pkg.applyArea}</span>
                <div className={styles.segmented} role="group" aria-label={pkg.applyArea}>
                  {(
                    [
                      { id: "auto-artwork", label: pkg.targetAutoArt },
                      { id: "brand-frame", label: pkg.targetFrame },
                      { id: "full-surface", label: pkg.targetFull },
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
                    {pkg.tactileRelief(
                      params.finishRelief > 0.05 ? "emboss" : params.finishRelief < -0.05 ? "deboss" : "flat",
                    )}
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
                  <label htmlFor="pkg-finish-intensity">{pkg.finishStrength}</label>
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
                    <label htmlFor="pkg-finish-thresh">{pkg.artworkMaskSens}</label>
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
                  <span>{pkg.invertFinishMask}</span>
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
                    title={pkg.uploadFinishMask}
                  >
                    <Upload size={12} aria-hidden="true" />
                    <span>
                      {hasCustomFinishMask
                        ? pkg.maskSelected(finishMaskName || "B&W")
                        : pkg.uploadFinishMask}
                    </span>
                  </button>
                  {hasCustomFinishMask && onClearFinishMask && (
                    <button
                      type="button"
                      className={styles.comboResetLink}
                      disabled={disabled}
                      onClick={onClearFinishMask}
                    >
                      {pkg.clearShort}
                    </button>
                  )}
                </div>
              )}

              <p className={styles.finishHint}>{pkg.finishActiveHint}</p>
            </>
          ) : (
            <p className={styles.finishHint}>{pkg.finishEmptyHint}</p>
          )}
          </div>
        </details>
      </section>
      </>
      )}

      {/* TIER 2: STRUCTURE, LOCKS & CUTOUTS */}
      {showSection("structure") && (
      <section className={styles.inspectorSection}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>
            <Sliders size={14} aria-hidden="true" />
            {pkg.structureTitle}
          </h3>
          <span style={{ fontSize: 10, color: "var(--pkg-muted)" }}>{template.code}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {f.carrierPack && (
              <div
                onMouseEnter={() => onHoverPart("dividers")}
                onMouseLeave={() => onHoverPart(null)}
                style={{ display: "flex", flexDirection: "column", gap: 8 }}
              >
                <div className={styles.sectionHeader}>
                  <span style={{ fontSize: 11, fontWeight: 550 }}>{pkg.carrierPackLayout}</span>
                  <div className={styles.segmented} role="group" aria-label={pkg.carrierPackLayout}>
                    {(["4-pack", "6-pack", "8-pack"] as const).map((layout) => (
                      <button
                        key={layout}
                        type="button"
                        aria-pressed={params.carrierPack === layout}
                        disabled={disabled}
                        onClick={() => onChange({ carrierPack: layout })}
                      >
                        {pkg.carrierPackBtn(layout)}
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
                <span>{pkg.internalDividers}</span>
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
                  <label htmlFor="pkg-lid-depth">{pkg.lidSkirtDepth}</label>
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

            {f.frontRimLockTabs && (
              <div
                onMouseEnter={() => onHoverPart("lid")}
                onMouseLeave={() => onHoverPart(null)}
                style={{ display: "flex", flexDirection: "column", gap: 8 }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <span style={{ fontSize: 11, fontWeight: 550 }}>{pkg.frontRimLockTabs}</span>
                  <div className={styles.segmented} role="group" aria-label={pkg.frontRimLockTabs}>
                    {([0, 1, 2, 3] as const).map((count) => (
                      <button
                        key={count}
                        type="button"
                        aria-pressed={params.frontLockTabCount === count}
                        disabled={disabled}
                        onClick={() => onChange({ frontLockTabCount: count })}
                      >
                        {count === 0 ? pkg.noTabs : String(count)}
                      </button>
                    ))}
                  </div>
                </div>
                {params.frontLockTabCount > 0 && (
                  <div className={styles.sliderRow}>
                    <div className={styles.sliderHead}>
                      <label htmlFor="pkg-front-tab-w">{pkg.lockTabWidth}</label>
                      <output>{Math.round(params.lockTabWidthMm)} mm</output>
                    </div>
                    <input
                      id="pkg-front-tab-w"
                      type="range"
                      className={styles.rangeInput}
                      min={8}
                      max={34}
                      step={1}
                      disabled={disabled}
                      value={Math.min(34, Math.max(8, params.lockTabWidthMm))}
                      onChange={(e) => onChange({ lockTabWidthMm: Number(e.target.value) }, true)}
                      onPointerUp={() => onChange({}, false)}
                    />
                  </div>
                )}
                <div className={styles.sliderRow}>
                  <div className={styles.sliderHead}>
                    <label htmlFor="pkg-a21-tuck-len">{pkg.tuckFlapLength}</label>
                    <output>{Math.round(params.tuckFlapLengthMm)} mm</output>
                  </div>
                  <input
                    id="pkg-a21-tuck-len"
                    type="range"
                    className={styles.rangeInput}
                    min={12}
                    max={34}
                    step={1}
                    disabled={disabled}
                    value={params.tuckFlapLengthMm}
                    onChange={(e) => onChange({ tuckFlapLengthMm: Number(e.target.value) }, true)}
                    onPointerUp={() => onChange({}, false)}
                  />
                </div>
              </div>
            )}

            {f.lockTabs && (
              <div
                onMouseEnter={() => onHoverPart("locks")}
                onMouseLeave={() => onHoverPart(null)}
                style={{ display: "flex", flexDirection: "column", gap: 8 }}
              >
                <div className={styles.sectionHeader}>
                  <span style={{ fontSize: 11, fontWeight: 550 }}>{pkg.lockTabsPerSide}</span>
                  <div className={styles.segmented}>
                    <button
                      type="button"
                      aria-pressed={params.lockTabCount === 1}
                      disabled={disabled}
                      onClick={() => onChange({ lockTabCount: 1 })}
                    >
                      {pkg.oneTab}
                    </button>
                    <button
                      type="button"
                      aria-pressed={params.lockTabCount === 2}
                      disabled={disabled}
                      onClick={() => onChange({ lockTabCount: 2 })}
                    >
                      {pkg.twoTabs}
                    </button>
                  </div>
                </div>
                <div className={styles.sliderRow}>
                  <div className={styles.sliderHead}>
                    <label htmlFor="pkg-lock-tab-w">{pkg.lockTabWidth}</label>
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
                  <span style={{ fontSize: 11, fontWeight: 550 }}>{pkg.tuckStyle}</span>
                  <div className={styles.segmented}>
                    <button
                      type="button"
                      aria-pressed={params.tuckStyle === "reverse"}
                      disabled={disabled}
                      onClick={() => onChange({ tuckStyle: "reverse" })}
                    >
                      {pkg.tuckReverse}
                    </button>
                    <button
                      type="button"
                      aria-pressed={params.tuckStyle === "straight"}
                      disabled={disabled}
                      onClick={() => onChange({ tuckStyle: "straight" })}
                    >
                      {pkg.tuckStraight}
                    </button>
                  </div>
                </div>
                <div className={styles.sliderRow}>
                  <div className={styles.sliderHead}>
                    <label htmlFor="pkg-tuck-len">{pkg.tuckFlapLength}</label>
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
                  <label htmlFor="pkg-flap-gap">
                    {template.id === "fefco-0201e-beer-case" ? pkg.sideFlapGap : pkg.topBottomFlapGap}
                  </label>
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
                  <label htmlFor="pkg-taper">{pkg.dustFlapTaper}</label>
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
                <span>{pkg.thumbNotch}</span>
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
                  <span>{pkg.frontDisplayScoop}</span>
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
                      <label htmlFor="pkg-scoop-depth">{pkg.scoopDepth}</label>
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
                  <span>
                    {template.id === "fefco-0201e-beer-case" ? pkg.carryHandHoles : pkg.sideHandHoles}
                  </span>
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
                      <label htmlFor="pkg-hh-w">{pkg.handleWidth}</label>
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
                  <span>{pkg.windowCutout}</span>
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
                        <label htmlFor="pkg-win-w">{pkg.windowWidth}</label>
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
                        <label htmlFor="pkg-win-h">{pkg.windowHeight}</label>
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
                      <span>{pkg.windowFilm}</span>
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
        </div>
      </section>
      )}

      {/* TIER 3: PRO CAD ENGINEERING MODE */}
      {showSection("procad") && (
      <section className={styles.inspectorSection}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>
            <Wrench size={14} aria-hidden="true" />
            {pkg.proCadTitle}
            <span className={styles.proCadBadge}>
              <Sparkles size={9} /> {pkg.proCadBadge}
            </span>
          </h3>
          <span style={{ fontSize: 10, color: "var(--pkg-muted)" }}>{params.thicknessMm.toFixed(2)} mm</span>
        </div>

        <div className={styles.accordion} style={{ padding: 10, display: "flex", flexDirection: "column", gap: 9 }}>
          <div className={styles.sliderRow}>
            <div className={styles.sliderHead}>
              <label htmlFor="pkg-thick">{pkg.boardCaliper}</label>
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
            <span style={{ fontSize: 11, fontWeight: 550 }}>{pkg.fluteDirection}</span>
            <div className={styles.segmented}>
              <button
                type="button"
                aria-pressed={params.fluteDirection === "along-L"}
                disabled={disabled}
                onClick={() => onChange({ fluteDirection: "along-L" })}
              >
                {pkg.alongL}
              </button>
              <button
                type="button"
                aria-pressed={params.fluteDirection === "along-W"}
                disabled={disabled}
                onClick={() => onChange({ fluteDirection: "along-W" })}
              >
                {pkg.alongW}
              </button>
            </div>
          </div>

          <div className={styles.sliderRow}>
            <div className={styles.sliderHead}>
              <label htmlFor="pkg-clearance">{pkg.lockFoldClearance}</label>
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
              <label htmlFor="pkg-bleed">{pkg.printBleedMargin}</label>
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
            <span>{pkg.showCreaseGuidelines}</span>
            <input
              type="checkbox"
              checked={params.showCreaseLines}
              disabled={disabled}
              onChange={(e) => onChange({ showCreaseLines: e.target.checked })}
            />
          </label>

          <div className={styles.specSummary}>
            <div>
              <span>{pkg.netSheetArea}</span>
              <strong>{solved.blankAreaM2.toFixed(3)} m²</strong>
            </div>
            <div>
              <span>{pkg.panelsAndCreases}</span>
              <strong>{pkg.panelsFoldsValue(solved.flatPanels.length, solved.creaseSegments.length)}</strong>
            </div>
          </div>
        </div>
      </section>
      )}
    </div>
  );
}
