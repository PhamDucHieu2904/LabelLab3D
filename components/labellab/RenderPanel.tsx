"use client";

import type { CSSProperties, RefObject } from "react";
import { ArrowDownToLine, LoaderCircle, SlidersHorizontal } from "lucide-react";
import type { ScenePreferences } from "@/lib/labellab/preferences";
import { MOCKUP_ASPECTS } from "@/lib/mockup/camera";

export interface RenderPanelProps {
  settings: ScenePreferences;
  onChange: <K extends keyof ScenePreferences>(key: K, value: ScenePreferences[K]) => void;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  ready: boolean;
  busy: boolean;
  progress: number | null;
  onRender: () => void;
  result?: { url: string; name: string };
}

const frameRatios = { square: "1 / 1", portrait: "4 / 5", landscape: "16 / 9", story: "9 / 16" };

export default function RenderPanel({ settings, onChange, canvasRef, ready, busy, progress, onRender, result }: RenderPanelProps) {
  const percentage = progress === null ? null : Math.round(Math.min(1, Math.max(0, progress)) * 100);
  return (
    <aside className="render-panel" aria-label="Render image" aria-busy={busy}>
      <div className="render-panel-heading">
        <span><SlidersHorizontal size={16} aria-hidden="true" /> Render image</span>
      </div>
      <div className={`render-panel-preview${settings.transparent ? " is-transparent" : ""}`} style={{ "--render-frame-ratio": frameRatios[settings.frame], "--render-frame-aspect": MOCKUP_ASPECTS[settings.frame] } as CSSProperties}>
        <canvas ref={canvasRef} aria-label="Render camera preview" />
        {!ready && <span className="render-panel-loading">Loading preview…</span>}
      </div>
      <div className="render-panel-fields">
        <label>Aspect ratio
          <select value={settings.frame} disabled={busy} onChange={(event) => onChange("frame", event.target.value as ScenePreferences["frame"])}>
            <option value="square">1:1 · Square</option>
            <option value="portrait">4:5 · Portrait</option>
            <option value="landscape">16:9 · Landscape</option>
            <option value="story">9:16 · Story</option>
          </select>
        </label>
        <label>Resolution
          <select value={settings.resolution} disabled={busy} onChange={(event) => onChange("resolution", Number(event.target.value) as ScenePreferences["resolution"])}>
            <option value={1024}>1024 px</option>
            <option value={2048}>2048 px</option>
            <option value={4096}>4096 px</option>
            <option value={8129}>8129 px</option>
          </select>
        </label>
      </div>
      <label className="render-panel-toggle">
        <span>Is Transparent</span>
        <input type="checkbox" role="switch" checked={settings.transparent} disabled={busy} onChange={(event) => onChange("transparent", event.target.checked)} />
      </label>
      <button type="button" className="render-panel-submit" disabled={!ready || busy} onClick={onRender}>
        {busy ? <LoaderCircle size={17} className="render-panel-spinner" aria-hidden="true" /> : <ArrowDownToLine size={17} aria-hidden="true" />}
        {busy ? "Rendering…" : "Render image"}
        <span>PNG</span>
      </button>
      <div className="render-panel-progress" role="status" aria-live="polite">
        {busy && <><span>{percentage === null ? "Preparing image…" : `Rendering ${percentage}%`}</span><progress max={1} value={progress === null ? undefined : Math.min(1, Math.max(0, progress))} /></>}
      </div>
      {result && !busy && <a className="render-panel-result" href={result.url} title={result.name} download={result.name}><ArrowDownToLine size={15} aria-hidden="true" /> Download image</a>}
    </aside>
  );
}

