"use client";

import { useMemo } from "react";
import { getModelMaterialDefaults, type LabModel } from "@/lib/labellab/catalog";
import { DEFAULT_PREFERENCES } from "@/lib/labellab/preferences";
import SceneCanvas from "./SceneCanvas";
import styles from "./HomeModelDemo.module.css";

// Match the pale pink demo surface so the real liquid/glass shader refracts
// this card's background instead of the Studio's saturated default pink.
function paintDemoBackdrop(context: CanvasRenderingContext2D, width: number, height: number) {
  context.save();
  context.translate(width / 2, height / 2);
  context.scale(width / 2, height / 2);
  const glow = context.createRadialGradient(0, 0, 0, 0, 0, 1);
  glow.addColorStop(0, "#fff0f6");
  glow.addColorStop(0.52, "#f6c6d6");
  glow.addColorStop(1, "#e6aac0");
  context.fillStyle = glow;
  context.fillRect(-1, -1, 2, 2);
  context.restore();
}

const ignoreStatus = () => {};

export default function HomeModelDemo({ model }: { model: LabModel }) {
  // This demo has its own defaults: editing Studio must not stop its animation
  // or change the homepage's product, colors or scene.
  const settings = useMemo(() => ({
    ...DEFAULT_PREFERENCES,
    ...getModelMaterialDefaults(model.id),
    modelId: model.id,
    grid: false,
    highlight: false,
  }), [model]);

  return (
    <div className={styles.canvas}>
      <SceneCanvas
        model={model}
        settings={settings}
        onStatus={ignoreStatus}
        interaction="drag-only"
        displayScale={1.1}
        paintBackground={paintDemoBackdrop}
      />
    </div>
  );
}
