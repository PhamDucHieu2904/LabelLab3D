"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Minus, Plus, RotateCcw, Ruler } from "lucide-react";
import type { PackagingPartGroup, SolvedDieline } from "@/lib/packaging-cad/types";
import { exportDielineSvg } from "@/lib/packaging-cad/exporters/vector-dieline";
import { recordDomSvgCopy } from "@/lib/client/usage-tracker";
import { useLocale } from "../LocaleProvider";
import styles from "./PackagingStudio.module.css";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
const DRAG_CLICK_THRESHOLD_PX = 5;

function clampZoom(z: number) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}

interface Props {
  solved: SolvedDieline;
  side: "outside" | "inside";
  fullWidth?: boolean;
  highlightPartGroup?: PackagingPartGroup | null;
  dielineCost?: number;
  disabled?: boolean;
  onChangeSide: (side: "outside" | "inside") => void;
  onSelectPanel?: (panelId: string) => void;
  onDownloadDieline: (format: "svg" | "pdf" | "dxf") => void;
}

export default function PackagingDielineViewport({
  solved,
  side,
  fullWidth = false,
  highlightPartGroup,
  dielineCost = 10,
  disabled = false,
  onChangeSide,
  onSelectPanel,
  onDownloadDieline,
}: Props) {
  const { locale, t } = useLocale();
  const vp = t.studio.viewport;
  const pkg = t.studio.packaging;
  const isVi = locale === "vi";

  const [showDimensions, setShowDimensions] = useState(true);
  const [view, setView] = useState({ zoom: 1, panX: 0, panY: 0 });
  const [dragging, setDragging] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originPanX: number;
    originPanY: number;
    moved: boolean;
  } | null>(null);
  const pinchStateRef = useRef<{
    distance: number;
    midX: number;
    midY: number;
    originZoom: number;
    originPanX: number;
    originPanY: number;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const lastTemplateIdRef = useRef(solved.templateId);

  const resetView = useCallback(() => {
    setView({ zoom: 1, panX: 0, panY: 0 });
  }, []);

  // Reset pan/zoom when switching to a different box template so the new dieline starts centered.
  useEffect(() => {
    if (lastTemplateIdRef.current !== solved.templateId) {
      lastTemplateIdRef.current = solved.templateId;
      const frame = requestAnimationFrame(() => setView({ zoom: 1, panX: 0, panY: 0 }));
      return () => cancelAnimationFrame(frame);
    }
  }, [solved.templateId]);

  const zoomAtPoint = useCallback((factor: number, clientX?: number, clientY?: number) => {
    const el = viewportRef.current;
    setView((prev) => {
      const nextZoom = clampZoom(prev.zoom * factor);
      if (Math.abs(nextZoom - prev.zoom) < 1e-4) return prev;
      if (!el || clientX === undefined || clientY === undefined) {
        const ratio = nextZoom / prev.zoom;
        return {
          zoom: nextZoom,
          panX: prev.panX * ratio,
          panY: prev.panY * ratio,
        };
      }
      const rect = el.getBoundingClientRect();
      const cx = clientX - rect.left - rect.width * 0.5;
      const cy = clientY - rect.top - rect.height * 0.5;
      const ratio = nextZoom / prev.zoom;
      return {
        zoom: nextZoom,
        panX: cx - (cx - prev.panX) * ratio,
        panY: cy - (cy - prev.panY) * ratio,
      };
    });
  }, []);

  // Attach non-passive wheel listener so zooming never scrolls the page or leaks into 3D behind it.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const clampedDelta = Math.max(-180, Math.min(180, event.deltaY));
      const factor = Math.exp(-clampedDelta * 0.0018);
      zoomAtPoint(factor, event.clientX, event.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAtPoint]);

  const svgMarkup = useMemo(
    () =>
      exportDielineSvg(solved, {
        side,
        includeDimensions: showDimensions,
        includeLabels: true,
        includeBleed: true,
        includeFill: true,
        highlightPartGroup,
      }),
    [solved, side, showDimensions, highlightPartGroup],
  );

  const zoomPct = Math.round(view.zoom * 100);

  return (
    <div
      className={`${styles.splitPane2D} ${fullWidth ? styles.splitPane2DFull : ""}`}
      aria-label="2D parametric millimeter dieline view"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <div className={styles.dielineHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <strong style={{ color: "#1f2328" }}>
            {solved.templateCode} · {pkg.dielineBlank} {Math.round(solved.blankBounds.width)} × {Math.round(solved.blankBounds.height)} mm
          </strong>
          <span style={{ color: "#e11d48", fontWeight: 600 }}>━ {pkg.dielineCut}</span>
          <span style={{ color: "#059669", fontWeight: 600 }}>┄ {pkg.dielineCrease}</span>
          <span style={{ color: "#2563eb", fontWeight: 600 }}>┈ {pkg.dielineBleed} ({solved.params.bleedMm}mm)</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <div className={styles.dielineZoomGroup} role="group" aria-label="2D zoom controls">
            <button
              type="button"
              className={styles.dielineZoomBtn}
              aria-label={vp.zoomOut}
              title={vp.zoomOut}
              disabled={view.zoom <= MIN_ZOOM + 0.01}
              onClick={() => zoomAtPoint(1 / 1.25)}
            >
              <Minus size={13} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={styles.dielineZoomBtn}
              title={isVi ? "Đặt lại khung nhìn 100%" : "Reset 2D view to 100%"}
              onClick={resetView}
            >
              {zoomPct}%
            </button>
            <button
              type="button"
              className={styles.dielineZoomBtn}
              aria-label={vp.zoomIn}
              title={vp.zoomIn}
              disabled={view.zoom >= MAX_ZOOM - 0.01}
              onClick={() => zoomAtPoint(1.25)}
            >
              <Plus size={13} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={styles.dielineZoomBtn}
              aria-label={vp.reset}
              title={isVi ? "Vừa khung (Reset)" : "Fit to view"}
              onClick={resetView}
            >
              <RotateCcw size={12} aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            className={styles.dockIconBtn}
            aria-pressed={showDimensions}
            onClick={() => setShowDimensions((v) => !v)}
            title={isVi ? "Bật/tắt kích thước chi tiết (mm)" : "Toggle detailed CAD dimensions (mm)"}
          >
            <Ruler size={13} aria-hidden="true" /> mm
          </button>

          <div className={styles.segmented} role="group" aria-label="Dieline print surface">
            <button type="button" aria-pressed={side === "outside"} onClick={() => onChangeSide("outside")}>
              {vp.hoverOutside}
            </button>
            <button type="button" aria-pressed={side === "inside"} onClick={() => onChangeSide("inside")}>
              {vp.hoverInside}
            </button>
          </div>
          <button
            type="button"
            className={styles.dockIconBtn}
            disabled={disabled}
            onClick={() => onDownloadDieline("svg")}
            title={`SVG 1:1 mm (${dielineCost === 0 ? t.studio.render.free : `${dielineCost} coin`})`}
          >
            <Download size={13} /> SVG
          </button>
          <button
            type="button"
            className={styles.dockIconBtn}
            disabled={disabled}
            onClick={() => onDownloadDieline("pdf")}
            title={`PDF 1:1 mm (${dielineCost === 0 ? t.studio.render.free : `${dielineCost} coin`})`}
          >
            <Download size={13} /> PDF
          </button>
          <button
            type="button"
            className={styles.dockIconBtn}
            disabled={disabled}
            onClick={() => onDownloadDieline("dxf")}
            title={`DXF 1:1 mm (${dielineCost === 0 ? t.studio.render.free : `${dielineCost} coin`})`}
          >
            <Download size={13} /> DXF
          </button>
          {dielineCost > 0 && (
            <span className={styles.dielineCostBadge} aria-label={`${dielineCost} coins per dieline export`}>
              <Image src="/branding/hypermockup-coin.svg" alt="" width={12} height={12} aria-hidden="true" />
              <span>{dielineCost}</span>
            </span>
          )}
        </div>
      </div>

      <div
        ref={viewportRef}
        className={`${styles.dielineCanvasWrap} ${dragging ? styles.dielineCanvasWrapDragging : ""}`}
        onDoubleClick={(event) => {
          event.stopPropagation();
          const targetPanel = (event.target as HTMLElement | null)?.closest?.("[data-panel-id]");
          if (!targetPanel) resetView();
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
          if (event.button !== 0 && event.button !== 1) return;
          const el = viewportRef.current;
          el?.setPointerCapture?.(event.pointerId);
          activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

          if (activePointersRef.current.size === 2) {
            const pts = Array.from(activePointersRef.current.values());
            const dist = Math.max(1, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y));
            pinchStateRef.current = {
              distance: dist,
              midX: (pts[0].x + pts[1].x) * 0.5,
              midY: (pts[0].y + pts[1].y) * 0.5,
              originZoom: view.zoom,
              originPanX: view.panX,
              originPanY: view.panY,
            };
            dragStateRef.current = null;
            setDragging(true);
            return;
          }

          dragStateRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            originPanX: view.panX,
            originPanY: view.panY,
            moved: false,
          };
          suppressClickRef.current = false;
        }}
        onPointerMove={(event) => {
          event.stopPropagation();
          if (!activePointersRef.current.has(event.pointerId)) return;
          activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

          if (activePointersRef.current.size === 2 && pinchStateRef.current && viewportRef.current) {
            const pts = Array.from(activePointersRef.current.values());
            const dist = Math.max(1, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y));
            const midX = (pts[0].x + pts[1].x) * 0.5;
            const midY = (pts[0].y + pts[1].y) * 0.5;
            const pinch = pinchStateRef.current;
            const rect = viewportRef.current.getBoundingClientRect();
            const nextZoom = clampZoom(pinch.originZoom * (dist / pinch.distance));
            const ratio = nextZoom / pinch.originZoom;
            const cx0 = pinch.midX - rect.left - rect.width * 0.5;
            const cy0 = pinch.midY - rect.top - rect.height * 0.5;
            const dx = midX - pinch.midX;
            const dy = midY - pinch.midY;
            setView({
              zoom: nextZoom,
              panX: cx0 - (cx0 - pinch.originPanX) * ratio + dx,
              panY: cy0 - (cy0 - pinch.originPanY) * ratio + dy,
            });
            suppressClickRef.current = true;
            return;
          }

          const drag = dragStateRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          const dx = event.clientX - drag.startX;
          const dy = event.clientY - drag.startY;
          if (!drag.moved && Math.hypot(dx, dy) >= DRAG_CLICK_THRESHOLD_PX) {
            drag.moved = true;
            suppressClickRef.current = true;
            setDragging(true);
          }
          if (drag.moved) {
            setView((prev) => ({
              ...prev,
              panX: drag.originPanX + dx,
              panY: drag.originPanY + dy,
            }));
          }
        }}
        onPointerUp={(event) => {
          event.stopPropagation();
          activePointersRef.current.delete(event.pointerId);
          viewportRef.current?.releasePointerCapture?.(event.pointerId);
          if (activePointersRef.current.size < 2) pinchStateRef.current = null;
          if (dragStateRef.current?.pointerId === event.pointerId) {
            dragStateRef.current = null;
          }
          if (activePointersRef.current.size === 0) {
            setDragging(false);
          }
        }}
        onPointerCancel={(event) => {
          event.stopPropagation();
          activePointersRef.current.delete(event.pointerId);
          pinchStateRef.current = null;
          dragStateRef.current = null;
          setDragging(false);
        }}
      >
        <div className={styles.dielineHintPill} aria-hidden="true">
          {isVi
            ? "Cuộn để phóng to/thu nhỏ · Kéo để di chuyển · Click mặt hộp để gắn thiết kế"
            : "Scroll to zoom · Drag to pan · Click a face to edit artwork"}
        </div>
        <div
          className={styles.dielineSvgHost}
          style={{
            transform: `translate3d(${view.panX.toFixed(1)}px, ${view.panY.toFixed(1)}px, 0) scale(${view.zoom.toFixed(4)})`,
          }}
          onCopy={() => recordDomSvgCopy()}
          onClick={(event) => {
            event.stopPropagation();
            if (suppressClickRef.current) {
              suppressClickRef.current = false;
              return;
            }
            const target = (event.target as HTMLElement | null)?.closest?.("[data-panel-id]");
            const panelId = target?.getAttribute("data-panel-id");
            if (panelId) onSelectPanel?.(panelId);
          }}
          dangerouslySetInnerHTML={{ __html: svgMarkup }}
        />
      </div>
    </div>
  );
}
