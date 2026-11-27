import type { Point2D, SolvedDieline } from '../types';

const MM_TO_PT = 72 / 25.4;

function fmt(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number(rounded.toFixed(1)).toString();
}

function fmtExact(n: number): string {
  return Number(n.toFixed(2)).toString();
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function escapeXml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

export interface DielineChainSegment {
  /** Start coordinate along axis in mm relative to blank origin (0..blankSpan). */
  start: number;
  /** End coordinate along axis in mm relative to blank origin (0..blankSpan). */
  end: number;
  /** Physical length in mm (`end - start`). */
  length: number;
}

export interface DielinePanelAnnotation {
  id: string;
  shortCode: string;
  printable: boolean;
  /** Center position in blank space: u (left-to-right 0..W), v (bottom-to-top 0..H). */
  u: number;
  v: number;
  widthMm: number;
  heightMm: number;
  /** Readable label angle in degrees: 0, 90, or -90 (180° is normalized to 0° with ↓ arrow). */
  textAngleDeg: number;
  /** Print-direction indicator for printable faces ('↑' | '↓' | ''). */
  arrow: string;
  fontSize: number;
  dimFontSize: number;
  showDimensions: boolean;
}

export interface DielineHoleAnnotation {
  u: number;
  v: number;
  widthMm: number;
  heightMm: number;
}

export interface DielineDimensionPlan {
  blankW: number;
  blankH: number;
  /** Proportional drawing scale (1.0 ≈ 450 mm blank). */
  scale: number;
  xChain: DielineChainSegment[];
  yChain: DielineChainSegment[];
  panels: DielinePanelAnnotation[];
  holes: DielineHoleAnnotation[];
  specLines: [string, string, string];
}

function toBlankU(px: number, solved: SolvedDieline, side: 'outside' | 'inside'): number {
  const b = solved.blankBounds;
  return side === 'outside' ? b.maxX - px : px - b.minX;
}

function toBlankV(py: number, solved: SolvedDieline): number {
  return py - solved.blankBounds.minY;
}

/**
 * Extract uncluttered structural breakpoints along an axis from primary crease lines
 * (weighted by cumulative crease span so full wall folds win over tiny clearance offsets).
 */
function buildAxisChain(
  totalSpan: number,
  candidates: Array<{ pos: number; weight: number }>,
  minGapMm: number,
): DielineChainSegment[] {
  if (totalSpan <= 0.5) return [];

  // Aggregate nearby crease lines within 0.8 mm into exact clusters first.
  const fine: Array<{ pos: number; weight: number }> = [];
  for (const cand of candidates) {
    if (!Number.isFinite(cand.pos) || cand.pos <= 0.8 || cand.pos >= totalSpan - 0.8) continue;
    const hit = fine.find((item) => Math.abs(item.pos - cand.pos) <= 0.8);
    if (hit) {
      hit.pos = (hit.pos * hit.weight + cand.pos * cand.weight) / (hit.weight + cand.weight);
      hit.weight += cand.weight;
    } else {
      fine.push({ pos: cand.pos, weight: cand.weight });
    }
  }

  // Greedily pick strongest structural breakpoints respecting minGapMm so dimension text never overlaps.
  fine.sort((a, b) => b.weight - a.weight);
  const chosen: number[] = [0, totalSpan];
  for (const item of fine) {
    if (chosen.every((existing) => Math.abs(existing - item.pos) >= minGapMm)) {
      chosen.push(item.pos);
    }
  }
  chosen.sort((a, b) => a - b);

  const segments: DielineChainSegment[] = [];
  for (let i = 0; i < chosen.length - 1; i++) {
    const start = chosen[i];
    const end = chosen[i + 1];
    const length = end - start;
    if (length >= 0.5) {
      segments.push({ start, end, length });
    }
  }
  return segments;
}

/**
 * Build the shared CAD engineering dimensioning plan used across 2D Viewport,
 * 1:1 mm SVG, Vector PDF, and AutoCAD DXF R12 exports.
 */
export function buildDielineDimensionPlan(
  solved: SolvedDieline,
  side: 'outside' | 'inside' = 'outside',
): DielineDimensionPlan {
  const b = solved.blankBounds;
  const maxSpan = Math.max(b.width, b.height, 100);
  const scale = clamp(maxSpan / 460, 0.72, 2.3);
  const minChainGapMm = clamp(maxSpan * 0.022, 6, 16);

  const xCandidates: Array<{ pos: number; weight: number }> = [];
  const yCandidates: Array<{ pos: number; weight: number }> = [];

  for (const seg of solved.creaseSegments) {
    const u1 = toBlankU(seg.p1[0], solved, side);
    const v1 = toBlankV(seg.p1[1], solved);
    const u2 = toBlankU(seg.p2[0], solved, side);
    const v2 = toBlankV(seg.p2[1], solved);
    const du = Math.abs(u2 - u1);
    const dv = Math.abs(v2 - v1);
    if (du <= 0.6 && dv >= 8) {
      xCandidates.push({ pos: (u1 + u2) * 0.5, weight: dv });
    } else if (dv <= 0.6 && du >= 8) {
      yCandidates.push({ pos: (v1 + v2) * 0.5, weight: du });
    }
  }

  // Also add detached piece bounds (e.g. 2-piece Rigid Lid & Base gap) as structural Y/X breakpoints.
  for (const panel of solved.flatPanels) {
    if (panel.faceRole === 'base' || panel.faceRole === 'top') {
      const uMin = Math.min(toBlankU(panel.bounds.minX, solved, side), toBlankU(panel.bounds.maxX, solved, side));
      const uMax = Math.max(toBlankU(panel.bounds.minX, solved, side), toBlankU(panel.bounds.maxX, solved, side));
      const vMin = toBlankV(panel.bounds.minY, solved);
      const vMax = toBlankV(panel.bounds.maxY, solved);
      xCandidates.push({ pos: uMin, weight: panel.bounds.height * 0.35 });
      xCandidates.push({ pos: uMax, weight: panel.bounds.height * 0.35 });
      yCandidates.push({ pos: vMin, weight: panel.bounds.width * 0.35 });
      yCandidates.push({ pos: vMax, weight: panel.bounds.width * 0.35 });
    }
  }

  const xChain = buildAxisChain(b.width, xCandidates, minChainGapMm);
  const yChain = buildAxisChain(b.height, yCandidates, minChainGapMm);

  const panels: DielinePanelAnnotation[] = [];
  for (const p of solved.flatPanels) {
    const pw = p.bounds.width;
    const ph = p.bounds.height;
    if (Math.max(pw, ph) < 14 || Math.min(pw, ph) < 6) continue;

    const u = toBlankU(p.centroid[0], solved, side);
    const v = toBlankV(p.centroid[1], solved);

    // Normalize 180° to readable upright 0° while preserving print direction arrow (↑ vs ↓).
    const rawRot = side === 'outside' ? p.uprightAngleDeg : 0;
    const normRot = ((rawRot % 360) + 360) % 360;
    let textAngleDeg = 0;
    let arrow = p.printable ? ' ↑' : '';
    if (normRot === 180) {
      textAngleDeg = 0;
      arrow = p.printable ? ' ↓' : '';
    } else if (normRot === 90) {
      textAngleDeg = ph >= pw * 1.15 ? 90 : 0;
    } else if (normRot === 270) {
      textAngleDeg = ph >= pw * 1.15 ? -90 : 0;
    } else if (ph > pw * 2.1 && pw < 42) {
      // Very tall narrow vertical panel (e.g. side glue tab) reads cleaner vertically.
      textAngleDeg = -90;
    }

    const rotated90 = Math.abs(textAngleDeg) === 90;
    const alongSpan = rotated90 ? ph : pw;
    const acrossSpan = rotated90 ? pw : ph;

    const labelText = `${p.shortCode}${arrow}`;
    const dimText = `${fmt(pw)}×${fmt(ph)} mm`;
    const fontSize = clamp(
      Math.min(acrossSpan * 0.24, alongSpan / Math.max(4.5, labelText.length * 0.65), 11 * scale),
      3.4,
      11.5 * scale,
    );
    const dimFontSize = clamp(
      Math.min(fontSize * 0.78, alongSpan / Math.max(8, dimText.length * 0.58)),
      2.9,
      8.2 * scale,
    );
    const showDimensions = alongSpan >= 20 && acrossSpan >= 13;

    panels.push({
      id: p.id,
      shortCode: p.shortCode,
      printable: p.printable,
      u,
      v,
      widthMm: pw,
      heightMm: ph,
      textAngleDeg,
      arrow,
      fontSize,
      dimFontSize,
      showDimensions,
    });
  }

  const holes: DielineHoleAnnotation[] = [];
  for (const loop of solved.holeLoops) {
    if (loop.length < 3) continue;
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const pt of loop) {
      const pu = toBlankU(pt[0], solved, side);
      const pv = toBlankV(pt[1], solved);
      if (pu < minU) minU = pu;
      if (pu > maxU) maxU = pu;
      if (pv < minV) minV = pv;
      if (pv > maxV) maxV = pv;
    }
    const widthMm = maxU - minU;
    const heightMm = maxV - minV;
    if (Math.max(widthMm, heightMm) >= 12) {
      holes.push({
        u: (minU + maxU) * 0.5,
        v: (minV + maxV) * 0.5,
        widthMm,
        heightMm,
      });
    }
  }

  const areaStr = solved.blankAreaM2.toFixed(3);
  const specLine1 = `HyperMockup CAD Dieline (1:1 mm) | ${solved.templateCode} ${solved.templateName} | ${side.toUpperCase()} PRINT VIEW`;
  const specLine2 = `Inner: ${fmt(solved.innerMm.length)}x${fmt(solved.innerMm.width)}x${fmt(solved.innerMm.height)} mm | Outer: ${fmt(solved.outerMm.length)}x${fmt(solved.outerMm.width)}x${fmt(solved.outerMm.height)} mm | Blank: ${fmt(b.width)}x${fmt(b.height)} mm (${areaStr} m2, ~${fmt(solved.estimatedWeightG)} g)`;
  const specLine3 = `Board: ${solved.material.shortName} (t=${fmtExact(solved.params.thicknessMm)} mm, ${solved.params.fluteDirection}) | Bleed: ${fmt(solved.params.bleedMm)} mm | Clearance: ${fmtExact(solved.params.slotClearanceMm)} mm | RED=Cut GREEN=Crease BLUE=Bleed`;

  return {
    blankW: b.width,
    blankH: b.height,
    scale,
    xChain,
    yChain,
    panels,
    holes,
    specLines: [specLine1, specLine2, specLine3],
  };
}

export interface DielineSvgOptions {
  side?: 'outside' | 'inside';
  marginMm?: number;
  includeDimensions?: boolean;
  includeLabels?: boolean;
  includeBleed?: boolean;
  includeFill?: boolean;
  highlightPartGroup?: string | null;
}

/**
 * Generate a 1:1 physical millimetre SVG dieline (ready for Adobe Illustrator, Inkscape,
 * CorelDRAW, and our interactive 2D Dieline Editor overlay) with full engineering
 * chain dimensions, per-panel W×H mm readouts, cutout dimensions, and specification block.
 */
export function exportDielineSvg(solved: SolvedDieline, options: DielineSvgOptions = {}): string {
  const side = options.side ?? 'outside';
  const includeDimensions = options.includeDimensions ?? true;
  const includeLabels = options.includeLabels ?? true;
  const includeBleed = options.includeBleed ?? true;
  const includeFill = options.includeFill ?? true;
  const bleed = Math.max(0, solved.params.bleedMm);

  const plan = buildDielineDimensionPlan(solved, side);
  const sc = plan.scale;
  const baseMargin = options.marginMm ?? (includeDimensions ? Math.round(32 * sc) : 14);
  const marginLeft = includeDimensions ? Math.max(baseMargin, Math.round(32 * sc)) : baseMargin;
  const marginTop = includeDimensions ? Math.max(baseMargin, Math.round(30 * sc)) : baseMargin;
  const marginRight = Math.max(14, bleed + Math.round(10 * sc));
  const footerHeight = includeDimensions ? Math.round(28 * sc) : 0;
  const marginBottom = Math.max(12, bleed + 8) + footerHeight;

  const sheetW = plan.blankW + marginLeft + marginRight;
  const sheetH = plan.blankH + marginTop + marginBottom;

  const mapPt = (pt: Point2D): [number, number] => [
    marginLeft + toBlankU(pt[0], solved, side),
    marginTop + (plan.blankH - toBlankV(pt[1], solved)),
  ];

  const polyPath = (pts: readonly Point2D[]) =>
    pts
      .map((pt, i) => {
        const [x, y] = mapPt(pt);
        return `${i === 0 ? 'M' : 'L'}${fmtExact(x)} ${fmtExact(y)}`;
      })
      .join(' ') + ' Z';

  const fillLayer = includeFill
    ? solved.flatPanels
        .map((panel) => {
          const isHi = options.highlightPartGroup && panel.partGroup === options.highlightPartGroup;
          const fill = isHi
            ? 'rgba(37, 99, 235, 0.22)'
            : side === 'outside'
              ? solved.params.outsideColor
              : solved.params.insideColor;
          const opacity = isHi ? '1' : '0.32';
          const d = [polyPath(panel.outline), ...panel.holes.map(polyPath)].join(' ');
          return `    <path data-panel-id="${escapeXml(panel.id)}" d="${d}" fill="${escapeXml(fill)}" fill-opacity="${opacity}" fill-rule="evenodd" stroke="none"/>`;
        })
        .join('\n')
    : '';

  const cutStroke = fmtExact(clamp(0.55 * sc, 0.45, 1.1));
  const creaseStroke = fmtExact(clamp(0.5 * sc, 0.4, 1.0));
  const dimStroke = fmtExact(clamp(0.38 * sc, 0.3, 0.8));

  const cutPaths = [
    ...solved.cutLoops.map((loop) => `    <path d="${polyPath(loop)}"/>`),
    ...solved.holeLoops.map((loop) => `    <path d="${polyPath(loop)}"/>`),
  ].join('\n');

  const creaseLines = solved.creaseSegments
    .map((seg) => {
      const [x1, y1] = mapPt(seg.p1);
      const [x2, y2] = mapPt(seg.p2);
      return `    <line x1="${fmtExact(x1)}" y1="${fmtExact(y1)}" x2="${fmtExact(x2)}" y2="${fmtExact(y2)}"/>`;
    })
    .join('\n');

  const bleedRect = includeBleed && bleed > 0
    ? `  <g id="Bleed" fill="none" stroke="#2563eb" stroke-width="${fmtExact(clamp(0.38 * sc, 0.3, 0.8))}" stroke-dasharray="${fmt(2.6 * sc)} ${fmt(2 * sc)}">
    <rect x="${fmtExact(marginLeft - bleed)}" y="${fmtExact(marginTop - bleed)}" width="${fmtExact(plan.blankW + bleed * 2)}" height="${fmtExact(plan.blankH + bleed * 2)}" rx="1"/>
  </g>`
    : '';

  const labelLayer = includeLabels
    ? `  <g id="Labels" font-family="Arial, Helvetica, sans-serif" text-anchor="middle" dominant-baseline="middle" fill="#1e293b">
${plan.panels
  .map((p) => {
    const cx = marginLeft + p.u;
    const cy = marginTop + (plan.blankH - p.v);
    const transform = p.textAngleDeg !== 0 ? ` transform="rotate(${fmt(p.textAngleDeg)} ${fmtExact(cx)} ${fmtExact(cy)})"` : '';
    if (includeDimensions && p.showDimensions) {
      const lineGap = p.fontSize * 0.62;
      return `    <g${transform}>
      <text x="${fmtExact(cx)}" y="${fmtExact(cy - lineGap * 0.72)}" font-size="${fmt(p.fontSize)}" font-weight="700" fill="#1e293b">${escapeXml(p.shortCode + p.arrow)}</text>
      <text x="${fmtExact(cx)}" y="${fmtExact(cy + lineGap * 0.92)}" font-size="${fmt(p.dimFontSize)}" font-weight="600" fill="#0369a1">${escapeXml(`${fmt(p.widthMm)} × ${fmt(p.heightMm)} mm`)}</text>
    </g>`;
    }
    return `    <text x="${fmtExact(cx)}" y="${fmtExact(cy)}" font-size="${fmt(p.fontSize)}" font-weight="700"${transform}>${escapeXml(p.shortCode + p.arrow)}</text>`;
  })
  .join('\n')}
  </g>`
    : '';

  const dimLayer = includeDimensions
    ? (() => {
        const bw = plan.blankW;
        const bh = plan.blankH;
        const tick = 2.4 * sc;
        const extGap = Math.max(bleed + 2.5, 4 * sc);
        const dimFont = clamp(5.8 * sc, 4.4, 11.5);
        const chainFont = clamp(4.8 * sc, 3.8, 9.5);
        const specFont = clamp(4.5 * sc, 3.6, 8.2);

        const topChainY = marginTop - 10.5 * sc;
        const topTotalY = marginTop - 21.5 * sc;
        const leftChainX = marginLeft - 10.5 * sc;
        const leftTotalX = marginLeft - 21.5 * sc;

        const elems: string[] = [];

        // Helper for 45° architectural CAD tick at (x, y)
        const archTick = (x: number, y: number) =>
          `    <line x1="${fmtExact(x - tick * 0.75)}" y1="${fmtExact(y + tick * 0.75)}" x2="${fmtExact(x + tick * 0.75)}" y2="${fmtExact(y - tick * 0.75)}" stroke="#0f172a" stroke-width="${fmtExact(clamp(0.5 * sc, 0.4, 1.0))}"/>`;

        // --- TOP OUTER TOTAL BLANK WIDTH ---
        elems.push(
          `    <line x1="${fmtExact(marginLeft)}" y1="${fmtExact(marginTop - extGap)}" x2="${fmtExact(marginLeft)}" y2="${fmtExact(topTotalY - tick)}" stroke-dasharray="1.5 1.2" opacity="0.65"/>`,
          `    <line x1="${fmtExact(marginLeft + bw)}" y1="${fmtExact(marginTop - extGap)}" x2="${fmtExact(marginLeft + bw)}" y2="${fmtExact(topTotalY - tick)}" stroke-dasharray="1.5 1.2" opacity="0.65"/>`,
          `    <line x1="${fmtExact(marginLeft)}" y1="${fmtExact(topTotalY)}" x2="${fmtExact(marginLeft + bw)}" y2="${fmtExact(topTotalY)}" stroke="#0f172a"/>`,
          archTick(marginLeft, topTotalY),
          archTick(marginLeft + bw, topTotalY),
          `    <text x="${fmtExact(marginLeft + bw * 0.5)}" y="${fmtExact(topTotalY - 2.4 * sc)}" stroke="none" fill="#0f172a" font-size="${fmt(dimFont)}" font-weight="700" text-anchor="middle">Total Blank W: ${fmt(bw)} mm</text>`,
        );

        // --- TOP INNER X-CHAIN SEGMENT DIMENSIONS ---
        if (plan.xChain.length > 1) {
          elems.push(
            `    <line x1="${fmtExact(marginLeft)}" y1="${fmtExact(topChainY)}" x2="${fmtExact(marginLeft + bw)}" y2="${fmtExact(topChainY)}" stroke="#0369a1"/>`,
          );
          const xBreaks = [0, ...plan.xChain.map((seg) => seg.end)];
          for (const bx of xBreaks) {
            const sx = marginLeft + bx;
            elems.push(
              `    <line x1="${fmtExact(sx)}" y1="${fmtExact(marginTop - extGap * 0.5)}" x2="${fmtExact(sx)}" y2="${fmtExact(topChainY - tick * 0.8)}" stroke="#64748b" stroke-dasharray="1.5 1.2" opacity="0.55"/>`,
              archTick(sx, topChainY),
            );
          }
          plan.xChain.forEach((seg, idx) => {
            const midX = marginLeft + (seg.start + seg.end) * 0.5;
            const stagger = seg.length < 28 * sc && idx % 2 === 1 ? -4.2 * sc : 0;
            elems.push(
              `    <text x="${fmtExact(midX)}" y="${fmtExact(topChainY - 2.2 * sc + stagger)}" stroke="none" fill="#0369a1" font-size="${fmt(chainFont)}" font-weight="600" text-anchor="middle">${fmt(seg.length)}</text>`,
            );
          });
        }

        // --- LEFT OUTER TOTAL BLANK HEIGHT ---
        elems.push(
          `    <line x1="${fmtExact(marginLeft - extGap)}" y1="${fmtExact(marginTop)}" x2="${fmtExact(leftTotalX - tick)}" y2="${fmtExact(marginTop)}" stroke-dasharray="1.5 1.2" opacity="0.65"/>`,
          `    <line x1="${fmtExact(marginLeft - extGap)}" y1="${fmtExact(marginTop + bh)}" x2="${fmtExact(leftTotalX - tick)}" y2="${fmtExact(marginTop + bh)}" stroke-dasharray="1.5 1.2" opacity="0.65"/>`,
          `    <line x1="${fmtExact(leftTotalX)}" y1="${fmtExact(marginTop)}" x2="${fmtExact(leftTotalX)}" y2="${fmtExact(marginTop + bh)}" stroke="#0f172a"/>`,
          archTick(leftTotalX, marginTop),
          archTick(leftTotalX, marginTop + bh),
          `    <text x="${fmtExact(leftTotalX - 2.8 * sc)}" y="${fmtExact(marginTop + bh * 0.5)}" stroke="none" fill="#0f172a" font-size="${fmt(dimFont)}" font-weight="700" text-anchor="middle" transform="rotate(-90 ${fmtExact(leftTotalX - 2.8 * sc)} ${fmtExact(marginTop + bh * 0.5)})">Total Blank H: ${fmt(bh)} mm</text>`,
        );

        // --- LEFT INNER Y-CHAIN SEGMENT DIMENSIONS ---
        if (plan.yChain.length > 1) {
          elems.push(
            `    <line x1="${fmtExact(leftChainX)}" y1="${fmtExact(marginTop)}" x2="${fmtExact(leftChainX)}" y2="${fmtExact(marginTop + bh)}" stroke="#0369a1"/>`,
          );
          const yBreaks = [0, ...plan.yChain.map((seg) => seg.end)];
          for (const by of yBreaks) {
            const sy = marginTop + (bh - by);
            elems.push(
              `    <line x1="${fmtExact(marginLeft - extGap * 0.5)}" y1="${fmtExact(sy)}" x2="${fmtExact(leftChainX - tick * 0.8)}" y2="${fmtExact(sy)}" stroke="#64748b" stroke-dasharray="1.5 1.2" opacity="0.55"/>`,
              archTick(leftChainX, sy),
            );
          }
          plan.yChain.forEach((seg, idx) => {
            const midY = marginTop + (bh - (seg.start + seg.end) * 0.5);
            const stagger = seg.length < 28 * sc && idx % 2 === 1 ? -4.2 * sc : 0;
            const tx = leftChainX - 2.2 * sc + stagger;
            elems.push(
              `    <text x="${fmtExact(tx)}" y="${fmtExact(midY)}" stroke="none" fill="#0369a1" font-size="${fmt(chainFont)}" font-weight="600" text-anchor="middle" transform="rotate(-90 ${fmtExact(tx)} ${fmtExact(midY)})">${fmt(seg.length)}</text>`,
            );
          });
        }

        // --- CUTOUT / HOLE DIMENSION CALLOUTS ---
        for (const hole of plan.holes) {
          const hx = marginLeft + hole.u;
          const hy = marginTop + (bh - hole.v);
          const ch = 2.2 * sc;
          const hFont = clamp(3.6 * sc, 3.0, 6.8);
          elems.push(
            `    <line x1="${fmtExact(hx - ch)}" y1="${fmtExact(hy)}" x2="${fmtExact(hx + ch)}" y2="${fmtExact(hy)}" stroke="#be123c" opacity="0.7"/>`,
            `    <line x1="${fmtExact(hx)}" y1="${fmtExact(hy - ch)}" x2="${fmtExact(hx)}" y2="${fmtExact(hy + ch)}" stroke="#be123c" opacity="0.7"/>`,
            `    <text x="${fmtExact(hx)}" y="${fmtExact(hy - (hole.heightMm * 0.5 + 2.2 * sc))}" stroke="none" fill="#be123c" font-size="${fmt(hFont)}" font-weight="600" text-anchor="middle">${fmt(hole.widthMm)}×${fmt(hole.heightMm)}</text>`,
          );
        }

        // --- ENGINEERING SPECIFICATION TITLE BLOCK (FOOTER) ---
        const boxTop = marginTop + bh + Math.max(bleed + 6, 8 * sc);
        const boxH = 21 * sc;
        const padX = 5 * sc;
        elems.push(
          `    <rect x="${fmtExact(marginLeft)}" y="${fmtExact(boxTop)}" width="${fmtExact(bw)}" height="${fmtExact(boxH)}" rx="${fmt(2 * sc)}" fill="#f8fafc" stroke="#cbd5e1" stroke-width="${dimStroke}"/>`,
          `    <text x="${fmtExact(marginLeft + padX)}" y="${fmtExact(boxTop + 6.2 * sc)}" stroke="none" fill="#0f172a" font-size="${fmt(specFont * 1.08)}" font-weight="700">${escapeXml(plan.specLines[0])}</text>`,
          `    <text x="${fmtExact(marginLeft + padX)}" y="${fmtExact(boxTop + 12.6 * sc)}" stroke="none" fill="#334155" font-size="${fmt(specFont)}">${escapeXml(plan.specLines[1])}</text>`,
          `    <text x="${fmtExact(marginLeft + padX)}" y="${fmtExact(boxTop + 18.2 * sc)}" stroke="none" fill="#475569" font-size="${fmt(specFont * 0.92)}">${escapeXml(plan.specLines[2])}</text>`,
        );

        return `  <g id="Dimensions" font-family="Arial, Helvetica, sans-serif" fill="#475569" stroke="#64748b" stroke-width="${dimStroke}">\n${elems.join('\n')}\n  </g>`;
      })()
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${fmtExact(sheetW)}mm" height="${fmtExact(sheetH)}mm" viewBox="0 0 ${fmtExact(sheetW)} ${fmtExact(sheetH)}">
  <title>${escapeXml(solved.templateCode)} — ${escapeXml(solved.templateName)} (${fmt(solved.params.lengthMm)}x${fmt(solved.params.widthMm)}x${fmt(solved.params.heightMm)} mm)</title>
  <g id="BoardFill">
${fillLayer}
  </g>
${bleedRect}
  <g id="Cut" fill="none" stroke="#e11d48" stroke-width="${cutStroke}" stroke-linejoin="round">
${cutPaths}
  </g>
  <g id="Crease" fill="none" stroke="#059669" stroke-width="${creaseStroke}" stroke-dasharray="${fmt(3.5 * sc)} ${fmt(2 * sc)}">
${creaseLines}
  </g>
${labelLayer}
${dimLayer}
</svg>`;
}

/**
 * Generate an industry-standard AutoCAD DXF R12 file in exact millimetres ($INSUNITS = 4)
 * with separated CUT (ACI 1 red), CREASE (ACI 3 green), DIMENSIONS (ACI 8 gray),
 * and LABELS (ACI 7) layers so CNC plotters & CAD tools can toggle annotations cleanly.
 */
export function exportDielineDxf(solved: SolvedDieline, side: 'outside' | 'inside' = 'outside'): string {
  const plan = buildDielineDimensionPlan(solved, side);
  const sc = plan.scale;
  const mapPt = (pt: Point2D): [number, number] => [
    toBlankU(pt[0], solved, side),
    toBlankV(pt[1], solved),
  ];

  const lines: string[] = [
    '0', 'SECTION',
    '2', 'HEADER',
    '9', '$ACADVER', '1', 'AC1009',
    '9', '$INSUNITS', '70', '4', // 4 = Millimetres
    '0', 'ENDSEC',
    '0', 'SECTION',
    '2', 'TABLES',
    '0', 'TABLE', '2', 'LAYER', '70', '4',
    '0', 'LAYER', '2', 'CUT', '70', '0', '62', '1', '6', 'CONTINUOUS',
    '0', 'LAYER', '2', 'CREASE', '70', '0', '62', '3', '6', 'DASHED',
    '0', 'LAYER', '2', 'DIMENSIONS', '70', '0', '62', '8', '6', 'CONTINUOUS',
    '0', 'LAYER', '2', 'LABELS', '70', '0', '62', '7', '6', 'CONTINUOUS',
    '0', 'ENDTAB',
    '0', 'ENDSEC',
    '0', 'SECTION',
    '2', 'ENTITIES',
  ];

  const pushLine = (layer: 'CUT' | 'CREASE' | 'DIMENSIONS', x1: number, y1: number, x2: number, y2: number) => {
    lines.push(
      '0', 'LINE',
      '8', layer,
      '10', fmtExact(x1), '20', fmtExact(y1), '30', '0',
      '11', fmtExact(x2), '21', fmtExact(y2), '31', '0',
    );
  };

  const pushText = (layer: 'DIMENSIONS' | 'LABELS', x: number, y: number, height: number, text: string, rotationDeg = 0) => {
    const clean = text.replace(/[^\x20-\x7E]/g, ' ');
    lines.push(
      '0', 'TEXT',
      '8', layer,
      '10', fmtExact(x), '20', fmtExact(y), '30', '0',
      '40', fmtExact(height),
      '1', clean,
      '50', fmtExact(rotationDeg),
    );
  };

  for (const loop of [...solved.cutLoops, ...solved.holeLoops]) {
    for (let i = 0; i < loop.length; i++) {
      const [x1, y1] = mapPt(loop[i]);
      const [x2, y2] = mapPt(loop[(i + 1) % loop.length]);
      pushLine('CUT', x1, y1, x2, y2);
    }
  }

  for (const seg of solved.creaseSegments) {
    const [x1, y1] = mapPt(seg.p1);
    const [x2, y2] = mapPt(seg.p2);
    pushLine('CREASE', x1, y1, x2, y2);
  }

  // DXF DIMENSIONS layer: outer blank W/H + X/Y chain segments
  const bw = plan.blankW;
  const bh = plan.blankH;
  const tick = 2.4 * sc;
  const topChainY = bh + 11 * sc;
  const topTotalY = bh + 22 * sc;
  const leftChainX = -11 * sc;
  const leftTotalX = -22 * sc;
  const dimTextH = clamp(4.8 * sc, 3.6, 9.0);

  // Total Blank W
  pushLine('DIMENSIONS', 0, bh + 3 * sc, 0, topTotalY + tick);
  pushLine('DIMENSIONS', bw, bh + 3 * sc, bw, topTotalY + tick);
  pushLine('DIMENSIONS', 0, topTotalY, bw, topTotalY);
  pushLine('DIMENSIONS', -tick, topTotalY - tick, tick, topTotalY + tick);
  pushLine('DIMENSIONS', bw - tick, topTotalY - tick, bw + tick, topTotalY + tick);
  pushText('DIMENSIONS', bw * 0.5 - 24 * sc, topTotalY + 2.5 * sc, dimTextH, `BLANK W: ${fmt(bw)} mm`);

  // Horizontal X-chain
  if (plan.xChain.length > 1) {
    pushLine('DIMENSIONS', 0, topChainY, bw, topChainY);
    for (const bx of [0, ...plan.xChain.map((s) => s.end)]) {
      pushLine('DIMENSIONS', bx, bh + 2 * sc, bx, topChainY + tick);
      pushLine('DIMENSIONS', bx - tick * 0.7, topChainY - tick * 0.7, bx + tick * 0.7, topChainY + tick * 0.7);
    }
    for (const seg of plan.xChain) {
      pushText('DIMENSIONS', (seg.start + seg.end) * 0.5 - 6 * sc, topChainY + 2 * sc, dimTextH * 0.85, `${fmt(seg.length)}`);
    }
  }

  // Total Blank H
  pushLine('DIMENSIONS', -3 * sc, 0, leftTotalX - tick, 0);
  pushLine('DIMENSIONS', -3 * sc, bh, leftTotalX - tick, bh);
  pushLine('DIMENSIONS', leftTotalX, 0, leftTotalX, bh);
  pushLine('DIMENSIONS', leftTotalX - tick, -tick, leftTotalX + tick, tick);
  pushLine('DIMENSIONS', leftTotalX - tick, bh - tick, leftTotalX + tick, bh + tick);
  pushText('DIMENSIONS', leftTotalX - 3 * sc, bh * 0.5 - 20 * sc, dimTextH, `BLANK H: ${fmt(bh)} mm`, 90);

  // Vertical Y-chain
  if (plan.yChain.length > 1) {
    pushLine('DIMENSIONS', leftChainX, 0, leftChainX, bh);
    for (const by of [0, ...plan.yChain.map((s) => s.end)]) {
      pushLine('DIMENSIONS', -2 * sc, by, leftChainX - tick, by);
      pushLine('DIMENSIONS', leftChainX - tick * 0.7, by - tick * 0.7, leftChainX + tick * 0.7, by + tick * 0.7);
    }
    for (const seg of plan.yChain) {
      pushText('DIMENSIONS', leftChainX - 2.5 * sc, (seg.start + seg.end) * 0.5 - 5 * sc, dimTextH * 0.85, `${fmt(seg.length)}`, 90);
    }
  }

  // Panel codes + WxH mm on LABELS layer
  for (const p of plan.panels) {
    const rot = p.textAngleDeg === 90 ? -90 : p.textAngleDeg === -90 ? 90 : 0;
    const labelStr = p.showDimensions ? `${p.shortCode} (${fmt(p.widthMm)}x${fmt(p.heightMm)})` : p.shortCode;
    pushText('LABELS', p.u - p.fontSize * 1.8, p.v - p.fontSize * 0.35, p.fontSize * 0.75, labelStr, rot);
  }

  // Engineering spec lines below the blank
  pushText('DIMENSIONS', 0, -10 * sc, dimTextH * 0.82, plan.specLines[0]);
  pushText('DIMENSIONS', 0, -17 * sc, dimTextH * 0.76, plan.specLines[1]);
  pushText('DIMENSIONS', 0, -23 * sc, dimTextH * 0.7, plan.specLines[2]);

  lines.push('0', 'ENDSEC', '0', 'EOF');
  return lines.join('\r\n') + '\r\n';
}

function pdfEscape(str: string): string {
  return str
    .replace(/[^\x20-\x7E]/g, ' ')
    .replaceAll('\\', '\\\\')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)');
}

/**
 * Generate a true 1:1 physical millimetre Vector PDF 1.4 document with zero dependencies.
 * Emits exact Cut, Crease, Bleed, Outer & Chain Dimension lines, Per-Panel W×H mm labels,
 * Cutout measurements, and a full CAD specification block in points (`1 mm = 72/25.4 pt`).
 */
export function exportDielinePdf(solved: SolvedDieline, side: 'outside' | 'inside' = 'outside'): Uint8Array {
  const plan = buildDielineDimensionPlan(solved, side);
  const sc = plan.scale;
  const bleed = Math.max(0, solved.params.bleedMm);

  const marginLeftMm = Math.round(34 * sc);
  const marginRightMm = Math.max(16, bleed + Math.round(12 * sc));
  const marginTopMm = Math.round(32 * sc);
  const footerMm = Math.round(28 * sc);
  const marginBottomMm = Math.max(14, bleed + 8) + footerMm;

  const pageWmm = plan.blankW + marginLeftMm + marginRightMm;
  const pageHmm = plan.blankH + marginTopMm + marginBottomMm;
  const pageWpt = pageWmm * MM_TO_PT;
  const pageHpt = pageHmm * MM_TO_PT;

  // PDF origin is bottom-left (+Y upward).
  const ptU = (uMm: number) => (marginLeftMm + uMm) * MM_TO_PT;
  const ptV = (vMm: number) => (marginBottomMm + vMm) * MM_TO_PT;
  const toPdf = (pt: Point2D): [number, number] => [
    ptU(toBlankU(pt[0], solved, side)),
    ptV(toBlankV(pt[1], solved)),
  ];

  const ops: string[] = [];

  const drawText = (xPt: number, yPt: number, fontPt: number, text: string, centered = false, rotate90CCW = false) => {
    const safe = pdfEscape(text);
    const approxWidth = safe.length * fontPt * 0.52;
    if (rotate90CCW) {
      const startY = centered ? yPt - approxWidth * 0.5 : yPt;
      ops.push(`BT /F1 ${fmtExact(fontPt)} Tf 0 1 -1 0 ${fmtExact(xPt)} ${fmtExact(startY)} Tm (${safe}) Tj ET`);
    } else {
      const startX = centered ? xPt - approxWidth * 0.5 : xPt;
      ops.push(`BT /F1 ${fmtExact(fontPt)} Tf 1 0 0 1 ${fmtExact(startX)} ${fmtExact(yPt)} Tm (${safe}) Tj ET`);
    }
  };

  // Bleed box (Blue dashed)
  if (bleed > 0) {
    const bx = ptU(-bleed);
    const by = ptV(-bleed);
    const bw = (plan.blankW + bleed * 2) * MM_TO_PT;
    const bh = (plan.blankH + bleed * 2) * MM_TO_PT;
    ops.push('q 0.145 0.388 0.922 RG 0.65 w [4 3] 0 d');
    ops.push(`${fmtExact(bx)} ${fmtExact(by)} ${fmtExact(bw)} ${fmtExact(bh)} re S Q`);
  }

  // Cut loops & holes (Red solid)
  ops.push(`q 0.882 0.114 0.282 RG ${fmtExact(clamp(0.95 * sc, 0.8, 1.8))} w [] 0 d 1 j`);
  for (const loop of [...solved.cutLoops, ...solved.holeLoops]) {
    if (loop.length < 2) continue;
    loop.forEach((pt, idx) => {
      const [x, y] = toPdf(pt);
      ops.push(`${fmtExact(x)} ${fmtExact(y)} ${idx === 0 ? 'm' : 'l'}`);
    });
    ops.push('h S');
  }
  ops.push('Q');

  // Crease lines (Green dashed)
  ops.push(`q 0.02 0.588 0.412 RG ${fmtExact(clamp(0.8 * sc, 0.65, 1.5))} w [5 3] 0 d`);
  for (const seg of solved.creaseSegments) {
    const [x1, y1] = toPdf(seg.p1);
    const [x2, y2] = toPdf(seg.p2);
    ops.push(`${fmtExact(x1)} ${fmtExact(y1)} m ${fmtExact(x2)} ${fmtExact(y2)} l S`);
  }
  ops.push('Q');

  // Detailed CAD Dimensions (Outer Total W/H + X/Y Chain Lines)
  const tickPt = 2.4 * sc * MM_TO_PT;
  const extGapMm = Math.max(bleed + 2.5, 4 * sc);
  const topChainV = plan.blankH + 10.5 * sc;
  const topTotalV = plan.blankH + 21.5 * sc;
  const leftChainU = -10.5 * sc;
  const leftTotalU = -21.5 * sc;
  const dimFontPt = clamp(5.5 * sc * MM_TO_PT, 10, 26);
  const chainFontPt = clamp(4.6 * sc * MM_TO_PT, 8.5, 22);

  const pushTick = (xPt: number, yPt: number) => {
    ops.push(`${fmtExact(xPt - tickPt * 0.7)} ${fmtExact(yPt - tickPt * 0.7)} m ${fmtExact(xPt + tickPt * 0.7)} ${fmtExact(yPt + tickPt * 0.7)} l S`);
  };

  // Outer Total Blank W & H (Dark Slate)
  ops.push('q 0.06 0.09 0.16 RG 0.06 0.09 0.16 rg 0.7 w [] 0 d');
  ops.push(`${fmtExact(ptU(0))} ${fmtExact(ptV(topTotalV))} m ${fmtExact(ptU(plan.blankW))} ${fmtExact(ptV(topTotalV))} l S`);
  pushTick(ptU(0), ptV(topTotalV));
  pushTick(ptU(plan.blankW), ptV(topTotalV));
  drawText(ptU(plan.blankW * 0.5), ptV(topTotalV + 2.2 * sc), dimFontPt, `Total Blank W: ${fmt(plan.blankW)} mm`, true, false);

  ops.push(`${fmtExact(ptU(leftTotalU))} ${fmtExact(ptV(0))} m ${fmtExact(ptU(leftTotalU))} ${fmtExact(ptV(plan.blankH))} l S`);
  pushTick(ptU(leftTotalU), ptV(0));
  pushTick(ptU(leftTotalU), ptV(plan.blankH));
  drawText(ptU(leftTotalU - 2.6 * sc), ptV(plan.blankH * 0.5), dimFontPt, `Total Blank H: ${fmt(plan.blankH)} mm`, true, true);
  ops.push('Q');

  // Extension lines (Subtle Gray Dashed)
  ops.push('q 0.45 0.5 0.58 RG 0.45 w [3 2] 0 d');
  for (const bx of [0, ...plan.xChain.map((s) => s.end)]) {
    const topEnd = bx === 0 || Math.abs(bx - plan.blankW) < 0.1 ? topTotalV + 2 * sc : topChainV + 2 * sc;
    ops.push(`${fmtExact(ptU(bx))} ${fmtExact(ptV(plan.blankH + extGapMm * 0.5))} m ${fmtExact(ptU(bx))} ${fmtExact(ptV(topEnd))} l S`);
  }
  for (const by of [0, ...plan.yChain.map((s) => s.end)]) {
    const leftEnd = by === 0 || Math.abs(by - plan.blankH) < 0.1 ? leftTotalU - 2 * sc : leftChainU - 2 * sc;
    ops.push(`${fmtExact(ptU(-extGapMm * 0.5))} ${fmtExact(ptV(by))} m ${fmtExact(ptU(leftEnd))} ${fmtExact(ptV(by))} l S`);
  }
  ops.push('Q');

  // Chain lines & numbers (Technical Blue)
  ops.push('q 0.012 0.412 0.631 RG 0.012 0.412 0.631 rg 0.65 w [] 0 d');
  if (plan.xChain.length > 1) {
    ops.push(`${fmtExact(ptU(0))} ${fmtExact(ptV(topChainV))} m ${fmtExact(ptU(plan.blankW))} ${fmtExact(ptV(topChainV))} l S`);
    for (const bx of [0, ...plan.xChain.map((s) => s.end)]) pushTick(ptU(bx), ptV(topChainV));
    plan.xChain.forEach((seg, idx) => {
      const stagger = seg.length < 28 * sc && idx % 2 === 1 ? 4.2 * sc : 0;
      drawText(ptU((seg.start + seg.end) * 0.5), ptV(topChainV + 2.0 * sc + stagger), chainFontPt, fmt(seg.length), true, false);
    });
  }
  if (plan.yChain.length > 1) {
    ops.push(`${fmtExact(ptU(leftChainU))} ${fmtExact(ptV(0))} m ${fmtExact(ptU(leftChainU))} ${fmtExact(ptV(plan.blankH))} l S`);
    for (const by of [0, ...plan.yChain.map((s) => s.end)]) pushTick(ptU(leftChainU), ptV(by));
    plan.yChain.forEach((seg, idx) => {
      const stagger = seg.length < 28 * sc && idx % 2 === 1 ? -4.2 * sc : 0;
      drawText(ptU(leftChainU - 2.2 * sc + stagger), ptV((seg.start + seg.end) * 0.5), chainFontPt, fmt(seg.length), true, true);
    });
  }
  ops.push('Q');

  // Per-panel shortCodes & W×H mm labels
  ops.push('q');
  for (const p of plan.panels) {
    const rot90 = Math.abs(p.textAngleDeg) === 90;
    const fPt = clamp(p.fontSize * MM_TO_PT * 0.78, 7, 22);
    const dfPt = clamp(p.dimFontSize * MM_TO_PT * 0.76, 6, 17);
    const cx = ptU(p.u);
    const cy = ptV(p.v);
    ops.push('0.12 0.16 0.23 rg');
    if (p.showDimensions) {
      if (rot90) {
        drawText(cx - fPt * 0.55, cy, fPt, p.shortCode, true, true);
        ops.push('0.012 0.412 0.631 rg');
        drawText(cx + dfPt * 0.75, cy, dfPt, `${fmt(p.widthMm)}x${fmt(p.heightMm)} mm`, true, true);
      } else {
        drawText(cx, cy + fPt * 0.35, fPt, p.shortCode, true, false);
        ops.push('0.012 0.412 0.631 rg');
        drawText(cx, cy - dfPt * 0.95, dfPt, `${fmt(p.widthMm)}x${fmt(p.heightMm)} mm`, true, false);
      }
    } else {
      drawText(cx, cy - fPt * 0.3, fPt, p.shortCode, true, rot90);
    }
  }
  // Hole dimensions
  ops.push('0.745 0.071 0.235 rg');
  for (const hole of plan.holes) {
    const hfPt = clamp(3.6 * sc * MM_TO_PT, 6.5, 14);
    drawText(ptU(hole.u), ptV(hole.v + hole.heightMm * 0.5 + 2.2 * sc), hfPt, `${fmt(hole.widthMm)}x${fmt(hole.heightMm)}`, true, false);
  }
  ops.push('Q');

  // Engineering specification footer block
  const boxX = ptU(0);
  const boxY = 8 * sc * MM_TO_PT;
  const boxW = plan.blankW * MM_TO_PT;
  const boxH = 20 * sc * MM_TO_PT;
  const specFontPt = clamp(4.2 * sc * MM_TO_PT, 8, 17);
  ops.push('q 0.973 0.98 0.988 rg 0.796 0.835 0.882 RG 0.6 w');
  ops.push(`${fmtExact(boxX)} ${fmtExact(boxY)} ${fmtExact(boxW)} ${fmtExact(boxH)} re B`);
  ops.push('0.06 0.09 0.16 rg');
  drawText(boxX + 6 * sc * MM_TO_PT, boxY + boxH - specFontPt * 1.45, specFontPt * 1.05, plan.specLines[0], false, false);
  ops.push('0.2 0.25 0.33 rg');
  drawText(boxX + 6 * sc * MM_TO_PT, boxY + boxH - specFontPt * 2.75, specFontPt * 0.94, plan.specLines[1], false, false);
  ops.push('0.28 0.33 0.41 rg');
  drawText(boxX + 6 * sc * MM_TO_PT, boxY + boxH - specFontPt * 3.95, specFontPt * 0.88, plan.specLines[2], false, false);
  ops.push('Q');

  const streamContent = ops.join('\n');
  const encoder = new TextEncoder();
  const streamBytes = encoder.encode(streamContent);

  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmtExact(pageWpt)} ${fmtExact(pageHpt)}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
  ];

  const header = '%PDF-1.4\n%\xFF\xFF\xFF\xFF\n';
  let body = header;
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(encoder.encode(body).length);
    body += obj;
  }
  const xrefOffset = encoder.encode(body).length;
  body += `xref\n0 ${objects.length + 1}\n`;
  body += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return encoder.encode(body);
}
