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

/**
 * Build a rectangular flap extending vertically from `yHinge` toward `yHinge + dirY * length`
 * with smoothly rounded free outer corners (used for both outer seal-end cover flaps and
 * large-radius inner dust flaps).
 */
function buildVerticalRoundedFlapPoly(input: {
  xMin: number;
  xMax: number;
  yHinge: number;
  length: number;
  dirY: 1 | -1;
  cornerRadiusMm: number;
  arcSegments?: number;
}): Point2D[] {
  const { xMin, xMax, yHinge, dirY, arcSegments = 7 } = input;
  const span = Math.max(4, xMax - xMin);
  const len = Math.max(4, input.length);
  const r = clampNum(input.cornerRadiusMm, 0, Math.min(span * 0.45, len * 0.72));
  const yTip = yHinge + dirY * len;

  if (r <= 0.25) {
    return rectPoly(xMin, Math.min(yHinge, yTip), xMax, Math.max(yHinge, yTip));
  }

  const pts: Point2D[] = [];
  const pushArc = (cx: number, cy: number, startAngle: number, endAngle: number) => {
    for (let i = 0; i <= arcSegments; i++) {
      const a = startAngle + ((endAngle - startAngle) * i) / arcSegments;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  };

  if (dirY === 1) {
    // Extends upward (+Y): hinge at yHinge (bottom), rounded corners at yTip (top).
    const cy = yTip - r;
    pts.push([xMin, yHinge], [xMax, yHinge]);
    pushArc(xMax - r, cy, 0, Math.PI * 0.5);
    pushArc(xMin + r, cy, Math.PI * 0.5, Math.PI);
  } else {
    // Extends downward (-Y): hinge at yHinge (top), rounded corners at yTip (bottom).
    const cy = yTip + r;
    pts.push([xMax, yHinge], [xMin, yHinge]);
    pushArc(xMin + r, cy, Math.PI, Math.PI * 1.5);
    pushArc(xMax - r, cy, Math.PI * 1.5, Math.PI * 2);
  }

  return ensureCCW(pts);
}

/**
 * Build the signature T-shaped stepped inner seal-end glue flap (Panel 3 on ECMA A10
 * overlap beverage multipack cartons): full-width shoulder over the dust flaps stepping
 * cleanly inward to a centered hot-melt glue tongue bonded beneath the outer cover flap.
 */
function buildSteppedGlueFlapPoly(input: {
  xMin: number;
  xMax: number;
  yHinge: number;
  totalLength: number;
  shoulderLength: number;
  stepInsetMm: number;
  dirY: 1 | -1;
}): Point2D[] {
  const { xMin, xMax, yHinge, dirY } = input;
  const span = Math.max(10, xMax - xMin);
  const totalLen = Math.max(8, input.totalLength);
  const shoulderLen = clampNum(input.shoulderLength, totalLen * 0.35, totalLen - 3);
  const inset = clampNum(input.stepInsetMm, 2, span * 0.3);

  const yShoulder = yHinge + dirY * shoulderLen;
  const yTip = yHinge + dirY * totalLen;
  const xStepL = xMin + inset;
  const xStepR = xMax - inset;

  return ensureCCW([
    [xMin, yHinge],
    [xMax, yHinge],
    [xMax, yShoulder],
    [xStepR, yShoulder],
    [xStepR, yTip],
    [xStepL, yTip],
    [xStepL, yShoulder],
    [xMin, yShoulder],
  ]);
}

/**
 * ECMA A10 / Overlap Seal-End Folding Carton (4-Can Beverage Multipack & Retail Glue-End Box).
 *
 * Industry-standard glued-end paperboard folding carton matching commercial 4-can multipack dielines:
 *  - Outside print-side-up 2D layout (left to right):
 *      [Glue Tab] — [Front (L)] — [Right (W)] — [Back (L)] — [Left (W)]
 *  - 3-layer zero-collision top & bottom closure stackup (`pivotOffsetMm = 0` on every joint):
 *      1. Innermost: Left & Right sweeping rounded dust flaps (`~46% W`, e.g. 51 mm on 110 mm pack)
 *      2. Middle:    Back Wall T-shaped stepped inner glue flap (`~78% W`, e.g. 85 mm)
 *      3. Outermost: Front Wall rounded full-overlap cover flap (`~78% W`, e.g. 85 mm) sealing
 *                    flush over the stepped glue tongue with zero center seam slit
 *  - Manufacturer glue joint tucked strictly outside the clear interior cavity behind Left Wall
 *  - Native 1-click "Pack Your Bottles" support (default 110×110×134 mm fits 4 × 250 mL slim cans 2×2!)
 */
export const ECMA_A10_SEAL_END_TEMPLATE: PackagingTemplateDefinition = {
  id: 'ecma-a10-seal-end',
  code: 'ECMA A10',
  name: 'Seal-End Folding Carton (4-Can)',
  shortName: 'Seal-End Carton',
  category: 'folding-box',
  tagline: 'Overlap glue-end retail & 4-can multipack folding carton with stepped seal flaps',
  description:
    'Commercial paperboard seal-end carton (ECMA A10 overlap style) featuring large rounded side dust flaps, T-shaped stepped inner glue flaps, and rounded outer cover flaps that bond seamlessly with no center gap. Built for 4-can / 6-can beverage multipacks and retail boxes.',
  defaultMaterialId: 'ivory-350',
  defaultDimensions: { length: 110, width: 110, height: 134 },
  minDimensions: { length: 50, width: 45, height: 55 },
  maxDimensions: { length: 500, width: 450, height: 500 },
  heroFold: 0.9,
  openPreviewFold: 0.66,
  features: {
    lockTabs: false,
    dustFlapTaper: false,
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
      id: 'seal-4can-250-slim',
      label: '4-Can 250ml Slim (2×2)',
      detail: '110 × 110 × 134 mm (Inner)',
      lengthMm: 110,
      widthMm: 110,
      heightMm: 134,
      dimensionMode: 'inner',
      materialId: 'ivory-350',
      beverageFit: '4 × 250ml Slim',
    },
    {
      id: 'seal-4can-330',
      label: '4-Can 330ml Pack (2×2)',
      detail: '136 × 136 × 118 mm (Inner)',
      lengthMm: 136,
      widthMm: 136,
      heightMm: 118,
      dimensionMode: 'inner',
      materialId: 'ivory-350',
      beverageFit: '4 × 330ml Cans',
    },
    {
      id: 'seal-6can-250-slim',
      label: '6-Can 250ml Slim (3×2)',
      detail: '168 × 112 × 134 mm (Inner)',
      lengthMm: 168,
      widthMm: 112,
      heightMm: 134,
      dimensionMode: 'inner',
      materialId: 'ivory-350',
      beverageFit: '6 × 250ml Slim',
    },
    {
      id: 'seal-4bottle-290',
      label: '4-Bottle 290ml Glass (2×2)',
      detail: '142 × 142 × 184 mm (Inner)',
      lengthMm: 142,
      widthMm: 142,
      heightMm: 184,
      dimensionMode: 'inner',
      materialId: 'kraft-350',
      beverageFit: '4 × 290ml Glass',
    },
    {
      id: 'seal-retail-tall',
      label: 'Retail Beverage / Food Box',
      detail: '90 × 70 × 165 mm (Inner)',
      lengthMm: 90,
      widthMm: 70,
      heightMm: 165,
      dimensionMode: 'inner',
      materialId: 'ivory-350',
    },
  ],

  solve(rawParams: PackagingParams, material: BoardMaterialPreset) {
    const clampNotices: string[] = [];
    const t = clampNum(rawParams.thicknessMm, 0.25, 4.0);
    const gap = clampNum(rawParams.slotClearanceMm, 0.08, 1.0);
    const Lreq = clampNum(rawParams.lengthMm, 50, 500);
    const Wreq = clampNum(rawParams.widthMm, 45, 450);
    const Hreq = clampNum(rawParams.heightMm, 55, 500);

    // 3-layer end stackup at BOTH top and bottom:
    //   dust flap (t) + gap + stepped inner glue flap (t) + gap + outer rounded cover flap (t)
    //   => heightStackTotal = 6*t + 4*gap = 4*outerStep + 2*t!
    // Along Length (L), manufacturer glue tab tucks strictly OUTSIDE clear cavity behind Left Wall.
    const outerStep = t + gap;
    const lengthStackTotal = 3 * t + gap;
    const heightStackTotal = 4 * outerStep + 2 * t;

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
      Winner = Math.max(30, Wouter - 2 * t);
      Hinner = Math.max(30, Houter - heightStackTotal);
    }

    // Back wall widens leftward by `outerStep` (`t + gap`) so Left Wall wraps cleanly outside
    // the folded Glue Tab while preserving an unobstructed `Linner` interior cavity.
    const Lback = Linner + outerStep;

    // Vertical height bands on the flat dieline (relative to `y = 0` = Back Wall bottom crease):
    //   • Back Wall (middle stepped glue flaps):   y ∈ [0, Hback]               where Hback = Hinner + 2*outerStep
    //   • Left/Right Walls (innermost dust flaps): y ∈ [outerStep, Hback - outerStep] (exact span Hinner)
    //   • Front Wall (outermost cover flaps):      y ∈ [-outerStep, Hback + outerStep] (span Hinner + 4*outerStep)
    const Hback = Hinner + 2 * outerStep;
    const yDustBot = outerStep;
    const yDustTop = Hback - outerStep;
    const yFrontBot = -outerStep;
    const yFrontTop = Hback + outerStep;

    // Exact proportions matching commercial 4-can seal-end dielines (e.g. 85 mm cover & stepped glue flaps,
    // 51 mm rounded dust flaps on a 110 mm square pack):
    const majorFlapLen = clampNum(Winner * 0.773, 18, Math.max(18, Winner - 2));
    const dustFlapLen = Math.max(12, Math.min(Winner * 0.464, Lback * 0.47));
    const dustCornerR = clampNum(Math.min(dustFlapLen * 0.44, Winner * 0.22), 4, 24);
    const coverCornerR = clampNum(Math.min(Linner * 0.085, majorFlapLen * 0.12), 2.5, 11);
    const glueShoulderLen = clampNum(majorFlapLen * 0.62, Math.min(dustFlapLen, majorFlapLen * 0.5), majorFlapLen - 5);
    const glueStepInset = clampNum(Lback * 0.175, 6, Lback * 0.24);

    const slotRelief = Math.max(0.6, t * 0.8);
    const glueTabW = clampNum(t * 6 + 13, 12, Math.min(26, Winner * 0.28));

    // Internal 2D CAD X layout (horizontally mirrored on Outside print-side-up SVG so it reads
    // left-to-right: [Glue Tab] — [Front (Panel 1)] — [Right (Panel 2)] — [Back (Panel 3)] — [Left (Panel 4)]):
    const xBackR = Linner * 0.5;
    const xBackL = -Linner * 0.5 - outerStep;
    const xLeftInner = xBackL - Winner;
    const xLeftOuter = xLeftInner - t;
    const xRightR = xBackR + Winner;
    const xFrontR = xRightR + Linner;
    const xFrontCap = xFrontR + t;

    const yGlueMin = yDustBot + gap;
    const yGlueMax = yDustTop - gap;
    const glueSpanY = Math.max(12, yGlueMax - yGlueMin);
    const glueTaper = clampNum(Math.min(10, glueTabW * 0.42, glueSpanY * 0.12), 2, 12);

    // Optional die-cut carry hand holes on Left & Right walls
    const leftHoles: Point2D[][] = [];
    const rightHoles: Point2D[][] = [];
    if (rawParams.handHoles) {
      const availW = Winner - 24;
      const availH = Hinner - 30;
      if (availW >= 32 && availH >= 16) {
        const hhW = clampNum(rawParams.handHoleWidthMm, 28, Math.min(96, availW));
        const hhH = clampNum(rawParams.handHoleHeightMm, 14, Math.min(28, availH));
        const yCenter = yDustBot + Hinner * 0.72;
        leftHoles.push(handHolePoly((xLeftInner + xBackL) * 0.5, yCenter, hhW, hhH));
        rightHoles.push(handHolePoly((xBackR + xRightR) * 0.5, yCenter, hhW, hhH));
      } else {
        clampNotices.push('Increase carton width or height slightly to fit side carry hand holes.');
      }
    }

    // Optional front retail display window cutout + transparent PET film
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
        const cy = (yDustBot + yDustTop) * 0.5;
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
        stageStart: 0.22,
        stageEnd: 0.4,
        renderCreaseFillet: true,
      },
      children: [],
    };

    // --- PANEL 1: FRONT WALL + GLUE TAB + OUTERMOST ROUNDED COVER FLAPS (85 mm) ---
    const frontWallOutline = ensureCCW([
      [xRightR, yFrontBot],
      [xFrontCap, yFrontBot],
      [xFrontCap, yGlueMin - 0.12],
      [xFrontR, yGlueMin - 0.12],
      [xFrontR, yGlueMax + 0.12],
      [xFrontCap, yGlueMax + 0.12],
      [xFrontCap, yFrontTop],
      [xRightR, yFrontTop],
    ]);

    const frontWall: PanelNode2D = {
      id: 'front-wall',
      label: 'Front Panel',
      shortCode: 'FRONT',
      faceRole: 'front',
      partGroup: 'length',
      printable: true,
      uprightAngleDeg: 0,
      outline: frontWallOutline,
      holes: frontHoles,
      windowFilms: frontFilms,
      hinge: {
        p1: [xRightR, yDustBot],
        p2: [xRightR, yDustTop],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.16,
        stageEnd: 0.36,
      },
      children: [
        glueTab,
        {
          id: 'bottom-front-flap',
          label: 'Bottom Outer Cover Flap',
          shortCode: 'B-COV',
          faceRole: 'flap',
          partGroup: 'flaps',
          printable: true,
          uprightAngleDeg: 0,
          outline: buildVerticalRoundedFlapPoly({
            xMin: xRightR + slotRelief,
            xMax: xFrontCap,
            yHinge: yFrontBot,
            length: majorFlapLen,
            dirY: -1,
            cornerRadiusMm: coverCornerR,
          }),
          hinge: {
            p1: [xRightR + slotRelief, yFrontBot],
            p2: [xFrontCap, yFrontBot],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.48,
            stageEnd: 0.62,
            renderCreaseFillet: true,
          },
          children: [],
        },
        {
          id: 'top-front-flap',
          label: 'Top Outer Cover Flap',
          shortCode: 'TOP',
          faceRole: 'top',
          partGroup: 'lid',
          printable: true,
          uprightAngleDeg: 0,
          outline: buildVerticalRoundedFlapPoly({
            xMin: xRightR + slotRelief,
            xMax: xFrontCap,
            yHinge: yFrontTop,
            length: majorFlapLen,
            dirY: 1,
            cornerRadiusMm: coverCornerR,
          }),
          hinge: {
            p1: [xRightR + slotRelief, yFrontTop],
            p2: [xFrontCap, yFrontTop],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.82,
            stageEnd: 1.0,
            renderCreaseFillet: true,
          },
          children: [],
        },
      ],
    };

    // --- PANEL 2: RIGHT SIDE WALL + FRONT WALL + LARGE-ROUNDED DUST FLAPS (51 mm) ---
    const rightWall: PanelNode2D = {
      id: 'right-wall',
      label: 'Right Side Panel',
      shortCode: 'RIGHT',
      faceRole: 'right',
      partGroup: 'width',
      printable: true,
      uprightAngleDeg: 0,
      outline: rectPoly(xBackR, yDustBot, xRightR, yDustTop),
      holes: rightHoles,
      hinge: {
        p1: [xBackR, yDustBot],
        p2: [xBackR, yDustTop],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.1,
        stageEnd: 0.3,
      },
      children: [
        frontWall,
        {
          id: 'bottom-right-flap',
          label: 'Bottom Right Dust Flap',
          shortCode: 'B-RGT',
          faceRole: 'flap',
          partGroup: 'flaps',
          printable: false,
          uprightAngleDeg: 180,
          outline: buildVerticalRoundedFlapPoly({
            xMin: xBackR + slotRelief,
            xMax: xRightR - slotRelief,
            yHinge: yDustBot,
            length: dustFlapLen,
            dirY: -1,
            cornerRadiusMm: dustCornerR,
          }),
          hinge: {
            p1: [xBackR + slotRelief, yDustBot],
            p2: [xRightR - slotRelief, yDustBot],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.34,
            stageEnd: 0.48,
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
          outline: buildVerticalRoundedFlapPoly({
            xMin: xBackR + slotRelief,
            xMax: xRightR - slotRelief,
            yHinge: yDustTop,
            length: dustFlapLen,
            dirY: 1,
            cornerRadiusMm: dustCornerR,
          }),
          hinge: {
            p1: [xBackR + slotRelief, yDustTop],
            p2: [xRightR - slotRelief, yDustTop],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.62,
            stageEnd: 0.74,
            renderCreaseFillet: true,
          },
          children: [],
        },
      ],
    };

    // --- PANEL 4: LEFT SIDE WALL + LARGE-ROUNDED DUST FLAPS (51 mm) ---
    const leftWall: PanelNode2D = {
      id: 'left-wall',
      label: 'Left Side Panel',
      shortCode: 'LEFT',
      faceRole: 'left',
      partGroup: 'width',
      printable: true,
      uprightAngleDeg: 0,
      outline: rectPoly(xLeftOuter, yDustBot, xBackL, yDustTop),
      holes: leftHoles,
      hinge: {
        p1: [xBackL, yDustBot],
        p2: [xBackL, yDustTop],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.1,
        stageEnd: 0.3,
      },
      children: [
        {
          id: 'bottom-left-flap',
          label: 'Bottom Left Dust Flap',
          shortCode: 'B-LFT',
          faceRole: 'flap',
          partGroup: 'flaps',
          printable: false,
          uprightAngleDeg: 180,
          outline: buildVerticalRoundedFlapPoly({
            xMin: xLeftInner + slotRelief,
            xMax: xBackL - slotRelief,
            yHinge: yDustBot,
            length: dustFlapLen,
            dirY: -1,
            cornerRadiusMm: dustCornerR,
          }),
          hinge: {
            p1: [xLeftInner + slotRelief, yDustBot],
            p2: [xBackL - slotRelief, yDustBot],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.34,
            stageEnd: 0.48,
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
          outline: buildVerticalRoundedFlapPoly({
            xMin: xLeftInner + slotRelief,
            xMax: xBackL - slotRelief,
            yHinge: yDustTop,
            length: dustFlapLen,
            dirY: 1,
            cornerRadiusMm: dustCornerR,
          }),
          hinge: {
            p1: [xLeftInner + slotRelief, yDustTop],
            p2: [xBackL - slotRelief, yDustTop],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.62,
            stageEnd: 0.74,
            renderCreaseFillet: true,
          },
          children: [],
        },
      ],
    };

    // --- PANEL 3: BACK WALL + TOP STEPPED INNER GLUE FLAP (85 mm) ---
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
        stageEnd: 0.2,
      },
      children: [
        leftWall,
        rightWall,
        {
          id: 'top-back-flap',
          label: 'Top Stepped Seal Flap',
          shortCode: 'T-SEAL',
          faceRole: 'flap',
          partGroup: 'lid',
          printable: true,
          uprightAngleDeg: 180,
          outline: buildSteppedGlueFlapPoly({
            xMin: xBackL + slotRelief,
            xMax: xBackR - slotRelief,
            yHinge: Hback,
            totalLength: majorFlapLen,
            shoulderLength: glueShoulderLen,
            stepInsetMm: glueStepInset,
            dirY: 1,
          }),
          hinge: {
            p1: [xBackL + slotRelief, Hback],
            p2: [xBackR - slotRelief, Hback],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.72,
            stageEnd: 0.84,
            renderCreaseFillet: true,
          },
          children: [],
        },
      ],
    };

    // --- ROOT: BOTTOM STEPPED INNER GLUE FLAP (middle bottom layer; outer bottom cover seals beneath it) ---
    const rootPanel: PanelNode2D = {
      id: 'base',
      label: 'Bottom Stepped Seal Flap',
      shortCode: 'BASE',
      faceRole: 'base',
      partGroup: 'length',
      printable: true,
      uprightAngleDeg: 180,
      outline: buildSteppedGlueFlapPoly({
        xMin: xBackL + slotRelief,
        xMax: xBackR - slotRelief,
        yHinge: 0,
        totalLength: majorFlapLen,
        shoulderLength: glueShoulderLen,
        stepInsetMm: glueStepInset,
        dirY: -1,
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
