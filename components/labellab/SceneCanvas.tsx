"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type RefObject,
} from "react";
import { LoaderCircle, RotateCcw, TriangleAlert } from "lucide-react";
import {
  getModelMaterialDefaults,
  type LabModel,
} from "@/lib/labellab/catalog";
import type {
  InteractivePickTarget,
  MockupRuntime,
  MockupStatus,
  MockupCameraPreset,
  MockupBackdropPainter,
  ProceduralSubject,
} from "@/lib/mockup/contracts";
import type { QualityPreference, QualityRuntimeReport } from "@/lib/mockup/quality-tier";
import type { ScenePreferences } from "@/lib/labellab/preferences";
import { createMaterialOverrides } from "@/lib/labellab/material-overrides";
import { paintRenderBackdrop, prepareRenderBackdrop, snapshotRenderBackdrop } from "@/lib/labellab/render-backdrop";
import { MOCKUP_ASPECTS as aspects } from "@/lib/mockup/camera";
import { artworkEditAnimation } from "@/lib/labellab/artwork-edit-motion";

export interface SceneCanvasHandle {
  capture: (onProgress?: (progress: number) => void) => Promise<Blob>;
  zoom: (factor: number) => void;
  fov: (deltaDegrees: number) => void;
  reset: () => void;
  camera: (preset: MockupCameraPreset) => void;
  cameraAngles: (yawDeg: number, pitchDeg: number, fov?: number, animate?: boolean) => void;
  orbit: (yaw: number, pitch: number) => void;
  refreshProceduralBounds: (refitCamera?: boolean) => void;
  requestFrame: () => void;
  getCanvas: () => HTMLCanvasElement | null;
}
interface Props {
  model: LabModel;
  /** When provided, mounts a procedural subject (e.g. Parametric Box/Tray) instead of static GLB. */
  proceduralSubject?: ProceduralSubject | null;
  /** Accessible subject name for screen readers (defaults to model.name). */
  subjectName?: string;
  /** User-selected or Auto 4-tier rendering quality preference. */
  qualityPreference?: QualityPreference;
  /** Reports detected hardware tier, effective tier, scene weight and MSAA level. */
  onQualityChange?: (report: QualityRuntimeReport) => void;
  settings: ScenePreferences;
  artwork?: string;
  artworkEditing?: boolean;
  deferSelection?: boolean;
  onStatus: (status: MockupStatus) => void;
  renderCanvasRef?: RefObject<HTMLCanvasElement | null>;
  interaction?: "studio" | "drag-only";
  displayScale?: number;
  paintBackground?: MockupBackdropPainter;
  onHoverTarget?: (target: InteractivePickTarget | null) => void;
  onPickTarget?: (target: InteractivePickTarget) => void;
}
function applyMotion(
  runtime: MockupRuntime,
  settings: Pick<ScenePreferences, "sceneMode" | "motion">,
  artworkEditing = false,
) {
  const animation = artworkEditAnimation(settings, artworkEditing);
  runtime.setAnimation({
    ...animation,
    playing: animation.playing && !matchMedia("(prefers-reduced-motion: reduce)").matches,
  });
}

const SceneCanvas = forwardRef<SceneCanvasHandle, Props>(function SceneCanvas(
  { model, proceduralSubject = null, subjectName, qualityPreference = "auto", onQualityChange, settings, artwork, artworkEditing = false, deferSelection = false, onStatus, renderCanvasRef, interaction = "studio", displayScale = 1, paintBackground, onHoverTarget, onPickTarget },
  ref,
) {
  const outerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<MockupRuntime | null>(null);
  const panKeysRef = useRef<Set<"w" | "a" | "s" | "d">>(new Set());
  const orbitKeysRef = useRef<Set<"left" | "right">>(new Set());
  const propsRef = useRef({ model, settings, artwork, artworkEditing, onStatus, onQualityChange, qualityPreference, paintBackground, onHoverTarget, onPickTarget });
  const [readyVersion, setReadyVersion] = useState(0);
  const [status, setStatus] = useState("loading-model");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    propsRef.current = { model, settings, artwork, artworkEditing, onStatus, onQualityChange, qualityPreference, paintBackground, onHoverTarget, onPickTarget };
  });

  useImperativeHandle(
    ref,
    () => ({
      capture: async (onProgress) => {
        if (!runtimeRef.current) throw new Error("The scene is not ready.");
        const state = propsRef.current.settings;
        if (!state.transparent && state.grid && state.sceneMode === 'website') await prepareRenderBackdrop(state.style);
        const host = hostRef.current;
        if (!host) throw new Error('The scene is not ready.');
        const backdrop = snapshotRenderBackdrop(host, state, aspects[state.frame]);
        return runtimeRef.current.capture({
          longEdge: state.resolution,
          aspect: aspects[state.frame],
          transparent: state.transparent,
          onProgress,
          paintBackground: (context, width, height) => paintRenderBackdrop(context, width, height, backdrop),
        });
      },
      zoom: (factor) => runtimeRef.current?.zoom(factor),
      fov: (deltaDegrees) => runtimeRef.current?.adjustFov(deltaDegrees),
      reset: () => runtimeRef.current?.resetView(),
      camera: (preset) => runtimeRef.current?.setCamera(preset),
      cameraAngles: (yawDeg, pitchDeg, fov, animate = true) => runtimeRef.current?.setCameraAngles(yawDeg, pitchDeg, fov, animate),
      orbit: (yaw, pitch) => runtimeRef.current?.orbitView(yaw, pitch),
      refreshProceduralBounds: (refitCamera = false) => runtimeRef.current?.refreshProceduralBounds({ refitCamera }),
      requestFrame: () => runtimeRef.current?.requestFrame(),
      getCanvas: () => runtimeRef.current?.getCanvas() ?? null,
    }),
    [],
  );

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !renderCanvasRef?.current) return;
    runtime.setRenderPreview(renderCanvasRef.current, {
      aspect: aspects[settings.frame],
      transparent: settings.transparent,
      paintBackground: (context, width, height) => {
        if (!hostRef.current) return;
        const state = propsRef.current.settings;
        paintRenderBackdrop(context, width, height, snapshotRenderBackdrop(hostRef.current, state, aspects[state.frame]));
      },
    });
    void prepareRenderBackdrop(settings.style).then(() => runtime.requestFrame()).catch(() => {});
    return () => runtime.setRenderPreview(null, {});
  }, [readyVersion, renderCanvasRef, settings.frame, settings.transparent, settings.background, settings.grid, settings.highlight, settings.sceneMode, settings.style]);

  useEffect(() => {
    let alive = true;
    let owned: MockupRuntime | null = null;
    void import("@/lib/mockup/runtime")
      .then(({ createMockupRuntime }) => {
        if (!alive || !hostRef.current) return;
        try {
          owned = createMockupRuntime(hostRef.current, {
            enableWheelZoom: interaction !== "drag-only",
            displayScale,
            environmentPreset: propsRef.current.settings.environment,
            spotLight: propsRef.current.settings.spotLight,
            qualityPreference: propsRef.current.qualityPreference,
            onQualityChange: (report) => {
              if (alive) propsRef.current.onQualityChange?.(report);
            },
            ...(interaction !== "drag-only" && propsRef.current.onHoverTarget
              ? {
                  onHoverTarget: (target) => {
                    if (alive) propsRef.current.onHoverTarget?.(target);
                  },
                }
              : {}),
            ...(interaction !== "drag-only" && propsRef.current.onPickTarget
              ? {
                  onPickTarget: (target) => {
                    if (alive) propsRef.current.onPickTarget?.(target);
                  },
                }
              : {}),
            paintBackground: (context, width, height) => {
              if (propsRef.current.paintBackground) {
                propsRef.current.paintBackground(context, width, height);
                return;
              }
              const host = hostRef.current;
              if (!host) return;
              const state = { ...propsRef.current.settings, transparent: false };
              paintRenderBackdrop(context, width, height, snapshotRenderBackdrop(host, state, host.clientWidth / Math.max(1, host.clientHeight)));
            },
            onStatus: (value) => {
              if (!alive) return;
              setStatus(value.phase);
              setError(
                value.phase === "error"
                  ? (value.message ?? "Unable to load the 3D model.")
                  : "",
              );
              propsRef.current.onStatus(value);
            },
          });
          runtimeRef.current = owned;
          setReadyVersion((v) => v + 1);
        } catch {
          setError(
            "Unable to initialize WebGL. Enable hardware acceleration or try again.",
          );
          setStatus("error");
        }
      })
      .catch(() => {
        if (alive) {
          setError("Unable to load the studio. Please try again.");
          setStatus("error");
        }
      });
    return () => {
      alive = false;
      owned?.dispose();
      runtimeRef.current = null;
    };
  }, [retry, interaction, displayScale]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || deferSelection) return;
    if (proceduralSubject) {
      runtime.setProceduralSubject(proceduralSubject);
      return;
    }
    const appearance = artwork
      ? {
          ...model.appearance,
          id: `${model.id}:artwork:${artwork}`,
          slots: {
            ...model.appearance.slots,
            label: { ...model.appearance.slots?.label, baseColorMap: artwork },
          },
        }
      : model.appearance;
    runtime.select(model.asset, appearance, model.frontYaw);
  }, [model, proceduralSubject, artwork, deferSelection, readyVersion]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.setSceneMode(settings.sceneMode);
    runtime.setBackground(
      settings.sceneMode === "studio"
        ? { type: "white" }
        : { type: "transparent" },
    );
    if (!proceduralSubject) {
      runtime.setMaterialOverrides(createMaterialOverrides(settings, model, getModelMaterialDefaults(model.id)));
    }
  }, [model, proceduralSubject, settings, readyVersion]);

  useEffect(() => {
    runtimeRef.current?.setQualityPreference(qualityPreference);
  }, [qualityPreference, readyVersion]);

  useEffect(() => {
    runtimeRef.current?.setEnvironment(settings.environment);
  }, [settings.environment, readyVersion]);

  useEffect(() => {
    runtimeRef.current?.setSpotLight(settings.spotLight);
  }, [settings.spotLight, readyVersion]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.setPaused(artworkEditing);
    applyMotion(runtime, { sceneMode: settings.sceneMode, motion: settings.motion }, artworkEditing);
  }, [settings.sceneMode, settings.motion, artworkEditing, readyVersion]);

  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      if (runtimeRef.current)
        applyMotion(runtimeRef.current, propsRef.current.settings, propsRef.current.artworkEditing);
    };
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const outer = outerRef.current,
      host = hostRef.current;
    if (!outer || !host) return;
    const resize = () => {
      const width = Math.max(1, outer.clientWidth);
      const height = Math.max(1, outer.clientHeight);
      const aspect = width / height;
      host.style.width = `${width}px`;
      host.style.height = `${height}px`;
      runtimeRef.current?.setAspect(aspect);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(outer);
    resize();
    return () => observer.disconnect();
  }, [readyVersion]);

  const resolvePanKey = (event: { code?: string; key: string }): "w" | "a" | "s" | "d" | null => {
    if (event.code === "KeyW") return "w";
    if (event.code === "KeyA") return "a";
    if (event.code === "KeyS") return "s";
    if (event.code === "KeyD") return "d";
    const lower = event.key.toLowerCase();
    if (lower === "w" || lower === "a" || lower === "s" || lower === "d") return lower;
    return null;
  };

  const resolveOrbitKey = (event: { code?: string; key: string }): "left" | "right" | null => {
    if (event.code === "ArrowLeft" || event.key === "ArrowLeft") return "left";
    if (event.code === "ArrowRight" || event.key === "ArrowRight") return "right";
    return null;
  };

  const syncPanVelocity = () => {
    const keys = panKeysRef.current;
    const horizontal = (keys.has("a") ? 1 : 0) - (keys.has("d") ? 1 : 0);
    const vertical = (keys.has("s") ? 1 : 0) - (keys.has("w") ? 1 : 0);
    runtimeRef.current?.setPanVelocity(horizontal, vertical);
  };

  const syncOrbitVelocity = () => {
    const keys = orbitKeysRef.current;
    const yaw = (keys.has("right") ? 1 : 0) - (keys.has("left") ? 1 : 0);
    runtimeRef.current?.setOrbitVelocity(yaw, 0);
  };

  useEffect(() => {
    if (interaction === "drag-only") return;
    const clearHeldNavigation = () => {
      if (panKeysRef.current.size > 0) {
        panKeysRef.current.clear();
        runtimeRef.current?.setPanVelocity(0, 0);
      }
      if (orbitKeysRef.current.size > 0) {
        orbitKeysRef.current.clear();
        runtimeRef.current?.setOrbitVelocity(0, 0);
      }
    };
    const onWindowKeyUp = (event: KeyboardEvent) => {
      const panKey = resolvePanKey(event);
      if (panKey && panKeysRef.current.delete(panKey)) {
        const keys = panKeysRef.current;
        const horizontal = (keys.has("a") ? 1 : 0) - (keys.has("d") ? 1 : 0);
        const vertical = (keys.has("s") ? 1 : 0) - (keys.has("w") ? 1 : 0);
        runtimeRef.current?.setPanVelocity(horizontal, vertical);
      }
      const orbitKey = resolveOrbitKey(event);
      if (orbitKey && orbitKeysRef.current.delete(orbitKey)) {
        const keys = orbitKeysRef.current;
        const yaw = (keys.has("right") ? 1 : 0) - (keys.has("left") ? 1 : 0);
        runtimeRef.current?.setOrbitVelocity(yaw, 0);
      }
    };
    const onVisibility = () => {
      if (document.hidden) clearHeldNavigation();
    };
    window.addEventListener("blur", clearHeldNavigation);
    window.addEventListener("keyup", onWindowKeyUp);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearHeldNavigation();
      window.removeEventListener("blur", clearHeldNavigation);
      window.removeEventListener("keyup", onWindowKeyUp);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [interaction]);

  const loading = status !== "ready" && status !== "exporting" && !error;
  return (
    <div className="viewer-measure" ref={outerRef}>
      <div
        className="viewer-host"
        ref={hostRef}
        role="region"
        aria-label={interaction === "drag-only"
          ? `Interactive 3D demo of ${subjectName ?? model.name}. Drag the product to rotate it.`
          : `3D view of ${subjectName ?? model.name}. Use left and right arrows to rotate, up and down arrows to change field of view, and WASD to pan.`}
        tabIndex={interaction === "drag-only" ? undefined : 0}
        onKeyDown={interaction === "drag-only" ? undefined : (event) => {
          if (event.ctrlKey || event.metaKey || event.altKey) return;
          const panKey = resolvePanKey(event);
          if (panKey) {
            event.preventDefault();
            if (!panKeysRef.current.has(panKey)) {
              panKeysRef.current.add(panKey);
              syncPanVelocity();
            }
            return;
          }
          const orbitKey = resolveOrbitKey(event);
          if (orbitKey) {
            event.preventDefault();
            if (!orbitKeysRef.current.has(orbitKey)) {
              orbitKeysRef.current.add(orbitKey);
              syncOrbitVelocity();
            }
            return;
          }
          const key = event.key.toLowerCase();
          const map: Record<string, () => void> = {
            ArrowUp: () => runtimeRef.current?.adjustFov(-2),
            ArrowDown: () => runtimeRef.current?.adjustFov(2),
            "+": () => runtimeRef.current?.zoom(1.15),
            "=": () => runtimeRef.current?.zoom(1.15),
            "-": () => runtimeRef.current?.zoom(1 / 1.15),
            "_": () => runtimeRef.current?.zoom(1 / 1.15),
            r: () => runtimeRef.current?.resetView(),
            "0": () => runtimeRef.current?.resetView(),
          };
          const action = map[event.key] ?? map[key];
          if (action) {
            event.preventDefault();
            action();
          }
        }}
        onKeyUp={interaction === "drag-only" ? undefined : (event) => {
          const panKey = resolvePanKey(event);
          if (panKey && panKeysRef.current.delete(panKey)) {
            syncPanVelocity();
          }
          const orbitKey = resolveOrbitKey(event);
          if (orbitKey && orbitKeysRef.current.delete(orbitKey)) {
            syncOrbitVelocity();
          }
        }}
        onBlur={interaction === "drag-only" ? undefined : () => {
          if (panKeysRef.current.size > 0) {
            panKeysRef.current.clear();
            syncPanVelocity();
          }
          if (orbitKeysRef.current.size > 0) {
            orbitKeysRef.current.clear();
            syncOrbitVelocity();
          }
        }}
      />
      {loading && (
        <div className="viewer-loading" aria-live="polite">
          <LoaderCircle className="spinning" size={22} />
          <span>
            Preparing 3D materials
            <span className="loading-sub">Model, lighting and liquid</span>
          </span>
        </div>
      )}
      {error && (
        <div className="viewer-error" role="alert">
          <TriangleAlert size={28} />
          <strong>Reload the scene</strong>
          <p>{error}</p>
          <button
            onClick={() => {
              setError("");
              setStatus("loading-model");
              setRetry((v) => v + 1);
            }}
          >
            <RotateCcw size={16} /> Try again
          </button>
        </div>
      )}
    </div>
  );
});
export default SceneCanvas;
