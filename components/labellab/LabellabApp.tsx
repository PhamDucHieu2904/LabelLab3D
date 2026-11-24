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
  Gauge,
  Globe2,
  Grid2X2,
  Maximize2,
  Minus,
  Move3D,
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
import { loadPackagingParams, savePackagingParams } from "@/lib/packaging-cad/preferences";
import { createPackagingSubject, type PackagingSubjectController } from "@/lib/packaging-cad/adapter";
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
  parsePreferences,
  pickMaterialPreferences,
  savePreferences,
  type ScenePreferences,
} from "@/lib/labellab/preferences";
import {
  createLocalArtwork,
  releaseLocalArtwork,
} from "@/lib/labellab/local-artwork";
import type { MockupStatus, MockupCameraPreset } from "@/lib/mockup/contracts";
import {
  loadQualityPreference,
  QUALITY_PREFERENCE_OPTIONS,
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
import { setArtworkSelection } from "@/lib/labellab/artwork-store";
import SiteHeader from "./SiteHeader";
import ModelVariantsPanel from "./ModelVariantsPanel";
import PropertiesPanel from "./PropertiesPanel";

type Modal = "projects" | "guide" | null;
type EditorTool = "models" | "scene" | "materials";
type SavedProject = {
  id: string;
  name: string;
  date: string;
  settings: ScenePreferences;
};
const swatches = [
  "#d53660",
  "#7f9a7a",
  "#98bdcb",
  "#d8ad72",
  "#ac97be",
  "#253d36",
];
const projectKey = "labellab.projects.v1";
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

function readProjects(): SavedProject[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(projectKey) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (item) =>
          item &&
          typeof item.id === "string" &&
          typeof item.name === "string" &&
          typeof item.date === "string" &&
          Number.isFinite(Date.parse(item.date)),
      )
      .slice(0, 20)
      .map((item) => ({
        id: item.id,
        name: item.name.slice(0, 80),
        date: item.date,
        settings: parsePreferences(item.settings),
      }));
  } catch {
    return [];
  }
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
  const [packagingSubject, setPackagingSubject] = useState<PackagingSubjectController | null>(null);
  const packagingSubjectRef = useRef<PackagingSubjectController | null>(null);
  const packagingArtworkRef = useRef<PackagingArtworkState>(packagingArtwork);
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
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [artwork, setArtwork] = useState<string>();
  const [artworkEditing, setArtworkEditing] = useState(false);
  const [artworkReset, setArtworkReset] = useState(0);
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
    packagingArtworkRef.current = packagingArtwork;
  }, [packagingArtwork]);

  useEffect(() => {
    const initial = loadPreferences();
    const initialPackaging = loadPackagingParams();
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
    setProjects(readProjects());
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
      });
      packagingSubjectRef.current = subject;
      setPackagingSubject(subject);
    }
    // Only recreate when domain toggles; live parameter updates mutate `subject` in place!
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, isPackaging]);

  const revokePackagingArtworkUrls = useCallback((state: PackagingArtworkState) => {
    if (state.outsideDielineUrl?.startsWith("blob:")) URL.revokeObjectURL(state.outsideDielineUrl);
    if (state.insideDielineUrl?.startsWith("blob:")) URL.revokeObjectURL(state.insideDielineUrl);
    for (const ov of Object.values(state.panelOverlays)) {
      if (ov.imageUrl?.startsWith("blob:")) URL.revokeObjectURL(ov.imageUrl);
    }
  }, []);

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
    setArtwork(undefined);
  };
  const applyArtwork = (blob: Blob) => {
    const url = createLocalArtwork(blob);
    const previous = artworkRef.current;
    artworkRef.current = url;
    setArtwork(url);
    if (previous) releaseLocalArtwork(previous);
  };
  const saveProject = () => {
    const project: SavedProject = {
      id: crypto.randomUUID(),
      name: projectName.trim() || model.name,
      date: new Date().toISOString(),
      settings: { ...settings },
    };
    const next = [project, ...projects].slice(0, 20);
    try {
      localStorage.setItem(projectKey, JSON.stringify(next));
      setProjects(next);
      setToast(
        artwork
          ? "Settings and your artwork library are saved in this browser."
          : "Project saved in this browser.",
      );
    } catch {
      setToast("Browser storage is unavailable. You can keep editing.");
    }
  };
  const switchDomain = (next: StudioDomainId) => {
    if (exportBusy || next === domain) return;
    const meta = getStudioDomain(next);
    if (meta.id !== next) {
      setToast("Fashion & Apparel Studio is on our roadmap — coming soon!");
      return;
    }
    setActiveFamilyId(null);
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
    const next = createDefaultPackagingParams(tpl.id);
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

  const clearPackagingArtwork = () => {
    revokePackagingArtworkUrls(packagingArtworkRef.current);
    const cleared: PackagingArtworkState = { mode: packagingArtwork.mode, panelOverlays: {} };
    setPackagingArtwork(cleared);
    void packagingSubjectRef.current?.syncArtwork(cleared);
    setToast("Cleared packaging artwork.");
  };

  const downloadPackagingDieline = (format: "svg" | "pdf" | "dxf") => {
    const solved = solvedPackaging;
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
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${baseName}.${format}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast(`Downloaded 1:1 mm ${format.toUpperCase()} dieline (${Math.round(solved.blankBounds.width)}×${Math.round(solved.blankBounds.height)} mm).`);
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
    const reservationKey = `reserve_${crypto.randomUUID().replaceAll("-", "")}`;
    let reserved = false;
    try {
      const reserveResponse = await fetch("/api/account/coin/reserve", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey: reservationKey, modelId: activeExportId, resolution: settings.resolution }),
      });
      if (reserveResponse.status === 401 || reserveResponse.status === 403) {
        setToast("Please sign in before spending coins on a render.");
        return;
      }
      if (!reserveResponse.ok) {
        const payload = await reserveResponse.json().catch(() => null) as { error?: string } | null;
        setToast(payload?.error === "INSUFFICIENT_COINS" ? "You do not have enough coins for this render." : "Could not charge the render. Please try again.");
        return;
      }
      reserved = true;
      const blob = await sceneRef.current!.capture(setRenderProgress);
      const commitResponse = await fetch("/api/account/coin/commit", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: reservationKey }) });
      if (!commitResponse.ok) throw new Error("Render payment could not be committed. Please try again.");
      if (resultRef.current) URL.revokeObjectURL(resultRef.current);
      const url = URL.createObjectURL(blob);
      resultRef.current = url;
      const sizeSuffix = isPackaging
        ? `-${Math.round(packagingParams.lengthMm)}x${Math.round(packagingParams.widthMm)}x${Math.round(packagingParams.heightMm)}mm`
        : "";
      setExportResult({ url, name: `labellab-${activeExportId}${sizeSuffix}-${settings.resolution}${settings.transparent ? "-transparent" : ""}.png` });
      setToast("Your image is ready. Select Download image to save the PNG.");
    } catch (error) {
      if (reserved) void fetch("/api/account/coin/release", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: reservationKey }) }).catch(() => undefined);
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
                          onChangeSide={setPackagingSurface}
                          onSelectPanel={(panelId) => {
                            setSelectedPanelId(panelId);
                            setPackagingArtwork((cur) => ({ ...cur, mode: "panel" }));
                            setActiveTool("scene");
                          }}
                          onDownloadDieline={downloadPackagingDieline}
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
                          artworkEditing={artworkEditing}
                          deferSelection={!hydrated}
                          onStatus={(value) => setStatus(value.phase)}
                          renderCanvasRef={renderCanvasRef}
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
                      artworkEditing={artworkEditing}
                      deferSelection={!hydrated}
                      onStatus={(value) => setStatus(value.phase)}
                      renderCanvasRef={renderCanvasRef}
                    />
                  )}
                </div>
              </div>
              <div className="stage-ui-layer" aria-label="Scene controls" inert={exportBusy}>
                <div className="stage-top">
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", pointerEvents: "auto" }}>
                    <div className="mode-switch" aria-label="Choose scene">
                      <button
                        aria-pressed={!studio}
                        onClick={() => switchMode("website")}
                      >
                        <Globe2 size={15} /> Scene 1
                      </button>
                      <button
                        aria-pressed={studio}
                        onClick={() => switchMode("studio")}
                      >
                        <Box size={15} /> Scene 2
                      </button>
                    </div>
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
                  </div>
                  <div className="studio-project-actions" role="group" aria-label="Project actions">
                    {!studio && <div className="studio-style-switch" role="group" aria-label="Preview style">
                      <span>Style</span>
                      <button
                        type="button"
                        className="studio-style-toggle"
                        role="switch"
                        aria-checked={whiteStyle}
                        aria-label="White preview style"
                        onClick={() => update("style", whiteStyle ? "pink" : "white")}
                      >
                        <span className="studio-style-label studio-style-label-pink">Pink</span>
                        <span className="studio-style-label studio-style-label-white">White</span>
                        <span className="studio-style-thumb" aria-hidden="true" />
                      </button>
                    </div>}
                    <label
                      className={pkgStyles.qualitySelectWrap}
                      data-tone={studio ? "neutral" : settings.style}
                      title={
                        qualityReport
                          ? `Graphics quality · Active: ${qualityReport.effectiveTier.toUpperCase()} (${qualityReport.sceneWeight} scene · ${qualityReport.idleMsaa}x MSAA)`
                          : "Choose 3D preview graphics quality"
                      }
                    >
                      <Gauge size={14} aria-hidden="true" />
                      <select
                        aria-label="3D preview graphics quality"
                        value={qualityPreference}
                        disabled={exportBusy}
                        onChange={(e) => {
                          const next = e.target.value as QualityPreference;
                          setQualityPreference(next);
                        }}
                      >
                        {QUALITY_PREFERENCE_OPTIONS.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.id === "auto" && qualityReport
                              ? `Auto (${qualityReport.effectiveTier[0].toUpperCase()}${qualityReport.effectiveTier.slice(1)})`
                              : opt.shortLabel}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="button" onClick={reset} aria-label="Restore default scene" title="Restore default scene">
                      <RotateCcw size={16} /><span>Restore defaults</span>
                    </button>
                    <button type="button" onClick={saveProject} aria-label="Save project" title="Save project">
                      <Save size={16} /><span>Save project</span>
                    </button>
                  </div>
                </div>
                <div className="vertical-tools">
                  <button
                    aria-label="View 1"
                    title="View 1"
                    onClick={() => {
                      setActiveCamera("view-1");
                      update("motion", "off");
                      sceneRef.current?.camera("view-1");
                    }}
                  >
                    <Box size={17} />
                  </button>
                  <button
                    aria-label="View 4"
                    title="View 4"
                    onClick={() => {
                      setActiveCamera("view-4");
                      update("motion", "off");
                      sceneRef.current?.camera("view-4");
                    }}
                  >
                    <Move3D size={17} />
                  </button>
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
                      disabled={exportBusy}
                      onChangeSurface={setPackagingSurface}
                      onSelectPanel={setSelectedPanelId}
                      onChangeArtwork={handlePackagingArtworkChange}
                      onDownloadDieline={downloadPackagingDieline}
                      onClearAll={clearPackagingArtwork}
                    />
                  </section>
                  <section className="control-section" data-tool-section="materials">
                    <PackagingInspector
                      template={activePackagingTemplate}
                      params={packagingParams}
                      solved={solvedPackaging}
                      tone={studio ? "studio" : settings.style}
                      disabled={exportBusy}
                      onChange={updatePackaging}
                      onReset={() => void reset()}
                      onHoverPart={handlePackagingHoverPart}
                      onDownloadDieline={downloadPackagingDieline}
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
                    artwork={<ArtworkLibrary key={`${model.id}:${artworkReset}`} modelId={model.id} disabled={exportBusy}
                      resetSignal={artworkReset} onApply={applyArtwork} onClear={clearArtwork} onEditorStateChange={setArtworkEditing} />}
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
              Projects are saved in this browser. Select a project to continue
              editing.
            </p>
            {projects.length ? (
              projects.map((project) => (
                <div className="saved-project" key={project.id}>
                  <div
                    className="saved-project-color"
                    style={{ background: project.settings.background }}
                  >
                    <Box size={21} />
                  </div>
                  <div>
                    <strong>{project.name}</strong>
                    <small>
                      {getLabModel(project.settings.modelId).name} ·{" "}
                      {formatDate(project.date)}
                    </small>
                  </div>
                  <button
                    aria-label={`Open ${project.name}`}
                    onClick={() => {
                      clearArtwork();
                      setActiveFamilyId(null);
                      modelMaterials.current.clear();
                      setSettings(project.settings);
                      setActiveCamera(
                        project.settings.sceneMode === "studio"
                          ? "view-4"
                          : project.settings.motion === "showcase"
                            ? "animated"
                            : "view-1",
                      );
                      setProjectName(project.name);
                      setModal(null);
                      setToast("Project settings loaded.");
                    }}
                  >
                    <ArrowRight size={19} />
                  </button>
                </div>
              ))
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
