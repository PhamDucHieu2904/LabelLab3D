"use client";

import Image from "next/image";
import type { CSSProperties, RefObject } from "react";
import { ArrowDownToLine, Download, FileCode2, LoaderCircle, SlidersHorizontal } from "lucide-react";
import type { ScenePreferences } from "@/lib/labellab/preferences";
import { MOCKUP_ASPECTS } from "@/lib/mockup/camera";
import { DEFAULT_RENDER_COIN_COST, resolveRenderCoinCost } from "@/lib/payments/packages";
import { useLocale } from "./LocaleProvider";

export interface DielineExportConfig {
  cost: number;
  busy?: boolean;
  templateCode?: string;
  onDownload: (format: "svg" | "pdf" | "dxf") => void;
}

export interface RenderPanelProps {
  settings: ScenePreferences;
  onChange: <K extends keyof ScenePreferences>(key: K, value: ScenePreferences[K]) => void;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  ready: boolean;
  busy: boolean;
  progress: number | null;
  onRender: () => void;
  result?: { url: string; name: string };
  baseRenderCost?: number;
  /** Shown beneath Render Image in Boxes & Trays mode for 1:1 mm production vector downloads. */
  dielineExport?: DielineExportConfig;
}

const frameRatios = { square: "1 / 1", portrait: "4 / 5", landscape: "16 / 9", story: "9 / 16" };
const RESOLUTIONS: ReadonlyArray<ScenePreferences["resolution"]> = [1024, 2048, 4096, 8129];

export default function RenderPanel({
  settings,
  onChange,
  canvasRef,
  ready,
  busy,
  progress,
  onRender,
  result,
  baseRenderCost = DEFAULT_RENDER_COIN_COST,
  dielineExport,
}: RenderPanelProps) {
  const { t } = useLocale();
  const r = t.studio.render;
  const percentage = progress === null ? null : Math.round(Math.min(1, Math.max(0, progress)) * 100);
  const renderCost = resolveRenderCoinCost(settings.resolution, baseRenderCost);
  return (
    <div className="render-sidebar">
    <aside className="render-panel" aria-label={r.heading} aria-busy={busy}>
      <div className="render-panel-heading">
        <span><SlidersHorizontal size={16} aria-hidden="true" /> {r.heading}</span>
      </div>
      <div className={`render-panel-preview${settings.transparent ? " is-transparent" : ""}`} style={{ "--render-frame-ratio": frameRatios[settings.frame], "--render-frame-aspect": MOCKUP_ASPECTS[settings.frame] } as CSSProperties}>
        <canvas ref={canvasRef} aria-label={r.heading} />
        {!ready && <span className="render-panel-loading">{r.loadingPreview}</span>}
      </div>
      <div className="render-panel-fields">
        <label>{r.aspectRatio}
          <select value={settings.frame} disabled={busy} onChange={(event) => onChange("frame", event.target.value as ScenePreferences["frame"])}>
            <option value="square">{r.frameSquare}</option>
            <option value="portrait">{r.framePortrait}</option>
            <option value="landscape">{r.frameLandscape}</option>
            <option value="story">{r.frameStory}</option>
          </select>
        </label>
        <label>{r.resolution}
          <select value={settings.resolution} disabled={busy} onChange={(event) => onChange("resolution", Number(event.target.value) as ScenePreferences["resolution"])}>
            {RESOLUTIONS.map((res) => (
              <option key={res} value={res}>
                {res} px
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="render-panel-toggle">
        <span>{r.isTransparent}</span>
        <input type="checkbox" role="switch" checked={settings.transparent} disabled={busy} onChange={(event) => onChange("transparent", event.target.checked)} />
      </label>
      <button type="button" className="render-panel-submit" disabled={!ready || busy} onClick={onRender}>
        <span className="render-panel-submit-label">
          {busy && <LoaderCircle size={20} className="render-panel-spinner" aria-hidden="true" />}
          {busy ? r.rendering : r.renderButton}
        </span>
        <span className="render-panel-cost" aria-label={renderCost === 0 ? r.free : `${renderCost} coins`}>
          <strong>{renderCost}</strong>
          <Image src="/branding/hypermockup-coin.svg" alt="" width={22} height={22} aria-hidden="true" />
        </span>
      </button>
      <div className="render-panel-progress" role="status" aria-live="polite">
        {busy && <><span>{percentage === null ? r.preparingImage : r.renderingPct(percentage)}</span><progress max={1} value={progress === null ? undefined : Math.min(1, Math.max(0, progress))} /></>}
      </div>
      {result && !busy && <a className="render-panel-result" href={result.url} title={result.name} download={result.name}><ArrowDownToLine size={15} aria-hidden="true" /> {r.downloadImage}</a>}
    </aside>
    {dielineExport && (
      <aside className="dieline-export-panel" aria-label={r.dielineTitle}>
        <div className="dieline-export-header">
          <span className="dieline-export-title">
            <FileCode2 size={15} aria-hidden="true" />
            <span>{r.dielineTitle}</span>
          </span>
          <span
            className="dieline-export-cost"
            aria-label={dielineExport.cost === 0 ? r.free : `${dielineExport.cost} coins`}
          >
            {dielineExport.cost === 0 ? (
              r.free
            ) : (
              <>
                <Image src="/branding/hypermockup-coin.svg" alt="" width={13} height={13} aria-hidden="true" />
                <span>{dielineExport.cost}</span>
              </>
            )}
          </span>
        </div>
        <p className="dieline-export-subtitle">
          {dielineExport.templateCode ? `${dielineExport.templateCode} · ` : ""}{r.dielineSub}
        </p>
        <div className="dieline-export-actions">
          <button
            type="button"
            disabled={busy || dielineExport.busy}
            onClick={() => dielineExport.onDownload("svg")}
            title={`Scalable Vector Graphics 1:1 mm (Illustrator / Inkscape) · ${dielineExport.cost === 0 ? "Free" : `${dielineExport.cost} coins`}`}
          >
            <Download size={13} aria-hidden="true" />
            <span>SVG</span>
          </button>
          <button
            type="button"
            disabled={busy || dielineExport.busy}
            onClick={() => dielineExport.onDownload("pdf")}
            title={`True Vector PDF 1:1 mm with Cut/Crease/Bleed · ${dielineExport.cost === 0 ? "Free" : `${dielineExport.cost} coins`}`}
          >
            <Download size={13} aria-hidden="true" />
            <span>PDF</span>
          </button>
          <button
            type="button"
            disabled={busy || dielineExport.busy}
            onClick={() => dielineExport.onDownload("dxf")}
            title={`AutoCAD DXF R12 (mm) for CNC die-cutters · ${dielineExport.cost === 0 ? "Free" : `${dielineExport.cost} coins`}`}
          >
            <Download size={13} aria-hidden="true" />
            <span>DXF</span>
          </button>
        </div>
      </aside>
    )}
    </div>
  );
}
