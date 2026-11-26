import type { Point2D, SolvedDieline } from '../types';

const MM_TO_PT = 72 / 25.4;

function fmt(n: number): string {
  return Number(n.toFixed(2)).toString();
}

function escapeXml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function mapPoint2DToSheet(
  pt: Point2D,
  solved: SolvedDieline,
  marginMm: number,
  side: 'outside' | 'inside',
): [number, number] {
  const b = solved.blankBounds;
  const x = side === 'outside' ? b.maxX - pt[0] + marginMm : pt[0] - b.minX + marginMm;
  const y = b.maxY - pt[1] + marginMm;
  return [x, y];
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
 * CorelDRAW, and our interactive 2D Dieline Editor overlay).
 * Color convention:
 *  - Red solid (#e11d48): Cut lines & punched slots/windows
 *  - Green dashed (#059669): Crease / Fold lines
 *  - Blue dotted (#2563eb): Outer bleed boundary
 */
export function exportDielineSvg(solved: SolvedDieline, options: DielineSvgOptions = {}): string {
  const side = options.side ?? 'outside';
  const margin = options.marginMm ?? 18;
  const includeDimensions = options.includeDimensions ?? true;
  const includeLabels = options.includeLabels ?? true;
  const includeBleed = options.includeBleed ?? true;
  const includeFill = options.includeFill ?? true;
  const bleed = Math.max(0, solved.params.bleedMm);

  const sheetW = solved.blankBounds.width + margin * 2;
  const sheetH = solved.blankBounds.height + margin * 2 + (includeDimensions ? 16 : 0);

  const polyPath = (pts: readonly Point2D[]) =>
    pts
      .map((pt, i) => {
        const [x, y] = mapPoint2DToSheet(pt, solved, margin, side);
        return `${i === 0 ? 'M' : 'L'}${fmt(x)} ${fmt(y)}`;
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

  const cutPaths = [
    ...solved.cutLoops.map((loop) => `    <path d="${polyPath(loop)}"/>`),
    ...solved.holeLoops.map((loop) => `    <path d="${polyPath(loop)}"/>`),
  ].join('\n');

  const creaseLines = solved.creaseSegments
    .map((seg) => {
      const [x1, y1] = mapPoint2DToSheet(seg.p1, solved, margin, side);
      const [x2, y2] = mapPoint2DToSheet(seg.p2, solved, margin, side);
      return `    <line x1="${fmt(x1)}" y1="${fmt(y1)}" x2="${fmt(x2)}" y2="${fmt(y2)}"/>`;
    })
    .join('\n');

  const bleedRect = includeBleed && bleed > 0
    ? `  <g id="Bleed" fill="none" stroke="#2563eb" stroke-width="0.35" stroke-dasharray="2.5 2">
    <rect x="${fmt(margin - bleed)}" y="${fmt(margin - bleed)}" width="${fmt(solved.blankBounds.width + bleed * 2)}" height="${fmt(solved.blankBounds.height + bleed * 2)}" rx="1"/>
  </g>`
    : '';

  const labelLayer = includeLabels
    ? `  <g id="Labels" font-family="Arial, Helvetica, sans-serif" text-anchor="middle" dominant-baseline="middle" fill="#334155">
${solved.flatPanels
  .filter((p) => p.bounds.width >= 16 && p.bounds.height >= 12)
  .map((p) => {
    const [cx, cy] = mapPoint2DToSheet(p.centroid, solved, margin, side);
    const fontSize = Math.max(4, Math.min(10, Math.min(p.bounds.width, p.bounds.height) * 0.2));
    const arrow = p.printable ? ' ↑' : '';
    const rot = side === 'outside' ? p.uprightAngleDeg : 0;
    return `    <text x="${fmt(cx)}" y="${fmt(cy)}" font-size="${fmt(fontSize)}" font-weight="600" transform="rotate(${fmt(rot)} ${fmt(cx)} ${fmt(cy)})">${escapeXml(p.shortCode + arrow)}</text>`;
  })
  .join('\n')}
  </g>`
    : '';

  const dimLayer = includeDimensions
    ? (() => {
        const bw = solved.blankBounds.width;
        const bh = solved.blankBounds.height;
        const topY = margin * 0.45;
        const leftX = margin * 0.45;
        const footerY = margin + bh + 12;
        const title = `${solved.templateCode} ${solved.templateName} · ${solved.params.dimensionMode.toUpperCase()} ${fmt(solved.params.lengthMm)}×${fmt(solved.params.widthMm)}×${fmt(solved.params.heightMm)} mm · Board ${solved.material.shortName} (${fmt(solved.params.thicknessMm)} mm) · Blank ${fmt(bw)}×${fmt(bh)} mm (${side.toUpperCase()})`;
        return `  <g id="Dimensions" font-family="Arial, Helvetica, sans-serif" fill="#475569" stroke="#64748b" stroke-width="0.35">
    <line x1="${fmt(margin)}" y1="${fmt(topY)}" x2="${fmt(margin + bw)}" y2="${fmt(topY)}"/>
    <line x1="${fmt(margin)}" y1="${fmt(topY - 2.5)}" x2="${fmt(margin)}" y2="${fmt(topY + 2.5)}"/>
    <line x1="${fmt(margin + bw)}" y1="${fmt(topY - 2.5)}" x2="${fmt(margin + bw)}" y2="${fmt(topY + 2.5)}"/>
    <text x="${fmt(margin + bw * 0.5)}" y="${fmt(topY - 2.2)}" stroke="none" font-size="5.5" text-anchor="middle">Blank W: ${fmt(bw)} mm</text>
    <line x1="${fmt(leftX)}" y1="${fmt(margin)}" x2="${fmt(leftX)}" y2="${fmt(margin + bh)}"/>
    <line x1="${fmt(leftX - 2.5)}" y1="${fmt(margin)}" x2="${fmt(leftX + 2.5)}" y2="${fmt(margin)}"/>
    <line x1="${fmt(leftX - 2.5)}" y1="${fmt(margin + bh)}" x2="${fmt(leftX + 2.5)}" y2="${fmt(margin + bh)}"/>
    <text x="${fmt(leftX - 2.2)}" y="${fmt(margin + bh * 0.5)}" stroke="none" font-size="5.5" text-anchor="middle" transform="rotate(-90 ${fmt(leftX - 2.2)} ${fmt(margin + bh * 0.5)})">Blank H: ${fmt(bh)} mm</text>
    <text x="${fmt(margin)}" y="${fmt(footerY)}" stroke="none" font-size="4.8">${escapeXml(title)}</text>
  </g>`;
      })()
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(sheetW)}mm" height="${fmt(sheetH)}mm" viewBox="0 0 ${fmt(sheetW)} ${fmt(sheetH)}">
  <title>${escapeXml(solved.templateCode)} — ${escapeXml(solved.templateName)} (${fmt(solved.params.lengthMm)}x${fmt(solved.params.widthMm)}x${fmt(solved.params.heightMm)} mm)</title>
  <g id="BoardFill">
${fillLayer}
  </g>
${bleedRect}
  <g id="Cut" fill="none" stroke="#e11d48" stroke-width="0.55" stroke-linejoin="round">
${cutPaths}
  </g>
  <g id="Crease" fill="none" stroke="#059669" stroke-width="0.5" stroke-dasharray="3.5 2">
${creaseLines}
  </g>
${labelLayer}
${dimLayer}
</svg>`;
}

/**
 * Generate an industry-standard AutoCAD DXF R12 file in exact millimetres ($INSUNITS = 4)
 * with separated CUT (red, ACI 1) and CREASE (green, ACI 3) layers.
 * Opens natively in Adobe Illustrator, AutoCAD, ArtiosCAD, and CNC die-cutting plotters.
 */
export function exportDielineDxf(solved: SolvedDieline, side: 'outside' | 'inside' = 'outside'): string {
  const b = solved.blankBounds;
  const mapPt = (pt: Point2D): [number, number] => [
    side === 'outside' ? b.maxX - pt[0] : pt[0] - b.minX,
    pt[1] - b.minY,
  ];

  const lines: string[] = [
    '0', 'SECTION',
    '2', 'HEADER',
    '9', '$ACADVER', '1', 'AC1009',
    '9', '$INSUNITS', '70', '4', // 4 = Millimetres
    '0', 'ENDSEC',
    '0', 'SECTION',
    '2', 'TABLES',
    '0', 'TABLE', '2', 'LAYER', '70', '2',
    '0', 'LAYER', '2', 'CUT', '70', '0', '62', '1', '6', 'CONTINUOUS',
    '0', 'LAYER', '2', 'CREASE', '70', '0', '62', '3', '6', 'DASHED',
    '0', 'ENDTAB',
    '0', 'ENDSEC',
    '0', 'SECTION',
    '2', 'ENTITIES',
  ];

  const pushLine = (layer: 'CUT' | 'CREASE', x1: number, y1: number, x2: number, y2: number) => {
    lines.push(
      '0', 'LINE',
      '8', layer,
      '10', fmt(x1), '20', fmt(y1), '30', '0',
      '11', fmt(x2), '21', fmt(y2), '31', '0',
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

  lines.push('0', 'ENDSEC', '0', 'EOF');
  return lines.join('\r\n') + '\r\n';
}

function pdfEscape(str: string): string {
  return str.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

/**
 * Generate a true 1:1 physical millimetre Vector PDF 1.4 document with zero dependencies.
 * Every cut path, punched hole, crease fold line, bleed box and title spec is emitted
 * directly as PDF vector drawing operators in points (`1 mm = 72/25.4 pt`).
 */
export function exportDielinePdf(solved: SolvedDieline, side: 'outside' | 'inside' = 'outside'): Uint8Array {
  const marginMm = 20;
  const footerMm = 18;
  const b = solved.blankBounds;
  const pageWmm = b.width + marginMm * 2;
  const pageHmm = b.height + marginMm * 2 + footerMm;
  const pageWpt = pageWmm * MM_TO_PT;
  const pageHpt = pageHmm * MM_TO_PT;

  // PDF origin is bottom-left (+Y upward).
  const toPdf = (pt: Point2D): [number, number] => {
    const xMm = (side === 'outside' ? b.maxX - pt[0] : pt[0] - b.minX) + marginMm;
    const yMm = (pt[1] - b.minY) + marginMm + footerMm;
    return [xMm * MM_TO_PT, yMm * MM_TO_PT];
  };

  const ops: string[] = [];

  // Bleed box (Blue dashed)
  const bleed = Math.max(0, solved.params.bleedMm);
  if (bleed > 0) {
    const bx = (marginMm - bleed) * MM_TO_PT;
    const by = (marginMm + footerMm - bleed) * MM_TO_PT;
    const bw = (b.width + bleed * 2) * MM_TO_PT;
    const bh = (b.height + bleed * 2) * MM_TO_PT;
    ops.push('q 0.145 0.388 0.922 RG 0.6 w [4 3] 0 d');
    ops.push(`${fmt(bx)} ${fmt(by)} ${fmt(bw)} ${fmt(bh)} re S Q`);
  }

  // Cut loops & holes (Red solid)
  ops.push('q 0.882 0.114 0.282 RG 0.9 w [] 0 d 1 j');
  for (const loop of [...solved.cutLoops, ...solved.holeLoops]) {
    if (loop.length < 2) continue;
    loop.forEach((pt, idx) => {
      const [x, y] = toPdf(pt);
      ops.push(`${fmt(x)} ${fmt(y)} ${idx === 0 ? 'm' : 'l'}`);
    });
    ops.push('h S');
  }
  ops.push('Q');

  // Crease lines (Green dashed)
  ops.push('q 0.02 0.588 0.412 RG 0.75 w [5 3] 0 d');
  for (const seg of solved.creaseSegments) {
    const [x1, y1] = toPdf(seg.p1);
    const [x2, y2] = toPdf(seg.p2);
    ops.push(`${fmt(x1)} ${fmt(y1)} m ${fmt(x2)} ${fmt(y2)} l S`);
  }
  ops.push('Q');

  // Engineering specification footer block
  const specLine1 = `HyperMockup CAD Dieline (1:1 mm) | ${solved.templateCode} ${solved.templateName} | ${side.toUpperCase()} PRINT VIEW`;
  const specLine2 = `Inner: ${fmt(solved.innerMm.length)}x${fmt(solved.innerMm.width)}x${fmt(solved.innerMm.height)} mm | Outer: ${fmt(solved.outerMm.length)}x${fmt(solved.outerMm.width)}x${fmt(solved.outerMm.height)} mm | Board: ${solved.material.shortName} (${fmt(solved.params.thicknessMm)} mm) | Blank: ${fmt(b.width)}x${fmt(b.height)} mm`;
  const legend = 'RED SOLID = Cut / Holes   |   GREEN DASHED = Crease / Fold   |   BLUE DASHED = Bleed';

  ops.push('q 0.2 0.24 0.29 rg');
  ops.push(`BT /F1 10 Tf ${fmt(marginMm * MM_TO_PT)} ${fmt(22 * MM_TO_PT * 0.45 + 14)} Td (${pdfEscape(specLine1)}) Tj ET`);
  ops.push(`BT /F1 8.5 Tf ${fmt(marginMm * MM_TO_PT)} ${fmt(22 * MM_TO_PT * 0.45 + 2)} Td (${pdfEscape(specLine2)}) Tj ET`);
  ops.push(`BT /F1 7.5 Tf ${fmt(marginMm * MM_TO_PT)} ${fmt(22 * MM_TO_PT * 0.45 - 9)} Td (${pdfEscape(legend)}) Tj ET`);
  ops.push('Q');

  const streamContent = ops.join('\n');
  const encoder = new TextEncoder();
  const streamBytes = encoder.encode(streamContent);

  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(pageWpt)} ${fmt(pageHpt)}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
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
