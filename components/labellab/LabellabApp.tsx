"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
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
  FolderOpen,
  Globe2,
  Grid2X2,
  Maximize2,
  Minus,
  MousePointerClick,
  Package,
  Palette,
  Plus,
  RotateCcw,
  RotateCw,
  Save,
  Search,
  Shirt,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  Upload,
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
import pkgStyles from "./packaging/PackagingStudio.module.css";
import PackagingLibrary from "./packaging/PackagingLibrary";
import PackagingInspector from "./packaging/PackagingInspector";
import PackagingBottomDock, {
  type PackagingCameraViewPreset,
  type PackagingViewMode,
} from "./packaging/PackagingBottomDock";
import PackagingDielineViewport from "./packaging/PackagingDielineViewport";
import PackagingArtworkPanel from "./packaging/PackagingArtworkPanel";
import PackagingFaceArtworkModal from "./packaging/PackagingFaceArtworkModal";
import SaveProjectDialog from "./SaveProjectDialog";
import ViewportDisplayRail from "./ViewportDisplayRail";
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
import { UNITY_CAMERA_PRESETS } from "@/lib/mockup/unity-camera-presets";
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
  deleteCustomProject,
  listCustomProjects,
  sanitizeProjectName,
  saveCustomProject,
  type CustomProjectRecord,
} from "@/lib/labellab/project-store";
import SiteHeader from "./SiteHeader";
import ModelVariantsPanel from "./ModelVariantsPanel";
import PropertiesPanel from "./PropertiesPanel";
import { useAuthDialog } from "./AuthDialog";
import {
  DEFAULT_DIELINE_COIN_COST,
  DEFAULT_RENDER_COIN_COST,
  resolveRenderCoinCost,
} from "@/lib/payments/packages";

type Modal = "projects" | "guide" | null;
type EditorTool = "models" | "scene" | "materials";
const swatches = [
  "#d53660",
  "#7f9a7a",
  "#98bdcb",
  "#d8ad72",
  "#ac97be",
  "#253d36",
];
const VALID_BEVERAGE_MODEL_IDS = new Set(LAB_MODELS.map((m) => m.id));
const libraryPageSize = 8; // Two columns, four rows.
const categories = [
  { id: "all", label: "All" },
  { id: "glass", label: "Glass" },
  { id: "can", label: "Cans" },
  { id: "pet", label: "PET" },
  { id: "pp", label: "PP" },
];
const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

function captureCanvasThumbnailBlob(canvas: HTMLCanvasElement | null): Promise<Blob | undefined> {
  if (!canvas || canvas.width < 2 || canvas.height < 2) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    try {
      const size = 256;
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
  const [toast, setToast] = useState("");
  const [projectName, setProjectName] = useState("Basil study 01");
  const [projects, setProjects] = useState<CustomProjectRecord[]>([]);
  const [projectThumbUrls, setProjectThumbUrls] = useState<Record<string, string>>({});
  const [loadedProjectId, setLoadedProjectId] = useState<string | undefined>(undefined);
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
  const artworkRef = useRef<string | undefined>(undefined);
  const artworkBlobRef = useRef<Blob | undefined>(undefined);
  const artworkIdRef = useRef<string | undefined>(undefined);
  const suppressLibraryAutoApplyRef = useRef(false);
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
    void fetch("/api/site/config", { cache: "no-store" })
      .then(async (res) => (res.ok ? (await res.json() as { settings?: { renderCost?: number; dielineCost?: number } }) : null))
      .then((payload) => {
        if (!active || !payload?.settings) return;
        const renderCost = Number(payload.settings.renderCost);
        const dielineCost = Number(payload.settings.dielineCost);
        setSitePricing({
          renderCost: Number.isSafeInteger(renderCost) && renderCost >= 0 ? renderCost : DEFAULT_RENDER_COIN_COST,
          dielineCost: Number.isSafeInteger(dielineCost) && dielineCost >= 0 ? dielineCost : DEFAULT_DIELINE_COIN_COST,
        });
      })
      .catch(() => undefined);
    return () => { active = false; };
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

  const beverageProjects = useMemo(
    () => projects.filter((p) => p.kind === "beverage"),
    [projects],
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
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const frame = requestAnimationFrame(() => setCustomProjectLabelUrl(url));
    return () => {
      cancelAnimationFrame(frame);
      URL.revokeObjectURL(url);
    };
  }, [activeCustomPackProject]);
  const effectiveCustomProjectLabelUrl = activeCustomPackProject?.artworkBlob
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
    const initialPackaging = loadPackagingParams();
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
    if (nextDomain === "packaging") setActiveTool("materials");
    setActiveCamera(
      initial.sceneMode === "studio"
        ? "view-4"
        : initial.motion === "showcase"
          ? "animated"
          : "view-1",
    );
    void listCustomProjects()
      .then((loaded) => setProjects(loaded))
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
                ...(fit.carrierPack ? { carrierPack: fit.carrierPack } : {}),
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

  // Hydrate saved independent per-face artworks for the active packaging template from IndexedDB.
  useEffect(() => {
    if (!hydrated || !isPackaging) return;
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
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (modal && dialog && !dialog.open) dialog.showModal();
    if (!modal && dialog?.open) dialog.close();
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
    const existingLoaded = loadedProjectId
      ? projects.find((p) => p.id === loadedProjectId && p.kind === (isPackaging ? "packaging" : "beverage"))
      : undefined;
    if (existingLoaded) {
      setProjectName(existingLoaded.name);
    } else {
      setProjectName(isPackaging ? `${activePackagingTemplate.shortName} Custom` : `${model.name} Custom`);
    }
    setSaveDialogOpen(true);
  };
  const handleConfirmSaveProject = async (rawName: string, mode: "new" | "update") => {
    const kind = isPackaging ? "packaging" : "beverage";
    const isoNow = new Date().toISOString();
    const now = Date.parse(isoNow);
    const existing =
      mode === "update" && loadedProjectId
        ? projects.find((p) => p.id === loadedProjectId && p.kind === kind)
        : undefined;
    const record: CustomProjectRecord = {
      id: existing ? existing.id : crypto.randomUUID(),
      name: sanitizeProjectName(rawName, isPackaging ? activePackagingTemplate.name : model.name),
      kind,
      date: isoNow,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
      settings: { ...settings },
      ...(!isPackaging && artworkIdRef.current ? { artworkId: artworkIdRef.current } : {}),
      ...(!isPackaging && artworkBlobRef.current ? { artworkBlob: artworkBlobRef.current } : {}),
      ...(savePreviewBlob ? { thumbnailBlob: savePreviewBlob } : {}),
      ...(isPackaging ? { packagingParams: { ...packagingParams }, bottlePack: { ...bottlePack } } : {}),
    };
    const saved = await saveCustomProject(record);
    setProjects((prev) => [saved, ...prev.filter((item) => item.id !== saved.id)].slice(0, 60));
    setLoadedProjectId(saved.id);
    setProjectName(saved.name);
    setSaveDialogOpen(false);
    setToast(
      kind === "beverage"
        ? `Saved "${saved.name}" — now ready to select in Boxes & Trays → Pack Your Bottles!`
        : `Saved "${saved.name}" to Your projects.`,
    );
  };
  const handleDeleteSavedProject = async (project: CustomProjectRecord) => {
    await deleteCustomProject(project.id);
    setProjects((prev) => prev.filter((item) => item.id !== project.id));
    if (loadedProjectId === project.id) setLoadedProjectId(undefined);
    if (bottlePack.customProjectId === project.id) {
      setBottlePack((cur) => ({ ...cur, customProjectId: undefined }));
    }
    setToast(`Deleted "${project.name}".`);
  };
  const handleOpenSavedProject = (project: CustomProjectRecord) => {
    setHoverTarget(null);
    setActiveArtworkTarget(null);
    setLoadedProjectId(project.id);
    setProjectName(project.name);
    if (project.kind === "packaging" && project.packagingParams) {
      setDomain("packaging");
      setPackagingParams(project.packagingParams);
      if (project.bottlePack) setBottlePack(project.bottlePack);
      setSettings((cur) => ({ ...cur, sceneMode: "studio", motion: "off" }));
      setActiveTool("materials");
      setPackagingViewMode("3d");
      packagingSubjectRef.current?.syncParams(project.packagingParams, { interactive: false });
      sceneRef.current?.refreshProceduralBounds(true);
      setModal(null);
      setToast(`Loaded "${project.name}".`);
      return;
    }
    if (domain !== "beverage") {
      setPackagingFoldPlaying(false);
      setDomain("beverage");
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
    setToast(`Loaded custom bottle "${project.name}".`);
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
      setToast("Fashion & Apparel Studio is on our roadmap — coming soon!");
      return;
    }
    setActiveFamilyId(null);
    setHoverTarget(null);
    setActiveArtworkTarget(null);
    if (domain === "beverage") beverageSceneModeRef.current = settings.sceneMode;
    setDomain(next);
    if (next === "packaging") {
      setSettings((cur) => ({ ...cur, sceneMode: "studio", motion: "off" }));
      setActiveTool("materials");
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
        ...(fit.carrierPack ? { carrierPack: fit.carrierPack } : {}),
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
    const isCarrier = packagingParams.templateId === "beverage-carrier";
    const carrierCols =
      packagingParams.carrierPack === "4-pack"
        ? 2
        : packagingParams.carrierPack === "8-pack"
          ? 4
          : 3;

    const nextPack: BottlePackConfig = {
      ...bottlePack,
      // When first turning Pack Your Bottles ON, default to user's active Beverage Studio model
      // and smartly match carrier/tray layout!
      ...(enablingNow
        ? {
            modelId: settings.modelId,
            ...(isCarrier ? { cols: carrierCols, rows: 2 } : {}),
          }
        : {}),
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
      patch.wallPaddingMm !== undefined;

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
    // If user switches carrier layout (4/6/8-pack) while bottles are packed inside, sync bottle grid columns!
    if (
      patch.carrierPack &&
      packagingParams.templateId === "beverage-carrier" &&
      bottlePack.enabled
    ) {
      const cols = patch.carrierPack === "4-pack" ? 2 : patch.carrierPack === "8-pack" ? 4 : 3;
      setBottlePack((cur) => ({ ...cur, cols, rows: 2 }));
    }
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
      const adjustedPack: BottlePackConfig =
        tpl.id === "beverage-carrier"
          ? { ...bottlePack, cols: Math.max(2, Math.min(4, bottlePack.cols)), rows: 2 }
          : bottlePack;
      if (adjustedPack !== bottlePack) setBottlePack(adjustedPack);
      const targetModel = getLabModel(adjustedPack.modelId);
      const fp =
        measuredFootprints[targetModel.id] ??
        getBeverageFootprintMm(targetModel.id, targetModel.asset.volumeMl);
      const fit = computeAutoFitBoxDimensions({
        templateId: tpl.id,
        itemMm: fp,
        config: adjustedPack,
        thicknessMm: next.thicknessMm,
        dividerGrid: next.dividerGrid,
      });
      next = {
        ...next,
        dimensionMode: "inner",
        lengthMm: fit.lengthMm,
        widthMm: fit.widthMm,
        heightMm: fit.heightMm,
        ...(fit.carrierPack ? { carrierPack: fit.carrierPack } : {}),
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
    setToast(`Loaded ${tpl.code} — ${tpl.name} (${next.lengthMm}×${next.widthMm}×${next.heightMm} mm).`);
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
    setToast("Cleared all box face artworks.");
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
            ? `Please sign in to export 1:1 mm dieline files (${sitePricing.dielineCost} coins).`
            : "Please sign in to export 1:1 mm dieline files.",
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
            ? `You need ${sitePricing.dielineCost} coins to export a 1:1 mm ${format.toUpperCase()} dieline.`
            : "Could not start dieline export. Please try again.",
        );
        return;
      }
      const isFree = Boolean(reservePayload?.free);
      chargedAmount = Number(reservePayload?.quote?.amount ?? (isFree ? 0 : sitePricing.dielineCost));
      reserved = !isFree;

      const baseName = `labellab-${solved.templateId}-${Math.round(solved.params.lengthMm)}x${Math.round(solved.params.widthMm)}x${Math.round(solved.params.heightMm)}mm`;
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
        if (!commitResponse.ok) throw new Error("Dieline export payment could not be committed. Please try again.");
        reserved = false;
        window.dispatchEvent(new Event("labellab-account-changed"));
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${baseName}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setToast(
        `Downloaded 1:1 mm ${format.toUpperCase()} dieline (${Math.round(solved.blankBounds.width)}×${Math.round(solved.blankBounds.height)} mm)${chargedAmount > 0 ? ` · −${chargedAmount} coins` : ""}.`,
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
      setToast(error instanceof Error ? error.message : "Dieline export failed. Please try again.");
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
            ? `Please sign in to render (${expectedCost} coins at ${settings.resolution} px).`
            : "Please sign in before rendering.",
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
            ? `You need ${expectedCost} coins to render at ${settings.resolution} px.`
            : "Could not charge the render. Please try again.",
        );
        return;
      }
      const isFree = Boolean(reservePayload?.free);
      reserved = !isFree;
      const blob = await sceneRef.current!.capture(setRenderProgress);
      if (reserved) {
        const commitResponse = await fetch("/api/account/coin/commit", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: reservationKey }) });
        if (!commitResponse.ok) throw new Error("Render payment could not be committed. Please try again.");
        reserved = false;
        window.dispatchEvent(new Event("labellab-account-changed"));
      }
      if (resultRef.current) URL.revokeObjectURL(resultRef.current);
      const url = URL.createObjectURL(blob);
      resultRef.current = url;
      const sizeSuffix = isPackaging
        ? `-${Math.round(packagingParams.lengthMm)}x${Math.round(packagingParams.widthMm)}x${Math.round(packagingParams.heightMm)}mm`
        : "";
      setExportResult({ url, name: `labellab-${activeExportId}${sizeSuffix}-${settings.resolution}${settings.transparent ? "-transparent" : ""}.png` });
      setToast("Your image is ready. Select Download image to save the PNG.");
    } catch (error) {
      if (reserved) {
        void fetch("/api/account/coin/release", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: reservationKey }) })
          .then(() => window.dispatchEvent(new Event("labellab-account-changed")))
          .catch(() => undefined);
      }
      setToast(error instanceof Error ? error.message : "Rendering failed. Please try again.");
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
      setToast(`Restored ${activePackagingTemplate.code} defaults.`);
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
    setToast("Default Basil Strawberry scene restored.");
  };

  return (
    <main>
      <a className="skip-link" href="#workspace">
        Skip to studio
      </a>
      <SiteHeader activePage="studio" disabled={exportBusy} onOpenProjects={() => setModal("projects")} />

      <section
        className={`creative-space ${studio ? `is-studio ${studioTheme.theme}` : ""}`}
        data-style={settings.style}
        style={{ "--scene-color": studio || whiteStyle ? "#ffffff" : settings.background } as CSSProperties}
        id="workspace"
      >
        <MovingGrid enabled={settings.grid && !studio} style={settings.style} />
        <div className="workspace-heading">
          <div>
            <div className="eyebrow">
              <span /> {isPackaging ? "PARAMETRIC MILLIMETRE PACKAGING CAD" : "A LITTLE LABEL. A WHOLE NEW WORLD."}
            </div>
            <h1>
              {isPackaging ? (
                <>Custom boxes.<span> Folded real.</span></>
              ) : (
                <>Your design.<span> Made real.</span></>
              )}
            </h1>
          </div>
          <button className="text-guide" onClick={() => setModal("guide")}>
            Explore the studio <ArrowRight size={16} />
          </button>
        </div>

        <div className="workbench">
          <div
            ref={workspaceLayoutRef}
            className={`workspace-layout ${activeTool ? "has-tool-panel" : "canvas-only"} has-render-panel`}
          >
            <nav className="editor-rail" aria-label="Studio tools" inert={exportBusy}>
              <button
                className={activeTool === "models" ? "is-active" : ""}
                aria-pressed={activeTool === "models"}
                aria-label={isPackaging ? "Templates" : "Models"}
                title={isPackaging ? "Box & tray templates" : "Models"}
                onClick={() => selectTool("models")}
              >
                {isPackaging ? <Package size={18} /> : <Box size={18} />}
                <span>{isPackaging ? "Templates" : "Models"}</span>
              </button>
              <button
                className={activeTool === "materials" ? "is-active" : ""}
                aria-pressed={activeTool === "materials"}
                aria-label={isPackaging ? "Size & CAD" : "Properties"}
                title={isPackaging ? "Dimensions, material & Pro CAD" : "Properties"}
                onClick={() => selectTool("materials")}
              >
                {isPackaging ? <SlidersHorizontal size={18} /> : <Droplets size={18} />}
                <span>{isPackaging ? "Size & CAD" : "Properties"}</span>
              </button>
              {isPackaging && (
                <button
                  className={activeTool === "scene" ? "is-active" : ""}
                  aria-pressed={activeTool === "scene"}
                  aria-label="Design"
                  title="Panel artwork & 1:1 dieline print"
                  onClick={() => selectTool("scene")}
                >
                  <Palette size={18} />
                  <span>Design</span>
                </button>
              )}
            </nav>

            <aside
              ref={libraryPanelRef}
              className={`library-panel tool-panel ${modelLibrary.panel} ${activeTool === "models" ? "is-open" : ""}`}
              data-panel={activeTool}
              data-tone={studio ? "neutral" : settings.style}
              inert={exportBusy}
              aria-label={isPackaging ? "Packaging templates" : "Model library"}
              aria-hidden={activeTool !== "models"}
            >
              <div className="panel-title">
                <h2>{isPackaging ? "Box templates" : "Model library"}</h2>
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
                  <label className="search-box">
                    <Search size={16} />
                    <input
                      placeholder="Search packaging..."
                      aria-label="Search packaging"
                      value={query}
                      onChange={(e) => { setQuery(e.target.value); setLibraryPage(0); setActiveFamilyId(null); }}
                    />
                  </label>
                  <div className="category-filters" aria-label="Filter packaging">
                    {categories.map((category) => (
                      <button
                        key={category.id}
                        aria-pressed={filter === category.id}
                        onClick={() => { setFilter(category.id); setLibraryPage(0); setActiveFamilyId(null); }}
                      >
                        {category.label}
                      </button>
                    ))}
                  </div>
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
                          ({family.category === "glass" ? "Glass bottle" : family.category === "can" ? "Alu can" : family.category === "pp" ? "PP bottle" : "PET bottle"})
                        </span>
                      </button>
                      );
                    })}
                  </div>
                  {!modelFamilies.length && (
                    <div className="empty-state">
                      <Search size={24} />
                      <p>No matching models found.</p>
                      <button
                        onClick={() => {
                          setQuery("");
                          setFilter("all");
                          setLibraryPage(0);
                          setActiveFamilyId(null);
                        }}
                      >
                        Clear filters
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
                    <span role="status" aria-live="polite" aria-atomic="true">Page {currentLibraryPage + 1} / {libraryPageCount}</span>
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
                          "--pkg-left-inset": activeTool ? "372px" : "88px",
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
                        {hoverTarget.surface === "outside" ? "Outside" : "Inside"}
                      </span>
                      <span>
                        {hoverTarget.label} ({hoverTarget.widthMm} × {hoverTarget.heightMm} mm)
                      </span>
                      <span className={pkgStyles.hoverPillHint}>· Click to replace artwork</span>
                    </>
                  ) : (
                    <>
                      <span className={pkgStyles.hoverPillAccent}>Label</span>
                      <span>{hoverTarget.label}</span>
                      <span className={pkgStyles.hoverPillHint}>
                        {hoverTarget.packCount && hoverTarget.packCount > 1
                          ? `· Click to replace all ${hoverTarget.packCount} bottles`
                          : "· Click to replace artwork"}
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
                      const Icon = item.id === "packaging" ? Package : item.id === "apparel" ? Shirt : Droplets;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={pkgStyles.domainBtn}
                          aria-pressed={domain === item.id}
                          disabled={exportBusy || !item.available}
                          title={item.description}
                          onClick={() => switchDomain(item.id)}
                        >
                          <Icon size={14} aria-hidden="true" />
                          <span>{item.shortLabel}</span>
                          {item.badge && <span className={pkgStyles.domainBadge}>{item.badge}</span>}
                        </button>
                      );
                    })}
                  </div>
                  <div className="studio-project-actions" role="group" aria-label="Project actions">
                    <button type="button" onClick={reset} aria-label="Restore default scene" title="Restore default scene">
                      <RotateCcw size={16} /><span>Restore defaults</span>
                    </button>
                    <button type="button" onClick={() => void openSaveProjectDialog()} aria-label="Save project" title="Save custom project with a name">
                      <Save size={16} /><span>Save project</span>
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
                    aria-label="Fullscreen scene"
                    title="Fullscreen"
                    onClick={() => {
                      if (document.fullscreenElement)
                        void document.exitFullscreen();
                      else
                        void stageRef.current
                          ?.requestFullscreen()
                          .catch(() =>
                            setToast("Fullscreen is unavailable in this browser."),
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
                    onToggleStyle={() => update("style", whiteStyle ? "pink" : "white")}
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
                          <span>Animated</span>
                        </button>
                        </div>
                        <div className="camera-mode-frame camera-mode-frame-green">
                        <div className="camera-preset-list" aria-label="Idle camera angles">
                          {UNITY_CAMERA_PRESETS.map(({ id: preset, label }) => (
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
                              {label}
                            </button>
                          ))}
                        </div>
                        </div>
                      </div>
                      <div className="zoom-tools">
                        <button
                          aria-label="Zoom out"
                          onClick={() => sceneRef.current?.zoom(1 / 1.15)}
                        >
                          <Minus size={16} />
                        </button>
                        <button
                          aria-label="Zoom in"
                          onClick={() => sceneRef.current?.zoom(1.15)}
                        >
                          <Plus size={16} />
                        </button>
                        <span />
                        <button aria-label="Reset" onClick={() => { setActiveCamera("animated"); sceneRef.current?.reset(); }}>
                          <RotateCcw size={14} />
                          <span>Reset</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            <aside
              id="material-settings-panel"
              className={`controls-panel tool-panel ${activeTool === "scene" || activeTool === "materials" ? "is-open" : ""}`}
              data-active-tool={activeTool ?? ""}
              aria-label={isPackaging ? (activeTool === "scene" ? "Box design & artwork" : "Size & CAD") : "Properties"}
              inert={exportBusy}
              aria-hidden={activeTool !== "scene" && activeTool !== "materials"}
            >
              <div className="panel-title">
                <h2>
                  {isPackaging ? (
                    activeTool === "scene" ? (
                      <><Palette size={16} aria-hidden="true" /> Box design</>
                    ) : (
                      <><SlidersHorizontal size={16} aria-hidden="true" /> {activePackagingTemplate.code}</>
                    )
                  ) : (
                    <><SlidersHorizontal size={16} aria-hidden="true" /> Properties</>
                  )}
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
                      dielineCost={sitePricing.dielineCost}
                      disabled={exportBusy || dielineBusy}
                      onChangeSurface={setPackagingSurface}
                      onSelectPanel={setSelectedPanelId}
                      onOpenFaceEditor={openFaceArtworkEditor}
                      onChangeArtwork={handlePackagingArtworkChange}
                      onRemoveFaceArtwork={handleRemoveFaceArtwork}
                      onDownloadDieline={(fmt) => void downloadPackagingDieline(fmt)}
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
                      projectThumbnails={projectThumbUrls}
                      hasPackLabelOverride={Boolean(bottlePack.packLabelArtworkId)}
                      hasCustomFinishMask={Boolean(packagingArtwork.finishMaskUrl)}
                      finishMaskName={packagingArtwork.finishMaskName}
                      measuredFootprints={measuredFootprints}
                      tone={studio ? "studio" : settings.style}
                      dielineCost={sitePricing.dielineCost}
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
                      onDownloadDieline={(fmt) => void downloadPackagingDieline(fmt)}
                    />
                  </section>
                </>
              ) : (
                <>
                  <section className="control-section" data-tool-section="scene">
                    <div className="control-heading">
                      <Palette size={15} />
                      <h3>Background & environment</h3>
                    </div>
                    {studio ? (
                      <div className="studio-info">
                        <Sun size={17} />
                        <span>
                          White Studio
                          <small>White floor · Perspective grid · 20 m fade</small>
                        </span>
                      </div>
                    ) : (
                      <>
                        <div className="color-field">
                          <label htmlFor="background-color">Background color</label>
                          <div className="color-value">
                            <span>{settings.background.toUpperCase()}</span>
                            <input
                              id="background-color"
                              type="color"
                              aria-label="Choose background color"
                              value={settings.background}
                              onInput={(e) =>
                                update("background", e.currentTarget.value)
                              }
                              onChange={(e) => update("background", e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="swatches">
                          {swatches.map((color) => (
                            <button
                              key={color}
                              style={{ background: color }}
                              aria-label={`Background ${color}`}
                              aria-pressed={
                                settings.background.toLowerCase() === color
                              }
                              onClick={() => update("background", color)}
                            >
                              {settings.background.toLowerCase() === color && (
                                <Check size={13} />
                              )}
                            </button>
                          ))}
                        </div>
                        <Toggle
                          label="Animated grid"
                          checked={settings.grid}
                          onChange={() => update("grid", !settings.grid)}
                          icon={<Grid2X2 size={14} />}
                        />
                        <Toggle
                          label="Product highlight"
                          checked={settings.highlight}
                          onChange={() => update("highlight", !settings.highlight)}
                          icon={<Sun size={14} />}
                        />
                      </>
                    )}
                  </section>
                  <section className="control-section" data-tool-section="scene">
                    <div className="control-heading">
                      <RotateCw size={15} />
                      <h3>Motion</h3>
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
                        <strong>Website</strong>
                        <small>Tilt & rotate</small>
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
                        <strong>Idle</strong>
                        <small>Still</small>
                      </button>
                    </div>
                  </section>
                  <PropertiesPanel key={model.id} model={model} settings={settings}
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
              onOpenMaterials={() => setActiveTool("materials")}
              materialsOpen={activeTool === "materials"}
              baseRenderCost={sitePricing.renderCost}
            />
          </div>
        </div>
      </section>

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
            <span className="eyebrow dark">LABELLAB STUDIO</span>
            <h2 id="dialog-title">
              {modal === "projects"
                  ? "Your projects."
                  : "Meet Labellab."}
            </h2>
          </div>
          <button
            className="close-dialog"
            aria-label="Close dialog"
            disabled={exportBusy}
            onClick={() => setModal(null)}
          >
            <X size={21} />
          </button>
        </div>
        {modal === "projects" && (
          <div className="projects-dialog">
            <p className="dialog-muted">
              Custom bottle/can projects are saved in this browser and can also be packed directly
              inside Boxes &amp; Trays → Pack Your Bottles.
            </p>
            {projects.length ? (
              projects.map((project) => {
                const baseModel = getLabModel(project.settings.modelId);
                const thumbUrl = projectThumbUrls[project.id] || (project.kind === "beverage" ? baseModel.poster : undefined);
                const subLabel =
                  project.kind === "packaging" && project.packagingParams
                    ? `${getPackagingTemplate(project.packagingParams.templateId).code} · ${formatDate(project.date)}`
                    : `${baseModel.name} (${baseModel.volume})${project.artworkBlob ? " · Custom label" : ""} · ${formatDate(project.date)}`;
                return (
                  <div className="saved-project" key={project.id}>
                    <div
                      className="saved-project-color"
                      style={{
                        background: thumbUrl ? "#ffffff" : project.settings.background,
                        overflow: "hidden",
                        border: "1px solid #e5dce0",
                      }}
                    >
                      {thumbUrl ? (
                        <img src={thumbUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : project.kind === "packaging" ? (
                        <Package size={20} />
                      ) : (
                        <Box size={21} />
                      )}
                    </div>
                    <div>
                      <strong>{project.name}</strong>
                      <small>{subLabel}</small>
                    </div>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <button
                        type="button"
                        aria-label={`Delete ${project.name}`}
                        title="Delete project"
                        onClick={() => void handleDeleteSavedProject(project)}
                      >
                        <Trash2 size={16} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Open ${project.name}`}
                        title="Open project"
                        onClick={() => handleOpenSavedProject(project)}
                      >
                        <ArrowRight size={19} />
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="projects-empty">
                <FolderOpen size={36} strokeWidth={1} />
                <h3>Room for your first idea.</h3>
                <p>
                  Create a scene and select Save project.
                  <br />
                  Pick up where you left off next time.
                </p>
                <button className="dark-cta" onClick={() => setModal(null)}>
                  Back to studio <ArrowRight size={16} />
                </button>
              </div>
            )}
          </div>
        )}
        {modal === "guide" && (
          <div className="guide-steps">
            {[
              {
                title: "Choose a shape",
                text: "Start with a Basil bottle, aluminum can or PET bottle from the library.",
                icon: <Box />,
              },
              {
                title: "Add your design",
                text: "Upload your label artwork, then adjust its position and surface finish.",
                icon: <Upload />,
              },
              {
                title: "Set the scene",
                text: "Scene 1 has a colored background and motion. Scene 2 has a white floor and perspective grid.",
                icon: <Globe2 />,
              },
              {
                title: "Capture the moment",
                text: "Choose an aspect ratio and resolution, then render a PNG. Use the left/right arrows to rotate, up/down to change field of view, WASD to pan, and +/− to zoom.",
                icon: <FileImage />,
              },
            ].map((step, i) => (
              <div className="guide-step" key={step.title}>
                <span>{step.icon}</span>
                <div>
                  <small>0{i + 1}</small>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </div>
              </div>
            ))}
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
            loadedProjectId
              ? projects.find(
                  (p) => p.id === loadedProjectId && p.kind === (isPackaging ? "packaging" : "beverage"),
                )?.name
              : undefined
          }
          busy={exportBusy}
          onSave={handleConfirmSaveProject}
          onClose={() => setSaveDialogOpen(false)}
        />
      )}
      {toast && (
        <div className={`toast ${isPackaging ? pkgStyles.toastTop : ""}`} role="status">
          <Check size={17} />
          <span>{toast}</span>
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
