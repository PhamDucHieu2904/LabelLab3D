import type { BoundingBox2D, PanelNode2D, Point2D } from '../types';

const EPS = 1e-6;

/** Signed area (> 0 means counter-clockwise, < 0 means clockwise). */
export function signedPolygonArea(points: readonly Point2D[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    area += x1 * y2 - x2 * y1;
  }
  return area * 0.5;
}

/** Remove consecutive duplicate or nearly-collinear points safely. */
export function cleanPolygon(points: readonly Point2D[]): Point2D[] {
  const out: Point2D[] = [];
  for (const pt of points) {
    if (!Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) continue;
    const prev = out[out.length - 1];
    if (!prev || Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) > EPS) {
      out.push([pt[0], pt[1]]);
    }
  }
  while (out.length > 2) {
    const first = out[0];
    const last = out[out.length - 1];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) <= EPS) out.pop();
    else break;
  }
  return out;
}

export function ensureCCW(points: readonly Point2D[]): Point2D[] {
  const cleaned = cleanPolygon(points);
  return signedPolygonArea(cleaned) < 0 ? [...cleaned].reverse() : cleaned;
}

export function ensureCW(points: readonly Point2D[]): Point2D[] {
  const cleaned = cleanPolygon(points);
  return signedPolygonArea(cleaned) > 0 ? [...cleaned].reverse() : cleaned;
}

export function polygonCentroid(points: readonly Point2D[]): Point2D {
  if (!points.length) return [0, 0];
  let cx = 0;
  let cy = 0;
  let signed2 = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    const cross = x1 * y2 - x2 * y1;
    signed2 += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  if (Math.abs(signed2) < EPS) {
    const sx = points.reduce((acc, p) => acc + p[0], 0) / points.length;
    const sy = points.reduce((acc, p) => acc + p[1], 0) / points.length;
    return [sx, sy];
  }
  return [cx / (3 * signed2), cy / (3 * signed2)];
}

export function polygonBounds(points: readonly Point2D[]): BoundingBox2D {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 };
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}

export function rectPoly(xMin: number, yMin: number, xMax: number, yMax: number): Point2D[] {
  return ensureCCW([
    [xMin, yMin],
    [xMax, yMin],
    [xMax, yMax],
    [xMin, yMax],
  ]);
}

/** Rounded rectangle (CCW by default, or CW when `asHole` is true). */
export function roundedRectPoly(
  xMin: number,
  yMin: number,
  xMax: number,
  yMax: number,
  radius: number,
  segments = 6,
  asHole = false,
): Point2D[] {
  const w = Math.max(0.01, xMax - xMin);
  const h = Math.max(0.01, yMax - yMin);
  const r = Math.max(0, Math.min(radius, w * 0.49, h * 0.49));
  if (r <= 0.05) {
    const pts = rectPoly(xMin, yMin, xMax, yMax);
    return asHole ? ensureCW(pts) : pts;
  }
  const segs = Math.max(2, Math.min(16, Math.round(segments)));
  const corners: Array<{ cx: number; cy: number; start: number; end: number }> = [
    { cx: xMax - r, cy: yMin + r, start: -Math.PI / 2, end: 0 },
    { cx: xMax - r, cy: yMax - r, start: 0, end: Math.PI / 2 },
    { cx: xMin + r, cy: yMax - r, start: Math.PI / 2, end: Math.PI },
    { cx: xMin + r, cy: yMin + r, start: Math.PI, end: (Math.PI * 3) / 2 },
  ];
  const pts: Point2D[] = [];
  for (const c of corners) {
    for (let i = 0; i <= segs; i++) {
      const a = c.start + ((c.end - c.start) * i) / segs;
      pts.push([c.cx + Math.cos(a) * r, c.cy + Math.sin(a) * r]);
    }
  }
  return asHole ? ensureCW(pts) : ensureCCW(pts);
}

/** Stadium / pill-shaped hand-hole cutout (CW hole). */
export function handHolePoly(cx: number, cy: number, width: number, height: number): Point2D[] {
  const hw = width * 0.5;
  const hh = height * 0.5;
  return roundedRectPoly(cx - hw, cy - hh, cx + hw, cy + hh, hh * 0.95, 8, true);
}

/**
 * Rectangle extending horizontally or vertically with an inward semi-circular
 * notch or scoop cut out of one free edge.
 * `edge`: which edge receives the cutout ('bottom' = yMin, 'top' = yMax, 'left' = xMin, 'right' = xMax).
 */
export function notchedRectPoly(
  xMin: number,
  yMin: number,
  xMax: number,
  yMax: number,
  edge: 'top' | 'bottom' | 'left' | 'right',
  cutWidth: number,
  cutDepth: number,
  curveSegments = 12,
): Point2D[] {
  const w = xMax - xMin;
  const h = yMax - yMin;
  const cw = Math.max(2, Math.min(cutWidth, (edge === 'top' || edge === 'bottom' ? w : h) * 0.86));
  const cd = Math.max(1, Math.min(cutDepth, (edge === 'top' || edge === 'bottom' ? h : w) * 0.8));
  const pts: Point2D[] = [];
  const cx = (xMin + xMax) * 0.5;
  const cy = (yMin + yMax) * 0.5;

  const pushArc = (
    centerX: number,
    centerY: number,
    rx: number,
    ry: number,
    startAngle: number,
    endAngle: number,
  ) => {
    for (let i = 0; i <= curveSegments; i++) {
      const a = startAngle + ((endAngle - startAngle) * i) / curveSegments;
      pts.push([centerX + Math.cos(a) * rx, centerY + Math.sin(a) * ry]);
    }
  };

  if (edge === 'bottom') {
    pts.push([xMin, yMin]);
    pushArc(cx, yMin, cw * 0.5, cd, Math.PI, 0);
    pts.push([xMax, yMin], [xMax, yMax], [xMin, yMax]);
  } else if (edge === 'top') {
    pts.push([xMin, yMin], [xMax, yMin], [xMax, yMax]);
    pushArc(cx, yMax, cw * 0.5, cd, 0, -Math.PI);
    pts.push([xMin, yMax]);
  } else if (edge === 'right') {
    pts.push([xMin, yMin], [xMax, yMin]);
    pushArc(xMax, cy, cd, cw * 0.5, -Math.PI / 2, (-Math.PI * 3) / 2);
    pts.push([xMax, yMax], [xMin, yMax]);
  } else {
    pts.push([xMin, yMin], [xMax, yMin], [xMax, yMax], [xMin, yMax]);
    pushArc(xMin, cy, cd, cw * 0.5, Math.PI / 2, -Math.PI / 2);
  }
  return ensureCCW(pts);
}

/** Traverse a panel tree depth-first. */
export function walkPanels(root: PanelNode2D, visit: (node: PanelNode2D, parent: PanelNode2D | null) => void): void {
  const recurse = (node: PanelNode2D, parent: PanelNode2D | null) => {
    visit(node, parent);
    for (const child of node.children) recurse(child, node);
  };
  recurse(root, null);
}

/** Measure overall flat blank bounding box across all panels in the tree. */
export function measureTreeBounds2D(root: PanelNode2D): BoundingBox2D {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  walkPanels(root, (node) => {
    for (const [x, y] of node.outline) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  });
  if (!Number.isFinite(minX)) return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 };
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}

/** Compute net flat sheet area (in square metres) accounting for holes. */
export function computeNetAreaM2(root: PanelNode2D): number {
  let mm2 = 0;
  walkPanels(root, (node) => {
    mm2 += Math.abs(signedPolygonArea(node.outline));
    for (const hole of node.holes ?? []) {
      mm2 -= Math.abs(signedPolygonArea(hole));
    }
  });
  return Math.max(0, mm2) * 1e-6;
}
