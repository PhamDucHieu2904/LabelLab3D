import type {
  BoardMaterialPreset,
  PackagingParams,
  PackagingTemplateDefinition,
  PanelNode2D,
  Point2D,
} from '../types';
import {
  ensureCCW,
  handHolePoly,
  rectPoly,
  roundedRectPoly,
} from '../geometry/polygon-ops';
import { clampNum, finalizeSolvedDieline } from './helpers';

/** Compute evenly spaced symmetric horizontal tab centers (mm in world X around 0). */
function computeSymmetricTabCentersX(
  innerLength: number,
  count: 0 | 1 | 2 | 3,
  requestedWidthMm: number,
): { centersX: number[]; tabWidthMm: number } {
  if (count <= 0) return { centersX: [], tabWidthMm: 0 };
  const edgeMargin = clampNum(innerLength * 0.13, 8, 22);
  const usableSpan = Math.max(12, innerLength - 2 * edgeMargin);
  const minBridge = count > 1 ? Math.max(6, Math.min(12, usableSpan * 0.1)) : 0;
  const maxTabW = Math.max(8, (usableSpan - (count - 1) * minBridge) / count);
  const tabWidthMm = clampNum(requestedWidthMm, 8, Math.min(34, maxTabW));

  if (count === 1) {
    return { centersX: [0], tabWidthMm };
  }
  if (count === 2) {
    const offset = clampNum(usableSpan * 0.27, tabWidthMm * 0.5 + minBridge * 0.5, usableSpan * 0.5 - tabWidthMm * 0.5);
    return { centersX: [-offset, offset], tabWidthMm };
  }
  const outerOffset = clampNum(
    usableSpan * 0.36,
    tabWidthMm + minBridge,
    Math.max(tabWidthMm + minBridge, usableSpan * 0.5 - tabWidthMm * 0.5),
  );
  return { centersX: [-outerOffset, 0, outerOffset], tabWidthMm };
}

/**
 * Build the Front Wall outline with optional 0, 1, 2, or 3 rounded positive-lock tabs
 * rising cleanly along its top rim (matching the exact green-marked lock-tab area on ECMA A21).
 */
function buildFrontWallWithLockTabs(input: {
  xRightR: number;
  xFrontR: number;
  xFrontCap: number;
  yBot: number;
  yTop: number;
  yGlueMin: number;
  yGlueMax: number;
  tabCenters2D: number[];
  tabWidthMm: number;
  tabHeightMm: number;
}): Point2D[] {
  const {
    xRightR,
    xFrontR,
    xFrontCap,
    yBot,
    yTop,
    yGlueMin,
    yGlueMax,
    tabWidthMm,
    tabHeightMm,
  } = input;

  const pts: Point2D[] = [
    [xRightR, yBot],
    [xFrontCap, yBot],
    [xFrontCap, yGlueMin - 0.12],
    [xFrontR, yGlueMin - 0.12],
    [xFrontR, yGlueMax + 0.12],
    [xFrontCap, yGlueMax + 0.12],
    [xFrontCap, yTop],
  ];

  // Traverse top edge from right (xFrontCap) back to left (xRightR) in CCW order.
  const sortedTabs = [...input.tabCenters2D].sort((a, b) => b - a);
  const halfW = tabWidthMm * 0.5;
  const tipInset = clampNum(tabWidthMm * 0.08, 0.8, 2.2);
  const r = clampNum(Math.min(tabHeightMm * 0.42, (tabWidthMm - 2 * tipInset) * 0.36), 1.4, 3.4);
  const arcSegs = 4;

  for (const cx of sortedTabs) {
    const xBaseR = Math.min(xFrontCap - 1.5, cx + halfW);
    const xBaseL = Math.max(xRightR + 1.5, cx - halfW);
    if (xBaseR - xBaseL < 5) continue;

    const xTopR = xBaseR - tipInset;
    const xTopL = xBaseL + tipInset;
    const yTip = yTop + tabHeightMm;
    const cy = yTip - r;

    pts.push([xBaseR, yTop]);
    // Right rounded corner arc (0 -> pi/2)
    for (let i = 0; i <= arcSegs; i++) {
      const a = (Math.PI * 0.5 * i) / arcSegs;
      pts.push([xTopR - r + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    // Left rounded corner arc (pi/2 -> pi)
    for (let i = 0; i <= arcSegs; i++) {
      const a = Math.PI * 0.5 + (Math.PI * 0.5 * i) / arcSegs;
      pts.push([xTopL + r + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    pts.push([xBaseL, yTop]);
  }

  pts.push([xRightR, yTop]);
  return ensureCCW(pts);
}

/**
 * Build the Top Lid outline (`[xMin, xMax] × [yBot, yTop]`) with optional 0, 1, 2, or 3
 * recessed lock-slot cutouts centered along its front crease (`yTop`), aligned 1:1 with the
 * Front Wall positive-lock tabs.
 */
function buildTopLidWithLockSlots(input: {
  xMin: number;
  xMax: number;
  yBot: number;
  yTop: number;
  slotCenters2D: number[];
  slotWidthMm: number;
  slotDepthMm: number;
}): Point2D[] {
  const { xMin, xMax, yBot, yTop, slotWidthMm, slotDepthMm } = input;
  if (input.slotCenters2D.length === 0 || slotDepthMm <= 0.1) {
    return rectPoly(xMin, yBot, xMax, yTop);
  }
  const pts: Point2D[] = [
    [xMin, yBot],
    [xMax, yBot],
    [xMax, yTop],
  ];
  // Traverse top edge from xMax -> xMin (CCW).
  const sortedSlots = [...input.slotCenters2D].sort((a, b) => b - a);
  const halfW = slotWidthMm * 0.5;
  for (const cx of sortedSlots) {
    const sxR = Math.min(xMax - 2.5, cx + halfW);
    const sxL = Math.max(xMin + 2.5, cx - halfW);
    if (sxR - sxL < 4) continue;
    pts.push([sxR, yTop], [sxR, yTop - slotDepthMm], [sxL, yTop - slotDepthMm], [sxL, yTop]);
  }
  pts.push([xMin, yTop]);
  return ensureCCW(pts);
}

/**
 * Build the classic ECMA A21 friction-lock Tuck Flap with side slit-lock shoulder nicks,
 * rounded outer corners, and optional matching crease slot reliefs opposite the Front Wall lock tabs.
 */
function buildTuckFlapPoly(input: {
  xMin: number;
  xMax: number;
  yHinge: number;
  tuckLengthMm: number;
  slitInsetMm: number;
  slotCenters2D: number[];
  slotWidthMm: number;
  slotDepthMm: number;
}): Point2D[] {
  const { xMin, xMax, yHinge, tuckLengthMm, slitInsetMm, slotWidthMm, slotDepthMm } = input;
  const span = Math.max(12, xMax - xMin);
  const len = Math.max(10, tuckLengthMm);
  const inset = clampNum(slitInsetMm, 1.5, Math.min(5, span * 0.08));
  const neckH = clampNum(Math.min(2.6, len * 0.16), 1.2, 3.0);
  const r = clampNum(Math.min(len * 0.52, (span - 2 * inset) * 0.22), 3, 12);
  const yTip = yHinge + len;
  const cy = yTip - r;
  const xL = xMin + inset;
  const xR = xMax - inset;
  const arcSegs = 6;

  const pts: Point2D[] = [];

  // Bottom hinge edge from xL -> xR (CCW), carving subtle slot reliefs if front lock tabs are active.
  pts.push([xL, yHinge]);
  if (input.slotCenters2D.length > 0 && slotDepthMm > 0.1) {
    const sorted = [...input.slotCenters2D].sort((a, b) => a - b);
    const halfW = slotWidthMm * 0.5;
    for (const cx of sorted) {
      const sxL = Math.max(xL + 1.5, cx - halfW);
      const sxR = Math.min(xR - 1.5, cx + halfW);
      if (sxR - sxL < 4) continue;
      pts.push([sxL, yHinge], [sxL, yHinge + slotDepthMm], [sxR, yHinge + slotDepthMm], [sxR, yHinge]);
    }
  }
  pts.push([xR, yHinge]);

  // Right slit-lock shoulder ear -> straight side -> rounded top-right corner
  pts.push([xR, yHinge + neckH], [xMax - 0.5, yHinge + neckH]);
  for (let i = 0; i <= arcSegs; i++) {
    const a = (Math.PI * 0.5 * i) / arcSegs;
    pts.push([xMax - 0.5 - r + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  // Rounded top-left corner -> straight side -> left slit-lock shoulder ear
  for (let i = 0; i <= arcSegs; i++) {
    const a = Math.PI * 0.5 + (Math.PI * 0.5 * i) / arcSegs;
    pts.push([xMin + 0.5 + r + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  pts.push([xMin + 0.5, yHinge + neckH], [xL, yHinge + neckH]);

  return ensureCCW(pts);
}

/**
 * Build the classic ECMA A21 asymmetric top dust flap:
 * straight back shoulder beside the Top Lid (with tiny corner relief), flat top crest,
 * smooth rounded outer corner, and angled front taper sloping cleanly to the front edge.
 */
function buildAsymmetricDustFlapPoly(input: {
  xMin: number;
  xMax: number;
  yHinge: number;
  lengthMm: number;
  straightEdgeSide: 'left' | 'right';
  taperDeg: number;
}): Point2D[] {
  const { xMin, xMax, yHinge, lengthMm, straightEdgeSide, taperDeg } = input;
  const span = Math.max(10, xMax - xMin);
  const len = Math.max(12, lengthMm);
  const reliefH = clampNum(len * 0.08, 1.5, 4);
  const reliefX = clampNum(span * 0.04, 1.0, 2.5);
  const taperRad = (clampNum(taperDeg, 4, 24) * Math.PI) / 180;
  const frontSlopeX = clampNum(Math.tan(taperRad) * len, span * 0.12, span * 0.34);
  const r = clampNum(Math.min(len * 0.28, span * 0.22), 3, 12);
  const yTip = yHinge + len;
  const arcSegs = 5;

  const pts: Point2D[] = [];
  if (straightEdgeSide === 'left') {
    // Back/lid side is on xMin (straight vertical); front side is on xMax (angled taper).
    const xCrestR = xMax - frontSlopeX;
    pts.push(
      [xMin + reliefX, yHinge],
      [xMax, yHinge],
      [xMax, yHinge + reliefH],
    );
    // Smooth rounded outer corner on tapered front-top
    const cy = yTip - r;
    for (let i = 0; i <= arcSegs; i++) {
      const a = (Math.PI * 0.5 * i) / arcSegs;
      pts.push([xCrestR - r + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    pts.push([xMin + reliefX, yTip], [xMin + reliefX, yHinge + reliefH]);
  } else {
    // Back/lid side is on xMax (straight vertical); front side is on xMin (angled taper).
    const xCrestL = xMin + frontSlopeX;
    pts.push(
      [xMin, yHinge],
      [xMax - reliefX, yHinge],
      [xMax - reliefX, yTip],
    );
    const cy = yTip - r;
    for (let i = 0; i <= arcSegs; i++) {
      const a = Math.PI * 0.5 + (Math.PI * 0.5 * i) / arcSegs;
      pts.push([xCrestL + r + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    pts.push([xMin, yHinge + reliefH]);
  }
  return ensureCCW(pts);
}

/**
 * 1-2-3 Snap-Lock Bottom — Panel 1 (Front): U-forked two-foot outer locking base flap.
 */
function buildSnapBottomForkFlapPoly(input: {
  xMin: number;
  xMax: number;
  yHinge: number;
  lengthMm: number;
}): Point2D[] {
  const { xMin, xMax, yHinge, lengthMm } = input;
  const span = Math.max(16, xMax - xMin);
  const len = Math.max(14, lengthMm);
  const yTip = yHinge - len;
  const cutoutW = clampNum(span * 0.44, 10, span * 0.56);
  const footW = (span - cutoutW) * 0.5;
  const yNotch = yTip + clampNum(len * 0.36, 6, len * 0.48);
  const r = clampNum(Math.min(footW * 0.28, len * 0.18), 2.5, 6);
  const xNotchL = xMin + footW;
  const xNotchR = xMax - footW;
  const arcSegs = 4;

  const pts: Point2D[] = [[xMax, yHinge], [xMin, yHinge]];
  // Left foot outer bottom-left corner (pi -> 1.5*pi)
  for (let i = 0; i <= arcSegs; i++) {
    const a = Math.PI + (Math.PI * 0.5 * i) / arcSegs;
    pts.push([xMin + r + Math.cos(a) * r, yTip + r + Math.sin(a) * r]);
  }
  // Left foot inner bottom-right corner (1.5*pi -> 2*pi)
  for (let i = 0; i <= arcSegs; i++) {
    const a = Math.PI * 1.5 + (Math.PI * 0.5 * i) / arcSegs;
    pts.push([xNotchL - r + Math.cos(a) * r, yTip + r + Math.sin(a) * r]);
  }
  // Center U-notch roof
  pts.push([xNotchL, yNotch], [xNotchR, yNotch]);
  // Right foot inner bottom-left corner (pi -> 1.5*pi)
  for (let i = 0; i <= arcSegs; i++) {
    const a = Math.PI + (Math.PI * 0.5 * i) / arcSegs;
    pts.push([xNotchR + r + Math.cos(a) * r, yTip + r + Math.sin(a) * r]);
  }
  // Right foot outer bottom-right corner (1.5*pi -> 2*pi)
  for (let i = 0; i <= arcSegs; i++) {
    const a = Math.PI * 1.5 + (Math.PI * 0.5 * i) / arcSegs;
    pts.push([xMax - r + Math.cos(a) * r, yTip + r + Math.sin(a) * r]);
  }
  return ensureCCW(pts);
}

/**
 * 1-2-3 Snap-Lock Bottom — Panel 2 & 4 (Left/Right): 45° sloped side interlocking hook flaps.
 */
function buildSnapBottomSideHookPoly(input: {
  xMin: number;
  xMax: number;
  yHinge: number;
  lengthMm: number;
  straightEdgeSide: 'left' | 'right';
}): Point2D[] {
  const { xMin, xMax, yHinge, lengthMm, straightEdgeSide } = input;
  const span = Math.max(12, xMax - xMin);
  const len = Math.max(14, lengthMm);
  const yTip = yHinge - len;
  const yHookShoulder = yTip + clampNum(len * 0.34, 6, len * 0.44);
  const slopeInset = clampNum(span * 0.42, 6, span * 0.54);
  const hookFlare = clampNum(span * 0.08, 1.5, 4.5);
  const r = clampNum(Math.min(span * 0.14, len * 0.16), 2.5, 5.5);
  const arcSegs = 4;

  const pts: Point2D[] = [];
  if (straightEdgeSide === 'left') {
    // Straight edge along xMin (next to Back Panel); 45° diagonal cut along xMax (next to Front Panel).
    const xShoulder = xMax - slopeInset;
    const xFootR = Math.min(xMax - 2, xShoulder + hookFlare);
    pts.push([xMax, yHinge], [xMin, yHinge]);
    // Bottom-left rounded corner
    for (let i = 0; i <= arcSegs; i++) {
      const a = Math.PI + (Math.PI * 0.5 * i) / arcSegs;
      pts.push([xMin + r + Math.cos(a) * r, yTip + r + Math.sin(a) * r]);
    }
    // Bottom-right rounded corner on flared hook foot
    for (let i = 0; i <= arcSegs; i++) {
      const a = Math.PI * 1.5 + (Math.PI * 0.5 * i) / arcSegs;
      pts.push([xFootR - r + Math.cos(a) * r, yTip + r + Math.sin(a) * r]);
    }
    pts.push([xShoulder, yHookShoulder]);
  } else {
    // Straight edge along xMax (next to Back Panel); 45° diagonal cut along xMin (next to Front Panel).
    const xShoulder = xMin + slopeInset;
    const xFootL = Math.max(xMin + 2, xShoulder - hookFlare);
    pts.push([xMax, yHinge], [xMin, yHinge], [xShoulder, yHookShoulder]);
    // Bottom-left rounded corner on flared hook foot
    for (let i = 0; i <= arcSegs; i++) {
      const a = Math.PI + (Math.PI * 0.5 * i) / arcSegs;
      pts.push([xFootL + r + Math.cos(a) * r, yTip + r + Math.sin(a) * r]);
    }
    // Bottom-right rounded corner
    for (let i = 0; i <= arcSegs; i++) {
      const a = Math.PI * 1.5 + (Math.PI * 0.5 * i) / arcSegs;
      pts.push([xMax - r + Math.cos(a) * r, yTip + r + Math.sin(a) * r]);
    }
  }
  return ensureCCW(pts);
}

/**
 * 1-2-3 Snap-Lock Bottom — Panel 3 (Back / Root): Symmetric 45° tapered center locking tongue.
 */
function buildSnapBottomCenterTonguePoly(input: {
  xMin: number;
  xMax: number;
  yHinge: number;
  lengthMm: number;
}): Point2D[] {
  const { xMin, xMax, yHinge, lengthMm } = input;
  const span = Math.max(16, xMax - xMin);
  const len = Math.max(14, lengthMm);
  const yTip = yHinge - len;
  const yStep = yTip + clampNum(len * 0.34, 6, len * 0.44);
  const stepInset = clampNum(span * 0.24, 8, span * 0.31);
  const xStepL = xMin + stepInset;
  const xStepR = xMax - stepInset;
  const r = clampNum(Math.min((xStepR - xStepL) * 0.16, len * 0.16), 2.5, 6);
  const arcSegs = 4;

  const pts: Point2D[] = [
    [xMax, yHinge],
    [xMin, yHinge],
    [xStepL, yStep],
  ];
  for (let i = 0; i <= arcSegs; i++) {
    const a = Math.PI + (Math.PI * 0.5 * i) / arcSegs;
    pts.push([xStepL + r + Math.cos(a) * r, yTip + r + Math.sin(a) * r]);
  }
  for (let i = 0; i <= arcSegs; i++) {
    const a = Math.PI * 1.5 + (Math.PI * 0.5 * i) / arcSegs;
    pts.push([xStepR - r + Math.cos(a) * r, yTip + r + Math.sin(a) * r]);
  }
  pts.push([xStepR, yStep]);
  return ensureCCW(pts);
}

/**
 * ECMA A21 — Tuck-Top Snap-Lock Bottom (1-2-3 Bottom) Folding Carton.
 *
 * Industry-standard glue-free snap-lock base retail box with friction tuck lid and customizable
 * 0 / 1 / 2 / 3 Front Rim Positive-Lock Tabs matching recessed Top-Lid Crease Lock Slots:
 *  - Outside print-side-up 2D layout (left to right):
 *      [Glue Tab] — [Front (L) + 0–3 Rim Lock Tabs & U-Fork Base]
 *      — [Right (W) + Dust Flap & 45° Side Hook]
 *      — [Back (L) + Top Lid / Slit-Lock Tuck Flap & Center Lock Tongue]
 *      — [Left (W) + Dust Flap & 45° Side Hook]
 *  - Zero-collision 3-layer snap-lock bottom + 2-layer tuck top (`pivotOffsetMm = 0` on all joints)
 *  - Tier-2 packable retail box (fits natively inside FEFCO 0421 Display Trays & FEFCO 0201 Cartons!)
 */
export const ECMA_A21_SNAP_LOCK_TEMPLATE: PackagingTemplateDefinition = {
  id: 'ecma-a21-snap-lock',
  code: 'ECMA A21',
  name: 'Tuck-Top Snap-Lock Carton (1-2-3)',
  shortName: 'Snap-Lock Carton',
  category: 'folding-box',
  tagline: 'Tuck-top retail carton with glue-free 1-2-3 snap-lock bottom and 0–3 front rim lock tabs',
  description:
    'Classic ECMA A21 paperboard folding carton combining a heavy-duty 1-2-3 interlocking snap-lock bottom with a slit-lock tuck lid, asymmetric top dust flaps, and customizable 0, 1, 2, or 3 front rim positive-lock tabs.',
  defaultMaterialId: 'ivory-350',
  defaultDimensions: { length: 126, width: 66, height: 167 },
  minDimensions: { length: 50, width: 36, height: 60 },
  maxDimensions: { length: 420, width: 320, height: 480 },
  heroFold: 0.84,
  openPreviewFold: 0.64,
  features: {
    lockTabs: false,
    frontRimLockTabs: true,
    dustFlapTaper: true,
    flapGap: false,
    tuckStyle: false,
    thumbNotch: false,
    handHoles: true,
    displayScoop: false,
    windowCutout: true,
    bottlePacking: true,
  },
  sizePresets: [
    {
      id: 'a21-ref-2pack',
      label: '2-Bottle / Retail (126×66)',
      detail: '126 × 66 × 167 mm (Inner)',
      lengthMm: 126,
      widthMm: 66,
      heightMm: 167,
      dimensionMode: 'inner',
      materialId: 'ivory-350',
      beverageFit: '2 × 325ml',
    },
    {
      id: 'a21-single-glass',
      label: 'Single 290ml Glass Bottle',
      detail: '72 × 72 × 185 mm (Inner)',
      lengthMm: 72,
      widthMm: 72,
      heightMm: 185,
      dimensionMode: 'inner',
      materialId: 'ivory-350',
      beverageFit: '1 × 290ml Glass',
    },
    {
      id: 'a21-single-pet',
      label: 'Single 500ml PET Bottle',
      detail: '64 × 64 × 214 mm (Inner)',
      lengthMm: 64,
      widthMm: 64,
      heightMm: 214,
      dimensionMode: 'inner',
      materialId: 'ivory-350',
      beverageFit: '1 × 500ml PET',
    },
    {
      id: 'a21-cosmetic',
      label: 'Cosmetic / Serum Carton',
      detail: '60 × 60 × 150 mm (Inner)',
      lengthMm: 60,
      widthMm: 60,
      heightMm: 150,
      dimensionMode: 'inner',
      materialId: 'ivory-350',
    },
    {
      id: 'a21-wide-retail',
      label: 'Wide Tea / Gift Box (3-Tab)',
      detail: '185 × 72 × 160 mm (Inner)',
      lengthMm: 185,
      widthMm: 72,
      heightMm: 160,
      dimensionMode: 'inner',
      materialId: 'kraft-350',
    },
  ],

  solve(rawParams: PackagingParams, material: BoardMaterialPreset) {
    const clampNotices: string[] = [];
    const t = clampNum(rawParams.thicknessMm, 0.25, 4.0);
    const gap = clampNum(rawParams.slotClearanceMm, 0.08, 1.0);
    const Lreq = clampNum(rawParams.lengthMm, 50, 420);
    const Wreq = clampNum(rawParams.widthMm, 36, 320);
    const Hreq = clampNum(rawParams.heightMm, 60, 480);

    // Bottom 1-2-3 stackup (3 layers): bottom-front-flap (outermost) < base (middle) < bottom side hooks (innermost).
    // Top Tuck stackup (2 layers): top dust flaps (innermost) < top-lid (outermost).
    // => heightStackTotal = 3 * outerStep + 2 * t = 5*t + 3*gap.
    const outerStep = t + gap;
    const lengthStackTotal = 3 * t + gap;
    const heightStackTotal = 3 * outerStep + 2 * t;

    let Linner: number;
    let Winner: number;
    let Hinner: number;
    let Louter: number;
    let Wouter: number;
    let Houter: number;

    if (rawParams.dimensionMode === 'inner') {
      Linner = Lreq;
      Winner = Wreq;
      Hinner = Hreq;
      Louter = Linner + lengthStackTotal;
      Wouter = Winner + 2 * t;
      Houter = Hinner + heightStackTotal;
    } else {
      Louter = Lreq;
      Wouter = Wreq;
      Houter = Hreq;
      Linner = Math.max(30, Louter - lengthStackTotal);
      Winner = Math.max(26, Wouter - 2 * t);
      Hinner = Math.max(36, Houter - heightStackTotal);
    }

    const Lback = Linner + outerStep;

    // Vertical Y bands on flat 2D sheet (relative to y = 0 = Back Wall bottom crease):
    //   • Back Wall (base tongue + top lid):        y ∈ [0, Hback]               (Hback = Hinner + 2*outerStep)
    //   • Left/Right Walls (inner dust & 1-2-3):    y ∈ [outerStep, Hback - outerStep] (exact interior Hinner)
    //   • Front Wall (outer U-fork base & top rim): y ∈ [-outerStep, Hback + t]  (flush with closed Top Lid top)
    const Hback = Hinner + 2 * outerStep;
    const ySideBot = outerStep;
    const ySideTop = Hback - outerStep;
    const yFrontBot = -outerStep;
    const yFrontTop = Hback + t;

    // Top tuck-lid & asymmetric dust flap proportions matching ECMA A21 reference dieline
    const lidDepth = Math.max(20, Winner - outerStep);
    const tuckLen = clampNum(rawParams.tuckFlapLengthMm || 18, 12, Math.min(36, Hinner * 0.28, Winner * 0.65));
    const dustTaperDeg = clampNum(rawParams.dustFlapTaperDeg || 12, 4, 22);
    const topDustLen = clampNum(Math.min(Winner * 0.72, Lback * 0.44), 14, Math.max(14, Winner - 4));

    // 1-2-3 Snap-Lock Bottom flap lengths (all safely clear opposing walls!)
    const botTongueLen = clampNum(Winner * 0.72, 16, Math.max(16, Winner - 3));
    const botForkLen = clampNum(Winner * 0.72, 16, Math.max(16, Winner - 3));
    const botSideLen = clampNum(Math.min(Winner * 0.72, Lback * 0.46), 16, Math.max(16, Lback * 0.47));

    const slotRelief = Math.max(0.6, t * 0.8);
    const glueTabW = clampNum(t * 6 + 13, 12, Math.min(26, Winner * 0.32));

    // Internal 2D CAD X layout (horizontally mirrored on Outside print-side-up SVG so it reads
    // left-to-right: [Glue Tab] — [Front (Panel 1)] — [Right (Panel 2)] — [Back (Panel 3)] — [Left (Panel 4)]):
    const xBackR = Linner * 0.5;
    const xBackL = -Linner * 0.5 - outerStep;
    const xLeftInner = xBackL - Winner;
    const xLeftOuter = xLeftInner - t;
    const xRightR = xBackR + Winner;
    const xFrontR = xRightR + Linner;
    const xFrontCap = xFrontR + t;

    const yGlueMin = ySideBot + gap;
    const yGlueMax = ySideTop - gap;
    const glueSpanY = Math.max(12, yGlueMax - yGlueMin);
    const glueTaper = clampNum(Math.min(10, glueTabW * 0.42, glueSpanY * 0.12), 2, 12);

    // Customizable 0 / 1 / 2 / 3 Front Rim Positive-Lock Tabs + matching Top-Lid Crease Lock Slots
    const rawTabCount = rawParams.frontLockTabCount;
    const tabCount: 0 | 1 | 2 | 3 =
      rawTabCount === 0 || rawTabCount === 1 || rawTabCount === 2 || rawTabCount === 3
        ? rawTabCount
        : 1;
    const { centersX: worldTabCentersX, tabWidthMm } = computeSymmetricTabCentersX(
      Linner,
      tabCount,
      rawParams.lockTabWidthMm || 22,
    );
    const frontTabHeightMm = tabCount > 0 ? clampNum(Math.min(7.5, Winner * 0.13), 4.5, 8.5) : 0;
    const lidSlotWidthMm = tabCount > 0 ? tabWidthMm + Math.max(1.0, gap * 4) : 0;
    const lidSlotDepthMm = tabCount > 0 ? clampNum(t * 2.0 + gap, 0.9, 2.2) : 0;

    // Exact 3D X-alignment mapping: world X = cxWorld <-> Back/Lid x_2D = cxWorld <-> Front x_2D = xRightR + Linner/2 - cxWorld
    const frontTabCenters2D = worldTabCentersX.map((cx) => xRightR + Linner * 0.5 - cx);
    const lidSlotCenters2D = worldTabCentersX;

    // Optional die-cut side carry hand holes
    const leftHoles: Point2D[][] = [];
    const rightHoles: Point2D[][] = [];
    if (rawParams.handHoles) {
      const availW = Winner - 20;
      const availH = Hinner - 30;
      if (availW >= 28 && availH >= 16) {
        const hhW = clampNum(rawParams.handHoleWidthMm, 26, Math.min(84, availW));
        const hhH = clampNum(rawParams.handHoleHeightMm, 14, Math.min(26, availH));
        const yCenter = ySideBot + Hinner * 0.72;
        leftHoles.push(handHolePoly((xLeftInner + xBackL) * 0.5, yCenter, hhW, hhH));
        rightHoles.push(handHolePoly((xBackR + xRightR) * 0.5, yCenter, hhW, hhH));
      } else {
        clampNotices.push('Increase carton width slightly to fit side carry hand holes.');
      }
    }

    // Optional front retail display window cutout + PET film
    const frontHoles: Point2D[][] = [];
    const frontFilms: Point2D[][] = [];
    if (rawParams.windowCutout) {
      const margin = Math.max(12, t * 12);
      const maxWinW = Math.max(16, Linner - margin * 2);
      const maxWinH = Math.max(16, Hinner - margin * 2);
      if (maxWinW >= 20 && maxWinH >= 20) {
        const winW = clampNum(rawParams.windowWidthMm, 18, maxWinW);
        const winH = clampNum(rawParams.windowHeightMm, 18, maxWinH);
        const winR = clampNum(rawParams.windowRadiusMm, 0, Math.min(winW, winH) * 0.45);
        const cx = (xRightR + xFrontR) * 0.5;
        const cy = (ySideBot + ySideTop) * 0.5;
        frontHoles.push(roundedRectPoly(cx - winW * 0.5, cy - winH * 0.5, cx + winW * 0.5, cy + winH * 0.5, winR, 6, true));
        if (rawParams.windowFilm) {
          frontFilms.push(roundedRectPoly(cx - winW * 0.5 - 2, cy - winH * 0.5 - 2, cx + winW * 0.5 + 2, cy + winH * 0.5 + 2, winR, 6, false));
        }
      } else {
        clampNotices.push('Front panel is too compact for a display window cutout.');
      }
    }

    // --- MANUFACTURER GLUE TAB (far left on Outside SVG, attached to Panel 1 Front) ---
    const glueTab: PanelNode2D = {
      id: 'glue-tab',
      label: 'Manufacturer Glue Joint',
      shortCode: 'GLUE',
      faceRole: 'glue',
      partGroup: 'flaps',
      printable: false,
      uprightAngleDeg: 0,
      outline: ensureCCW([
        [xFrontR, yGlueMin],
        [xFrontR + glueTabW, yGlueMin + glueTaper],
        [xFrontR + glueTabW, yGlueMax - glueTaper],
        [xFrontR, yGlueMax],
      ]),
      hinge: {
        p1: [xFrontR, yGlueMin],
        p2: [xFrontR, yGlueMax],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.2,
        stageEnd: 0.36,
        renderCreaseFillet: true,
      },
      children: [],
    };

    // --- PANEL 1: FRONT WALL + 0..3 RIM LOCK TABS + GLUE TAB + 1-2-3 U-FORK BOTTOM FLAP ---
    const frontWall: PanelNode2D = {
      id: 'front-wall',
      label: 'Front Panel',
      shortCode: 'FRONT',
      faceRole: 'front',
      partGroup: 'length',
      printable: true,
      uprightAngleDeg: 0,
      outline: buildFrontWallWithLockTabs({
        xRightR,
        xFrontR,
        xFrontCap,
        yBot: yFrontBot,
        yTop: yFrontTop,
        yGlueMin,
        yGlueMax,
        tabCenters2D: frontTabCenters2D,
        tabWidthMm,
        tabHeightMm: frontTabHeightMm,
      }),
      holes: frontHoles,
      windowFilms: frontFilms,
      hinge: {
        p1: [xRightR, ySideBot],
        p2: [xRightR, ySideTop],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.14,
        stageEnd: 0.32,
      },
      children: [
        glueTab,
        {
          id: 'bottom-front-flap',
          label: 'Bottom Snap-Lock Fork Flap',
          shortCode: 'B-FORK',
          faceRole: 'flap',
          partGroup: 'flaps',
          printable: true,
          uprightAngleDeg: 0,
          outline: buildSnapBottomForkFlapPoly({
            xMin: xRightR + slotRelief,
            xMax: xFrontCap,
            yHinge: yFrontBot,
            lengthMm: botForkLen,
          }),
          hinge: {
            p1: [xRightR + slotRelief, yFrontBot],
            p2: [xFrontCap, yFrontBot],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.44,
            stageEnd: 0.58,
            renderCreaseFillet: true,
          },
          children: [],
        },
      ],
    };

    // --- PANEL 2: RIGHT SIDE WALL + FRONT WALL + ASYMMETRIC TOP DUST FLAP + 1-2-3 SIDE HOOK ---
    const rightWall: PanelNode2D = {
      id: 'right-wall',
      label: 'Right Side Panel',
      shortCode: 'RIGHT',
      faceRole: 'right',
      partGroup: 'width',
      printable: true,
      uprightAngleDeg: 0,
      outline: rectPoly(xBackR, ySideBot, xRightR, ySideTop),
      holes: rightHoles,
      hinge: {
        p1: [xBackR, ySideBot],
        p2: [xBackR, ySideTop],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.08,
        stageEnd: 0.26,
      },
      children: [
        frontWall,
        {
          id: 'bottom-right-flap',
          label: 'Bottom Right Snap-Lock Hook',
          shortCode: 'B-RGT',
          faceRole: 'flap',
          partGroup: 'flaps',
          printable: false,
          uprightAngleDeg: 180,
          outline: buildSnapBottomSideHookPoly({
            xMin: xBackR + slotRelief,
            xMax: xRightR - slotRelief,
            yHinge: ySideBot,
            lengthMm: botSideLen,
            straightEdgeSide: 'left',
          }),
          hinge: {
            p1: [xBackR + slotRelief, ySideBot],
            p2: [xRightR - slotRelief, ySideBot],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.3,
            stageEnd: 0.44,
            renderCreaseFillet: true,
          },
          children: [],
        },
        {
          id: 'top-right-flap',
          label: 'Top Right Dust Flap',
          shortCode: 'T-RGT',
          faceRole: 'flap',
          partGroup: 'lid',
          printable: false,
          uprightAngleDeg: 0,
          outline: buildAsymmetricDustFlapPoly({
            xMin: xBackR + slotRelief,
            xMax: xRightR - slotRelief,
            yHinge: ySideTop,
            lengthMm: topDustLen,
            straightEdgeSide: 'left',
            taperDeg: dustTaperDeg,
          }),
          hinge: {
            p1: [xBackR + slotRelief, ySideTop],
            p2: [xRightR - slotRelief, ySideTop],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.58,
            stageEnd: 0.72,
            renderCreaseFillet: true,
          },
          children: [],
        },
      ],
    };

    // --- PANEL 4: LEFT SIDE WALL + ASYMMETRIC TOP DUST FLAP + 1-2-3 SIDE HOOK ---
    const leftWall: PanelNode2D = {
      id: 'left-wall',
      label: 'Left Side Panel',
      shortCode: 'LEFT',
      faceRole: 'left',
      partGroup: 'width',
      printable: true,
      uprightAngleDeg: 0,
      outline: rectPoly(xLeftOuter, ySideBot, xBackL, ySideTop),
      holes: leftHoles,
      hinge: {
        p1: [xBackL, ySideBot],
        p2: [xBackL, ySideTop],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.08,
        stageEnd: 0.26,
      },
      children: [
        {
          id: 'bottom-left-flap',
          label: 'Bottom Left Snap-Lock Hook',
          shortCode: 'B-LFT',
          faceRole: 'flap',
          partGroup: 'flaps',
          printable: false,
          uprightAngleDeg: 180,
          outline: buildSnapBottomSideHookPoly({
            xMin: xLeftInner + slotRelief,
            xMax: xBackL - slotRelief,
            yHinge: ySideBot,
            lengthMm: botSideLen,
            straightEdgeSide: 'right',
          }),
          hinge: {
            p1: [xLeftInner + slotRelief, ySideBot],
            p2: [xBackL - slotRelief, ySideBot],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.3,
            stageEnd: 0.44,
            renderCreaseFillet: true,
          },
          children: [],
        },
        {
          id: 'top-left-flap',
          label: 'Top Left Dust Flap',
          shortCode: 'T-LFT',
          faceRole: 'flap',
          partGroup: 'lid',
          printable: false,
          uprightAngleDeg: 0,
          outline: buildAsymmetricDustFlapPoly({
            xMin: xLeftInner + slotRelief,
            xMax: xBackL - slotRelief,
            yHinge: ySideTop,
            lengthMm: topDustLen,
            straightEdgeSide: 'right',
            taperDeg: dustTaperDeg,
          }),
          hinge: {
            p1: [xLeftInner + slotRelief, ySideTop],
            p2: [xBackL - slotRelief, ySideTop],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.58,
            stageEnd: 0.72,
            renderCreaseFillet: true,
          },
          children: [],
        },
      ],
    };

    // --- TOP LID + FRICTION-LOCK TUCK FLAP (with 0..3 matching crease lock slots) ---
    const yLidCrease = Hback + lidDepth;
    const lidXMin = xBackL + slotRelief;
    const lidXMax = xBackR - slotRelief;
    const tuckInset = clampNum(t * 2 + 1.8, 2.0, 4.5);

    const topTuckFlap: PanelNode2D = {
      id: 'top-tuck-flap',
      label: 'Top Tuck Flap',
      shortCode: 'TUCK',
      faceRole: 'flap',
      partGroup: 'lid',
      printable: true,
      uprightAngleDeg: 180,
      outline: buildTuckFlapPoly({
        xMin: lidXMin,
        xMax: lidXMax,
        yHinge: yLidCrease,
        tuckLengthMm: tuckLen,
        slitInsetMm: tuckInset,
        slotCenters2D: lidSlotCenters2D,
        slotWidthMm: lidSlotWidthMm,
        slotDepthMm: lidSlotDepthMm * 0.65,
      }),
      hinge: {
        p1: [lidXMin + tuckInset, yLidCrease],
        p2: [lidXMax - tuckInset, yLidCrease],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.84,
        stageEnd: 1.0,
        renderCreaseFillet: true,
      },
      children: [],
    };

    const topLid: PanelNode2D = {
      id: 'top-lid',
      label: 'Top Lid',
      shortCode: 'TOP',
      faceRole: 'top',
      partGroup: 'lid',
      printable: true,
      uprightAngleDeg: 180,
      outline: buildTopLidWithLockSlots({
        xMin: lidXMin,
        xMax: lidXMax,
        yBot: Hback,
        yTop: yLidCrease,
        slotCenters2D: lidSlotCenters2D,
        slotWidthMm: lidSlotWidthMm,
        slotDepthMm: lidSlotDepthMm,
      }),
      hinge: {
        p1: [lidXMin, Hback],
        p2: [lidXMax, Hback],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.72,
        stageEnd: 0.9,
        renderCreaseFillet: true,
      },
      children: [topTuckFlap],
    };

    // --- PANEL 3: BACK WALL + TOP LID ---
    const backWall: PanelNode2D = {
      id: 'back-wall',
      label: 'Back Panel',
      shortCode: 'BACK',
      faceRole: 'back',
      partGroup: 'height',
      printable: true,
      uprightAngleDeg: 0,
      outline: rectPoly(xBackL, 0, xBackR, Hback),
      hinge: {
        p1: [xBackL + slotRelief, 0],
        p2: [xBackR - slotRelief, 0],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.0,
        stageEnd: 0.18,
      },
      children: [leftWall, rightWall, topLid],
    };

    // --- ROOT: 1-2-3 BOTTOM CENTER LOCKING TONGUE (middle layer; outer U-fork locks beneath it) ---
    const rootPanel: PanelNode2D = {
      id: 'base',
      label: 'Bottom Snap-Lock Center Tongue',
      shortCode: 'BASE',
      faceRole: 'base',
      partGroup: 'length',
      printable: true,
      uprightAngleDeg: 180,
      outline: buildSnapBottomCenterTonguePoly({
        xMin: xBackL + slotRelief,
        xMax: xBackR - slotRelief,
        yHinge: 0,
        lengthMm: botTongueLen,
      }),
      children: [backWall],
    };

    return finalizeSolvedDieline({
      templateId: this.id,
      templateCode: this.code,
      templateName: this.name,
      params: {
        ...rawParams,
        thicknessMm: t,
        lengthMm: Lreq,
        widthMm: Wreq,
        heightMm: Hreq,
        frontLockTabCount: tabCount,
        lockTabWidthMm: tabCount > 0 ? Math.round(tabWidthMm) : rawParams.lockTabWidthMm,
        tuckFlapLengthMm: tuckLen,
        dustFlapTaperDeg: dustTaperDeg,
      },
      material,
      innerMm: { length: Linner, width: Winner, height: Hinner },
      outerMm: { length: Louter, width: Wouter, height: Houter },
      rootPanel,
      contentAnchor: {
        panelId: rootPanel.id,
        center2D: [0, -Winner * 0.5],
        floorOffsetMm: t * 0.5 + outerStep,
      },
      clampNotices,
    });
  },
};
