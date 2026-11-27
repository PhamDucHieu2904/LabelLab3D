"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getLabModel, getModelMaterialDefaults } from "@/lib/labellab/catalog";
import { DEFAULT_PREFERENCES, type ScenePreferences } from "@/lib/labellab/preferences";
import {
  getCachedHeroLabelArtworkUrl,
  loadHeroLabelArtworkUrl,
  resolveHeroEnvironment,
  type HeroLightMoodId,
  type HeroShowcaseScene,
} from "@/lib/labellab/hero-artwork";
import type { MockupBackdropPainter, MockupStatus } from "@/lib/mockup/contracts";
import { createPackagingSubject, type PackagingSubjectController } from "@/lib/packaging-cad/adapter";
import { createDefaultPackagingParams } from "@/lib/packaging-cad/templates/registry";
import type { PackagingArtworkState } from "@/lib/packaging-cad/types";
import SceneCanvas, { type SceneCanvasHandle } from "./SceneCanvas";
import styles from "./HomeModelDemo.module.css";

interface HomeModelDemoProps {
  scene: HeroShowcaseScene;
  lightMood: HeroLightMoodId;
  customArtworkUrl?: string | null;
  boxFoldPlaying?: boolean;
  onStatusChange?: (status: MockupStatus) => void;
  onUserInteract?: () => void;
}

const EMPTY_PACKAGING_ARTWORK: PackagingArtworkState = {
  mode: "panel",
  panelOverlays: {},
};

export default function HomeModelDemo({
  scene,
  lightMood,
  customArtworkUrl = null,
  boxFoldPlaying = false,
  onStatusChange,
  onUserInteract,
}: HomeModelDemoProps) {
  const canvasRef = useRef<SceneCanvasHandle>(null);
  const packagingRef = useRef<PackagingSubjectController | null>(null);
  const [packagingSubject, setPackagingSubject] = useState<PackagingSubjectController | null>(null);

  const model = useMemo(() => getLabModel(scene.modelId), [scene.modelId]);
  const [loadedDemoArt, setLoadedDemoArt] = useState<{ sceneId: string; url: string } | null>(null);

  const cachedDemoArt =
    scene.kind === "beverage" ? getCachedHeroLabelArtworkUrl(scene.id) : undefined;
  const demoArtwork =
    scene.kind === "beverage"
      ? (cachedDemoArt ?? (loadedDemoArt?.sceneId === scene.id ? loadedDemoArt.url : undefined))
      : undefined;

  // Fetch and register the static WebP demo label for the active beverage showcase scene.
  useEffect(() => {
    if (scene.kind !== "beverage" || cachedDemoArt) return;
    let cancelled = false;
    void loadHeroLabelArtworkUrl(scene.id).then((url) => {
      if (!cancelled && url) {
        setLoadedDemoArt({ sceneId: scene.id, url });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [scene.id, scene.kind, cachedDemoArt]);

  // Mount a luxury obsidian + gold-foil 3D rigid CAD box when the packaging showcase scene is active.
  useEffect(() => {
    if (scene.kind !== "packaging") {
      if (packagingRef.current) {
        packagingRef.current.setFoldPlaying(false);
        packagingRef.current.dispose();
        packagingRef.current = null;
      }
      /* eslint-disable react-hooks/set-state-in-effect */
      setPackagingSubject(null);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }

    const baseParams = createDefaultPackagingParams(scene.templateId ?? "rigid-lid-base", "black-e");
    const heroBoxParams = {
      ...baseParams,
      outsideColor: "#1b1820",
      insideColor: "#2d2430",
      outsideRoughness: 0.56,
      finishMode: "gold-foil" as const,
      finishTarget: "brand-frame" as const,
      finishIntensity: 0.96,
      finishRelief: 0.62,
      foldProgress: 0.78,
      showDimensions: false,
      showCreaseLines: false,
      showFaceLabels: false,
    };

    const subject = createPackagingSubject(heroBoxParams, EMPTY_PACKAGING_ARTWORK, {
      onNeedsRender: () => canvasRef.current?.requestFrame(),
      onBoundsChanged: () => canvasRef.current?.refreshProceduralBounds(false),
    });
    packagingRef.current = subject;
    setPackagingSubject(subject);

    return () => {
      subject.setFoldPlaying(false);
      subject.dispose();
      if (packagingRef.current === subject) {
        packagingRef.current = null;
      }
    };
  }, [scene.kind, scene.templateId]);

  // Sync live 60 FPS folding playback on the 3D CAD box scene.
  useEffect(() => {
    const subject = packagingRef.current;
    if (!subject) return;
    subject.setFoldPlaying(boxFoldPlaying);
    if (!boxFoldPlaying) {
      subject.setFoldProgress(0.78);
    }
    canvasRef.current?.requestFrame();
  }, [boxFoldPlaying, packagingSubject]);

  const { environment, spotLight } = useMemo(
    () => resolveHeroEnvironment(scene, lightMood),
    [scene, lightMood],
  );

  // Sync liquid/glass refraction backdrop to the active scene's deep studio cyclorama.
  const paintBackground = useCallback<MockupBackdropPainter>(
    (context, width, height) => {
      const [core, mid, edge] = scene.refractionStops;
      context.save();
      context.translate(width / 2, height / 2);
      context.scale(width / 2, height / 2);
      const glow = context.createRadialGradient(0, -0.08, 0, 0, 0, 1.05);
      glow.addColorStop(0, core);
      glow.addColorStop(0.5, mid);
      glow.addColorStop(1, edge);
      context.fillStyle = glow;
      context.fillRect(-1, -1, 2, 2);
      context.restore();
    },
    [scene.refractionStops],
  );

  const settings = useMemo<ScenePreferences>(
    () => ({
      ...DEFAULT_PREFERENCES,
      ...getModelMaterialDefaults(model.id),
      ...(scene.labelOffset !== undefined && !customArtworkUrl
        ? { labelOffset: scene.labelOffset }
        : {}),
      modelId: model.id,
      sceneMode: "website",
      motion: "showcase",
      environment,
      spotLight,
      grid: false,
      highlight: false,
    }),
    [model.id, scene.labelOffset, customArtworkUrl, environment, spotLight],
  );

  const activeArtwork =
    scene.kind === "beverage" ? (customArtworkUrl || demoArtwork) : undefined;

  const handleStatus = useCallback(
    (status: MockupStatus) => {
      onStatusChange?.(status);
    },
    [onStatusChange],
  );

  return (
    <div
      className={styles.canvas}
      onPointerDown={() => onUserInteract?.()}
    >
      <SceneCanvas
        ref={canvasRef}
        model={model}
        proceduralSubject={scene.kind === "packaging" ? packagingSubject : null}
        deferSelection={scene.kind === "packaging" && !packagingSubject}
        subjectName={scene.badgeEn}
        settings={settings}
        artwork={activeArtwork}
        onStatus={handleStatus}
        interaction="drag-only"
        displayScale={scene.displayScale}
        paintBackground={paintBackground}
      />
    </div>
  );
}
