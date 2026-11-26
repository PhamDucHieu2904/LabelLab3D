"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Box,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Droplets,
  FileImage,
  Globe2,
  Grid2X2,
  Layers,
  Layers3,
  Maximize2,
  Milk,
  Minus,
  MousePointerClick,
  Package,
  Palette,
  Plus,
  RotateCcw,
  RotateCw,
  Ruler,
  Save,
  Search,
  Shirt,
  Sliders,
  Sparkles,
  Sticker,
  Sun,
  Upload,
  Wrench,
  X,
} from "lucide-react";
import {
  getStudioDomain,
  loadSavedDomain,
  saveDomain,
  STUDIO_DOMAINS,
  type StudioDomainId,
} from "@/lib/domains/registry";
import type {
  BottlePackConfig,
  PackagingArtworkState,
  PackagingParams,
  PackagingPartGroup,
  PackagingTemplateDefinition,
} from "@/lib/packaging-cad/types";
import {
  createDefaultPackagingParams,
  getPackagingTemplate,
  PACKAGING_TEMPLATES,
  solvePackagingTemplate,
} from "@/lib/packaging-cad/templates/registry";
import {
  createDefaultBottlePackConfig,
  loadBottlePackConfig,
  loadPackagingParams,
  saveBottlePackConfig,
  savePackagingParams,
} from "@/lib/packaging-cad/preferences";
import {
  computeAutoFitBoxDimensions,
  getBeverageFootprintMm,
  isOpenTopPackagingTemplate,
  type BeverageFootprintMm,
} from "@/lib/packaging-cad/pack-layout";
import type { BottlePackVisualSource } from "@/lib/packaging-cad/bottle-packer";
import { createPackagingSubject, type PackagingSubjectController } from "@/lib/packaging-cad/adapter";
import { getPanelUprightSizeMm } from "@/lib/packaging-cad/artwork-composer";
import {
  exportDielineDxf,
  exportDielinePdf,
  exportDielineSvg,
} from "@/lib/packaging-cad/exporters/vector-dieline";
import { SCENE_THEME_BACKGROUNDS, SCENE_THEME_OPTIONS } from "@/lib/labellab/style-background";
import {
  SPOT_LIGHT_ANGLE_PRESETS,
  SPOT_LIGHT_COLOR_SWATCHES,
  STUDIO_ENVIRONMENT_PRESETS,
  type StudioSpotLightConfig,
} from "@/lib/mockup/environment-presets";
import pkgStyles from "./packaging/PackagingStudio.module.css";
import LibrarySearchFilterBar from "./LibrarySearchFilterBar";
import PackagingLibrary from "./packaging/PackagingLibrary";
import PackagingInspector, { type PackagingInspectorSection } from "./packaging/PackagingInspector";
import PackagingBottomDock, {
  type PackagingCameraViewPreset,
  type PackagingViewMode,
} from "./packaging/PackagingBottomDock";
import PackagingDielineViewport from "./packaging/PackagingDielineViewport";
import PackagingArtworkPanel from "./packaging/PackagingArtworkPanel";
import PackagingFaceArtworkModal from "./packaging/PackagingFaceArtworkModal";
import ProjectsModal from "./ProjectsModal";
import SaveProjectDialog, { type SaveProjectPayload } from "./SaveProjectDialog";
import ShareProjectDialog from "./ShareProjectDialog";
import ViewportDisplayRail from "./ViewportDisplayRail";
import { useLocale } from "./LocaleProvider";
import {
  getDefaultFamilyVariant,
  getLabModelFamily,
  getLabModelFamilyById,
  filterLabModelFamilies,
  LAB_MODELS,
  LAB_MODEL_FAMILIES,
  getLabModel,
  getModelMaterialDefaults,
} from "@/lib/labellab/catalog";
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  pickMaterialPreferences,
  savePreferences,
  type ScenePreferences,
} from "@/lib/labellab/preferences";
import {
  createLocalArtwork,
  releaseLocalArtwork,
} from "@/lib/labellab/local-artwork";
import type { InteractivePickTarget, MockupStatus, MockupCameraPreset } from "@/lib/mockup/contracts";
import {
  loadQualityPreference,
  saveQualityPreference,
  type QualityPreference,
  type QualityRuntimeReport,
} from "@/lib/mockup/quality-tier";
import { STUDIO_CAMERA_PRESETS } from "@/lib/mockup/camera-presets";
import studioTheme from "./StudioNeutral.module.css";
import modelLibrary from "./ModelLibrary.module.css";
import SceneCanvas, { type SceneCanvasHandle } from "./SceneCanvas";
import MovingGrid from "./MovingGrid";
import RenderPanel from "./RenderPanel";
import ArtworkLibrary from "./ArtworkLibrary";
import {
  clearArtworkSelectionsByPrefix,
  getArtworkById,
  getArtworkSelectionsByPrefix,
  packagingFaceArtworkScope,
  packagingTemplateScopePrefix,
  setArtworkSelection,
  type StoredArtwork,
} from "@/lib/labellab/artwork-store";
import {
  capturePackedBottleSnapshot,
  capturePackagingArtworkSnapshot,
  deleteCustomProject,
  deleteProjectGroupRecord,
  groupCustomProjects,
  hydratePackagingArtworkSnapshot,
  listCustomProjects,
  listProjectGroups,
  resolveItemGroupId,
  sanitizeProjectName,
  saveCustomProject,
  saveProjectGroup,
  type CustomProjectRecord,
  type ProjectGroup,
} from "@/lib/labellab/project-store";
import {
  cloudProjectAssetUrl,
  deleteCloudProjectApi,
  deleteCloudProjectItemApi,
  extendCloudProjectApi,
  fetchUserCloudProjects,
  hydrateCloudItemToRecord,
  migrateLocalGroupToCloud,
  patchCloudProject,
  saveRecordToCloudProject,
  type StudioProjectCollection,
} from "@/lib/labellab/cloud-projects-client";
import {
  CLOUD_PROJECT_LIMITS,
  type CloudProjectItem,
  type CloudProjectSummary,
} from "@/lib/projects/contracts";
import type { SharedProjectSummary } from "@/lib/share/contracts";
import SiteHeader from "./SiteHeader";
import ModelVariantsPanel from "./ModelVariantsPanel";
import PropertiesPanel, { type PropertiesPart } from "./PropertiesPanel";
import { useAuthDialog } from "./AuthDialog";
import {
  DEFAULT_DIELINE_COIN_COST,
  DEFAULT_PROJECT_EXTEND_COIN_COST,
  DEFAULT_RENDER_COIN_COST,
  DEFAULT_SHARE_COIN_COST,
  resolveRenderCoinCost,
} from "@/lib/payments/packages";
import { fetchSiteConfigCached } from "@/lib/client/api-cache";
import {
  attachUsageTrackerLifecycle,
  recordDielineCompleted,
  recordDielineStarted,
  recordRenderCompleted,
  recordRenderStarted,
} from "@/lib/client/usage-tracker";

type Modal = "projects" | "guide" | null;
type BeverageTool = "models" | "label" | "liquid" | "cap" | "body" | "backdrop";
type PackagingTool =
  | "models"
  | "pkg-size"
  | "pkg-pack"
  | "pkg-material"
  | "pkg-structure"
  | "pkg-procad"
  | "scene";
type EditorTool = BeverageTool | PackagingTool;
const VALID_BEVERAGE_MODEL_IDS = new Set(LAB_MODELS.map((m) => m.id));
const libraryPageSize = 8; // Two columns, four rows.

function captureCanvasThumbnailBlob(canvas: HTMLCanvasElement | null): Promise<Blob | undefined> {
  if (!canvas || canvas.width < 2 || canvas.height < 2) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    try {
      const size = 480;
      const offscreen = document.createElement("canvas");
      offscreen.width = size;
      offscreen.height = size;
      const ctx = offscreen.getContext("2d");
      if (!ctx) {
        resolve(undefined);
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);
      const srcSide = Math.min(canvas.width, canvas.height);
      const sx = (canvas.width - srcSide) * 0.5;
      const sy = (canvas.height - srcSide) * 0.5;
      ctx.drawImage(canvas, sx, sy, srcSide, srcSide, 0, 0, size, size);
      offscreen.toBlob((blob) => resolve(blob ?? undefined), "image/png");
    } catch {
      resolve(undefined);
    }
  });
}

export default function LabellabApp() {
  const { t } = useLocale();
  const st = t.studio;
  const modelCategoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: LAB_MODEL_FAMILIES.length };
    for (const family of LAB_MODEL_FAMILIES) {
      counts[family.category] = (counts[family.category] ?? 0) + 1;
    }
    return counts;
  }, []);
  const localizedCategories = [
    { id: "all", label: st.library.catAll, count: modelCategoryCounts.all ?? 0 },
    { id: "glass", label: st.library.catGlass, count: modelCategoryCounts.glass ?? 0 },
    { id: "can", label: st.library.catCans, count: modelCategoryCounts.can ?? 0 },
    { id: "pet", label: st.library.catPet, count: modelCategoryCounts.pet ?? 0 },
    { id: "pp", label: st.library.catPp, count: modelCategoryCounts.pp ?? 0 },
  ];
  const [domain, setDomain] = useState<StudioDomainId>("beverage");
  const [packagingParams, setPackagingParams] = useState<PackagingParams>(() => createDefaultPackagingParams());
  const [packagingArtwork, setPackagingArtwork] = useState<PackagingArtworkState>({
    mode: "panel",
    panelOverlays: {},
  });
  const [packagingViewMode, setPackagingViewMode] = useState<PackagingViewMode>("3d");
  const [packagingSurface, setPackagingSurface] = useState<"outside" | "inside">("outside");
  const [selectedPanelId, setSelectedPanelId] = useState<string>("front-wall");
  const [packagingHoverPart, setPackagingHoverPart] = useState<PackagingPartGroup | null>(null);
  const [packagingFoldPlaying, setPackagingFoldPlaying] = useState(false);
  const [packagingCameraId, setPackagingCameraId] = useState("iso");
  const [bottlePack, setBottlePack] = useState<BottlePackConfig>(() => createDefaultBottlePackConfig("can-mango"));
  const [measuredFootprints, setMeasuredFootprints] = useState<Record<string, BeverageFootprintMm>>({});
  const [packagingSubject, setPackagingSubject] = useState<PackagingSubjectController | null>(null);
  const packagingSubjectRef = useRef<PackagingSubjectController | null>(null);
  const packagingArtworkRef = useRef<PackagingArtworkState>(packagingArtwork);
  const packagingParamsRef = useRef<PackagingParams>(packagingParams);
  const bottlePackRef = useRef<BottlePackConfig>(bottlePack);
  const beverageSceneModeRef = useRef<ScenePreferences["sceneMode"]>("website");
  const isPackaging = domain === "packaging";

  const [settings, setSettings] = useState<ScenePreferences>({
    ...DEFAULT_PREFERENCES,
  });
  const [qualityPreference, setQualityPreference] = useState<QualityPreference>("auto");
  const [qualityReport, setQualityReport] = useState<QualityRuntimeReport | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [libraryPage, setLibraryPage] = useState(0);
  const [activeFamilyId, setActiveFamilyId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<EditorTool | null>("models");
  const [modal, setModal] = useState<Modal>(null);
  const [status, setStatus] = useState<MockupStatus["phase"]>("loading-model");
  const [toastState, setToastState] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const setToast = useCallback((message: string, tone: "success" | "error" = "success") => {
    setToastState(message ? { message, tone } : null);
  }, []);
  const [projectName, setProjectName] = useState("Basil study 01");
  const [projects, setProjects] = useState<CustomProjectRecord[]>([]);
  const [projectGroups, setProjectGroups] = useState<ProjectGroup[]>([]);
  const [cloudProjects, setCloudProjects] = useState<CloudProjectSummary[]>([]);
  const [cloudAuthenticated, setCloudAuthenticated] = useState(false);
  const [sharedProjects, setSharedProjects] = useState<SharedProjectSummary[]>([]);
  const [shareDialogGroupId, setShareDialogGroupId] = useState<string | null>(null);
  const [projectThumbUrls, setProjectThumbUrls] = useState<Record<string, string>>({});
  const [loadedProjectId, setLoadedProjectId] = useState<string | undefined>(undefined);
  const [loadedCloudProjectId, setLoadedCloudProjectId] = useState<string | undefined>(undefined);
  const [loadedCloudItemId, setLoadedCloudItemId] = useState<string | undefined>(undefined);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [savePreviewBlob, setSavePreviewBlob] = useState<Blob | undefined>(undefined);
  const [savePreviewUrl, setSavePreviewUrl] = useState<string | undefined>(undefined);
  const [hoverTarget, setHoverTarget] = useState<InteractivePickTarget | null>(null);
  const [activeArtworkTarget, setActiveArtworkTarget] = useState<InteractivePickTarget | null>(null);
  const [beverageArtworkOpenSignal, setBeverageArtworkOpenSignal] = useState(0);
  const [packBottleLabelUrl, setPackBottleLabelUrl] = useState<string | undefined>(undefined);
  const [customProjectLabelUrl, setCustomProjectLabelUrl] = useState<string | undefined>(undefined);
  const [artwork, setArtwork] = useState<string>();
  const [artworkEditing, setArtworkEditing] = useState(false);
  const [artworkReset, setArtworkReset] = useState(0);
  const openAuth = useAuthDialog();
  const [sitePricing, setSitePricing] = useState({
    renderCost: DEFAULT_RENDER_COIN_COST,
    dielineCost: DEFAULT_DIELINE_COIN_COST,
    shareCost: DEFAULT_SHARE_COIN_COST,
    projectExtendCost: DEFAULT_PROJECT_EXTEND_COIN_COST,
  });
  const [dielineBusy, setDielineBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [renderProgress, setRenderProgress] = useState<number | null>(null);
  const [activeCamera, setActiveCamera] = useState<"animated" | MockupCameraPreset>("animated");
  const renderCanvasRef = useRef<HTMLCanvasElement>(null);
  const [exportResult, setExportResult] = useState<{
    url: string;
    name: string;
  }>();
  const sceneRef = useRef<SceneCanvasHandle>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const workspaceLayoutRef = useRef<HTMLDivElement>(null);
  const libraryPanelRef = useRef<HTMLElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const railPropsRef = useRef<HTMLDivElement>(null);
  const connectorRef = useRef<HTMLDivElement>(null);
  const hadConnectorRef = useRef(false);
  const artworkRef = useRef<string | undefined>(undefined);
  const artworkBlobRef = useRef<Blob | undefined>(undefined);
  const artworkIdRef = useRef<string | undefined>(undefined);
  const suppressLibraryAutoApplyRef = useRef(false);
  const suppressPackagingHydrateRef = useRef(false);
  const resultRef = useRef<string | undefined>(undefined);
  const modelMaterials = useRef(
    new Map<string, ReturnType<typeof getModelMaterialDefaults>>(),
  );
  const model = getLabModel(settings.modelId);
  const studio = settings.sceneMode === "studio";
  const whiteStyle = settings.style === "white";
  const ready = status === "ready";
  const modelFamilies = filterLabModelFamilies(query, filter);
  const libraryPageCount = Math.max(1, Math.ceil(modelFamilies.length / libraryPageSize));
  const currentLibraryPage = Math.min(libraryPage, libraryPageCount - 1);
  const visibleModelFamilies = modelFamilies.slice(currentLibraryPage * libraryPageSize, (currentLibraryPage + 1) * libraryPageSize);
  const activeFamily = getLabModelFamilyById(activeFamilyId);
  const variantsOpen = activeTool === "models" && !modal && !!activeFamily && activeFamily.variants.length > 1 &&
    visibleModelFamilies.some((family) => family.id === activeFamily.id);
  const update = <K extends keyof ScenePreferences>(
    key: K,
    value: ScenePreferences[K],
  ) => { if (!exportBusy) setSettings((current) => ({ ...current, [key]: value })); };

  const activePackagingTemplate = useMemo(
    () => getPackagingTemplate(packagingParams.templateId),
    [packagingParams.templateId],
  );
  const solvedPackaging = useMemo(
    () => solvePackagingTemplate(packagingParams),
    [packagingParams],
  );
  useEffect(() => {
    let active = true;
    void fetchSiteConfigCached<{
      settings?: { renderCost?: number; dielineCost?: number; shareCost?: number; projectExtendCost?: number };
    }>()
      .then((payload) => {
        if (!active || !payload?.settings) return;
        const renderCost = Number(payload.settings.renderCost);
        const dielineCost = Number(payload.settings.dielineCost);
        const shareCost = Number(payload.settings.shareCost);
        const projectExtendCost = Number(payload.settings.projectExtendCost);
        setSitePricing({
          renderCost: Number.isSafeInteger(renderCost) && renderCost >= 0 ? renderCost : DEFAULT_RENDER_COIN_COST,
          dielineCost: Number.isSafeInteger(dielineCost) && dielineCost >= 0 ? dielineCost : DEFAULT_DIELINE_COIN_COST,
          shareCost: Number.isSafeInteger(shareCost) && shareCost >= 0 ? shareCost : DEFAULT_SHARE_COIN_COST,
          projectExtendCost:
            Number.isSafeInteger(projectExtendCost) && projectExtendCost >= 0
              ? projectExtendCost
              : DEFAULT_PROJECT_EXTEND_COIN_COST,
        });
      })
      .catch(() => undefined);
    const detachTracker = attachUsageTrackerLifecycle();
    return () => {
      active = false;
      detachTracker();
    };
  }, []);

  useEffect(() => {
    packagingArtworkRef.current = packagingArtwork;
  }, [packagingArtwork]);
  useEffect(() => {
    packagingParamsRef.current = packagingParams;
  }, [packagingParams]);
  useEffect(() => {
    bottlePackRef.current = bottlePack;
  }, [bottlePack]);

  const cloudBeverageMeta = useMemo(() => {
    const records: CustomProjectRecord[] = [];
    const labelUrls: Record<string, string> = {};
    const thumbUrls: Record<string, string> = {};
    for (const cp of cloudProjects) {
      for (const item of cp.items) {
        if (item.kind !== "beverage" || item.payload.kind !== "beverage") continue;
        const updatedMs = Date.parse(item.updatedAt) || 0;
        records.push({
          id: item.id,
          name: item.name,
          kind: "beverage",
          date: item.updatedAt,
          createdAt: updatedMs,
          updatedAt: updatedMs,
          groupId: cp.id,
          groupName: cp.name,
          sortOrder: item.sortOrder,
          settings: item.payload.settings,
        });
        if (item.payload.labelHash) {
          labelUrls[item.id] = cloudProjectAssetUrl(cp.id, item.payload.labelHash);
        }
        if (item.thumbnailHash) {
          thumbUrls[item.id] = cloudProjectAssetUrl(cp.id, item.thumbnailHash);
        }
      }
    }
    return { records, labelUrls, thumbUrls };
  }, [cloudProjects]);

  const beverageProjects = useMemo(() => {
    const localBev = projects.filter((p) => p.kind === "beverage");
    return [...cloudBeverageMeta.records, ...localBev];
  }, [cloudBeverageMeta.records, projects]);

  const combinedPackThumbUrls = useMemo(
    () => ({ ...cloudBeverageMeta.thumbUrls, ...projectThumbUrls }),
    [cloudBeverageMeta.thumbUrls, projectThumbUrls],
  );

  const groupedProjects = useMemo(
    () => groupCustomProjects(projects, projectGroups),
    [projects, projectGroups],
  );

  const studioCollections = useMemo<StudioProjectCollection[]>(() => {
    const cloudCols: StudioProjectCollection[] = cloudProjects.map((cp) => ({
      id: cp.id,
      source: "cloud",
      name: cp.name,
      description: cp.description,
      brandName: cp.brandName,
      updatedAt: Date.parse(cp.updatedAt) || 0,
      createdAt: Date.parse(cp.createdAt) || 0,
      expiresAt: cp.expiresAt,
      autoRenew: cp.autoRenew,
      renewalCount: cp.renewalCount,
      totalBytes: cp.totalBytes,
      cloudItems: cp.items,
    }));
    const localCols: StudioProjectCollection[] = groupedProjects.map((g) => ({
      id: g.group.id,
      source: "local",
      name: g.group.name,
      description: g.group.description ?? "",
      brandName: g.group.brandName ?? "",
      updatedAt: g.group.updatedAt,
      createdAt: g.group.createdAt,
      localGroup: g,
    }));
    return [...cloudCols, ...localCols];
  }, [cloudProjects, groupedProjects]);

  const shareByGroupId = useMemo(() => {
    const map = new Map<string, SharedProjectSummary>();
    for (const share of sharedProjects) {
      if (share.localProjectId && !map.has(share.localProjectId)) {
        map.set(share.localProjectId, share);
      }
    }
    return map;
  }, [sharedProjects]);
  const activeShareCollection = useMemo(
    () => (shareDialogGroupId ? studioCollections.find((c) => c.id === shareDialogGroupId) ?? null : null),
    [shareDialogGroupId, studioCollections],
  );
  const activeCustomPackProject = useMemo(
    () =>
      bottlePack.customProjectId
        ? beverageProjects.find((p) => p.id === bottlePack.customProjectId)
        : undefined,
    [bottlePack.customProjectId, beverageProjects],
  );

  useEffect(() => {
    const urls: Record<string, string> = {};
    for (const project of projects) {
      if (project.thumbnailBlob) {
        urls[project.id] = URL.createObjectURL(project.thumbnailBlob);
      }
    }
    const frame = requestAnimationFrame(() => setProjectThumbUrls(urls));
    return () => {
      cancelAnimationFrame(frame);
      Object.values(urls).forEach((u) => URL.revokeObjectURL(u));
    };
  }, [projects]);

  useEffect(() => {
    if (!savePreviewBlob) return;
    const url = URL.createObjectURL(savePreviewBlob);
    const frame = requestAnimationFrame(() => setSavePreviewUrl(url));
    return () => {
      cancelAnimationFrame(frame);
      URL.revokeObjectURL(url);
    };
  }, [savePreviewBlob]);
  const effectiveSavePreviewUrl = savePreviewBlob ? savePreviewUrl : undefined;

  useEffect(() => {
    const blob = activeCustomPackProject?.artworkBlob;
    const cloudUrl = activeCustomPackProject
      ? cloudBeverageMeta.labelUrls[activeCustomPackProject.id]
      : undefined;
    if (blob) {
      const url = URL.createObjectURL(blob);
      const frame = requestAnimationFrame(() => setCustomProjectLabelUrl(url));
      return () => {
        cancelAnimationFrame(frame);
        URL.revokeObjectURL(url);
      };
    }
    if (!cloudUrl) return;
    let cancelled = false;
    let createdUrl: string | undefined;
    void fetch(cloudUrl, { credentials: "same-origin" })
      .then((res) => (res.ok ? res.blob() : null))
      .then((fetched) => {
        if (cancelled || !fetched || fetched.size === 0) return;
        createdUrl = URL.createObjectURL(fetched);
        setCustomProjectLabelUrl(createdUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [activeCustomPackProject, cloudBeverageMeta.labelUrls]);
  const effectiveCustomProjectLabelUrl =
    activeCustomPackProject &&
    (activeCustomPackProject.artworkBlob || cloudBeverageMeta.labelUrls[activeCustomPackProject.id])
      ? customProjectLabelUrl
      : undefined;

  useEffect(() => {
    const artworkId = bottlePack.packLabelArtworkId;
    if (!artworkId) return;
    let cancelled = false;
    let createdUrl: string | undefined;
    void getArtworkById(artworkId)
      .then((rec) => {
        if (cancelled) return;
        if (!rec) {
          setPackBottleLabelUrl(undefined);
          return;
        }
        createdUrl = URL.createObjectURL(rec.preview);
        setPackBottleLabelUrl(createdUrl);
      })
      .catch(() => {
        if (!cancelled) setPackBottleLabelUrl(undefined);
      });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [bottlePack.packLabelArtworkId]);
  const effectivePackBottleLabelUrl = bottlePack.packLabelArtworkId
    ? packBottleLabelUrl
    : undefined;

  const activeBottleVisualSource = useMemo<BottlePackVisualSource | null>(() => {
    if (!bottlePack.enabled) return null;
    if (activeCustomPackProject) {
      const s = activeCustomPackProject.settings;
      const targetModel = getLabModel(s.modelId);
      return {
        model: targetModel,
        customProjectId: activeCustomPackProject.id,
        customProjectName: activeCustomPackProject.name,
        customLabelUrl: effectivePackBottleLabelUrl ?? effectiveCustomProjectLabelUrl,
        labelOffset: s.labelOffset,
        labelRoughness: s.roughness,
        labelMetalness: s.metalness,
        liquidColor: s.liquidColor,
        liquidCustomized: s.liquidCustomized,
        liquidClarity: s.liquidClarity,
        liquidDensity: s.liquidDensity,
        liquidTurbidity: s.liquidTurbidity,
        liquidBrightness: s.liquidBrightness,
        liquidScattering: s.liquidScattering,
        liquidRoughness: s.liquidRoughness,
        liquidIor: s.liquidIor,
        capColor: s.capColor,
        capMetalness: s.capMetalness,
        capRoughness: s.capRoughness,
        bodyColor: s.bodyColor,
        bodyMetalness: s.bodyMetalness,
        bodyRoughness: s.bodyRoughness,
      };
    }
    const targetModel = getLabModel(bottlePack.modelId);
    const matchesStudioModel = targetModel.id === settings.modelId;
    return {
      model: targetModel,
      customLabelUrl: effectivePackBottleLabelUrl ?? (matchesStudioModel ? artwork : undefined),
      ...(matchesStudioModel
        ? {
            labelOffset: settings.labelOffset,
            labelRoughness: settings.roughness,
            labelMetalness: settings.metalness,
            liquidColor: settings.liquidColor,
            liquidCustomized: settings.liquidCustomized,
            liquidClarity: settings.liquidClarity,
            liquidDensity: settings.liquidDensity,
            liquidTurbidity: settings.liquidTurbidity,
            liquidBrightness: settings.liquidBrightness,
            liquidScattering: settings.liquidScattering,
            liquidRoughness: settings.liquidRoughness,
            liquidIor: settings.liquidIor,
            capColor: settings.capColor,
            capMetalness: settings.capMetalness,
            capRoughness: settings.capRoughness,
            bodyColor: settings.bodyColor,
            bodyMetalness: settings.bodyMetalness,
            bodyRoughness: settings.bodyRoughness,
          }
        : {}),
    };
  }, [
    bottlePack.enabled,
    bottlePack.modelId,
    activeCustomPackProject,
    effectivePackBottleLabelUrl,
    effectiveCustomProjectLabelUrl,
    settings,
    artwork,
  ]);
  const activeBottleVisualSourceRef = useRef<BottlePackVisualSource | null>(activeBottleVisualSource);
  useEffect(() => {
    activeBottleVisualSourceRef.current = activeBottleVisualSource;
  }, [activeBottleVisualSource]);

  useEffect(() => {
    const initial = loadPreferences();
    const initialPackaging = { ...loadPackagingParams(), showDimensions: false };
    const initialBottlePack = loadBottlePackConfig(VALID_BEVERAGE_MODEL_IDS, initial.modelId);
    // Respect an explicit model or domain deep link without accepting external URLs.
    const params = new URLSearchParams(location.search);
    const id = params.get("model");
    const requestedDomain = params.get("domain");
    const requestedTemplate = params.get("template");
    let nextDomain: StudioDomainId = loadSavedDomain();

    if (id && LAB_MODELS.some((item) => item.id === id)) {
      nextDomain = "beverage";
      if (id !== initial.modelId) {
        Object.assign(initial, getModelMaterialDefaults(id), { modelId: id });
      }
    } else if (requestedDomain === "packaging" || requestedTemplate) {
      nextDomain = "packaging";
    } else if (requestedDomain === "beverage") {
      nextDomain = "beverage";
    }

    if (requestedTemplate && PACKAGING_TEMPLATES.some((t) => t.id === requestedTemplate)) {
      Object.assign(initialPackaging, createDefaultPackagingParams(requestedTemplate));
    }

    beverageSceneModeRef.current = initial.sceneMode;
    if (nextDomain === "packaging") {
      initial.sceneMode = "studio";
    }

    // Hydrate browser-only storage after the SSR render, before enabling persistence.
    /* eslint-disable react-hooks/set-state-in-effect */
    setDomain(nextDomain);
    setPackagingParams(initialPackaging);
    setBottlePack(initialBottlePack);
    setQualityPreference(loadQualityPreference());
    setSettings(initial);
    if (nextDomain === "packaging") setActiveTool("pkg-size");
    setActiveCamera(
      initial.sceneMode === "studio"
        ? "view-4"
        : initial.motion === "showcase"
          ? "animated"
          : "view-1",
    );
    void Promise.all([listCustomProjects(), listProjectGroups()])
      .then(([loadedItems, loadedGroups]) => {
        setProjects(loadedItems);
        setProjectGroups(loadedGroups);
      })
      .catch(() => {});
    if (params.get("panel") === "projects") setModal("projects");
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);
  useEffect(() => {
    if (hydrated && !isPackaging) savePreferences(settings);
  }, [settings, hydrated, isPackaging]);
  useEffect(() => {
    if (hydrated) saveDomain(domain);
  }, [domain, hydrated]);
  useEffect(() => {
    if (hydrated) savePackagingParams(packagingParams);
  }, [packagingParams, hydrated]);
  useEffect(() => {
    if (hydrated) saveBottlePackConfig(bottlePack, VALID_BEVERAGE_MODEL_IDS);
  }, [bottlePack, hydrated]);
  useEffect(() => {
    if (hydrated) saveQualityPreference(qualityPreference);
  }, [qualityPreference, hydrated]);

  // Mount or tear down the procedural Parametric Box/Tray subject cleanly on domain transitions.
  useEffect(() => {
    if (!hydrated) return;
    if (!isPackaging) {
      if (packagingSubjectRef.current) {
        packagingSubjectRef.current.setFoldPlaying(false);
        packagingSubjectRef.current = null;
      }
      /* eslint-disable react-hooks/set-state-in-effect */
      setPackagingFoldPlaying(false);
      setPackagingSubject(null);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    if (!packagingSubjectRef.current) {
      const subject = createPackagingSubject(packagingParams, packagingArtworkRef.current, {
        onNeedsRender: () => sceneRef.current?.requestFrame(),
        onBoundsChanged: () => sceneRef.current?.refreshProceduralBounds(false),
        onBottleFootprintMeasured: (modelId, footprintMm) => {
          setMeasuredFootprints((prev) => {
            const cur = prev[modelId];
            if (
              cur &&
              cur.diameterXMm === footprintMm.diameterXMm &&
              cur.diameterZMm === footprintMm.diameterZMm &&
              cur.heightMm === footprintMm.heightMm
            ) {
              return prev;
            }
            return { ...prev, [modelId]: footprintMm };
          });
          // If auto-fit is enabled for this active bottle model, immediately refine box dimensions
          // using the exact decoded GLB measurements so bottles never clip on first load!
          const activePack = bottlePackRef.current;
          const activeParams = packagingParamsRef.current;
          if (activePack.enabled && activePack.autoFitOnChange && activePack.modelId === modelId) {
            const fit = computeAutoFitBoxDimensions({
              templateId: activeParams.templateId,
              itemMm: footprintMm,
              config: activePack,
              thicknessMm: activeParams.thicknessMm,
              dividerGrid: activeParams.dividerGrid,
            });
            if (
              activeParams.dimensionMode !== "inner" ||
              Math.abs(activeParams.lengthMm - fit.lengthMm) > 1 ||
              Math.abs(activeParams.widthMm - fit.widthMm) > 1 ||
              Math.abs(activeParams.heightMm - fit.heightMm) > 1
            ) {
              const refined: PackagingParams = {
                ...activeParams,
                dimensionMode: "inner",
                lengthMm: fit.lengthMm,
                widthMm: fit.widthMm,
                heightMm: fit.heightMm,
              };
              setPackagingParams(refined);
              packagingSubjectRef.current?.syncParams(refined, { interactive: false });
              sceneRef.current?.refreshProceduralBounds(false);
            }
          }
        },
      });
      subject.syncBottlePack(bottlePackRef.current, activeBottleVisualSourceRef.current);
      packagingSubjectRef.current = subject;
      setPackagingSubject(subject);
    }
    // Only recreate when domain toggles; live parameter updates mutate `subject` in place!
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, isPackaging]);

  // Keep 3D packed bottles synced cleanly whenever bottle config or studio artwork/colors change.
  useEffect(() => {
    if (!isPackaging || !packagingSubjectRef.current) return;
    packagingSubjectRef.current.syncBottlePack(bottlePack, activeBottleVisualSource);
    sceneRef.current?.refreshProceduralBounds(false);
  }, [isPackaging, packagingSubject, bottlePack, activeBottleVisualSource]);

  const revokePackagingArtworkUrls = useCallback((state: PackagingArtworkState) => {
    if (state.outsideDielineUrl?.startsWith("blob:")) URL.revokeObjectURL(state.outsideDielineUrl);
    if (state.insideDielineUrl?.startsWith("blob:")) URL.revokeObjectURL(state.insideDielineUrl);
    if (state.finishMaskUrl?.startsWith("blob:")) URL.revokeObjectURL(state.finishMaskUrl);
    for (const ov of Object.values(state.panelOverlays)) {
      if (ov.imageUrl?.startsWith("blob:")) URL.revokeObjectURL(ov.imageUrl);
    }
  }, []);

  const refreshCloudState = useCallback(async () => {
    try {
      const res = await fetchUserCloudProjects();
      setCloudAuthenticated(res.authenticated);
      setCloudProjects(res.projects);
      if (typeof res.extendCost === "number" && res.extendCost >= 0) {
        setSitePricing((prev) => ({ ...prev, projectExtendCost: res.extendCost! }));
      }
      if (!res.authenticated) {
        setSharedProjects([]);
      }
    } catch {
      // Keep last known cloud state on transient error.
    }
  }, []);

  // Load user's Cloud Projects on startup and whenever login/logout/account changes.
  useEffect(() => {
    let active = true;
    const sync = () => {
      if (!active) return;
      void refreshCloudState();
    };
    const frame = requestAnimationFrame(sync);
    window.addEventListener("labellab-account-changed", sync);
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      window.removeEventListener("labellab-account-changed", sync);
    };
  }, [refreshCloudState]);

  // Refresh active cloud projects & share links whenever the Projects modal opens.
  useEffect(() => {
    if (modal !== "projects") return;
    let active = true;
    void fetchUserCloudProjects()
      .then((res) => {
        if (!active) return;
        setCloudAuthenticated(res.authenticated);
        setCloudProjects(res.projects);
        if (typeof res.extendCost === "number" && res.extendCost >= 0) {
          setSitePricing((prev) => ({ ...prev, projectExtendCost: res.extendCost! }));
        }
        if (!res.authenticated) setSharedProjects([]);
      })
      .catch(() => {});
    void fetch("/api/share/mine", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: { shares?: SharedProjectSummary[] } | null) => {
        if (active && Array.isArray(payload?.shares)) {
          setSharedProjects(payload.shares);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [modal]);

  // Hydrate saved independent per-face artworks for the active packaging template from IndexedDB.
  useEffect(() => {
    if (!hydrated || !isPackaging) return;
    if (suppressPackagingHydrateRef.current) {
      suppressPackagingHydrateRef.current = false;
      return;
    }
    let cancelled = false;
    const templateId = packagingParams.templateId;
    const prefix = packagingTemplateScopePrefix(templateId);

    void getArtworkSelectionsByPrefix(prefix)
      .then(async (selectionMap) => {
        if (cancelled) return;
        const entries = Object.entries(selectionMap);
        const nextOverlays: PackagingArtworkState["panelOverlays"] = {};
        const createdUrls: string[] = [];

        await Promise.all(
          entries.map(async ([scopeKey, artworkId]) => {
            const rest = scopeKey.slice(prefix.length);
            const sep = rest.indexOf(":");
            if (sep <= 0) return;
            const rawSurface = rest.slice(0, sep);
            const panelId = rest.slice(sep + 1);
            if ((rawSurface !== "outside" && rawSurface !== "inside") || !panelId) return;
            const record = await getArtworkById(artworkId).catch(() => undefined);
            if (cancelled || !record) return;
            const url = URL.createObjectURL(record.preview);
            createdUrls.push(url);
            nextOverlays[`${rawSurface}:${panelId}`] = {
              panelId,
              surface: rawSurface,
              imageUrl: url,
              artworkId: record.id,
              artworkName: record.name,
              fitMode: "crop",
              imageScale: 1,
              imageOffsetX: 0,
              imageOffsetY: 0,
              imageRotationDeg: 0,
            };
          }),
        );

        if (cancelled) {
          createdUrls.forEach((u) => URL.revokeObjectURL(u));
          return;
        }
        revokePackagingArtworkUrls(packagingArtworkRef.current);
        const hydratedState: PackagingArtworkState = {
          mode: "panel",
          panelOverlays: nextOverlays,
        };
        setPackagingArtwork(hydratedState);
        void packagingSubjectRef.current?.syncArtwork(hydratedState);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [hydrated, isPackaging, packagingParams.templateId, packagingSubject, revokePackagingArtworkUrls]);

  useEffect(
    () => () => {
      revokePackagingArtworkUrls(packagingArtworkRef.current);
    },
    [revokePackagingArtworkUrls],
  );
  useEffect(() => {
    if (!toastState) return;
    const timer = setTimeout(() => setToastState(null), 4500);
    return () => clearTimeout(timer);
  }, [toastState]);
  useEffect(() => {
    const dialog = dialogRef.current;
    const showGuide = modal === "guide";
    if (showGuide && dialog && !dialog.open) dialog.showModal();
    if (!showGuide && dialog?.open) dialog.close();
  }, [modal]);
  useEffect(
    () => () => {
      if (artworkRef.current) releaseLocalArtwork(artworkRef.current);
      if (resultRef.current) URL.revokeObjectURL(resultRef.current);
    },
    [],
  );

  const chooseModel = (id: string) => {
    if (exportBusy) return;
    const family = getLabModelFamily(id);
    setActiveFamilyId(family && family.variants.length > 1 ? family.id : null);
    if (id === settings.modelId) return;
    modelMaterials.current.set(settings.modelId, pickMaterialPreferences(settings));
    setSettings((current) => ({
      ...current,
      ...(modelMaterials.current.get(id) ?? getModelMaterialDefaults(id)),
      modelId: id,
    }));
    clearArtwork();
    setStatus("loading-model");
  };
  const openFamily = (familyId: string) => {
    if (exportBusy) return;
    const family = getLabModelFamilyById(familyId);
    if (!family) return;
    setActiveFamilyId(family.variants.length > 1 ? family.id : null);
    const defaultVariant = getDefaultFamilyVariant(family);
    if (defaultVariant?.available && defaultVariant.modelId) chooseModel(defaultVariant.modelId);
  };
  const changeLibraryPage = (page: number) => {
    setLibraryPage(Math.max(0, Math.min(page, libraryPageCount - 1)));
    setActiveFamilyId(null);
    libraryPanelRef.current?.scrollTo({ top: 0 });
  };
  const clearArtwork = () => {
    if (artworkRef.current) releaseLocalArtwork(artworkRef.current);
    artworkRef.current = undefined;
    artworkBlobRef.current = undefined;
    artworkIdRef.current = undefined;
    setArtwork(undefined);
  };
  const applyArtwork = (blob: Blob, _name?: string, artworkId?: string, isAutoRestore = false) => {
    if (isAutoRestore && suppressLibraryAutoApplyRef.current) {
      suppressLibraryAutoApplyRef.current = false;
      return;
    }
    const url = createLocalArtwork(blob);
    const previous = artworkRef.current;
    artworkRef.current = url;
    artworkBlobRef.current = blob;
    artworkIdRef.current = artworkId;
    setArtwork(url);
    if (previous) releaseLocalArtwork(previous);
  };
  const openSaveProjectDialog = async () => {
    if (exportBusy) return;
    setHoverTarget(null);
    const previewBlob = await captureCanvasThumbnailBlob(renderCanvasRef.current);
    setSavePreviewBlob(previewBlob);
    const kind = isPackaging ? "packaging" : "beverage";
    const existingCloudItem =
      loadedCloudProjectId && loadedCloudItemId
        ? cloudProjects
            .find((p) => p.id === loadedCloudProjectId)
            ?.items.find((i) => i.id === loadedCloudItemId && i.kind === kind)
        : undefined;
    const existingLocal = loadedProjectId
      ? projects.find((p) => p.id === loadedProjectId && p.kind === kind)
      : undefined;
    if (existingCloudItem) {
      setProjectName(existingCloudItem.name);
    } else if (existingLocal) {
      setProjectName(existingLocal.name);
    } else {
      setProjectName(isPackaging ? `${activePackagingTemplate.shortName} Custom` : `${model.name} Custom`);
    }
    setSaveDialogOpen(true);
  };
  const handleConfirmSaveProject = async (payload: SaveProjectPayload) => {
    const kind = isPackaging ? "packaging" : "beverage";
    const isoNow = new Date().toISOString();
    const now = Date.parse(isoNow);
    const cleanGroupName = sanitizeProjectName(payload.groupName, payload.itemName);

    const packagingArtworkSnapshot = isPackaging
      ? await capturePackagingArtworkSnapshot(packagingArtworkRef.current)
      : undefined;
    const packedBottleSnapshot = isPackaging
      ? await capturePackedBottleSnapshot(
          bottlePackRef.current,
          activeCustomPackProject,
          effectivePackBottleLabelUrl ??
            effectiveCustomProjectLabelUrl ??
            (bottlePackRef.current.modelId === settings.modelId ? artworkRef.current : undefined),
          settings,
        )
      : undefined;

    const targetIsExistingLocal = Boolean(
      payload.groupId && groupedProjects.some((g) => g.group.id === payload.groupId),
    );
    const shouldSaveToCloud = cloudAuthenticated && !targetIsExistingLocal;

    if (shouldSaveToCloud) {
      const targetCloudProjectId =
        payload.groupId && cloudProjects.some((p) => p.id === payload.groupId)
          ? payload.groupId
          : undefined;
      const updatingCloudItemId =
        payload.mode === "update" &&
        targetCloudProjectId &&
        loadedCloudProjectId === targetCloudProjectId &&
        loadedCloudItemId
          ? loadedCloudItemId
          : undefined;

      const snapshotRecord: CustomProjectRecord = {
        id: updatingCloudItemId ?? crypto.randomUUID(),
        name: sanitizeProjectName(payload.itemName, isPackaging ? activePackagingTemplate.name : model.name),
        kind,
        date: isoNow,
        createdAt: now,
        updatedAt: now,
        groupId: targetCloudProjectId,
        groupName: cleanGroupName,
        settings: { ...settings },
        ...(!isPackaging && artworkIdRef.current ? { artworkId: artworkIdRef.current } : {}),
        ...(!isPackaging && artworkBlobRef.current ? { artworkBlob: artworkBlobRef.current } : {}),
        ...(savePreviewBlob ? { thumbnailBlob: savePreviewBlob } : {}),
        ...(isPackaging ? { packagingParams: { ...packagingParams }, bottlePack: { ...bottlePack } } : {}),
        ...(packagingArtworkSnapshot ? { packagingArtwork: packagingArtworkSnapshot } : {}),
        ...(packedBottleSnapshot ? { packedBottle: packedBottleSnapshot } : {}),
      };

      try {
        const savedCloud = await saveRecordToCloudProject({
          record: snapshotRecord,
          cloudProjectId: targetCloudProjectId,
          cloudItemId: updatingCloudItemId,
          projectName: cleanGroupName,
          autoRenew: payload.autoRenew,
        });
        setCloudProjects((prev) => [
          savedCloud.project,
          ...prev.filter((p) => p.id !== savedCloud.project.id),
        ]);
        setLoadedCloudProjectId(savedCloud.project.id);
        setLoadedCloudItemId(savedCloud.savedItemId);
        setLoadedProjectId(undefined);
        setProjectName(snapshotRecord.name);
        setSaveDialogOpen(false);
        setToast(st.toasts.savedCloudItem(snapshotRecord.name, savedCloud.project.name));
        return;
      } catch (err) {
        const code = err instanceof Error ? err.message : "";
        if (code === "PROJECT_LIMIT_REACHED") {
          throw new Error(st.toasts.projectLimitReached(CLOUD_PROJECT_LIMITS.maxProjectsPerUser));
        }
        if (code === "AUTH_REQUIRED") {
          setCloudAuthenticated(false);
          openAuth("login");
          throw new Error(st.projectsModal.guestBannerTitle);
        }
        throw new Error(st.toasts.cloudActionFailed);
      }
    }

    const existing =
      payload.mode === "update" && loadedProjectId
        ? projects.find((p) => p.id === loadedProjectId && p.kind === kind)
        : undefined;

    let targetGroupId = payload.groupId;
    const existingGroup = targetGroupId
      ? groupedProjects.find((g) => g.group.id === targetGroupId)?.group
      : undefined;
    if (!targetGroupId) {
      targetGroupId = `grp_${crypto.randomUUID()}`;
    }

    const groupRecord: ProjectGroup = existingGroup
      ? { ...existingGroup, name: cleanGroupName, updatedAt: now }
      : { id: targetGroupId, name: cleanGroupName, createdAt: now, updatedAt: now };
    const savedGroup = await saveProjectGroup(groupRecord);

    const siblings = projects.filter((p) => resolveItemGroupId(p) === targetGroupId);
    const nextSortOrder =
      existing && resolveItemGroupId(existing) === targetGroupId
        ? (existing.sortOrder ?? 0)
        : siblings.reduce((max, item) => Math.max(max, (item.sortOrder ?? 0) + 1), 0);

    const record: CustomProjectRecord = {
      id: existing ? existing.id : crypto.randomUUID(),
      name: sanitizeProjectName(payload.itemName, isPackaging ? activePackagingTemplate.name : model.name),
      kind,
      date: isoNow,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
      groupId: savedGroup.id,
      groupName: savedGroup.name,
      sortOrder: nextSortOrder,
      settings: { ...settings },
      ...(!isPackaging && artworkIdRef.current ? { artworkId: artworkIdRef.current } : {}),
      ...(!isPackaging && artworkBlobRef.current ? { artworkBlob: artworkBlobRef.current } : {}),
      ...(savePreviewBlob ? { thumbnailBlob: savePreviewBlob } : {}),
      ...(isPackaging ? { packagingParams: { ...packagingParams }, bottlePack: { ...bottlePack } } : {}),
      ...(packagingArtworkSnapshot ? { packagingArtwork: packagingArtworkSnapshot } : {}),
      ...(packedBottleSnapshot ? { packedBottle: packedBottleSnapshot } : {}),
    };
    const saved = await saveCustomProject(record);
    setProjects((prev) => [saved, ...prev.filter((item) => item.id !== saved.id)].slice(0, 120));
    setProjectGroups((prev) => [savedGroup, ...prev.filter((g) => g.id !== savedGroup.id)]);
    setLoadedProjectId(saved.id);
    setLoadedCloudProjectId(undefined);
    setLoadedCloudItemId(undefined);
    setProjectName(saved.name);
    setSaveDialogOpen(false);
    setToast(st.toasts.savedItem(saved.name, savedGroup.name));
  };
  const handleDeleteSavedProject = async (project: CustomProjectRecord) => {
    const gid = resolveItemGroupId(project);
    await deleteCustomProject(project.id);
    const remaining = projects.filter((item) => item.id !== project.id);
    setProjects(remaining);
    if (!remaining.some((item) => resolveItemGroupId(item) === gid)) {
      await deleteProjectGroupRecord(gid);
      setProjectGroups((prev) => prev.filter((g) => g.id !== gid));
    }
    if (loadedProjectId === project.id) setLoadedProjectId(undefined);
    if (bottlePack.customProjectId === project.id) {
      setBottlePack((cur) => ({ ...cur, customProjectId: undefined }));
    }
    setToast(st.toasts.deletedName(project.name));
  };
  const handleDeleteProjectGroup = async (groupId: string, groupName: string) => {
    const victims = projects.filter((item) => resolveItemGroupId(item) === groupId);
    for (const item of victims) {
      await deleteCustomProject(item.id);
    }
    await deleteProjectGroupRecord(groupId);
    setProjects((prev) => prev.filter((item) => resolveItemGroupId(item) !== groupId));
    setProjectGroups((prev) => prev.filter((g) => g.id !== groupId));
    if (loadedProjectId && victims.some((v) => v.id === loadedProjectId)) {
      setLoadedProjectId(undefined);
    }
    if (bottlePack.customProjectId && victims.some((v) => v.id === bottlePack.customProjectId)) {
      setBottlePack((cur) => ({ ...cur, customProjectId: undefined }));
    }
    setToast(st.toasts.deletedProject(groupName));
  };
  const applyOpenedProjectRecord = (project: CustomProjectRecord) => {
    setHoverTarget(null);
    setActiveArtworkTarget(null);
    setProjectName(project.name);
    if (project.kind === "packaging" && project.packagingParams) {
      if (project.packagingArtwork) {
        suppressPackagingHydrateRef.current = true;
        revokePackagingArtworkUrls(packagingArtworkRef.current);
        const hydratedArt = hydratePackagingArtworkSnapshot(project.packagingArtwork);
        setPackagingArtwork(hydratedArt);
        void packagingSubjectRef.current?.syncArtwork(hydratedArt);
      }
      setDomain("packaging");
      setPackagingParams(project.packagingParams);
      if (project.bottlePack) setBottlePack(project.bottlePack);
      setSettings((cur) => ({ ...cur, sceneMode: "studio", motion: "off" }));
      setActiveTool("pkg-size");
      setPackagingViewMode("3d");
      packagingSubjectRef.current?.syncParams(project.packagingParams, { interactive: false });
      sceneRef.current?.refreshProceduralBounds(true);
      setModal(null);
      setToast(st.toasts.loadedName(project.name));
      return;
    }
    if (domain !== "beverage") {
      setPackagingFoldPlaying(false);
      setDomain("beverage");
      setActiveTool("models");
    }
    clearArtwork();
    setActiveFamilyId(null);
    modelMaterials.current.clear();
    if (project.artworkBlob) {
      suppressLibraryAutoApplyRef.current = true;
      applyArtwork(project.artworkBlob, project.name, project.artworkId);
    } else {
      suppressLibraryAutoApplyRef.current = true;
    }
    setSettings(project.settings);
    setActiveCamera(
      project.settings.sceneMode === "studio"
        ? "view-4"
        : project.settings.motion === "showcase"
          ? "animated"
          : "view-1",
    );
    setModal(null);
    setToast(st.toasts.loadedName(project.name));
  };
  const handleOpenSavedProject = (project: CustomProjectRecord) => {
    setLoadedProjectId(project.id);
    setLoadedCloudProjectId(undefined);
    setLoadedCloudItemId(undefined);
    applyOpenedProjectRecord(project);
  };
  const handleOpenCloudProjectItem = async (
    cloudProject: CloudProjectSummary,
    item: CloudProjectItem,
  ) => {
    try {
      const record = await hydrateCloudItemToRecord(cloudProject, item);
      setLoadedProjectId(undefined);
      setLoadedCloudProjectId(cloudProject.id);
      setLoadedCloudItemId(item.id);
      applyOpenedProjectRecord(record);
    } catch {
      setToast(st.toasts.cloudActionFailed, "error");
    }
  };
  const handleToggleCloudAutoRenew = async (projectId: string, nextValue: boolean) => {
    try {
      const updated = await patchCloudProject(projectId, { autoRenew: nextValue });
      setCloudProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setToast(
        nextValue
          ? st.toasts.autoRenewEnabled(updated.name, sitePricing.projectExtendCost)
          : st.toasts.autoRenewDisabled(updated.name),
      );
    } catch {
      setToast(st.toasts.cloudActionFailed, "error");
    }
  };
  const handleExtendCloudProject = async (projectId: string) => {
    try {
      const res = await extendCloudProjectApi(projectId);
      setCloudProjects((prev) => prev.map((p) => (p.id === res.project.id ? res.project : p)));
      if (res.chargedCoins > 0) {
        window.dispatchEvent(new Event("labellab-account-changed"));
      }
      setToast(
        st.toasts.extendedProject(
          res.project.name,
          CLOUD_PROJECT_LIMITS.extensionDays,
          res.chargedCoins,
        ),
      );
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "INSUFFICIENT_COINS") {
        setToast(st.toasts.needCoinsExtend(sitePricing.projectExtendCost), "error");
      } else if (code === "AUTH_REQUIRED") {
        setCloudAuthenticated(false);
        openAuth("login");
      } else {
        setToast(st.toasts.cloudActionFailed, "error");
      }
    }
  };
  const handleDeleteCloudProject = async (projectId: string, name: string) => {
    try {
      await deleteCloudProjectApi(projectId);
      setCloudProjects((prev) => prev.filter((p) => p.id !== projectId));
      setSharedProjects((prev) => prev.filter((s) => s.localProjectId !== projectId));
      if (loadedCloudProjectId === projectId) {
        setLoadedCloudProjectId(undefined);
        setLoadedCloudItemId(undefined);
      }
      setToast(st.toasts.deletedProject(name));
    } catch {
      setToast(st.toasts.cloudActionFailed, "error");
    }
  };
  const handleDeleteCloudItem = async (projectId: string, itemId: string, itemName: string) => {
    try {
      const res = await deleteCloudProjectItemApi(projectId, itemId);
      if (res.projectDeleted || !res.project) {
        setCloudProjects((prev) => prev.filter((p) => p.id !== projectId));
        setSharedProjects((prev) => prev.filter((s) => s.localProjectId !== projectId));
      } else {
        setCloudProjects((prev) => prev.map((p) => (p.id === projectId ? res.project! : p)));
      }
      if (loadedCloudItemId === itemId) {
        setLoadedCloudItemId(undefined);
        if (res.projectDeleted) setLoadedCloudProjectId(undefined);
      }
      setToast(st.toasts.deletedName(itemName));
    } catch {
      setToast(st.toasts.cloudActionFailed, "error");
    }
  };
  const handleMigrateLocalGroupToCloud = async (groupId: string) => {
    const target = groupedProjects.find((g) => g.group.id === groupId);
    if (!target) return;
    try {
      const created = await migrateLocalGroupToCloud(target, false);
      setCloudProjects((prev) => [created, ...prev.filter((p) => p.id !== created.id)]);
      // Clean up the migrated local records so there is no duplicate card.
      for (const item of target.items) {
        await deleteCustomProject(item.id).catch(() => {});
      }
      await deleteProjectGroupRecord(groupId).catch(() => {});
      setProjects((prev) => prev.filter((item) => resolveItemGroupId(item) !== groupId));
      setProjectGroups((prev) => prev.filter((g) => g.id !== groupId));
      setToast(st.toasts.migratedToCloud(created.name));
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "PROJECT_LIMIT_REACHED") {
        setToast(st.toasts.projectLimitReached(CLOUD_PROJECT_LIMITS.maxProjectsPerUser), "error");
      } else if (code === "AUTH_REQUIRED") {
        setCloudAuthenticated(false);
        openAuth("login");
      } else {
        setToast(st.toasts.cloudActionFailed, "error");
      }
    }
  };
  const handleSceneHoverTarget = useCallback((target: InteractivePickTarget | null) => {
    setHoverTarget(target);
  }, []);
  const handleScenePickTarget = useCallback(
    (target: InteractivePickTarget) => {
      if (exportBusy) return;
      setHoverTarget(null);
      if (isPackaging) {
        if (target.kind === "packaging-face") {
          setSelectedPanelId(target.panelId);
          setPackagingSurface(target.surface);
        }
        setActiveArtworkTarget(target);
      } else if (target.kind === "bottle-label") {
        setBeverageArtworkOpenSignal((value) => value + 1);
      }
    },
    [exportBusy, isPackaging],
  );
  const openFaceArtworkEditor = (panelId: string, surface: "outside" | "inside") => {
    if (exportBusy) return;
    const panel = solvedPackaging.flatPanels.find((p) => p.id === panelId);
    if (!panel) return;
    const { widthMm, heightMm } = getPanelUprightSizeMm(panel);
    setSelectedPanelId(panel.id);
    setPackagingSurface(surface);
    setHoverTarget(null);
    setActiveArtworkTarget({
      kind: "packaging-face",
      templateId: solvedPackaging.templateId,
      panelId: panel.id,
      surface,
      label: panel.label,
      shortCode: panel.shortCode,
      widthMm,
      heightMm,
    });
  };
  const openPackedBottleLabelEditor = () => {
    if (exportBusy || !bottlePack.enabled) return;
    const targetModelId = activeCustomPackProject?.settings.modelId ?? bottlePack.modelId;
    const targetModel = getLabModel(targetModelId);
    const packCount = Math.max(1, Math.min(24, Math.round(bottlePack.cols) * Math.round(bottlePack.rows)));
    setHoverTarget(null);
    setActiveArtworkTarget({
      kind: "bottle-label",
      modelId: targetModel.id,
      instanceId: 0,
      label: activeCustomPackProject
        ? `${activeCustomPackProject.name} Label`
        : `${targetModel.name} Label`,
      packCount,
    });
  };
  const handleApplyFaceArtwork = ({
    panelId,
    surface,
    record,
  }: {
    templateId: string;
    panelId: string;
    surface: "outside" | "inside";
    record: StoredArtwork;
  }) => {
    const key = `${surface}:${panelId}`;
    const current = packagingArtworkRef.current;
    const prevOverlay = current.panelOverlays[key];
    if (prevOverlay?.imageUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(prevOverlay.imageUrl);
    }
    const url = URL.createObjectURL(record.preview);
    const next: PackagingArtworkState = {
      ...current,
      mode: "panel",
      panelOverlays: {
        ...current.panelOverlays,
        [key]: {
          ...(prevOverlay ?? {
            panelId,
            surface,
            imageScale: 1,
            imageOffsetX: 0,
            imageOffsetY: 0,
            imageRotationDeg: 0,
          }),
          panelId,
          surface,
          imageUrl: url,
          artworkId: record.id,
          artworkName: record.name,
          fitMode: "crop",
          imageScale: 1,
          imageOffsetX: 0,
          imageOffsetY: 0,
          imageRotationDeg: 0,
        },
      },
    };
    setPackagingArtwork(next);
    void packagingSubjectRef.current?.syncArtwork(next);
    const panelMeta = solvedPackaging.flatPanels.find((p) => p.id === panelId);
    setToast(`Applied artwork to ${panelMeta?.label ?? panelId} (${surface}).`);
  };
  const handleRemoveFaceArtwork = (panelId: string, surface: "outside" | "inside") => {
    const key = `${surface}:${panelId}`;
    const scope = packagingFaceArtworkScope(packagingParams.templateId, surface, panelId);
    void setArtworkSelection(scope).catch(() => {});
    const current = packagingArtworkRef.current;
    const prevOverlay = current.panelOverlays[key];
    if (!prevOverlay) return;
    if (prevOverlay.imageUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(prevOverlay.imageUrl);
    }
    const updatedOverlay = {
      ...prevOverlay,
      imageUrl: undefined,
      artworkId: undefined,
      artworkName: undefined,
    };
    const nextOverlays = { ...current.panelOverlays };
    if (!updatedOverlay.fillColor && !updatedOverlay.text?.trim()) {
      delete nextOverlays[key];
    } else {
      nextOverlays[key] = updatedOverlay;
    }
    const next: PackagingArtworkState = { ...current, mode: "panel", panelOverlays: nextOverlays };
    setPackagingArtwork(next);
    void packagingSubjectRef.current?.syncArtwork(next);
    const panelMeta = solvedPackaging.flatPanels.find((p) => p.id === panelId);
    setToast(`Removed artwork from ${panelMeta?.label ?? panelId} (${surface}).`);
  };
  const handleApplyPackedBottleLabel = (_modelId: string, record: StoredArtwork) => {
    setBottlePack((cur) => ({ ...cur, packLabelArtworkId: record.id }));
    const count = Math.max(1, Math.min(24, Math.round(bottlePack.cols) * Math.round(bottlePack.rows)));
    setToast(`Applied "${record.name}" to all ${count} bottle${count > 1 ? "s" : ""} in this tray.`);
  };
  const handleClearPackLabelOverride = () => {
    setBottlePack((cur) => ({ ...cur, packLabelArtworkId: undefined }));
    setToast("Restored default bottle label on tray.");
  };
  const switchDomain = (next: StudioDomainId) => {
    if (exportBusy || next === domain) return;
    const meta = getStudioDomain(next);
    if (meta.id !== next) {
      setToast(st.toasts.apparelComingSoon);
      return;
    }
    setActiveFamilyId(null);
    setHoverTarget(null);
    setActiveArtworkTarget(null);
    if (domain === "beverage") beverageSceneModeRef.current = settings.sceneMode;
    setDomain(next);
    if (next === "packaging") {
      setSettings((cur) => ({ ...cur, sceneMode: "studio", motion: "off" }));
      setActiveTool("pkg-size");
      setPackagingViewMode("3d");
    } else {
      setPackagingFoldPlaying(false);
      setSettings((cur) => ({ ...cur, sceneMode: beverageSceneModeRef.current }));
      setActiveTool("models");
    }
  };

  const applyAutoFitForPack = useCallback(
    (
      nextPack: BottlePackConfig,
      targetParams: PackagingParams,
      options?: { openLidIfClosed?: boolean; refitCamera?: boolean },
    ) => {
      const targetModel = getLabModel(nextPack.modelId);
      const fp =
        measuredFootprints[targetModel.id] ??
        getBeverageFootprintMm(targetModel.id, targetModel.asset.volumeMl);
      const fit = computeAutoFitBoxDimensions({
        templateId: targetParams.templateId,
        itemMm: fp,
        config: nextPack,
        thicknessMm: targetParams.thicknessMm,
        dividerGrid: targetParams.dividerGrid,
      });
      const tpl = getPackagingTemplate(targetParams.templateId);
      const shouldOpenLid =
        options?.openLidIfClosed &&
        !isOpenTopPackagingTemplate(targetParams.templateId) &&
        targetParams.foldProgress > 0.9;
      const nextParams: PackagingParams = {
        ...targetParams,
        dimensionMode: "inner",
        lengthMm: fit.lengthMm,
        widthMm: fit.widthMm,
        heightMm: fit.heightMm,
        ...(shouldOpenLid ? { foldProgress: tpl.openPreviewFold } : {}),
      };
      setPackagingParams(nextParams);
      const subject = packagingSubjectRef.current;
      if (subject) {
        subject.syncParams(nextParams, { interactive: false });
        sceneRef.current?.refreshProceduralBounds(Boolean(options?.refitCamera));
      }
      return fit;
    },
    [measuredFootprints],
  );

  const updateBottlePack = (patch: Partial<BottlePackConfig>) => {
    if (exportBusy) return;
    const enablingNow = patch.enabled === true && !bottlePack.enabled;

    const nextPack: BottlePackConfig = {
      ...bottlePack,
      // When first turning Pack Your Bottles ON, default to user's active Beverage Studio model.
      ...(enablingNow ? { modelId: settings.modelId } : {}),
      ...patch,
    };
    setBottlePack(nextPack);

    const gridOrModelChanged =
      enablingNow ||
      patch.modelId !== undefined ||
      patch.customProjectId !== undefined ||
      patch.cols !== undefined ||
      patch.rows !== undefined ||
      patch.spacingMm !== undefined ||
      patch.wallPaddingMm !== undefined ||
      patch.honeycombDividers !== undefined;

    if (nextPack.enabled && nextPack.autoFitOnChange && gridOrModelChanged) {
      applyAutoFitForPack(nextPack, packagingParams, {
        openLidIfClosed: enablingNow,
        refitCamera: enablingNow || patch.customProjectId !== undefined,
      });
      if (patch.customProjectId) {
        const proj = beverageProjects.find((p) => p.id === patch.customProjectId);
        if (proj) {
          setToast(
            `Packed ${nextPack.cols * nextPack.rows}× "${proj.name}" inside ${activePackagingTemplate.shortName}.`,
          );
        }
      } else if (enablingNow) {
        const m = getLabModel(nextPack.modelId);
        setToast(
          `Packed ${nextPack.cols * nextPack.rows}× ${m.name} and auto-fitted ${activePackagingTemplate.shortName}.`,
        );
      }
    } else if (enablingNow && !isOpenTopPackagingTemplate(packagingParams.templateId) && packagingParams.foldProgress > 0.9) {
      updatePackaging({ foldProgress: activePackagingTemplate.openPreviewFold });
    }
  };

  const handleAutoFitBottlePack = () => {
    if (exportBusy || !bottlePack.enabled) return;
    const fit = applyAutoFitForPack(bottlePack, packagingParams, {
      openLidIfClosed: false,
      refitCamera: true,
    });
    setToast(
      `Auto-fitted inner box to ${fit.lengthMm}×${fit.widthMm}×${fit.heightMm} mm for ${bottlePack.cols * bottlePack.rows}× bottles.`,
    );
  };

  const updatePackaging = (patch: Partial<PackagingParams>, interactive = false) => {
    if (exportBusy) return;
    setPackagingParams((current) => {
      const next = { ...current, ...patch };
      const subject = packagingSubjectRef.current;
      if (subject) {
        subject.syncParams(next, { interactive });
        sceneRef.current?.refreshProceduralBounds(false);
      }
      return next;
    });
  };

  const selectPackagingTemplate = (tpl: PackagingTemplateDefinition) => {
    if (exportBusy) return;
    setPackagingFoldPlaying(false);
    packagingSubjectRef.current?.setFoldPlaying(false);
    let next = createDefaultPackagingParams(tpl.id);
    if (bottlePack.enabled && bottlePack.autoFitOnChange) {
      const targetModel = getLabModel(bottlePack.modelId);
      const fp =
        measuredFootprints[targetModel.id] ??
        getBeverageFootprintMm(targetModel.id, targetModel.asset.volumeMl);
      const fit = computeAutoFitBoxDimensions({
        templateId: tpl.id,
        itemMm: fp,
        config: bottlePack,
        thicknessMm: next.thicknessMm,
        dividerGrid: next.dividerGrid,
      });
      next = {
        ...next,
        dimensionMode: "inner",
        lengthMm: fit.lengthMm,
        widthMm: fit.widthMm,
        heightMm: fit.heightMm,
        foldProgress: isOpenTopPackagingTemplate(tpl.id) ? tpl.heroFold : tpl.openPreviewFold,
      };
    }
    setPackagingParams(next);
    setSelectedPanelId("front-wall");
    const subject = packagingSubjectRef.current;
    if (subject) {
      subject.syncParams(next, { interactive: false });
      sceneRef.current?.refreshProceduralBounds(true);
      sceneRef.current?.cameraAngles(34, 28, 32, true);
      setPackagingCameraId("iso");
    }
    setToast(
      t.studio.toasts.loadedName(
        `${tpl.code} — ${tpl.name} (${next.lengthMm}×${next.widthMm}×${next.heightMm} mm)`,
      ),
    );
  };

  const handlePackagingFoldChange = (progress: number) => {
    if (packagingFoldPlaying) {
      setPackagingFoldPlaying(false);
      packagingSubjectRef.current?.setFoldPlaying(false);
    }
    setPackagingParams((cur) => ({ ...cur, foldProgress: progress }));
    packagingSubjectRef.current?.setFoldProgress(progress);
    sceneRef.current?.refreshProceduralBounds(false);
  };

  const togglePackagingFoldPlay = () => {
    const nextPlaying = !packagingFoldPlaying;
    setPackagingFoldPlaying(nextPlaying);
    const subject = packagingSubjectRef.current;
    if (subject) {
      subject.setFoldPlaying(nextPlaying, (p) => {
        setPackagingParams((cur) => ({ ...cur, foldProgress: p }));
      });
      sceneRef.current?.requestFrame();
    }
  };

  const handlePackagingHoverPart = (part: PackagingPartGroup | null) => {
    setPackagingHoverPart(part);
    packagingSubjectRef.current?.setHighlightGroup(part);
    sceneRef.current?.requestFrame();
  };

  const handlePackagingArtworkChange = (next: PackagingArtworkState) => {
    setPackagingArtwork(next);
    void packagingSubjectRef.current?.syncArtwork(next);
  };

  const handleUploadFinishMask = (file: File) => {
    const prev = packagingArtworkRef.current;
    if (prev.finishMaskUrl?.startsWith("blob:")) URL.revokeObjectURL(prev.finishMaskUrl);
    const url = URL.createObjectURL(file);
    const next: PackagingArtworkState = {
      ...prev,
      finishMaskUrl: url,
      finishMaskName: file.name,
    };
    setPackagingArtwork(next);
    void packagingSubjectRef.current?.syncArtwork(next);
    setToast(`Applied custom Spot UV / Foil mask: ${file.name}`);
  };

  const handleClearFinishMask = () => {
    const prev = packagingArtworkRef.current;
    if (!prev.finishMaskUrl) return;
    if (prev.finishMaskUrl.startsWith("blob:")) URL.revokeObjectURL(prev.finishMaskUrl);
    const next: PackagingArtworkState = {
      ...prev,
      finishMaskUrl: undefined,
      finishMaskName: undefined,
    };
    setPackagingArtwork(next);
    void packagingSubjectRef.current?.syncArtwork(next);
  };

  const clearPackagingArtwork = () => {
    void clearArtworkSelectionsByPrefix(packagingTemplateScopePrefix(packagingParams.templateId)).catch(() => {});
    revokePackagingArtworkUrls(packagingArtworkRef.current);
    const cleared: PackagingArtworkState = { mode: "panel", panelOverlays: {} };
    setPackagingArtwork(cleared);
    void packagingSubjectRef.current?.syncArtwork(cleared);
    setToast(st.toasts.clearedBoxArtworks);
  };

  const downloadPackagingDieline = async (format: "svg" | "pdf" | "dxf") => {
    if (exportBusy || dielineBusy) return;
    setDielineBusy(true);
    const solved = solvedPackaging;
    const reservationKey = `reserve_${crypto.randomUUID().replaceAll("-", "")}`;
    let reserved = false;
    let chargedAmount = sitePricing.dielineCost;
    try {
      const reserveResponse = await fetch("/api/account/coin/reserve", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "dieline",
          idempotencyKey: reservationKey,
          modelId: solved.templateId,
          format,
        }),
      });
      if (reserveResponse.status === 401 || reserveResponse.status === 403) {
        setToast(
          sitePricing.dielineCost > 0
            ? st.toasts.dielineSignInPaid(sitePricing.dielineCost)
            : st.toasts.dielineSignInFree,
          "error",
        );
        openAuth("login");
        return;
      }
      const reservePayload = await reserveResponse.json().catch(() => null) as {
        free?: boolean;
        quote?: { amount?: number };
        error?: string;
      } | null;
      if (!reserveResponse.ok) {
        setToast(
          reservePayload?.error === "INSUFFICIENT_COINS"
            ? st.toasts.dielineNeedCoins(sitePricing.dielineCost, format.toUpperCase())
            : st.toasts.dielineStartFailed,
          "error",
        );
        return;
      }
      const isFree = Boolean(reservePayload?.free);
      chargedAmount = Number(reservePayload?.quote?.amount ?? (isFree ? 0 : sitePricing.dielineCost));
      reserved = !isFree;
      recordDielineStarted();

      const baseName = `hypermockup-${solved.templateId}-${Math.round(solved.params.lengthMm)}x${Math.round(solved.params.widthMm)}x${Math.round(solved.params.heightMm)}mm`;
      let blob: Blob;
      if (format === "svg") {
        blob = new Blob([exportDielineSvg(solved, { side: packagingSurface })], { type: "image/svg+xml;charset=utf-8" });
      } else if (format === "dxf") {
        blob = new Blob([exportDielineDxf(solved, packagingSurface)], { type: "application/dxf;charset=utf-8" });
      } else {
        const bytes = exportDielinePdf(solved, packagingSurface);
        const copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes);
        blob = new Blob([copy], { type: "application/pdf" });
      }

      if (reserved) {
        const commitResponse = await fetch("/api/account/coin/commit", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idempotencyKey: reservationKey }),
        });
        if (!commitResponse.ok) throw new Error(st.toasts.dielineFailed);
        reserved = false;
        window.dispatchEvent(new Event("labellab-account-changed"));
      }
      recordDielineCompleted(isFree ? 0 : chargedAmount);

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${baseName}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setToast(
        st.toasts.dielineDownloaded(
          format.toUpperCase(),
          Math.round(solved.blankBounds.width),
          Math.round(solved.blankBounds.height),
          chargedAmount,
        ),
      );
    } catch (error) {
      if (reserved) {
        void fetch("/api/account/coin/release", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idempotencyKey: reservationKey }),
        })
          .then(() => window.dispatchEvent(new Event("labellab-account-changed")))
          .catch(() => undefined);
      }
      setToast(error instanceof Error ? error.message : st.toasts.dielineFailed, "error");
    } finally {
      setDielineBusy(false);
    }
  };

  const selectPackagingCamera = (preset: PackagingCameraViewPreset) => {
    setPackagingCameraId(preset.id);
    sceneRef.current?.cameraAngles(preset.yawDeg, preset.pitchDeg, preset.fov ?? 32, true);
  };

  const exportPreview = async () => {
    if (!ready || exportBusy) return;
    setExportBusy(true);
    setRenderProgress(0);
    const activeExportId = isPackaging ? packagingParams.templateId : model.id;
    const expectedCost = resolveRenderCoinCost(settings.resolution, sitePricing.renderCost);
    const reservationKey = `reserve_${crypto.randomUUID().replaceAll("-", "")}`;
    let reserved = false;
    try {
      const reserveResponse = await fetch("/api/account/coin/reserve", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "render",
          idempotencyKey: reservationKey,
          modelId: activeExportId,
          resolution: settings.resolution,
        }),
      });
      if (reserveResponse.status === 401 || reserveResponse.status === 403) {
        setToast(
          expectedCost > 0
            ? st.toasts.signInRender(expectedCost, settings.resolution)
            : st.toasts.signInRenderFree,
          "error",
        );
        openAuth("login");
        return;
      }
      const reservePayload = await reserveResponse.json().catch(() => null) as {
        free?: boolean;
        quote?: { amount?: number };
        error?: string;
      } | null;
      if (!reserveResponse.ok) {
        setToast(
          reservePayload?.error === "INSUFFICIENT_COINS"
            ? st.toasts.needCoinsRender(expectedCost, settings.resolution)
            : st.toasts.renderChargeFailed,
          "error",
        );
        return;
      }
      const isFree = Boolean(reservePayload?.free);
      const chargedRenderCoins = Number(reservePayload?.quote?.amount ?? (isFree ? 0 : expectedCost));
      reserved = !isFree;
      recordRenderStarted();
      const blob = await sceneRef.current!.capture(setRenderProgress);
      if (reserved) {
        const commitResponse = await fetch("/api/account/coin/commit", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: reservationKey }) });
        if (!commitResponse.ok) throw new Error(st.toasts.renderChargeFailed);
        reserved = false;
        window.dispatchEvent(new Event("labellab-account-changed"));
      }
      recordRenderCompleted(isFree ? 0 : chargedRenderCoins);
      if (resultRef.current) URL.revokeObjectURL(resultRef.current);
      const url = URL.createObjectURL(blob);
      resultRef.current = url;
      const sizeSuffix = isPackaging
        ? `-${Math.round(packagingParams.lengthMm)}x${Math.round(packagingParams.widthMm)}x${Math.round(packagingParams.heightMm)}mm`
        : "";
      setExportResult({ url, name: `hypermockup-${activeExportId}${sizeSuffix}-${settings.resolution}${settings.transparent ? "-transparent" : ""}.png` });
      setToast(st.toasts.imageReady);
    } catch (error) {
      if (reserved) {
        void fetch("/api/account/coin/release", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: reservationKey }) })
          .then(() => window.dispatchEvent(new Event("labellab-account-changed")))
          .catch(() => undefined);
      }
      setToast(error instanceof Error ? error.message : st.toasts.renderFailed, "error");
    } finally {
      setExportBusy(false);
      setRenderProgress(null);
    }
  };
  const switchMode = (mode: ScenePreferences["sceneMode"]) => {
    if (exportBusy) return;
    setActiveCamera(
      mode === "studio"
        ? "view-4"
        : settings.motion === "showcase"
          ? "animated"
          : "view-1",
    );
    setSettings((value) => ({ ...value, sceneMode: mode }));
  };
  const selectTool = (tool: EditorTool) => {
    setActiveFamilyId(null);
    setActiveTool((current) => (current === tool ? null : tool));
  };
  const reset = async () => {
    if (exportBusy) return;
    if (isPackaging) {
      setPackagingFoldPlaying(false);
      packagingSubjectRef.current?.setFoldPlaying(false);
      const defaults = createDefaultPackagingParams(packagingParams.templateId);
      setPackagingParams(defaults);
      setBottlePack(createDefaultBottlePackConfig(settings.modelId));
      clearPackagingArtwork();
      packagingSubjectRef.current?.syncParams(defaults, { interactive: false });
      sceneRef.current?.refreshProceduralBounds(true);
      sceneRef.current?.cameraAngles(34, 28, 32, true);
      setPackagingCameraId("iso");
      setToast(st.toasts.restoredTemplateDefaults(activePackagingTemplate.code));
      return;
    }
    // Keep the library while clearing the current/default model's label choice.
    await Promise.all([setArtworkSelection(model.id), setArtworkSelection(DEFAULT_PREFERENCES.modelId)]).catch(() => {});
    clearArtwork();
    setArtworkReset(value => value + 1);
    modelMaterials.current.clear();
    setSettings({ ...DEFAULT_PREFERENCES });
    setActiveFamilyId(null);
    setActiveCamera("animated");
    sceneRef.current?.reset();
    setToast(st.toasts.defaultRestored);
  };

  const hasModelLabel = Boolean(model.asset.materialSlots?.label?.length);
  const hasModelLiquid = Boolean(model.asset.materialSlots?.liquid?.length);
  const hasModelCap = Boolean(model.asset.materialSlots?.cap?.length || model.asset.materialSlots?.tab?.length);
  const hasModelBody = Boolean(model.asset.materialSlots?.body?.length);

  const beverageRailItems: ReadonlyArray<{
    id: BeverageTool;
    label: string;
    title: string;
    icon: typeof Sticker;
  }> = [
    ...(hasModelLabel ? [{ id: "label" as const, label: st.rail.label, title: st.rail.label, icon: Sticker }] : []),
    ...(hasModelLiquid ? [{ id: "liquid" as const, label: st.rail.liquid, title: st.properties.liquidAppearance, icon: Droplets }] : []),
    ...(hasModelCap ? [{ id: "cap" as const, label: model.category === "can" ? st.rail.top : st.rail.cap, title: model.category === "can" ? st.rail.headingTopTab : st.properties.capFinish, icon: Circle }] : []),
    ...(hasModelBody ? [{ id: "body" as const, label: model.category === "can" ? st.rail.body : st.rail.bottle, title: model.category === "can" ? st.rail.headingCanBody : st.properties.surfaceFinish, icon: Layers3 }] : []),
    { id: "backdrop" as const, label: st.rail.scene, title: st.scenePanel.bgAndEnv, icon: Palette },
  ];

  const packagingRailItems: ReadonlyArray<{
    id: PackagingTool;
    label: string;
    title: string;
    icon: typeof Ruler;
    activeDot?: boolean;
  }> = [
    { id: "pkg-size", label: st.rail.sizeSpec, title: st.rail.sizeSpec, icon: Ruler },
    ...(activePackagingTemplate.features.bottlePacking !== false
      ? [{ id: "pkg-pack" as const, label: st.rail.packBottles, title: st.rail.headingPackBottles, icon: Milk, activeDot: bottlePack.enabled }]
      : []),
    { id: "pkg-material", label: st.rail.material, title: st.rail.headingBoardMaterial, icon: Layers },
    { id: "pkg-structure", label: st.rail.structure, title: st.rail.headingStructure, icon: Sliders },
    { id: "pkg-procad", label: st.rail.proCad, title: st.rail.headingProCad, icon: Wrench },
    { id: "scene", label: st.rail.design, title: st.rail.headingBoxDesign, icon: Palette },
  ];

  // Resolve effective active tool if switching models/templates hides a part (e.g. liquid on aluminum cans).
  const effectiveTool: EditorTool | null = (() => {
    if (!activeTool || activeTool === "models") return activeTool;
    if (isPackaging) {
      if (packagingRailItems.some((item) => item.id === activeTool)) return activeTool;
      return "pkg-size";
    }
    if (beverageRailItems.some((item) => item.id === activeTool)) return activeTool;
    return hasModelLabel ? "label" : hasModelBody ? "body" : "backdrop";
  })();

  const isControlsOpen = effectiveTool !== null && effectiveTool !== "models";
  const controlsToolGroup: "scene" | "materials" =
    effectiveTool === "scene" || effectiveTool === "backdrop" ? "scene" : "materials";

  const activeBeveragePart: PropertiesPart =
    effectiveTool === "liquid" || effectiveTool === "cap" || effectiveTool === "body" || effectiveTool === "label"
      ? effectiveTool
      : hasModelLabel
        ? "label"
        : hasModelLiquid
          ? "liquid"
          : hasModelBody
            ? "body"
            : "cap";

  const activePackagingSection: PackagingInspectorSection =
    effectiveTool === "pkg-pack"
      ? "pack"
      : effectiveTool === "pkg-material"
        ? "material"
        : effectiveTool === "pkg-structure"
          ? "structure"
          : effectiveTool === "pkg-procad"
            ? "procad"
            : "size";

  const controlsHeading = (() => {
    if (isPackaging) {
      switch (effectiveTool) {
        case "pkg-pack":
          return { icon: Milk, title: st.rail.headingPackBottles };
        case "pkg-material":
          return { icon: Layers, title: st.rail.headingBoardMaterial };
        case "pkg-structure":
          return { icon: Sliders, title: st.rail.headingStructure };
        case "pkg-procad":
          return { icon: Wrench, title: st.rail.headingProCad };
        case "scene":
          return { icon: Palette, title: st.rail.headingBoxDesign };
        default:
          return { icon: Ruler, title: st.rail.headingSizeSpec(activePackagingTemplate.code) };
      }
    }
    switch (effectiveTool) {
      case "liquid":
        return { icon: Droplets, title: st.rail.liquid };
      case "cap":
        return { icon: Circle, title: model.category === "can" ? st.rail.headingTopTab : st.rail.cap };
      case "body":
        return { icon: Layers3, title: model.category === "can" ? st.rail.headingCanBody : st.rail.bottle };
      case "backdrop":
        return { icon: Palette, title: st.rail.scene };
      default:
        return { icon: Sticker, title: st.rail.label };
    }
  })();
  const ControlsHeadingIcon = controlsHeading.icon;

  // Position & smoothly glide the concave metaball liquid bridge linking the active left-rail button
  // directly into the left edge of the open tool panel (100% zoom-immune via offsetHeight ratio).
  useEffect(() => {
    const connectorEl = connectorRef.current;
    const layoutEl = workspaceLayoutRef.current;
    const railEl = railRef.current;
    if (!connectorEl || !layoutEl || !railEl) return;

    const syncConnector = (instant: boolean) => {
      if (!effectiveTool) {
        connectorEl.style.opacity = "0";
        hadConnectorRef.current = false;
        return;
      }
      const activeBtn = railEl.querySelector<HTMLButtonElement>("button.is-active");
      const activeCard = activeBtn?.closest<HTMLElement>(".editor-rail-card");
      if (!activeBtn || !activeCard) {
        connectorEl.style.opacity = "0";
        hadConnectorRef.current = false;
        return;
      }
      const layoutRect = layoutEl.getBoundingClientRect();
      const btnRect = activeBtn.getBoundingClientRect();
      const cardRect = activeCard.getBoundingClientRect();
      const scaleY = layoutEl.offsetHeight > 0 ? layoutRect.height / layoutEl.offsetHeight : 1;
      if (scaleY <= 0.01) return;

      const btnCenterY = (btnRect.top + btnRect.height * 0.5 - layoutRect.top) / scaleY;
      const cardTopY = (cardRect.top - layoutRect.top) / scaleY;
      const cardBottomY = (cardRect.bottom - layoutRect.top) / scaleY;
      const panelTopY = 20;
      const panelBottomY = layoutEl.offsetHeight - 20;

      // SVG bridge height = 38px (tangency points at localY = 2 and localY = 36, center at 19).
      // Keep both tangency points inside the straight vertical edge (past the 18px corner radii)
      // of BOTH the active rail card and the open tool panel so curves merge C1-continuously.
      const minY = Math.max(cardTopY, panelTopY) + 18 - 2;
      const maxY = Math.min(cardBottomY, panelBottomY) - 18 - 36;
      const rawTop = btnCenterY - 19;
      const bridgeTop = maxY >= minY ? Math.max(minY, Math.min(maxY, rawTop)) : (minY + maxY) * 0.5;

      const snap = instant || !hadConnectorRef.current;
      if (snap) {
        connectorEl.style.transition = "none";
        connectorEl.style.transform = `translate3d(0, ${bridgeTop.toFixed(2)}px, 0)`;
        void connectorEl.offsetHeight;
        connectorEl.style.transition = "";
      } else {
        connectorEl.style.transform = `translate3d(0, ${bridgeTop.toFixed(2)}px, 0)`;
      }
      connectorEl.style.opacity = "1";
      hadConnectorRef.current = true;
    };

    const rafId = window.requestAnimationFrame(() => syncConnector(false));
    const propsEl = railPropsRef.current;
    const onScroll = () => syncConnector(true);
    propsEl?.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(() => syncConnector(true));
    ro.observe(layoutEl);
    return () => {
      window.cancelAnimationFrame(rafId);
      propsEl?.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [effectiveTool, isPackaging, model.id, bottlePack.enabled]);

  return (
    <main>
      <a className="skip-link" href="#workspace">
        {st.skipToStudio}
      </a>
      <SiteHeader activePage="studio" disabled={exportBusy} onOpenProjects={() => setModal("projects")} />

      <section
        className={`creative-space ${studio ? `is-studio ${studioTheme.theme}` : ""}`}
        data-style={settings.style}
        style={{ "--scene-color": studio ? "#ffffff" : SCENE_THEME_BACKGROUNDS[settings.style] } as CSSProperties}
        id="workspace"
      >
        <MovingGrid enabled={settings.grid && !studio} style={settings.style} />
        <div className="workspace-heading">
          <div>
            <div className="eyebrow">
              <span /> {isPackaging ? st.eyebrowPackaging : st.eyebrowBeverage}
            </div>
            <h1>
              {isPackaging ? (
                <>{st.heroPackagingLead}<span>{st.heroPackagingAccent}</span></>
              ) : (
                <>{st.heroBeverageLead}<span>{st.heroBeverageAccent}</span></>
              )}
            </h1>
          </div>
          <button className="text-guide" onClick={() => setModal("guide")}>
            {st.exploreStudio} <ArrowRight size={16} />
          </button>
        </div>

        <div className="workbench">
          <div
            ref={workspaceLayoutRef}
            className={`workspace-layout ${effectiveTool ? "has-tool-panel" : "canvas-only"} has-render-panel`}
          >
            <nav ref={railRef} className="editor-rail" aria-label="Studio tools" inert={exportBusy}>
              <div className="editor-rail-card editor-rail-primary">
                <button
                  type="button"
                  className={effectiveTool === "models" ? "is-active" : ""}
                  aria-pressed={effectiveTool === "models"}
                  aria-label={isPackaging ? st.rail.templates : st.rail.models}
                  title={isPackaging ? st.library.boxTemplates : st.library.modelLibrary}
                  onClick={() => selectTool("models")}
                >
                  {isPackaging ? <Package size={18} /> : <Box size={18} />}
                  <span>{isPackaging ? st.rail.templates : st.rail.models}</span>
                </button>
              </div>
              <div
                ref={railPropsRef}
                className="editor-rail-card editor-rail-props"
                role="group"
                aria-label={isPackaging ? "Box & CAD controls" : "Product properties"}
              >
                {isPackaging
                  ? packagingRailItems.map((item) => {
                      const Icon = item.icon;
                      const active = effectiveTool === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={active ? "is-active" : ""}
                          aria-pressed={active}
                          aria-label={item.label}
                          title={item.title}
                          onClick={() => selectTool(item.id)}
                        >
                          <Icon size={17} aria-hidden="true" />
                          <span>{item.label}</span>
                          {item.activeDot && <i className="editor-rail-dot" aria-hidden="true" />}
                        </button>
                      );
                    })
                  : beverageRailItems.map((item) => {
                      const Icon = item.icon;
                      const active = effectiveTool === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={active ? "is-active" : ""}
                          aria-pressed={active}
                          aria-label={item.label}
                          title={item.title}
                          onClick={() => selectTool(item.id)}
                        >
                          <Icon size={17} aria-hidden="true" />
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
              </div>
            </nav>

            {/* Animated concave metaball liquid bridge fusing the active rail button into the open panel */}
            <div ref={connectorRef} className="rail-connector" aria-hidden="true">
              <svg viewBox="0 0 18 38" width="18" height="38" focusable="false">
                <path
                  className="rail-connector-fill"
                  d="M 0,2 L 1.5,2 A 7.5,7.5 0 0 0 16.5,2 L 18,2 L 18,36 L 16.5,36 A 7.5,7.5 0 0 0 1.5,36 L 0,36 Z"
                />
                <path
                  className="rail-connector-stroke"
                  d="M 1.5,1.5 L 1.5,2 A 7.5,7.5 0 0 0 16.5,2 L 16.5,1.5"
                />
                <path
                  className="rail-connector-stroke"
                  d="M 1.5,36.5 L 1.5,36 A 7.5,7.5 0 0 1 16.5,36 L 16.5,36.5"
                />
              </svg>
            </div>

            <aside
              ref={libraryPanelRef}
              className={`library-panel tool-panel ${modelLibrary.panel} ${effectiveTool === "models" ? "is-open" : ""}`}
              data-panel={effectiveTool}
              data-tone={studio ? "neutral" : settings.style}
              inert={exportBusy}
              aria-label={isPackaging ? "Packaging templates" : "Model library"}
              aria-hidden={effectiveTool !== "models"}
            >
              <div className="panel-title">
                <h2>{isPackaging ? st.library.boxTemplates : st.library.modelLibrary}</h2>
                {activeTool === "models" && (
                  <span className="count-badge">{isPackaging ? PACKAGING_TEMPLATES.length : LAB_MODEL_FAMILIES.length}</span>
                )}
              </div>
              {activeTool === "models" && isPackaging ? (
                <PackagingLibrary
                  activeTemplateId={packagingParams.templateId}
                  tone={studio ? "neutral" : settings.style}
                  disabled={exportBusy}
                  onSelectTemplate={selectPackagingTemplate}
                />
              ) : activeTool === "models" ? (
                <>
                  <LibrarySearchFilterBar
                    tone={studio ? "neutral" : settings.style}
                    query={query}
                    placeholder={st.library.searchPackaging}
                    category={filter}
                    allCategoryId="all"
                    categories={localizedCategories}
                    activeResultCount={modelFamilies.length}
                    filterLabel={st.library.filterModels}
                    menuAriaLabel={st.library.modelLibrary}
                    resetLabel={st.library.resetFilter}
                    clearLabel={st.library.clearFilters}
                    disabled={exportBusy}
                    onQueryChange={(nextQuery) => {
                      setQuery(nextQuery);
                      setLibraryPage(0);
                      setActiveFamilyId(null);
                    }}
                    onCategoryChange={(nextCategory) => {
                      setFilter(nextCategory);
                      setLibraryPage(0);
                      setActiveFamilyId(null);
                    }}
                  />
                  <div
                    id="model-library-grid"
                    className={`models-grid ${modelLibrary.grid}`}
                    data-tone={studio ? "neutral" : settings.style}
                  >
                    {visibleModelFamilies.map((family, index) => {
                      const selected = family.variants.some(
                        (variant) => variant.modelId === model.id,
                      );
                      return (
                      <button
                        className={`model-card ${modelLibrary.card} ${selected ? "selected" : ""}`}
                        key={family.id}
                        aria-label={`${family.name}, ${family.description}`}
                        aria-pressed={selected}
                        aria-expanded={family.variants.length > 1 ? variantsOpen && activeFamilyId === family.id : undefined}
                        aria-controls={variantsOpen && activeFamilyId === family.id ? "model-variants-panel" : undefined}
                        onClick={() => openFamily(family.id)}
                      >
                        <div
                          className={`model-image ${modelLibrary.image}`}
                        >
                          <img
                            src={family.poster}
                            alt=""
                            loading={index === 0 ? "eager" : "lazy"}
                          />
                          {selected && (
                            <span className="selected-check">
                              <Check size={12} />
                            </span>
                          )}
                        </div>
                        <strong className={modelLibrary.name}>
                          {family.name}
                        </strong>
                        <span className={modelLibrary.caption}>
                          ({family.category === "glass" ? st.library.kindGlass : family.category === "can" ? st.library.kindCan : family.category === "pp" ? st.library.kindPp : st.library.kindPet})
                        </span>
                      </button>
                      );
                    })}
                  </div>
                  {!modelFamilies.length && (
                    <div className="empty-state">
                      <Search size={24} />
                      <p>{st.library.noModels}</p>
                      <button
                        onClick={() => {
                          setQuery("");
                          setFilter("all");
                          setLibraryPage(0);
                          setActiveFamilyId(null);
                        }}
                      >
                        {st.library.clearFilters}
                      </button>
                    </div>
                  )}
                </>
              ) : null}
              {!isPackaging && activeTool === "models" && libraryPageCount > 1 && (
                <div className={`library-bottom ${modelLibrary.footer}`}>
                  <nav className={modelLibrary.pagination} aria-label="Model library pages">
                    <button type="button" aria-label="Previous model page" aria-controls="model-library-grid"
                      disabled={currentLibraryPage === 0} onClick={() => changeLibraryPage(currentLibraryPage - 1)}>
                      <ChevronLeft size={18} aria-hidden="true" />
                    </button>
                    <span role="status" aria-live="polite" aria-atomic="true">{st.library.pageOf(currentLibraryPage + 1, libraryPageCount)}</span>
                    <button type="button" aria-label="Next model page" aria-controls="model-library-grid"
                      disabled={currentLibraryPage === libraryPageCount - 1} onClick={() => changeLibraryPage(currentLibraryPage + 1)}>
                      <ChevronRight size={18} aria-hidden="true" />
                    </button>
                  </nav>
                </div>
              )}
            </aside>

            {!isPackaging && variantsOpen && activeFamily && (
                <ModelVariantsPanel
                  family={activeFamily}
                  modelId={model.id}
                  tone={studio ? "neutral" : settings.style}
                  libraryRef={libraryPanelRef}
                  layoutRef={workspaceLayoutRef}
                  busy={exportBusy}
                  onChoose={chooseModel}
                  onDismiss={() => setActiveFamilyId(null)}
                />
              )}

            <div
              className={`preview-stage ${studio ? "studio-stage" : ""}`}
              ref={stageRef}
            >
              <div className="scene-layer" aria-label="3D scene">
                {!studio && !whiteStyle && settings.highlight && (
                  <div className="product-highlight" aria-hidden="true" />
                )}
                <div className="scene-area">
                  {isPackaging ? (
                    <div
                      className={`${pkgStyles.splitContainer} ${packagingViewMode !== "3d" ? pkgStyles.splitContainerInset : ""}`}
                      style={
                        {
                          "--pkg-left-inset": effectiveTool ? "372px" : "88px",
                          "--pkg-right-inset": packagingViewMode === "2d" ? "312px" : "306px",
                        } as CSSProperties
                      }
                    >
                      {(packagingViewMode === "split" || packagingViewMode === "2d") && (
                        <PackagingDielineViewport
                          solved={solvedPackaging}
                          side={packagingSurface}
                          fullWidth={packagingViewMode === "2d"}
                          highlightPartGroup={packagingHoverPart}
                          dielineCost={sitePricing.dielineCost}
                          disabled={exportBusy || dielineBusy}
                          onChangeSide={setPackagingSurface}
                          onSelectPanel={(panelId) => {
                            openFaceArtworkEditor(panelId, packagingSurface);
                          }}
                          onDownloadDieline={(fmt) => void downloadPackagingDieline(fmt)}
                        />
                      )}
                      <div className={packagingViewMode === "2d" ? pkgStyles.splitPane3DHidden : pkgStyles.splitPane3D}>
                        <SceneCanvas
                          ref={sceneRef}
                          model={model}
                          proceduralSubject={packagingSubject}
                          subjectName={activePackagingTemplate.name}
                          qualityPreference={qualityPreference}
                          onQualityChange={setQualityReport}
                          settings={settings}
                          artwork={artwork}
                          artworkEditing={artworkEditing || Boolean(activeArtworkTarget) || saveDialogOpen}
                          deferSelection={!hydrated}
                          onStatus={(value) => setStatus(value.phase)}
                          renderCanvasRef={renderCanvasRef}
                          onHoverTarget={handleSceneHoverTarget}
                          onPickTarget={handleScenePickTarget}
                        />
                      </div>
                    </div>
                  ) : (
                    <SceneCanvas
                      ref={sceneRef}
                      model={model}
                      proceduralSubject={null}
                      subjectName={model.name}
                      qualityPreference={qualityPreference}
                      onQualityChange={setQualityReport}
                      settings={settings}
                      artwork={artwork}
                      artworkEditing={artworkEditing || saveDialogOpen}
                      deferSelection={!hydrated}
                      onStatus={(value) => setStatus(value.phase)}
                      renderCanvasRef={renderCanvasRef}
                      onHoverTarget={handleSceneHoverTarget}
                      onPickTarget={handleScenePickTarget}
                    />
                  )}
                </div>
              </div>
              {hoverTarget && !activeArtworkTarget && !saveDialogOpen && !modal && !artworkEditing && (
                <div className={pkgStyles.hoverPill} role="status" aria-live="polite">
                  <MousePointerClick size={14} aria-hidden="true" color="#60a5fa" />
                  {hoverTarget.kind === "packaging-face" ? (
                    <>
                      <span className={pkgStyles.hoverPillAccent}>
                        {hoverTarget.surface === "outside" ? st.viewport.hoverOutside : st.viewport.hoverInside}
                      </span>
                      <span>
                        {hoverTarget.label} ({hoverTarget.widthMm} × {hoverTarget.heightMm} mm)
                      </span>
                      <span className={pkgStyles.hoverPillHint}>{st.viewport.hoverClickReplace}</span>
                    </>
                  ) : (
                    <>
                      <span className={pkgStyles.hoverPillAccent}>{st.viewport.hoverLabel}</span>
                      <span>{hoverTarget.label}</span>
                      <span className={pkgStyles.hoverPillHint}>
                        {hoverTarget.packCount && hoverTarget.packCount > 1
                          ? st.viewport.hoverClickReplaceAll(hoverTarget.packCount)
                          : st.viewport.hoverClickReplace}
                      </span>
                    </>
                  )}
                </div>
              )}
              <div className="stage-ui-layer" aria-label="Scene controls" inert={exportBusy}>
                <div className="stage-top">
                  <div
                    className={pkgStyles.domainBar}
                    data-tone={studio ? "neutral" : settings.style}
                    role="group"
                    aria-label="Mockup studio category"
                  >
                    {STUDIO_DOMAINS.map((item) => {
                      const Icon = item.id === "packaging" ? Package : item.id === "apparel" ? Shirt : Milk;
                      const label =
                        item.id === "packaging"
                          ? st.domains.packaging
                          : item.id === "apparel"
                            ? st.domains.apparel
                            : st.domains.beverage;
                      const badge = item.badge === "SOON" ? st.domains.soon : item.badge;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={pkgStyles.domainBtn}
                          aria-pressed={domain === item.id}
                          disabled={exportBusy || !item.available}
                          title={label}
                          onClick={() => switchDomain(item.id)}
                        >
                          <Icon size={14} aria-hidden="true" />
                          <span>{label}</span>
                          {badge && <span className={pkgStyles.domainBadge}>{badge}</span>}
                        </button>
                      );
                    })}
                  </div>
                  <div className="studio-project-actions" role="group" aria-label="Project actions">
                    <button type="button" onClick={reset} aria-label={st.actions.restoreDefaultsTitle} title={st.actions.restoreDefaultsTitle}>
                      <RotateCcw size={16} /><span>{st.actions.restoreDefaults}</span>
                    </button>
                    <button type="button" onClick={() => void openSaveProjectDialog()} aria-label={st.actions.saveProject} title={st.actions.saveProjectTitle}>
                      <Save size={16} /><span>{st.actions.saveProject}</span>
                    </button>
                  </div>
                </div>
                <div className="vertical-tools">
                  <div className="camera-dpad" aria-label="Camera navigation">
                    <button
                      aria-label="Narrow field of view"
                      title="Narrow field of view"
                      onClick={() => sceneRef.current?.fov(-2)}
                    >
                      <ArrowUp size={17} />
                    </button>
                    <div className="camera-dpad-row">
                      <button
                        aria-label="Rotate left"
                        title="Rotate left"
                        onClick={() => sceneRef.current?.orbit(-0.3, 0)}
                      >
                        <ArrowLeft size={17} />
                      </button>
                      <span aria-hidden="true">FOV</span>
                      <button
                        aria-label="Rotate right"
                        title="Rotate right"
                        onClick={() => sceneRef.current?.orbit(0.3, 0)}
                      >
                        <ArrowRight size={17} />
                      </button>
                    </div>
                    <button
                      aria-label="Widen field of view"
                      title="Widen field of view"
                      onClick={() => sceneRef.current?.fov(2)}
                    >
                      <ArrowDown size={17} />
                    </button>
                  </div>
                  <button
                    aria-label={st.viewport.fullscreen}
                    title={st.viewport.fullscreen}
                    onClick={() => {
                      if (document.fullscreenElement)
                        void document.exitFullscreen();
                      else
                        void stageRef.current
                          ?.requestFullscreen()
                          .catch(() =>
                            setToast(st.toasts.fullscreenUnavailable, "error"),
                          );
                    }}
                  >
                    <Maximize2 size={16} />
                  </button>
                  <ViewportDisplayRail
                    sceneMode={settings.sceneMode}
                    styleTone={settings.style}
                    qualityPreference={qualityPreference}
                    qualityReport={qualityReport}
                    disabled={exportBusy}
                    onSwitchSceneMode={switchMode}
                    onToggleStyle={() => {
                      const nextStyle = whiteStyle ? "pink" : "white";
                      setSettings((cur) => ({
                        ...cur,
                        style: nextStyle,
                        background: SCENE_THEME_BACKGROUNDS[nextStyle],
                      }));
                    }}
                    onChangeQuality={setQualityPreference}
                  />
                </div>
                <div className="stage-bottom">
                  {isPackaging ? (
                    <PackagingBottomDock
                      foldProgress={packagingParams.foldProgress}
                      foldPlaying={packagingFoldPlaying}
                      viewMode={packagingViewMode}
                      showDimensions={packagingParams.showDimensions}
                      showFaceLabels={packagingParams.showFaceLabels}
                      activeCameraId={packagingCameraId}
                      disabled={exportBusy}
                      onFoldChange={handlePackagingFoldChange}
                      onToggleFoldPlay={togglePackagingFoldPlay}
                      onViewModeChange={setPackagingViewMode}
                      onToggleDimensions={() => {
                        const next = !packagingParams.showDimensions;
                        setPackagingParams((cur) => ({ ...cur, showDimensions: next }));
                        packagingSubjectRef.current?.setDimensionsVisible(next);
                        sceneRef.current?.requestFrame();
                      }}
                      onToggleFaceLabels={() => updatePackaging({ showFaceLabels: !packagingParams.showFaceLabels })}
                      onSelectCamera={selectPackagingCamera}
                      onZoom={(factor) => sceneRef.current?.zoom(factor)}
                      onResetCamera={() => {
                        setPackagingCameraId("iso");
                        sceneRef.current?.cameraAngles(34, 28, 32, true);
                      }}
                    />
                  ) : (
                    <>
                      <div className="camera-presets" aria-label="Camera views">
                        <div className="camera-mode-frame camera-mode-frame-cyan">
                        <button
                          className={`camera-preset animated-preset ${activeCamera === "animated" ? "is-active" : ""}`}
                          aria-pressed={activeCamera === "animated"}
                          disabled={studio}
                          onClick={() => {
                            setActiveCamera("animated");
                            update("motion", "showcase");
                          }}
                        >
                          <span className="camera-preset-dot" />
                          <span>{st.viewport.animated}</span>
                        </button>
                        </div>
                        <div className="camera-mode-frame camera-mode-frame-green">
                        <div className="camera-preset-list" aria-label="Idle camera angles">
                          {STUDIO_CAMERA_PRESETS.map(({ id: preset }, idx) => (
                            <button
                              key={preset}
                              className={`camera-preset ${activeCamera === preset ? "is-active" : ""}`}
                              aria-pressed={activeCamera === preset}
                              onClick={() => {
                                setActiveCamera(preset);
                                update("motion", "off");
                                sceneRef.current?.camera(preset);
                              }}
                            >
                              {st.viewport.viewLabel(idx + 1)}
                            </button>
                          ))}
                        </div>
                        </div>
                      </div>
                      <div className="zoom-tools">
                        <button
                          aria-label={st.viewport.zoomOut}
                          onClick={() => sceneRef.current?.zoom(1 / 1.15)}
                        >
                          <Minus size={16} />
                        </button>
                        <button
                          aria-label={st.viewport.zoomIn}
                          onClick={() => sceneRef.current?.zoom(1.15)}
                        >
                          <Plus size={16} />
                        </button>
                        <span />
                        <button aria-label={st.viewport.reset} onClick={() => { setActiveCamera("animated"); sceneRef.current?.reset(); }}>
                          <RotateCcw size={14} />
                          <span>{st.viewport.reset}</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            <aside
              id="material-settings-panel"
              className={`controls-panel tool-panel ${isControlsOpen ? "is-open" : ""}`}
              data-active-tool={controlsToolGroup}
              aria-label={controlsHeading.title}
              inert={exportBusy}
              aria-hidden={!isControlsOpen}
            >
              <div className="panel-title">
                <h2>
                  <ControlsHeadingIcon size={16} aria-hidden="true" /> {controlsHeading.title}
                </h2>
              </div>
              {isPackaging ? (
                <>
                  <section className="control-section" data-tool-section="scene">
                    <PackagingArtworkPanel
                      solved={solvedPackaging}
                      artwork={packagingArtwork}
                      surface={packagingSurface}
                      selectedPanelId={selectedPanelId}
                      tone={studio ? "studio" : settings.style}
                      disabled={exportBusy || dielineBusy}
                      onChangeSurface={setPackagingSurface}
                      onSelectPanel={setSelectedPanelId}
                      onOpenFaceEditor={openFaceArtworkEditor}
                      onChangeArtwork={handlePackagingArtworkChange}
                      onRemoveFaceArtwork={handleRemoveFaceArtwork}
                      onClearAll={clearPackagingArtwork}
                    />
                  </section>
                  <section className="control-section" data-tool-section="materials">
                    <PackagingInspector
                      template={activePackagingTemplate}
                      params={packagingParams}
                      solved={solvedPackaging}
                      bottlePack={bottlePack}
                      activeBeverageModelId={settings.modelId}
                      hasActiveBeverageArtwork={Boolean(artwork)}
                      savedBottleProjects={beverageProjects}
                      projectThumbnails={combinedPackThumbUrls}
                      hasPackLabelOverride={Boolean(bottlePack.packLabelArtworkId)}
                      hasCustomFinishMask={Boolean(packagingArtwork.finishMaskUrl)}
                      finishMaskName={packagingArtwork.finishMaskName}
                      measuredFootprints={measuredFootprints}
                      tone={studio ? "studio" : settings.style}
                      activeSection={activePackagingSection}
                      disabled={exportBusy || dielineBusy}
                      onChange={updatePackaging}
                      onChangeBottlePack={updateBottlePack}
                      onAutoFitBottlePack={handleAutoFitBottlePack}
                      onOpenBottleLabelEditor={openPackedBottleLabelEditor}
                      onClearPackLabelOverride={handleClearPackLabelOverride}
                      onUploadFinishMask={handleUploadFinishMask}
                      onClearFinishMask={handleClearFinishMask}
                      onGoCustomizeBottle={() => switchDomain("beverage")}
                      onReset={() => void reset()}
                      onHoverPart={handlePackagingHoverPart}
                    />
                  </section>
                </>
              ) : (
                <>
                  <section className="control-section" data-tool-section="scene">
                    <div className="control-heading">
                      <Palette size={15} />
                      <h3>{st.scenePanel.bgAndEnv}</h3>
                    </div>
                    {studio ? (
                      <div className="studio-info">
                        <Sun size={17} />
                        <span>
                          {st.scenePanel.whiteStudio}
                          <small>{st.scenePanel.whiteStudioSub}</small>
                        </span>
                      </div>
                    ) : (
                      <>
                        <div className={pkgStyles.sceneThemeGroup} data-tone={settings.style}>
                          <span className={pkgStyles.sceneThemeLabel}>{st.scenePanel.bgColor}</span>
                          <div className={pkgStyles.sceneThemeGrid} role="group" aria-label={st.scenePanel.bgColor}>
                            {SCENE_THEME_OPTIONS.map((theme) => {
                              const active = settings.style === theme.id;
                              const label = theme.id === "white" ? st.viewport.styleWhite : st.viewport.stylePink;
                              return (
                                <button
                                  key={theme.id}
                                  type="button"
                                  className={pkgStyles.sceneThemeBtn}
                                  aria-pressed={active}
                                  onClick={() =>
                                    setSettings((cur) => ({
                                      ...cur,
                                      style: theme.id,
                                      background: theme.color,
                                    }))
                                  }
                                >
                                  <span
                                    className={`${pkgStyles.sceneThemeDot} ${theme.id === "white" ? pkgStyles.sceneThemeDotWhite : ""}`}
                                    style={{ background: theme.color }}
                                    aria-hidden="true"
                                  />
                                  <span className={pkgStyles.sceneThemeName}>{label}</span>
                                  {active && <Check size={13} className={pkgStyles.sceneThemeCheck} aria-hidden="true" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <Toggle
                          label={st.scenePanel.animatedGrid}
                          checked={settings.grid}
                          onChange={() => update("grid", !settings.grid)}
                          icon={<Grid2X2 size={14} />}
                        />
                        <Toggle
                          label={st.scenePanel.productHighlight}
                          checked={settings.highlight}
                          onChange={() => update("highlight", !settings.highlight)}
                          icon={<Sun size={14} />}
                        />
                      </>
                    )}
                    <div className={pkgStyles.sceneEnvGroup} data-tone={studio ? "neutral" : settings.style}>
                      <div className={pkgStyles.sceneEnvHeader}>
                        <span className={pkgStyles.sceneEnvLabel}>
                          <Sun size={13} aria-hidden="true" />
                          {st.scenePanel.envLighting}
                        </span>
                      </div>
                      <div
                        className={pkgStyles.sceneEnvGrid}
                        role="group"
                        aria-label={st.scenePanel.envLighting}
                      >
                        {STUDIO_ENVIRONMENT_PRESETS.map((preset) => {
                          const active = settings.environment === preset.id;
                          const copy = st.scenePanel.envPresets[preset.id];
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              className={pkgStyles.sceneEnvBtn}
                              aria-pressed={active}
                              disabled={exportBusy}
                              title={copy.detail}
                              onClick={() => update("environment", preset.id)}
                            >
                              <span
                                className={pkgStyles.sceneEnvOrb}
                                style={{ background: preset.swatch }}
                                aria-hidden="true"
                              />
                              <span className={pkgStyles.sceneEnvName}>{copy.label}</span>
                            </button>
                          );
                        })}
                      </div>
                      <p className={pkgStyles.sceneEnvHint}>{st.scenePanel.envLightingHint}</p>
                    </div>
                    <div className={pkgStyles.sceneSpotGroup} data-tone={studio ? "neutral" : settings.style}>
                      <label className={pkgStyles.sceneSpotCheckRow}>
                        <span className={pkgStyles.sceneSpotCheckTitle}>
                          <Sparkles size={13} aria-hidden="true" />
                          {st.scenePanel.spotLight}
                        </span>
                        <input
                          type="checkbox"
                          className={pkgStyles.sceneSpotCheckbox}
                          checked={settings.spotLight.enabled}
                          disabled={exportBusy}
                          onChange={(event) => {
                            const checked = event.target.checked;
                            setSettings((cur) => ({
                              ...cur,
                              spotLight: { ...cur.spotLight, enabled: checked },
                            }));
                          }}
                        />
                      </label>
                      {settings.spotLight.enabled && (
                        <div className={pkgStyles.sceneSpotBody}>
                          <div
                            className={pkgStyles.sceneSpotPresets}
                            role="group"
                            aria-label={st.scenePanel.spotLight}
                          >
                            {SPOT_LIGHT_ANGLE_PRESETS.map((preset) => {
                              const isActive =
                                Math.abs(settings.spotLight.azimuthDeg - preset.azimuthDeg) <= 4 &&
                                Math.abs(settings.spotLight.elevationDeg - preset.elevationDeg) <= 4;
                              const label =
                                preset.id === "top"
                                  ? st.scenePanel.spotPresetTop
                                  : preset.id === "hero"
                                    ? st.scenePanel.spotPresetHero
                                    : st.scenePanel.spotPresetRim;
                              return (
                                <button
                                  key={preset.id}
                                  type="button"
                                  className={pkgStyles.sceneSpotPresetBtn}
                                  aria-pressed={isActive}
                                  disabled={exportBusy}
                                  onClick={() =>
                                    setSettings((cur) => ({
                                      ...cur,
                                      spotLight: {
                                        ...cur.spotLight,
                                        azimuthDeg: preset.azimuthDeg,
                                        elevationDeg: preset.elevationDeg,
                                        softness: preset.softness,
                                      },
                                    }))
                                  }
                                >
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                          {(
                            [
                              {
                                key: "intensity" as const,
                                label: st.scenePanel.spotIntensity,
                                value: settings.spotLight.intensity,
                                min: 0,
                                max: 3,
                                step: 0.05,
                                format: (v: number) => `${Math.round(v * 100)}%`,
                              },
                              {
                                key: "azimuthDeg" as const,
                                label: st.scenePanel.spotAngle,
                                value: settings.spotLight.azimuthDeg,
                                min: -180,
                                max: 180,
                                step: 1,
                                format: (v: number) => `${Math.round(v)}°`,
                              },
                              {
                                key: "elevationDeg" as const,
                                label: st.scenePanel.spotHeight,
                                value: settings.spotLight.elevationDeg,
                                min: 10,
                                max: 85,
                                step: 1,
                                format: (v: number) => `${Math.round(v)}°`,
                              },
                            ] as const
                          ).map((ctrl) => (
                            <div key={ctrl.key} className={pkgStyles.sceneSpotSliderBlock}>
                              <div className={pkgStyles.sceneSpotSliderHead}>
                                <span>{ctrl.label}</span>
                                <span className={pkgStyles.sceneSpotSliderVal}>{ctrl.format(ctrl.value)}</span>
                              </div>
                              <input
                                type="range"
                                className={pkgStyles.sceneSpotRange}
                                aria-label={ctrl.label}
                                min={ctrl.min}
                                max={ctrl.max}
                                step={ctrl.step}
                                value={ctrl.value}
                                disabled={exportBusy}
                                onChange={(event) => {
                                  const nextVal = Number(event.target.value);
                                  setSettings((cur) => ({
                                    ...cur,
                                    spotLight: {
                                      ...cur.spotLight,
                                      [ctrl.key]: nextVal,
                                    } as StudioSpotLightConfig,
                                  }));
                                }}
                              />
                            </div>
                          ))}
                          <div className={pkgStyles.sceneSpotColorRow}>
                            <span className={pkgStyles.sceneSpotSliderHead}>{st.scenePanel.spotColor}</span>
                            <div className={pkgStyles.sceneSpotSwatches} role="group" aria-label={st.scenePanel.spotColor}>
                              {SPOT_LIGHT_COLOR_SWATCHES.map((sw) => {
                                const activeColor =
                                  settings.spotLight.color.toLowerCase() === sw.hex.toLowerCase();
                                const title = st.scenePanel.spotColors[sw.id];
                                return (
                                  <button
                                    key={sw.id}
                                    type="button"
                                    className={pkgStyles.sceneSpotSwatchBtn}
                                    aria-pressed={activeColor}
                                    aria-label={title}
                                    title={title}
                                    disabled={exportBusy}
                                    style={{ background: sw.hex }}
                                    onClick={() =>
                                      setSettings((cur) => ({
                                        ...cur,
                                        spotLight: { ...cur.spotLight, color: sw.hex },
                                      }))
                                    }
                                  />
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </section>
                  <section className="control-section" data-tool-section="scene">
                    <div className="control-heading">
                      <RotateCw size={15} />
                      <h3>{st.scenePanel.motion}</h3>
                    </div>
                    <div className="motion-options">
                      <button
                        disabled={studio}
                        aria-pressed={!studio && settings.motion === "showcase"}
                        onClick={() => {
                          update("motion", "showcase");
                          if (!studio) setActiveCamera("animated");
                        }}
                      >
                        <Sparkles size={16} />
                        <strong>{st.scenePanel.motionWebsite}</strong>
                        <small>{st.scenePanel.motionWebsiteSub}</small>
                      </button>
                      <button
                        aria-pressed={studio || settings.motion === "off"}
                        onClick={() => {
                          update("motion", "off");
                          if (activeCamera === "animated") {
                            setActiveCamera("view-1");
                            sceneRef.current?.camera("view-1");
                          }
                        }}
                      >
                        <Circle size={15} />
                        <strong>{st.scenePanel.motionIdle}</strong>
                        <small>{st.scenePanel.motionIdleSub}</small>
                      </button>
                    </div>
                  </section>
                  <PropertiesPanel key={model.id} model={model} settings={settings} activePart={activeBeveragePart}
                    artwork={<ArtworkLibrary key={`${model.id}:${artworkReset}`} modelId={model.id} modelName={model.name} disabled={exportBusy}
                      resetSignal={artworkReset} openSignal={beverageArtworkOpenSignal} onApply={applyArtwork} onClear={clearArtwork} onEditorStateChange={setArtworkEditing} />}
                    onChange={(patch) => { if (!exportBusy) setSettings((current) => ({ ...current, ...patch })); }} />
                </>
              )}

            </aside>
            <RenderPanel
              settings={settings}
              onChange={update}
              canvasRef={renderCanvasRef}
              ready={ready || exportBusy}
              busy={exportBusy}
              progress={renderProgress}
              onRender={() => void exportPreview()}
              result={exportResult}
              baseRenderCost={sitePricing.renderCost}
              dielineExport={
                isPackaging
                  ? {
                      cost: sitePricing.dielineCost,
                      busy: dielineBusy,
                      templateCode: activePackagingTemplate.code,
                      onDownload: (fmt) => void downloadPackagingDieline(fmt),
                    }
                  : undefined
              }
            />
          </div>
        </div>
      </section>

      <ProjectsModal
        open={modal === "projects"}
        collections={studioCollections}
        cloudProjects={cloudProjects}
        cloudAuthenticated={cloudAuthenticated}
        projectThumbUrls={projectThumbUrls}
        shareByGroupId={shareByGroupId}
        extendCost={sitePricing.projectExtendCost}
        busy={exportBusy}
        onOpenLocalItem={handleOpenSavedProject}
        onOpenCloudItem={handleOpenCloudProjectItem}
        onDeleteLocalItem={(item) => void handleDeleteSavedProject(item)}
        onDeleteLocalGroup={(gid, gname) => void handleDeleteProjectGroup(gid, gname)}
        onDeleteCloudItem={handleDeleteCloudItem}
        onDeleteCloudProject={handleDeleteCloudProject}
        onToggleAutoRenew={handleToggleCloudAutoRenew}
        onExtendCloudProject={handleExtendCloudProject}
        onMigrateLocalToCloud={handleMigrateLocalGroupToCloud}
        onOpenShare={(cid) => {
          if (!cloudAuthenticated) {
            setModal(null);
            setToast(
              sitePricing.shareCost > 0
                ? st.toasts.signInSharePaid(sitePricing.shareCost)
                : st.toasts.signInShareFree,
              "error",
            );
            openAuth("login");
            return;
          }
          setShareDialogGroupId(cid);
        }}
        onRequireLogin={() => {
          setModal(null);
          openAuth("login");
        }}
        onClose={() => setModal(null)}
      />

      <dialog
        ref={dialogRef}
        className="app-dialog"
        aria-labelledby="dialog-title"
        onCancel={(event) => {
          if (exportBusy) event.preventDefault();
          else setModal(null);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget && !exportBusy)
            setModal(null);
        }}
      >
        <div className="dialog-header">
          <div>
            <span className="eyebrow dark">{st.projectsModal.eyebrow}</span>
            <h2 id="dialog-title">{st.guide.title}</h2>
          </div>
          <button
            className="close-dialog"
            aria-label={st.projectsModal.closeAria}
            disabled={exportBusy}
            onClick={() => setModal(null)}
          >
            <X size={21} />
          </button>
        </div>
        {modal === "guide" && (
          <div className="guide-steps">
            {st.guide.steps.map((step, i) => {
              const icons = [<Box key="box" />, <Upload key="up" />, <Globe2 key="g" />, <FileImage key="f" />];
              return (
                <div className="guide-step" key={step.title}>
                  <span>{icons[i] ?? <Box />}</span>
                  <div>
                    <small>0{i + 1}</small>
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </dialog>
      {activeArtworkTarget && isPackaging && (
        <PackagingFaceArtworkModal
          key={
            activeArtworkTarget.kind === "packaging-face"
              ? `${activeArtworkTarget.templateId}:${activeArtworkTarget.surface}:${activeArtworkTarget.panelId}`
              : `bottle:${activeArtworkTarget.modelId}`
          }
          target={activeArtworkTarget}
          activeArtworkId={
            activeArtworkTarget.kind === "packaging-face"
              ? packagingArtwork.panelOverlays[
                  `${activeArtworkTarget.surface}:${activeArtworkTarget.panelId}`
                ]?.artworkId
              : bottlePack.packLabelArtworkId ?? activeCustomPackProject?.artworkId
          }
          hasCurrentArtwork={
            activeArtworkTarget.kind === "packaging-face"
              ? Boolean(
                  packagingArtwork.panelOverlays[
                    `${activeArtworkTarget.surface}:${activeArtworkTarget.panelId}`
                  ]?.imageUrl,
                )
              : Boolean(bottlePack.packLabelArtworkId)
          }
          faceTint={
            activeArtworkTarget.kind === "packaging-face"
              ? packagingArtwork.panelOverlays[
                  `${activeArtworkTarget.surface}:${activeArtworkTarget.panelId}`
                ]?.fillColor
              : undefined
          }
          boardSurfaceColor={
            activeArtworkTarget.kind === "packaging-face"
              ? activeArtworkTarget.surface === "outside"
                ? packagingParams.outsideColor
                : packagingParams.insideColor
              : undefined
          }
          onFaceTintChange={
            activeArtworkTarget.kind === "packaging-face"
              ? (fillColor) => {
                  const key = `${activeArtworkTarget.surface}:${activeArtworkTarget.panelId}`;
                  const current = packagingArtworkRef.current;
                  const prev = current.panelOverlays[key] ?? {
                    panelId: activeArtworkTarget.panelId,
                    surface: activeArtworkTarget.surface,
                    imageScale: 1,
                    imageOffsetX: 0,
                    imageOffsetY: 0,
                    imageRotationDeg: 0,
                  };
                  const next: PackagingArtworkState = {
                    ...current,
                    mode: "panel",
                    panelOverlays: {
                      ...current.panelOverlays,
                      [key]: { ...prev, fillColor },
                    },
                  };
                  handlePackagingArtworkChange(next);
                }
              : undefined
          }
          onApplyFaceArtwork={handleApplyFaceArtwork}
          onRemoveFaceArtwork={handleRemoveFaceArtwork}
          onApplyPackedBottleLabel={handleApplyPackedBottleLabel}
          onRemovePackedBottleLabel={handleClearPackLabelOverride}
          onClose={() => setActiveArtworkTarget(null)}
        />
      )}
      {saveDialogOpen && (
        <SaveProjectDialog
          open={saveDialogOpen}
          kind={isPackaging ? "packaging" : "beverage"}
          model={model}
          packagingTemplate={activePackagingTemplate}
          settings={settings}
          hasCustomLabel={Boolean(artwork)}
          customLabelUrl={artwork}
          previewUrl={effectiveSavePreviewUrl}
          initialName={projectName}
          existingProjectName={
            loadedCloudProjectId && loadedCloudItemId
              ? cloudProjects
                  .find((p) => p.id === loadedCloudProjectId)
                  ?.items.find((i) => i.id === loadedCloudItemId && i.kind === (isPackaging ? "packaging" : "beverage"))
                  ?.name
              : loadedProjectId
                ? projects.find(
                    (p) => p.id === loadedProjectId && p.kind === (isPackaging ? "packaging" : "beverage"),
                  )?.name
                : undefined
          }
          existingGroupId={
            loadedCloudProjectId
              ? loadedCloudProjectId
              : loadedProjectId
                ? (() => {
                    const found = projects.find((p) => p.id === loadedProjectId);
                    return found ? resolveItemGroupId(found) : undefined;
                  })()
                : undefined
          }
          availableGroups={studioCollections.map((col) => ({
            id: col.id,
            name: col.name,
            itemCount: col.source === "cloud" ? (col.cloudItems?.length ?? 0) : (col.localGroup?.items.length ?? 0),
            source: col.source,
          }))}
          isCloudAuthenticated={cloudAuthenticated}
          extendCost={sitePricing.projectExtendCost}
          busy={exportBusy}
          onSave={handleConfirmSaveProject}
          onClose={() => setSaveDialogOpen(false)}
        />
      )}
      {activeShareCollection && (
        <ShareProjectDialog
          open={Boolean(activeShareCollection)}
          collection={activeShareCollection}
          thumbUrls={projectThumbUrls}
          existingShare={shareByGroupId.get(activeShareCollection.id) ?? null}
          shareCost={sitePricing.shareCost}
          onShareCreatedOrUpdated={(share, chargedCoins) => {
            setSharedProjects((prev) => [share, ...prev.filter((s) => s.id !== share.id)]);
            if (activeShareCollection.source === "local" && activeShareCollection.localGroup) {
              const updatedGroup: ProjectGroup = {
                ...activeShareCollection.localGroup.group,
                shareId: share.id,
                shareToken: share.token,
                shareStatus: share.status,
                lastSharedAt: Date.now(),
              };
              void saveProjectGroup(updatedGroup)
                .then((saved) => setProjectGroups((prev) => [saved, ...prev.filter((g) => g.id !== saved.id)]))
                .catch(() => {});
            }
            setToast(
              chargedCoins > 0
                ? st.toasts.shareLivePaid(chargedCoins)
                : st.toasts.shareUpdated,
            );
          }}
          onShareDeleted={(shareId, groupId) => {
            setSharedProjects((prev) => prev.filter((s) => s.id !== shareId));
            const existingGroup = projectGroups.find((g) => g.id === groupId);
            if (existingGroup) {
              const cleaned: ProjectGroup = {
                ...existingGroup,
                shareId: undefined,
                shareToken: undefined,
                shareStatus: undefined,
              };
              void saveProjectGroup(cleaned)
                .then((saved) => setProjectGroups((prev) => [saved, ...prev.filter((g) => g.id !== saved.id)]))
                .catch(() => {});
            }
            setToast(st.toasts.shareRevoked);
          }}
          onRequireLogin={(msg) => {
            setToast(msg, "error");
            openAuth("login");
          }}
          onClose={() => setShareDialogGroupId(null)}
        />
      )}
      {toastState && (
        <div
          className={`toast ${toastState.tone === "error" ? "toast-error" : ""} ${isPackaging ? pkgStyles.toastTop : ""}`}
          role={toastState.tone === "error" ? "alert" : "status"}
        >
          {toastState.tone === "error" ? <AlertCircle size={17} /> : <Check size={17} />}
          <span>{toastState.message}</span>
          <button aria-label="Dismiss notification" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
    </main>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  icon,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      className="toggle-row"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
    >
      <span>
        {icon}
        {label}
      </span>
      <span className={`toggle-track ${checked ? "on" : ""}`}>
        <span />
      </span>
    </button>
  );
}
