"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Info,
  Layers,
  ListFilter,
  Lock,
  Maximize2,
  Milk,
  Minus,
  Package,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Plus,
  RotateCcw,
  RotateCw,
  Ruler,
  Search,
  ShieldAlert,
  Sparkles,
  Sun,
  X,
} from "lucide-react";
import SceneCanvas, { type SceneCanvasHandle } from "@/components/labellab/SceneCanvas";
import MovingGrid from "@/components/labellab/MovingGrid";
import { getLabModel } from "@/lib/labellab/catalog";
import { createLocalArtwork, releaseLocalArtwork } from "@/lib/labellab/local-artwork";
import { DEFAULT_PREFERENCES, type ScenePreferences } from "@/lib/labellab/preferences";
import type { MockupCameraPreset, MockupStatus } from "@/lib/mockup/contracts";
import { QUALITY_PREFERENCE_OPTIONS, type QualityPreference } from "@/lib/mockup/quality-tier";
import { createPackagingSubject, type PackagingSubjectController } from "@/lib/packaging-cad/adapter";
import type { BottlePackVisualSource } from "@/lib/packaging-cad/bottle-packer";
import type { PackagingArtworkState, PanelDesignOverlay } from "@/lib/packaging-cad/types";
import {
  collectPayloadAssetHashes,
  type PublicSharedProjectResponse,
  type SharedProjectItemPublic,
} from "@/lib/share/contracts";
import styles from "./SharedProjectViewer.module.css";

interface Props {
  token: string;
  initialData: PublicSharedProjectResponse;
}

type BackdropChoice = "studio" | "pink" | "dark";
type FilterTab = "all" | "beverage" | "packaging";

const PACKAGING_CAMERAS = [
  { id: "iso", label: "3/4 Iso", yaw: 34, pitch: 28, fov: 32 },
  { id: "front", label: "Front", yaw: 0, pitch: 8, fov: 32 },
  { id: "top", label: "Top", yaw: 0, pitch: 76, fov: 32 },
  { id: "back", label: "Back", yaw: 180, pitch: 14, fov: 32 },
] as const;

const BEVERAGE_CAMERAS: ReadonlyArray<{ id: MockupCameraPreset; label: string }> = [
  { id: "view-1", label: "Front" },
  { id: "view-4", label: "3/4" },
  { id: "view-2", label: "Side" },
  { id: "view-3", label: "Top" },
];

export default function SharedProjectViewer({ token, initialData }: Props) {
  const [data, setData] = useState<PublicSharedProjectResponse>(initialData);
  const [passcode, setPasscode] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState("");

  const readyShare = data.state === "ready" ? data.share : null;
  const items = useMemo(() => (data.state === "ready" ? data.items : []), [data]);

  const initialSelectedId = useMemo(() => {
    if (!readyShare || !items.length) return "";
    if (readyShare.options.defaultItemId && items.some((i) => i.id === readyShare.options.defaultItemId)) {
      return readyShare.options.defaultItemId;
    }
    return items[0].id;
  }, [readyShare, items]);

  const [selectedItemId, setSelectedItemId] = useState<string>(initialSelectedId);
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);

  const initialItem = items.find((i) => i.id === initialSelectedId) ?? items[0] ?? null;
  const [backdropChoice, setBackdropChoice] = useState<BackdropChoice>(() => {
    if (!initialItem || initialItem.payload.kind === "packaging") return "studio";
    if (initialItem.payload.settings.sceneMode === "studio" || initialItem.payload.settings.style === "white") return "studio";
    if (initialItem.payload.settings.style === "dark") return "dark";
    return "pink";
  });
  const [quality, setQuality] = useState<QualityPreference>("auto");
  const [autoSpin, setAutoSpin] = useState<boolean>(() =>
    Boolean(initialItem && initialItem.payload.kind === "beverage" && initialItem.payload.settings.motion !== "off"),
  );
  const [showInfo, setShowInfo] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [foldProgress, setFoldProgress] = useState<number>(() =>
    initialItem?.payload.kind === "packaging" ? initialItem.payload.packagingParams.foldProgress : 1,
  );
  const [showDimensions, setShowDimensions] = useState<boolean>(() =>
    Boolean(initialItem?.payload.kind === "packaging" && initialItem.payload.packagingParams.showDimensions),
  );
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [loadedHashesKey, setLoadedHashesKey] = useState<string>("");
  const [sceneStatus, setSceneStatus] = useState<MockupStatus["phase"]>("loading-model");

  const sceneRef = useRef<SceneCanvasHandle>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const activeItemBtnRef = useRef<HTMLButtonElement | null>(null);
  const filterWrapRef = useRef<HTMLDivElement | null>(null);
  const packagingSubjectRef = useRef<PackagingSubjectController | null>(null);
  const [packagingEntry, setPackagingEntry] = useState<{
    itemId: string;
    controller: PackagingSubjectController;
  } | null>(null);

  const hashes = useMemo(
    () => (data.state === "ready" ? collectPayloadAssetHashes(data.items) : []),
    [data],
  );
  const hashesKey = useMemo(() => hashes.join(","), [hashes]);
  const assetsReady = data.state === "ready" && (hashes.length === 0 || loadedHashesKey === hashesKey);

  // Fetch all referenced artwork & thumbnail images with same-origin credentials (so HttpOnly
  // unlock cookies work seamlessly with Three.js TextureLoader & canvas composers).
  useEffect(() => {
    if (data.state !== "ready" || !hashes.length) return;
    let cancelled = false;
    const created: string[] = [];
    void Promise.all(
      hashes.map(async (hash) => {
        try {
          const res = await fetch(`/api/share/public/${encodeURIComponent(token)}/assets/${hash}`, {
            credentials: "same-origin",
          });
          if (!res.ok) return [hash, ""] as const;
          const blob = await res.blob();
          // Register via createLocalArtwork so viewer-config's isLocalArtwork() gate accepts the label texture URL.
          const url = createLocalArtwork(blob);
          created.push(url);
          return [hash, url] as const;
        } catch {
          return [hash, ""] as const;
        }
      }),
    ).then((pairs) => {
      if (cancelled) {
        created.forEach((u) => releaseLocalArtwork(u));
        return;
      }
      const next: Record<string, string> = {};
      for (const [hash, url] of pairs) {
        if (url) next[hash] = url;
      }
      setAssetUrls(next);
      setLoadedHashesKey(hashesKey);
    });

    return () => {
      cancelled = true;
      created.forEach((u) => releaseLocalArtwork(u));
    };
  }, [data.state, hashes, hashesKey, token]);

  const activeItem: SharedProjectItemPublic | null = useMemo(
    () =>
      items.find((item) => item.id === selectedItemId) ??
      items.find((item) => item.id === initialSelectedId) ??
      items[0] ??
      null,
    [items, selectedItemId, initialSelectedId],
  );

  const applyItemSelection = useCallback((item: SharedProjectItemPublic) => {
    setSelectedItemId(item.id);
    if (item.payload.kind === "packaging") {
      setFoldProgress(item.payload.packagingParams.foldProgress);
      setShowDimensions(Boolean(item.payload.packagingParams.showDimensions));
      setAutoSpin(false);
    } else {
      const savedMode = item.payload.settings.sceneMode;
      const savedStyle = item.payload.settings.style;
      setBackdropChoice(
        savedMode === "studio" || savedStyle === "white"
          ? "studio"
          : savedStyle === "dark"
            ? "dark"
            : "pink",
      );
      setAutoSpin(item.payload.settings.motion !== "off");
    }
  }, []);

  const beverageCount = useMemo(() => items.filter((i) => i.kind === "beverage").length, [items]);
  const packagingCount = useMemo(() => items.filter((i) => i.kind === "packaging").length, [items]);
  const hasMultipleKinds = beverageCount > 0 && packagingCount > 0;

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (filterTab !== "all" && item.kind !== filterTab) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q) ||
        (item.kind === "packaging" ? "box tray hộp khay cad" : "bottle can chai lon").includes(q)
      );
    });
  }, [items, filterTab, searchQuery]);

  const activeFilteredIndex = useMemo(() => {
    if (!activeItem) return -1;
    return filteredItems.findIndex((i) => i.id === activeItem.id);
  }, [filteredItems, activeItem]);

  useEffect(() => {
    if (!filterMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (filterWrapRef.current && !filterWrapRef.current.contains(event.target as Node)) {
        setFilterMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFilterMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [filterMenuOpen]);

  useEffect(() => {
    activeItemBtnRef.current?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [activeItem?.id, filterTab]);

  useEffect(() => {
    const id = requestAnimationFrame(() => sceneRef.current?.requestFrame());
    return () => cancelAnimationFrame(id);
  }, [panelCollapsed]);

  // Build and dispose PackagingSubjectController cleanly whenever viewing a packaging item
  useEffect(() => {
    if (!activeItem || activeItem.payload.kind !== "packaging" || !assetsReady) {
      if (packagingSubjectRef.current) {
        packagingSubjectRef.current.setFoldPlaying(false);
        packagingSubjectRef.current = null;
      }
      return;
    }

    const payload = activeItem.payload;
    const panelOverlays: Record<string, PanelDesignOverlay> = {};
    if (payload.packagingArtwork?.panelOverlays) {
      for (const [key, ov] of Object.entries(payload.packagingArtwork.panelOverlays)) {
        const imageUrl = ov.imageHash ? assetUrls[ov.imageHash] : undefined;
        panelOverlays[key] = {
          panelId: ov.panelId,
          surface: ov.surface,
          ...(ov.fillColor ? { fillColor: ov.fillColor } : {}),
          ...(imageUrl ? { imageUrl } : {}),
          ...(ov.artworkName ? { artworkName: ov.artworkName } : {}),
          ...(ov.fitMode ? { fitMode: ov.fitMode } : {}),
          imageScale: ov.imageScale,
          imageOffsetX: ov.imageOffsetX,
          imageOffsetY: ov.imageOffsetY,
          imageRotationDeg: ov.imageRotationDeg,
          ...(ov.text ? { text: ov.text } : {}),
          ...(ov.textColor ? { textColor: ov.textColor } : {}),
          ...(ov.textSizePct !== undefined ? { textSizePct: ov.textSizePct } : {}),
        };
      }
    }

    const hydratedArtwork: PackagingArtworkState = {
      mode: payload.packagingArtwork?.mode ?? "panel",
      ...(payload.packagingArtwork?.outsideDielineHash && assetUrls[payload.packagingArtwork.outsideDielineHash]
        ? { outsideDielineUrl: assetUrls[payload.packagingArtwork.outsideDielineHash] }
        : {}),
      ...(payload.packagingArtwork?.insideDielineHash && assetUrls[payload.packagingArtwork.insideDielineHash]
        ? { insideDielineUrl: assetUrls[payload.packagingArtwork.insideDielineHash] }
        : {}),
      ...(payload.packagingArtwork?.finishMaskHash && assetUrls[payload.packagingArtwork.finishMaskHash]
        ? { finishMaskUrl: assetUrls[payload.packagingArtwork.finishMaskHash] }
        : {}),
      ...(payload.packagingArtwork?.finishMaskName
        ? { finishMaskName: payload.packagingArtwork.finishMaskName }
        : {}),
      panelOverlays,
    };

    const subject = createPackagingSubject(payload.packagingParams, hydratedArtwork, {
      onNeedsRender: () => sceneRef.current?.requestFrame(),
      onBoundsChanged: () => sceneRef.current?.refreshProceduralBounds(false),
    });

    if (payload.bottlePack?.enabled) {
      const packed = payload.packedBottle;
      const targetModel = getLabModel(packed?.modelId ?? payload.bottlePack.modelId);
      const s = packed?.settings;
      const visualSource: BottlePackVisualSource = {
        model: targetModel,
        ...(packed?.name ? { customProjectName: packed.name } : {}),
        ...(packed?.labelHash && assetUrls[packed.labelHash]
          ? { customLabelUrl: assetUrls[packed.labelHash] }
          : {}),
        ...(s
          ? {
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
            }
          : {}),
      };
      subject.syncBottlePack(payload.bottlePack, visualSource);
    }

    packagingSubjectRef.current = subject;
    const itemId = activeItem.id;
    const frame = requestAnimationFrame(() => {
      setPackagingEntry({ itemId, controller: subject });
    });

    return () => {
      cancelAnimationFrame(frame);
      subject.setFoldPlaying(false);
      subject.dispose();
      packagingSubjectRef.current = null;
    };
  }, [activeItem, assetUrls, assetsReady]);

  const packagingSubject =
    activeItem && activeItem.payload.kind === "packaging" && packagingEntry?.itemId === activeItem.id
      ? packagingEntry.controller
      : null;

  // Step through items in the current filter
  const stepItem = useCallback(
    (delta: -1 | 1) => {
      if (filteredItems.length <= 1 || !activeItem) return;
      const idx = filteredItems.findIndex((i) => i.id === activeItem.id);
      const nextIdx = (idx + delta + filteredItems.length) % filteredItems.length;
      applyItemSelection(filteredItems[nextIdx]);
    },
    [filteredItems, activeItem, applyItemSelection],
  );

  const handleUnlock = async (event: React.FormEvent) => {
    event.preventDefault();
    if (unlocking || !passcode.trim()) return;
    setUnlocking(true);
    setUnlockError("");
    try {
      const res = await fetch(`/api/share/public/${encodeURIComponent(token)}/unlock`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: passcode.trim() }),
      });
      const payload = (await res.json().catch(() => null)) as
        | (PublicSharedProjectResponse & { error?: string })
        | null;
      if (!res.ok || !payload) {
        if (payload?.error === "AUTH_RATE_LIMIT") {
          setUnlockError("Too many attempts. Please wait 15 minutes and try again.");
        } else if (payload?.error === "INVALID_CREDENTIALS") {
          setUnlockError("Incorrect passcode. Please check with the project sender.");
        } else {
          setUnlockError("Unable to unlock this 3D review link.");
        }
        return;
      }
      setData(payload);
      if (payload.state === "ready" && payload.items.length > 0) {
        const first =
          payload.items.find((i) => i.id === payload.share.options.defaultItemId) ?? payload.items[0];
        applyItemSelection(first);
      }
      setPasscode("");
    } catch {
      setUnlockError("Network error while unlocking. Please try again.");
    } finally {
      setUnlocking(false);
    }
  };

  // --- Non-ready states (Locked / Expired / Paused / Revoked / Not Found) ---
  if (data.state === "locked") {
    return (
      <main className={styles.gatePage}>
        <form className={styles.gateCard} onSubmit={(e) => void handleUnlock(e)}>
          <span className={styles.gateIcon}>
            <Lock size={26} />
          </span>
          {data.share.brandName && <span className={styles.gateBrand}>{data.share.brandName}</span>}
          <h1>{data.share.title}</h1>
          <p>
            This protected 3D client review contains{" "}
            <strong>
              {data.share.itemCount} {data.share.itemCount === 1 ? "3D object" : "3D objects"}
            </strong>
            . Enter the passcode provided by the designer to inspect them.
          </p>
          <input
            type="password"
            autoFocus
            placeholder="Enter passcode"
            value={passcode}
            disabled={unlocking}
            onChange={(e) => {
              setPasscode(e.target.value);
              if (unlockError) setUnlockError("");
            }}
          />
          {unlockError && (
            <p className={styles.gateError} role="alert">
              {unlockError}
            </p>
          )}
          <button type="submit" disabled={unlocking || !passcode.trim()}>
            {unlocking ? "Unlocking…" : "Unlock 3D Review"}
          </button>
          <Link href="/" className={styles.poweredLink}>
            Powered by HyperMockup
          </Link>
        </form>
      </main>
    );
  }

  if (data.state !== "ready" || !readyShare || !activeItem) {
    const copy =
      data.state === "expired"
        ? {
            icon: <Clock size={28} />,
            title: "This 3D review link has expired",
            body: "Ask the designer to extend or re-share the link from HyperMockup Studio.",
          }
        : data.state === "paused"
          ? {
              icon: <Pause size={28} />,
              title: "This 3D review link is paused",
              body: "The designer temporarily paused access while updating the mockups.",
            }
          : {
              icon: <ShieldAlert size={28} />,
              title: "3D review link unavailable",
              body: "This link may have been revoked or removed by its owner.",
            };
    return (
      <main className={styles.gatePage}>
        <section className={styles.gateCard}>
          <span className={styles.gateIcon}>{copy.icon}</span>
          <h1>{copy.title}</h1>
          <p>{copy.body}</p>
          <Link href="/" className={styles.gateHomeBtn}>
            Explore HyperMockup Studio
          </Link>
        </section>
      </main>
    );
  }

  const isPackaging = activeItem.payload.kind === "packaging";
  const beverageModel = getLabModel(
    activeItem.payload.kind === "beverage"
      ? activeItem.payload.settings.modelId
      : DEFAULT_PREFERENCES.modelId,
  );
  const effectiveSettings: ScenePreferences = {
    ...DEFAULT_PREFERENCES,
    ...activeItem.payload.settings,
    sceneMode: isPackaging ? "studio" : backdropChoice === "studio" ? "studio" : "website",
    style: backdropChoice === "pink" ? "pink" : backdropChoice === "dark" ? "dark" : "white",
    background: backdropChoice === "dark" ? "#111215" : backdropChoice === "pink" ? "#d53660" : "#ffffff",
    grid: backdropChoice === "pink",
    motion: !isPackaging && autoSpin ? "showcase" : "off",
  };
  const beverageLabelUrl =
    activeItem.payload.kind === "beverage" && activeItem.payload.labelHash
      ? assetUrls[activeItem.payload.labelHash]
      : undefined;

  const handleFoldSlider = (next: number) => {
    setFoldProgress(next);
    packagingSubjectRef.current?.setFoldProgress(next);
    sceneRef.current?.refreshProceduralBounds(false);
  };

  const handleToggleDimensions = () => {
    const next = !showDimensions;
    setShowDimensions(next);
    packagingSubjectRef.current?.setDimensionsVisible(next);
    sceneRef.current?.requestFrame();
  };

  const stageClass =
    backdropChoice === "dark"
      ? styles.stageDark
      : backdropChoice === "pink" && !isPackaging
        ? styles.stagePink
        : styles.stageStudio;

  return (
    <main className={`${styles.page} ${stageClass}`} ref={stageRef}>
      {!isPackaging && backdropChoice === "pink" && (
        <div className={styles.gridBackdrop} aria-hidden="true">
          <MovingGrid enabled style="pink" />
        </div>
      )}

      {/* Floating Transparent Header */}
      <header className={styles.topBar}>
        <div className={styles.titleBlock}>
          {readyShare.brandName && <span className={styles.brandTag}>{readyShare.brandName}</span>}
          <div className={styles.titleRow}>
            <h1>{readyShare.title}</h1>
            <span className={styles.activeBadge}>{activeItem.name}</span>
          </div>
        </div>

        <div className={styles.topControls}>
          {readyShare.description && (
            <button
              type="button"
              className={`${styles.pillBtn} ${showInfo ? styles.pillActive : ""}`}
              onClick={() => setShowInfo((v) => !v)}
              title="Project notes"
            >
              <Info size={14} />
              <span>Notes</span>
            </button>
          )}

          {readyShare.options.allowBgSwitch && !isPackaging && (
            <div className={styles.segment} role="group" aria-label="Backdrop style">
              <button
                type="button"
                aria-pressed={backdropChoice === "studio"}
                onClick={() => setBackdropChoice("studio")}
              >
                <Sun size={13} /> Studio
              </button>
              <button
                type="button"
                aria-pressed={backdropChoice === "pink"}
                onClick={() => setBackdropChoice("pink")}
              >
                <Sparkles size={13} /> Grid
              </button>
              <button
                type="button"
                aria-pressed={backdropChoice === "dark"}
                onClick={() => setBackdropChoice("dark")}
              >
                <Layers size={13} /> Dark
              </button>
            </div>
          )}

          <div className={styles.qualitySelectWrap}>
            <select
              className={styles.qualitySelect}
              aria-label="3D rendering quality"
              value={quality}
              onChange={(e) => setQuality(e.target.value as QualityPreference)}
            >
              {QUALITY_PREFERENCE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.shortLabel}
                </option>
              ))}
            </select>
            <ChevronDown size={13} className={styles.qualitySelectChevron} aria-hidden="true" />
          </div>

          <button
            type="button"
            className={styles.iconBtn}
            aria-label="Fullscreen"
            title="Fullscreen"
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else void stageRef.current?.requestFullscreen().catch(() => {});
            }}
          >
            <Maximize2 size={15} />
          </button>

          <Link href="/" className={styles.brandBadge} target="_blank" rel="noopener noreferrer">
            HyperMockup
          </Link>
        </div>
      </header>

      {showInfo && readyShare.description && (
        <aside className={styles.notePopover} role="dialog" aria-label="Designer notes">
          <div className={styles.noteHead}>
            <strong>Designer note</strong>
            <button type="button" aria-label="Close notes" onClick={() => setShowInfo(false)}>
              <X size={14} />
            </button>
          </div>
          <p>{readyShare.description}</p>
        </aside>
      )}

      {/* Main Workspace: 3D Stage + Desktop Rounded Right Panel (Bottom Dock on Mobile) */}
      <div className={styles.viewerBody}>
        <section className={styles.stageWrap} aria-label={`Interactive 3D viewer for ${activeItem.name}`}>
          {assetsReady ? (
            <SceneCanvas
              ref={sceneRef}
              model={beverageModel}
              proceduralSubject={isPackaging ? packagingSubject : null}
              deferSelection={isPackaging && !packagingSubject}
              subjectName={activeItem.name}
              qualityPreference={quality}
              settings={effectiveSettings}
              artwork={beverageLabelUrl}
              onStatus={(s) => setSceneStatus(s.phase)}
            />
          ) : (
            <div className={styles.loadingOverlay}>Loading 3D review assets…</div>
          )}

          {panelCollapsed && (
            <button
              type="button"
              className={styles.panelReopenBtn}
              onClick={() => setPanelCollapsed(false)}
              aria-label="Show 3D objects panel"
            >
              <PanelRightOpen size={15} />
              <span>Objects ({items.length})</span>
            </button>
          )}

          {/* Contextual Controls (Fold/Dimensions for CAD, Angles/Spin for Bottles, Zoom/Reset for all) */}
          <div className={`${styles.floatingControls} ${!panelCollapsed ? styles.floatingControlsWithPanel : ""}`}>
            {isPackaging && readyShare.options.allowFold && (
              <div className={styles.foldCard}>
                <label className={styles.foldSliderLabel}>
                  <span>Fold {Math.round(foldProgress * 100)}%</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={foldProgress}
                    onChange={(e) => handleFoldSlider(Number(e.target.value))}
                  />
                </label>
                {readyShare.options.allowDimensions && (
                  <button
                    type="button"
                    className={`${styles.miniToggle} ${showDimensions ? styles.miniToggleOn : ""}`}
                    onClick={handleToggleDimensions}
                    title="Toggle 3D millimeter dimensions"
                  >
                    <Ruler size={13} /> mm
                  </button>
                )}
              </div>
            )}

            <div className={styles.cameraRow}>
              {isPackaging ? (
                PACKAGING_CAMERAS.map((cam) => (
                  <button
                    key={cam.id}
                    type="button"
                    className={styles.camPill}
                    onClick={() => sceneRef.current?.cameraAngles(cam.yaw, cam.pitch, cam.fov, true)}
                  >
                    {cam.label}
                  </button>
                ))
              ) : (
                <>
                  {BEVERAGE_CAMERAS.map((cam) => (
                    <button
                      key={cam.id}
                      type="button"
                      className={styles.camPill}
                      onClick={() => {
                        setAutoSpin(false);
                        sceneRef.current?.camera(cam.id);
                      }}
                    >
                      {cam.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`${styles.camPill} ${autoSpin ? styles.camPillActive : ""}`}
                    onClick={() => setAutoSpin((v) => !v)}
                  >
                    <RotateCw size={12} /> Spin
                  </button>
                </>
              )}

              <span className={styles.divider} aria-hidden="true" />
              <button
                type="button"
                className={styles.camIcon}
                aria-label="Zoom out"
                onClick={() => sceneRef.current?.zoom(1 / 1.18)}
              >
                <Minus size={14} />
              </button>
              <button
                type="button"
                className={styles.camIcon}
                aria-label="Zoom in"
                onClick={() => sceneRef.current?.zoom(1.18)}
              >
                <Plus size={14} />
              </button>
              <button
                type="button"
                className={styles.camIcon}
                aria-label="Reset camera"
                title="Reset view"
                onClick={() => sceneRef.current?.reset()}
              >
                <RotateCcw size={13} />
              </button>
            </div>
          </div>
        </section>

        {/* Multi-Object Switcher: Rounded Right Panel on Desktop, Bottom Dock on Mobile */}
        <aside
          className={`${styles.switcherDock} ${panelCollapsed ? styles.switcherDockCollapsed : ""}`}
          aria-label="Switch 3D objects in this project"
        >
          <div className={styles.panelHead}>
            <div className={styles.panelHeadTitle}>
              <span className={styles.panelTitle}>3D Objects</span>
              <span className={styles.panelCounter}>
                {activeFilteredIndex >= 0
                  ? `${activeFilteredIndex + 1} / ${filteredItems.length}`
                  : filteredItems.length}
              </span>
            </div>
            <div className={styles.panelHeadActions}>
              {filteredItems.length > 1 && (
                <>
                  <button
                    type="button"
                    className={styles.panelIconBtn}
                    aria-label="Previous 3D object"
                    title="Previous object"
                    onClick={() => stepItem(-1)}
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <button
                    type="button"
                    className={styles.panelIconBtn}
                    aria-label="Next 3D object"
                    title="Next object"
                    onClick={() => stepItem(1)}
                  >
                    <ChevronRight size={15} />
                  </button>
                </>
              )}
              <button
                type="button"
                className={styles.panelIconBtn}
                aria-label="Collapse 3D objects panel"
                title="Hide panel"
                onClick={() => setPanelCollapsed(true)}
              >
                <PanelRightClose size={15} />
              </button>
            </div>
          </div>

          <div className={styles.searchFilterBar} ref={filterWrapRef}>
            <div className={styles.searchInputWrap}>
              <Search size={13} className={styles.searchIcon} aria-hidden="true" />
              <input
                type="search"
                className={styles.searchInput}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search 3D objects…"
                aria-label="Search 3D objects"
              />
              {searchQuery && (
                <button
                  type="button"
                  className={styles.searchClearBtn}
                  aria-label="Clear search"
                  onClick={() => setSearchQuery("")}
                >
                  <X size={12} />
                </button>
              )}
              {hasMultipleKinds && (
                <button
                  type="button"
                  className={`${styles.filterTriggerBtn} ${filterTab !== "all" ? styles.filterTriggerActive : ""}`}
                  aria-label="Filter objects by category"
                  aria-expanded={filterMenuOpen}
                  aria-haspopup="menu"
                  title="Filter by category"
                  onClick={() => setFilterMenuOpen((open) => !open)}
                >
                  <ListFilter size={14} aria-hidden="true" />
                  {filterTab !== "all" && <span className={styles.filterActiveDot} aria-hidden="true" />}
                </button>
              )}
            </div>

            {hasMultipleKinds && filterMenuOpen && (
              <div className={styles.filterPopover} role="menu" aria-label="Filter objects by category">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={filterTab === "all"}
                  className={`${styles.filterOption} ${filterTab === "all" ? styles.filterOptionActive : ""}`}
                  onClick={() => {
                    setFilterTab("all");
                    setFilterMenuOpen(false);
                  }}
                >
                  <span>All objects</span>
                  <span className={styles.filterOptionCount}>{items.length}</span>
                </button>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={filterTab === "beverage"}
                  className={`${styles.filterOption} ${filterTab === "beverage" ? styles.filterOptionActive : ""}`}
                  onClick={() => {
                    setFilterTab("beverage");
                    setFilterMenuOpen(false);
                  }}
                >
                  <span className={styles.filterOptionLabel}>
                    <Milk size={13} aria-hidden="true" /> Bottles &amp; Cans
                  </span>
                  <span className={styles.filterOptionCount}>{beverageCount}</span>
                </button>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={filterTab === "packaging"}
                  className={`${styles.filterOption} ${filterTab === "packaging" ? styles.filterOptionActive : ""}`}
                  onClick={() => {
                    setFilterTab("packaging");
                    setFilterMenuOpen(false);
                  }}
                >
                  <span className={styles.filterOptionLabel}>
                    <Package size={13} aria-hidden="true" /> Boxes &amp; Trays
                  </span>
                  <span className={styles.filterOptionCount}>{packagingCount}</span>
                </button>
              </div>
            )}

            <span className={styles.dragHint}>
              {sceneStatus === "ready" ? "Drag to rotate · Scroll / pinch to zoom" : "Preparing 3D…"}
            </span>
          </div>

          <div className={styles.switcherRow}>
            {filteredItems.length > 1 && (
              <button
                type="button"
                className={styles.navArrow}
                aria-label="Previous 3D object"
                onClick={() => stepItem(-1)}
              >
                <ChevronLeft size={16} />
              </button>
            )}
            <div className={styles.objectStrip}>
              {filteredItems.length === 0 ? (
                <div className={styles.emptyObjects}>
                  <span>No matching objects</span>
                  {(searchQuery || filterTab !== "all") && (
                    <button
                      type="button"
                      className={styles.resetFilterBtn}
                      onClick={() => {
                        setSearchQuery("");
                        setFilterTab("all");
                      }}
                    >
                      Reset
                    </button>
                  )}
                </div>
              ) : (
                filteredItems.map((item) => {
                  const selected = item.id === activeItem.id;
                  const thumb =
                    (item.thumbnailHash && assetUrls[item.thumbnailHash]) ||
                    (item.payload.kind === "beverage"
                      ? getLabModel(item.payload.settings.modelId).poster
                      : undefined);
                  return (
                    <button
                      key={item.id}
                      ref={selected ? activeItemBtnRef : undefined}
                      type="button"
                      className={`${styles.objectBtn} ${selected ? styles.objectBtnActive : ""}`}
                      aria-pressed={selected}
                      onClick={() => applyItemSelection(item)}
                    >
                      <span className={styles.objectThumb}>
                        {thumb ? (
                          <img src={thumb} alt="" />
                        ) : item.kind === "packaging" ? (
                          <Package size={18} />
                        ) : (
                          <Milk size={18} />
                        )}
                      </span>
                      <span className={styles.objectMeta}>
                        <strong>{item.name}</strong>
                        <small>{item.kind === "packaging" ? "Box / Tray" : "Bottle / Can"}</small>
                        {item.subtitle && <span className={styles.objectSubtitle}>{item.subtitle}</span>}
                      </span>
                      {selected && (
                        <span className={styles.objectActiveCheck} aria-hidden="true">
                          <Check size={13} />
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
            {filteredItems.length > 1 && (
              <button
                type="button"
                className={styles.navArrow}
                aria-label="Next 3D object"
                onClick={() => stepItem(1)}
              >
                <ChevronRight size={16} />
              </button>
            )}
          </div>

          <div className={styles.panelFooter}>
            <span
              className={`${styles.statusDot} ${sceneStatus === "ready" ? styles.statusDotReady : ""}`}
              aria-hidden="true"
            />
            <span>
              {sceneStatus === "ready" ? "Drag to rotate · Scroll / pinch to zoom" : "Preparing 3D…"}
            </span>
          </div>
        </aside>
      </div>
    </main>
  );
}
