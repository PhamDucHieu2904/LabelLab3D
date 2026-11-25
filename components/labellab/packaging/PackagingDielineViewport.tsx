"use client";

import Image from "next/image";
import { useMemo } from "react";
import { Download } from "lucide-react";
import type { PackagingPartGroup, SolvedDieline } from "@/lib/packaging-cad/types";
import { exportDielineSvg } from "@/lib/packaging-cad/exporters/vector-dieline";
import styles from "./PackagingStudio.module.css";

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
  dielineCost = 20,
  disabled = false,
  onChangeSide,
  onSelectPanel,
  onDownloadDieline,
}: Props) {
  const svgMarkup = useMemo(
    () =>
      exportDielineSvg(solved, {
        side,
        marginMm: 18,
        includeDimensions: true,
        includeLabels: true,
        includeBleed: true,
        includeFill: true,
        highlightPartGroup,
      }),
    [solved, side, highlightPartGroup],
  );

  return (
    <div
      className={`${styles.splitPane2D} ${fullWidth ? styles.splitPane2DFull : ""}`}
      aria-label="2D parametric millimeter dieline view"
    >
      <div className={styles.dielineHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <strong style={{ color: "#1f2328" }}>
            {solved.templateCode} · Blank {Math.round(solved.blankBounds.width)} × {Math.round(solved.blankBounds.height)} mm
          </strong>
          <span style={{ color: "#e11d48", fontWeight: 600 }}>━ Cut</span>
          <span style={{ color: "#059669", fontWeight: 600 }}>┄ Crease</span>
          <span style={{ color: "#2563eb", fontWeight: 600 }}>┈ Bleed ({solved.params.bleedMm}mm)</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div className={styles.segmented} role="group" aria-label="Dieline print surface">
            <button type="button" aria-pressed={side === "outside"} onClick={() => onChangeSide("outside")}>
              Outside
            </button>
            <button type="button" aria-pressed={side === "inside"} onClick={() => onChangeSide("inside")}>
              Inside
            </button>
          </div>
          <button
            type="button"
            className={styles.dockIconBtn}
            disabled={disabled}
            onClick={() => onDownloadDieline("svg")}
            title={`Download 1:1 mm SVG Dieline (${dielineCost === 0 ? "Free" : `${dielineCost} coins`})`}
          >
            <Download size={13} /> SVG
          </button>
          <button
            type="button"
            className={styles.dockIconBtn}
            disabled={disabled}
            onClick={() => onDownloadDieline("pdf")}
            title={`Download 1:1 mm Vector PDF Dieline (${dielineCost === 0 ? "Free" : `${dielineCost} coins`})`}
          >
            <Download size={13} /> PDF
          </button>
          {dielineCost > 0 && (
            <span className={styles.dielineCostBadge} aria-label={`${dielineCost} coins per dieline export`}>
              <Image src="/branding/LLCoin.svg" alt="" width={12} height={12} aria-hidden="true" />
              <span>{dielineCost}</span>
            </span>
          )}
        </div>
      </div>

      <div className={styles.dielineCanvasWrap}>
        <div
          className={styles.dielineSvgHost}
          onClick={(event) => {
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
