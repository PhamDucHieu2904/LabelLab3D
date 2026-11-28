import type {
  BoardMaterialPreset,
  PackagingParams,
  PackagingTemplateDefinition,
  PanelNode2D,
  Point2D,
} from '../types';
import {
  ensureCCW,
  ensureCW,
  notchedRectPoly,
  rectPoly,
  roundedRectPoly,
} from '../geometry/polygon-ops';
import { clampNum, finalizeSolvedDieline } from './helpers';

/**
 * Build a G1-tangent tapered lid dust wing with generous rounded outer corners
 * extending horizontally from `xHinge` toward `xHinge + dirX * depth`.
 * Matches the smooth curved side wings of classic FEFCO 0427 mailer boxes.
 */
function buildLidDustWingPoly(input: {
  xHinge: number;
  yMin: number;
  yMax: number;
  depth: number;
  dirX: 1 | -1;
  backTaperMm: number;
  frontTaperMm: number;
  cornerRadiusMm: number;
  arcSegments?: number;
}): Point2D[] {
  const { xHinge, yMin, yMax, dirX, arcSegments = 8 } = input;
  const span = Math.max(8, yMax - yMin);
  const depth = Math.max(6, input.depth);
  const backTaper = clampNum(input.backTaperMm, 0, Math.min(span * 0.22, depth * 0.45));
  const frontTaper = clampNum(input.frontTaperMm, 0, Math.min(span * 0.22, depth * 0.45));
  const alphaBack = Math.atan2(backTaper, depth);
  const alphaFront = Math.atan2(frontTaper, depth);
  const maxR = Math.min(depth * 0.48, (span - backTaper - frontTaper) * 0.4);
  const r = clampNum(input.cornerRadiusMm, 0, Math.max(0, maxR));

  const xOuter = xHinge + dirX * depth;
  if (r <= 0.25) {
    return ensureCCW([
      [xHinge, yMin],
      [xOuter, yMin + backTaper],
      [xOuter, yMax - frontTaper],
      [xHinge, yMax],
    ]);
  }

  const sBack = (r * (1 - Math.sin(alphaBack))) / Math.max(1e-4, Math.cos(alphaBack));
  const sFront = (r * (1 - Math.sin(alphaFront))) / Math.max(1e-4, Math.cos(alphaFront));
  const cx = xOuter - dirX * r;
  const cyBack = yMin + backTaper + sBack;
  const cyFront = yMax - frontTaper - sFront;

  const pts: Point2D[] = [];
  const pushArc = (centerX: number, centerY: number, startAngle: number, endAngle: number) => {
    for (let i = 0; i <= arcSegments; i++) {
      const a = startAngle + ((endAngle - startAngle) * i) / arcSegments;
      pts.push([centerX + Math.cos(a) * r, centerY + Math.sin(a) * r]);
    }
  };

  if (dirX === 1) {
    pts.push([xHinge, yMin]);
    pushArc(cx, cyBack, -Math.PI / 2 + alphaBack, 0);
    pushArc(cx, cyFront, 0, Math.PI / 2 - alphaFront);
    pts.push([xHinge, yMax]);
  } else {
    pts.push([xHinge, yMax]);
    pushArc(cx, cyFront, Math.PI / 2 + alphaFront, Math.PI);
    pushArc(cx, cyBack, Math.PI, (Math.PI * 3) / 2 - alphaBack);
    pts.push([xHinge, yMin]);
  }

  return ensureCCW(pts);
}

/**
 * Build the signature rounded front-tuck locking ear hinged along the left or right vertical
 * crease of the outer Lid Front Tuck panel. When the lid closes and the front tuck wraps down
 * over the outside of the Front Wall, these rounded ears fold 90° backward and slide directly
 * into the left & right double-wall side locking slots ("khe hộp").
 */
function buildFrontTuckEarPoly(input: {
  xHinge: number;
  yMin: number;
  yMax: number;
  length: number;
  dirX: 1 | -1;
  botArcSegments?: number;
  topArcSegments?: number;
}): Point2D[] {
  const { xHinge, yMin, yMax, dirX, botArcSegments = 5, topArcSegments = 12 } = input;
  const h = Math.max(6, yMax - yMin);
  const len = Math.max(6, input.length);
  const xOuter = xHinge + dirX * len;

  const botTaper = clampNum(Math.min(h * 0.065, 2.5), 0, Math.min(h * 0.15, len * 0.25));
  const alphaBot = Math.atan2(botTaper, len);
  const rBot = clampNum(Math.min(h * 0.2, len * 0.22), 1.5, Math.min(h * 0.28, len * 0.3));
  const sBot = (rBot * (1 - Math.sin(alphaBot))) / Math.max(1e-4, Math.cos(alphaBot));

  const cxBot = xOuter - dirX * rBot;
  const cyBot = yMin + botTaper + sBot;

  // Sweeping quarter-ellipse guiding smoothly into the side locking pocket when tucked in.
  const rxTop = clampNum(len * 0.86, Math.min(len * 0.5, 4), Math.max(len * 0.5, len - 0.8));
  const ryTop = Math.max(2, yMax - cyBot);
  const cxTop = xOuter - dirX * rxTop;
  const cyTop = cyBot;

  const pts: Point2D[] = [];
  const pushArc = (
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    startAngle: number,
    endAngle: number,
    segs: number,
  ) => {
    for (let i = 0; i <= segs; i++) {
      const a = startAngle + ((endAngle - startAngle) * i) / segs;
      pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    }
  };

  if (dirX === 1) {
    pts.push([xHinge, yMin]);
    pushArc(cxBot, cyBot, rBot, rBot, -Math.PI / 2 + alphaBot, 0, botArcSegments);
    pushArc(cxTop, cyTop, rxTop, ryTop, 0, Math.PI / 2, topArcSegments);
    pts.push([xHinge, yMax]);
  } else {
    pts.push([xHinge, yMax]);
    pushArc(cxTop, cyTop, rxTop, ryTop, Math.PI / 2, Math.PI, topArcSegments);
    pushArc(cxBot, cyBot, rBot, rBot, Math.PI, (Math.PI * 3) / 2 - alphaBot, botArcSegments);
    pts.push([xHinge, yMin]);
  }

  return ensureCCW(pts);
}

/**
 * FEFCO 0427 — Roll-End Front-Lock (REFT) Low-Profile E-Commerce Mailer Box.
 *
 * Authentic real-world 3-beat mailer closing choreography:
 *  1. Base tray locks completely by `fold = 0.55`, forming double-walled rollover side channels
 *     ("khe hộp") between `left/right-wall` and `front/back corner flaps`.
 *  2. Lid dust wings fold 90° down (`0.52 → 0.64`) while `lid-front-tuck` and both rounded
 *     locking ears remain completely FLAT (`0°`). Then `top-lid` closes flush onto the tray (`0.62 → 0.80`).
 *  3. Only AFTER `top-lid` closes completely (`0.80`), both rounded side-locking ears fold 90°
 *     downward FIRST (`0.80 → 0.90`) aligning directly with the side channels, and FINALLY
 *     `lid-front-tuck` folds 90° downward (`0.89 → 1.00`) guiding both ears cleanly straight
 *     into the left & right side locking pockets ("khe hộp") with zero wall collision!
 *
 * Designed as a flat/low-profile gift & e-commerce mailer: packed bottles/cans lie horizontally
 * with an optional die-cut corrugated product insert tray ("Khay giấy định hình").
 */
export const FEFCO_0427_MAILER_TEMPLATE: PackagingTemplateDefinition = {
  id: 'fefco-0427-mailer',
  code: 'FEFCO 0427',
  name: 'Roll-End Tuck-Top Mailer Box',
  shortName: 'Mailer Box',
  category: 'mailer',
  tagline: 'Flat self-locking e-commerce mailer with side-slot ears & horizontal product tray',
  description:
    'Low-profile corrugated mailer with double rollover side walls, flat-closing lid front tuck wrapping outside the front wall, and rounded side-locking ears that tuck directly into the double-wall pockets. Ideal for flat e-commerce kits, cosmetics, apparel, and horizontal beverage gift boxes.',
  defaultMaterialId: 'kraft-e',
  defaultDimensions: { length: 240, width: 200, height: 65 },
  minDimensions: { length: 95, width: 85, height: 28 },
  maxDimensions: { length: 800, width: 700, height: 240 },
  heroFold: 0.69,
  openPreviewFold: 0.66,
  features: {
    lockTabs: true,
    dustFlapTaper: true,
    flapGap: false,
    tuckStyle: false,
    thumbNotch: true,
    handHoles: false,
    displayScoop: false,
    windowCutout: true,
    bottlePacking: true,
  },
  sizePresets: [
    {
      id: 'mailer-standard',
      label: 'Flat E-Commerce Mailer',
      detail: '240 × 200 × 65 mm (Inner)',
      lengthMm: 240,
      widthMm: 200,
      heightMm: 65,
      dimensionMode: 'inner',
    },
    {
      id: 'mailer-square-6x6',
      label: 'Classic Square (6×6×2")',
      detail: '152 × 152 × 51 mm (Inner)',
      lengthMm: 152,
      widthMm: 152,
      heightMm: 51,
      dimensionMode: 'inner',
    },
    {
      id: 'mailer-gift-3bottle',
      label: '3-Bottle Flat Gift Box',
      detail: '244 × 204 × 74 mm (Inner)',
      lengthMm: 244,
      widthMm: 204,
      heightMm: 74,
      dimensionMode: 'inner',
      materialId: 'white-e',
      beverageFit: '3 × 290ml Flat Gift',
    },
    {
      id: 'mailer-gift-4can',
      label: '4-Can Flat Tasting Box',
      detail: '314 × 139 × 72 mm (Inner)',
      lengthMm: 314,
      widthMm: 139,
      heightMm: 72,
      dimensionMode: 'inner',
      materialId: 'kraft-e',
      beverageFit: '4 × 330ml Flat Kit',
    },
    {
      id: 'mailer-apparel',
      label: 'Apparel / Flat Luxury Box',
      detail: '320 × 240 × 55 mm (Inner)',
      lengthMm: 320,
      widthMm: 240,
      heightMm: 55,
      dimensionMode: 'inner',
      materialId: 'black-e',
    },
  ],

  solve(rawParams: PackagingParams, material: BoardMaterialPreset) {
    const clampNotices: string[] = [];
    const t = clampNum(rawParams.thicknessMm, 0.25, 5.5);
    const gap = clampNum(rawParams.slotClearanceMm, 0.1, 1.2);
    const Lreq = clampNum(rawParams.lengthMm, 95, 800);
    const Wreq = clampNum(rawParams.widthMm, 85, 700);
    const Hreq = clampNum(rawParams.heightMm, 28, 240);

    // Real double-wall side pocket ("khe hộp") stackup from outer side wall inward along X:
    //   • Outer side wall:     [-halfL - t, -halfL]
    //   • Side lock ear slot:  [-halfL + gap, -halfL + t + gap]          (receives lid-tuck-left-ear!)
    //   • Front/back flap:     [-halfL + t + 2*gap, -halfL + 2*t + 2*gap]
    //   • Inner rollover wall: [-halfL + bridgeW, -halfL + bridgeW + t]  where bridgeW = 2*t + 3*gap
    //   • Lid dust wing:       [-lidHalfL - t, -lidHalfL]                strictly inside inner rollover wall by `gap`
    const bridgeW = 2 * t + 3 * gap;
    const sideWallStack = bridgeW + t;
    const lidSideInset = sideWallStack + t + gap; // 4*t + 4*gap

    let Lbase: number;
    let Wbase: number;
    let Hwall: number;
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
      Lbase = Linner + 2 * lidSideInset;
      Wbase = Winner;
      Hwall = Hinner;
      Louter = Lbase + 2 * t;
      // Front-to-back outer span: back-wall (t) + base (Wbase) + front-wall (t) + gap + outer lid-front-tuck (t).
      Wouter = Wbase + 3 * t + gap;
      Houter = Hwall + 2 * t;
    } else {
      Louter = Lreq;
      Wouter = Wreq;
      Houter = Hreq;
      Lbase = Math.max(54, Louter - 2 * t);
      Wbase = Math.max(46, Wouter - 3 * t - gap);
      Hwall = Math.max(16, Houter - 2 * t);
      Linner = Math.max(20, Lbase - 2 * lidSideInset);
      Winner = Wbase;
      Hinner = Hwall;
    }

    const halfL = Lbase * 0.5;
    const halfW = Wbase * 0.5;

    // Front & back corner flaps sit in the inner half of the side channel: x ∈ [-halfL + t + 2*gap, -halfL + 2*t + 2*gap].
    const flapLen = Math.max(14, Math.min(Hwall * 0.92, Wbase * 0.42));
    const taperAngle = clampNum(rawParams.dustFlapTaperDeg, 0, 20);
    const taperDrop = Math.min(Hwall * 0.24, Math.tan((taperAngle * Math.PI) / 180) * flapLen);

    // Base lock tabs & symmetric rectangular slots aligned strictly to the rollover inner wall plane.
    const tabCount: 1 | 2 = rawParams.lockTabCount === 2 ? 2 : 1;
    const maxTabW = tabCount === 2 ? Math.max(12, Wbase * 0.26) : Math.max(16, Wbase * 0.46);
    const tabW = clampNum(rawParams.lockTabWidthMm, 12, maxTabW);
    if (tabW < rawParams.lockTabWidthMm - 0.5) {
      clampNotices.push(`Lock tab width clamped to ${tabW.toFixed(0)} mm to preserve side wall margin.`);
    }
    const slotW = tabW + 2 * gap;
    const tabCentersY = tabCount === 2 ? [-Wbase * 0.27, Wbase * 0.27] : [0];
    const tabDepth = Math.min(8, Math.max(1.4, t + 0.12));

    const baseHoles: Point2D[][] = [];
    const leftSlotOuterX = -halfL + bridgeW - gap;
    const leftSlotInnerX = -halfL + bridgeW + t + gap;
    const rightSlotOuterX = halfL - bridgeW - t - gap;
    const rightSlotInnerX = halfL - bridgeW + gap;

    for (const cy of tabCentersY) {
      baseHoles.push(
        ensureCW([
          [leftSlotOuterX, cy - slotW * 0.5],
          [leftSlotInnerX, cy - slotW * 0.5],
          [leftSlotInnerX, cy + slotW * 0.5],
          [leftSlotOuterX, cy + slotW * 0.5],
        ]),
      );
      baseHoles.push(
        ensureCW([
          [rightSlotOuterX, cy - slotW * 0.5],
          [rightSlotInnerX, cy - slotW * 0.5],
          [rightSlotInnerX, cy + slotW * 0.5],
          [rightSlotOuterX, cy + slotW * 0.5],
        ]),
      );
    }

    const bottomRelief = Math.max(t + 0.3, 1.5);
    const topRelief = 0.08;
    const innerHeight = Math.max(10, Hwall - 0.18);
    // Corner flaps hinge at ±flapBaseHalfL so after 90° fold they occupy the inner half of the side pocket,
    // leaving the outer half `[-halfL + gap, -halfL + t + gap]` completely clear for the front tuck locking ears!
    const flapInsetX = 2 * t + 2 * gap;
    const flapBaseHalfL = Math.max(12, halfL - flapInsetX);
    const outerSideHalfW = halfW + t;
    const innerInsetY = 0.08;

    // Top Lid extends from back inner face (z = -halfW) forward across front-wall to z = +halfW + t + gap
    // so `lid-front-tuck` folds cleanly down OVER the OUTSIDE of `front-wall`!
    const lidHalfL = Math.max(12, halfL - lidSideInset);
    const Wlid = Wbase + t + gap;
    const lidY0 = halfW + Hwall;
    const lidY1 = lidY0 + Wlid;

    // Lid dust wings fold 90° down strictly INSIDE `left/right-inner-wall` AND strictly BEHIND `front-wall` (`z < +halfW`).
    const wingDepth = Math.max(10, Hwall - Math.max(1.2, t * 0.6));
    const wingBackRelief = Math.max(1.2, t * 0.75);
    const wingFrontRelief = Math.max(1.2, t * 0.75);
    const wingYMin = lidY0 + wingBackRelief;
    const wingYMax = Math.max(wingYMin + 8, lidY0 + Wbase - wingFrontRelief);
    const wingSpan = wingYMax - wingYMin;
    const wingTaper = clampNum(Math.min(wingDepth * 0.14, wingSpan * 0.07), 1.5, 9);
    const wingCornerR = clampNum(Math.min(wingDepth * 0.42, wingSpan * 0.22), 3, 24);

    // Outer Lid Front Tuck wraps over the outside of `front-wall` (z ∈ [+halfW + t + gap, +halfW + 2*t + gap]).
    // Its side creases sit at ±tuckHalfL = ±(halfL - t - gap) so the locking ears fold 90° backward directly
    // into `[-halfL + gap, -halfL + t + gap]` (the open side slot between `left-wall` and `front-left-flap`!).
    const tuckHalfL = Math.max(lidHalfL, halfL - t - gap);
    const tuckDepth = Math.max(10, Hwall + t * 0.82);
    const earTopRelief = Math.max(0.8, gap * 2);
    const earBottomClearance = Math.max(1.2, t * 0.6);
    const earYMin = lidY1 + earTopRelief;
    const earYMax = Math.max(earYMin + 8, lidY1 + Hwall - earBottomClearance);
    const earLen = Math.max(10, Math.min(Hwall * 0.94, Wbase * 0.43));

    // Optional Top Lid display window cutout with transparent PET film.
    const lidHoles: Point2D[][] = [];
    const lidFilms: Point2D[][] = [];
    if (rawParams.windowCutout) {
      const margin = Math.max(12, t * 5);
      const maxWinW = Math.max(16, lidHalfL * 2 - margin * 2);
      const maxWinH = Math.max(16, Wbase - margin * 2);
      if (maxWinW >= 20 && maxWinH >= 20) {
        const winW = clampNum(rawParams.windowWidthMm, 18, maxWinW);
        const winH = clampNum(rawParams.windowHeightMm, 18, maxWinH);
        const winR = clampNum(rawParams.windowRadiusMm, 0, Math.min(winW, winH) * 0.45);
        const cy = lidY0 + Wbase * 0.5;
        lidHoles.push(
          roundedRectPoly(-winW * 0.5, cy - winH * 0.5, winW * 0.5, cy + winH * 0.5, winR, 6, true),
        );
        if (rawParams.windowFilm) {
          lidFilms.push(
            roundedRectPoly(
              -winW * 0.5 - 2,
              cy - winH * 0.5 - 2,
              winW * 0.5 + 2,
              cy + winH * 0.5 + 2,
              winR,
              6,
              false,
            ),
          );
        }
      } else {
        clampNotices.push('Top lid is too compact for a display window cutout.');
      }
    }

    // Optional thumb notch on inner front wall (off by default for clean mailer silhouette).
    const frontOutline = rawParams.thumbNotch
      ? notchedRectPoly(
          -flapBaseHalfL,
          -halfW - Hwall,
          flapBaseHalfL,
          -halfW,
          'bottom',
          clampNum(rawParams.thumbNotchRadiusMm * 2, 14, Math.min(48, flapBaseHalfL * 0.7)),
          clampNum(rawParams.thumbNotchRadiusMm, 6, Math.min(20, Hwall * 0.4)),
          10,
        )
      : rectPoly(-flapBaseHalfL, -halfW - Hwall, flapBaseHalfL, -halfW);

    // Helper: construct rollover inner wall polygon WITH protruding bottom locking tab(s).
    const buildInnerWallWithTabs = (side: 'left' | 'right'): Point2D[] => {
      const yMin = -halfW + innerInsetY;
      const yMax = halfW - innerInsetY;
      const chamfer = Math.min(2.0, tabDepth * 0.35);
      const sortedTabs = [...tabCentersY].sort((a, b) => a - b);

      if (side === 'left') {
        const xHinge = -halfL - Hwall - bridgeW;
        const xBottom = xHinge - innerHeight;
        const xTip = xBottom - tabDepth;
        const pts: Point2D[] = [
          [xHinge, yMin],
          [xHinge, yMax],
          [xBottom, yMax],
        ];
        for (let i = sortedTabs.length - 1; i >= 0; i--) {
          const cy = sortedTabs[i];
          const topY = Math.min(yMax - 2, cy + tabW * 0.5);
          const botY = Math.max(yMin + 2, cy - tabW * 0.5);
          pts.push(
            [xBottom, topY],
            [xTip, topY - chamfer],
            [xTip, botY + chamfer],
            [xBottom, botY],
          );
        }
        pts.push([xBottom, yMin]);
        return ensureCCW(pts);
      }

      const xHinge = halfL + Hwall + bridgeW;
      const xBottom = xHinge + innerHeight;
      const xTip = xBottom + tabDepth;
      const pts: Point2D[] = [
        [xHinge, yMax],
        [xHinge, yMin],
        [xBottom, yMin],
      ];
      for (let i = 0; i < sortedTabs.length; i++) {
        const cy = sortedTabs[i];
        const botY = Math.max(yMin + 2, cy - tabW * 0.5);
        const topY = Math.min(yMax - 2, cy + tabW * 0.5);
        pts.push(
          [xBottom, botY],
          [xTip, botY + chamfer],
          [xTip, topY - chamfer],
          [xBottom, topY],
        );
      }
      pts.push([xBottom, yMax]);
      return ensureCCW(pts);
    };

    // --- OUTER LID FRONT TUCK + ROUNDED SIDE-SLOT LOCKING EARS ---
    // Choreography:
    //  • Both `lid-front-tuck` and its 2 locking ears stay 100% FLAT (0°) while `top-lid` closes (0.62 → 0.80).
    //  • Once `top-lid` is flat closed (0.80), the 2 rounded locking ears fold 90° inward FIRST (0.80 → 0.90),
    //    aligning directly in-plane with the left & right side channels ("khe hộp").
    //  • Finally, `lid-front-tuck` folds 90° downward (0.89 → 1.00) over the outside of `front-wall`,
    //    sweeping both already-folded ears smoothly straight into the side pockets with zero wall clipping!
    const lidFrontTuck: PanelNode2D = {
      id: 'lid-front-tuck',
      label: 'Lid Front Tuck',
      shortCode: 'TUCK',
      faceRole: 'front',
      partGroup: 'lid',
      printable: true,
      uprightAngleDeg: 180,
      outline: rectPoly(-tuckHalfL, lidY1, tuckHalfL, lidY1 + tuckDepth),
      hinge: {
        p1: [-lidHalfL, lidY1],
        p2: [lidHalfL, lidY1],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.89,
        stageEnd: 1.0,
        renderCreaseFillet: true,
      },
      children: [
        {
          id: 'lid-tuck-left-ear',
          label: 'Front Tuck Left Locking Ear',
          shortCode: 'L-EAR',
          faceRole: 'flap',
          partGroup: 'lid',
          uprightAngleDeg: 90,
          outline: buildFrontTuckEarPoly({
            xHinge: -tuckHalfL,
            yMin: earYMin,
            yMax: earYMax,
            length: earLen,
            dirX: -1,
          }),
          hinge: {
            p1: [-tuckHalfL, earYMin],
            p2: [-tuckHalfL, earYMax],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.8,
            stageEnd: 0.9,
            renderCreaseFillet: true,
          },
          children: [],
        },
        {
          id: 'lid-tuck-right-ear',
          label: 'Front Tuck Right Locking Ear',
          shortCode: 'R-EAR',
          faceRole: 'flap',
          partGroup: 'lid',
          uprightAngleDeg: -90,
          outline: buildFrontTuckEarPoly({
            xHinge: tuckHalfL,
            yMin: earYMin,
            yMax: earYMax,
            length: earLen,
            dirX: 1,
          }),
          hinge: {
            p1: [tuckHalfL, earYMin],
            p2: [tuckHalfL, earYMax],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.8,
            stageEnd: 0.9,
            renderCreaseFillet: true,
          },
          children: [],
        },
      ],
    };

    const topLid: PanelNode2D = {
      id: 'top-lid',
      label: 'Top Lid',
      shortCode: 'TOP',
      faceRole: 'top',
      partGroup: 'lid',
      printable: true,
      uprightAngleDeg: 180,
      outline: rectPoly(-lidHalfL, lidY0, lidHalfL, lidY1),
      holes: lidHoles,
      windowFilms: lidFilms,
      hinge: {
        p1: [-lidHalfL, lidY0],
        p2: [lidHalfL, lidY0],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.62,
        stageEnd: 0.8,
        renderCreaseFillet: true,
      },
      children: [
        lidFrontTuck,
        {
          id: 'lid-left-wing',
          label: 'Lid Left Dust Wing',
          shortCode: 'L-WNG',
          faceRole: 'flap',
          partGroup: 'flaps',
          uprightAngleDeg: 90,
          outline: buildLidDustWingPoly({
            xHinge: -lidHalfL,
            yMin: wingYMin,
            yMax: wingYMax,
            depth: wingDepth,
            dirX: -1,
            backTaperMm: wingTaper,
            frontTaperMm: wingTaper,
            cornerRadiusMm: wingCornerR,
          }),
          hinge: {
            p1: [-lidHalfL, wingYMin],
            p2: [-lidHalfL, wingYMax],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.52,
            stageEnd: 0.64,
            renderCreaseFillet: true,
          },
          children: [],
        },
        {
          id: 'lid-right-wing',
          label: 'Lid Right Dust Wing',
          shortCode: 'R-WNG',
          faceRole: 'flap',
          partGroup: 'flaps',
          uprightAngleDeg: -90,
          outline: buildLidDustWingPoly({
            xHinge: lidHalfL,
            yMin: wingYMin,
            yMax: wingYMax,
            depth: wingDepth,
            dirX: 1,
            backTaperMm: wingTaper,
            frontTaperMm: wingTaper,
            cornerRadiusMm: wingCornerR,
          }),
          hinge: {
            p1: [lidHalfL, wingYMin],
            p2: [lidHalfL, wingYMax],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.52,
            stageEnd: 0.64,
            renderCreaseFillet: true,
          },
          children: [],
        },
      ],
    };

    // --- INNER FRONT WALL + FRONT CORNER FLAPS ---
    const frontWall: PanelNode2D = {
      id: 'front-wall',
      label: 'Front Wall',
      shortCode: 'FRONT',
      faceRole: 'front',
      partGroup: 'height',
      printable: true,
      uprightAngleDeg: 180,
      outline: frontOutline,
      hinge: {
        p1: [-flapBaseHalfL, -halfW],
        p2: [flapBaseHalfL, -halfW],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.0,
        stageEnd: 0.14,
      },
      children: [
        {
          id: 'front-left-flap',
          label: 'Front-Left Corner Flap',
          shortCode: 'FL',
          faceRole: 'flap',
          partGroup: 'flaps',
          uprightAngleDeg: 90,
          outline: ensureCCW([
            [-flapBaseHalfL, -halfW - bottomRelief],
            [-flapBaseHalfL - flapLen, -halfW - bottomRelief - taperDrop * 0.4],
            [-flapBaseHalfL - flapLen, -halfW - Hwall + topRelief + taperDrop],
            [-flapBaseHalfL, -halfW - Hwall + topRelief],
          ]),
          hinge: {
            p1: [-flapBaseHalfL, -halfW - bottomRelief],
            p2: [-flapBaseHalfL, -halfW - Hwall + topRelief],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.1,
            stageEnd: 0.24,
            renderCreaseFillet: true,
          },
          children: [],
        },
        {
          id: 'front-right-flap',
          label: 'Front-Right Corner Flap',
          shortCode: 'FR',
          faceRole: 'flap',
          partGroup: 'flaps',
          uprightAngleDeg: -90,
          outline: ensureCCW([
            [flapBaseHalfL, -halfW - bottomRelief],
            [flapBaseHalfL, -halfW - Hwall + topRelief],
            [flapBaseHalfL + flapLen, -halfW - Hwall + topRelief + taperDrop],
            [flapBaseHalfL + flapLen, -halfW - bottomRelief - taperDrop * 0.4],
          ]),
          hinge: {
            p1: [flapBaseHalfL, -halfW - bottomRelief],
            p2: [flapBaseHalfL, -halfW - Hwall + topRelief],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.1,
            stageEnd: 0.24,
            renderCreaseFillet: true,
          },
          children: [],
        },
      ],
    };

    // --- BACK SPINE WALL + BACK CORNER FLAPS + HINGED TOP LID ---
    const backWall: PanelNode2D = {
      id: 'back-wall',
      label: 'Back Spine Wall',
      shortCode: 'BACK',
      faceRole: 'back',
      partGroup: 'height',
      printable: true,
      uprightAngleDeg: 0,
      outline: rectPoly(-flapBaseHalfL, halfW, flapBaseHalfL, halfW + Hwall),
      hinge: {
        p1: [-flapBaseHalfL, halfW],
        p2: [flapBaseHalfL, halfW],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.0,
        stageEnd: 0.14,
      },
      children: [
        topLid,
        {
          id: 'back-left-flap',
          label: 'Back-Left Corner Flap',
          shortCode: 'BL',
          faceRole: 'flap',
          partGroup: 'flaps',
          uprightAngleDeg: 90,
          outline: ensureCCW([
            [-flapBaseHalfL, halfW + bottomRelief],
            [-flapBaseHalfL, halfW + Hwall - topRelief],
            [-flapBaseHalfL - flapLen, halfW + Hwall - topRelief - taperDrop],
            [-flapBaseHalfL - flapLen, halfW + bottomRelief + taperDrop * 0.4],
          ]),
          hinge: {
            p1: [-flapBaseHalfL, halfW + bottomRelief],
            p2: [-flapBaseHalfL, halfW + Hwall - topRelief],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.1,
            stageEnd: 0.24,
            renderCreaseFillet: true,
          },
          children: [],
        },
        {
          id: 'back-right-flap',
          label: 'Back-Right Corner Flap',
          shortCode: 'BR',
          faceRole: 'flap',
          partGroup: 'flaps',
          uprightAngleDeg: -90,
          outline: ensureCCW([
            [flapBaseHalfL, halfW + bottomRelief],
            [flapBaseHalfL + flapLen, halfW + bottomRelief + taperDrop * 0.4],
            [flapBaseHalfL + flapLen, halfW + Hwall - topRelief - taperDrop],
            [flapBaseHalfL, halfW + Hwall - topRelief],
          ]),
          hinge: {
            p1: [flapBaseHalfL, halfW + bottomRelief],
            p2: [flapBaseHalfL, halfW + Hwall - topRelief],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.1,
            stageEnd: 0.24,
            renderCreaseFillet: true,
          },
          children: [],
        },
      ],
    };

    // --- LEFT DOUBLE-WALL ROLLOVER SIDE (CREATES LEFT SIDE LOCKING SLOT "KHE HỘP") ---
    const leftOuterWall: PanelNode2D = {
      id: 'left-wall',
      label: 'Left Side Wall',
      shortCode: 'LEFT',
      faceRole: 'left',
      partGroup: 'width',
      printable: true,
      uprightAngleDeg: 90,
      outline: rectPoly(-halfL - Hwall, -outerSideHalfW, -halfL, outerSideHalfW),
      hinge: {
        p1: [-halfL, -halfW],
        p2: [-halfL, halfW],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.22,
        stageEnd: 0.36,
      },
      children: [
        {
          id: 'left-bridge',
          label: 'Left Top Rim',
          shortCode: 'L-RIM',
          faceRole: 'bridge',
          partGroup: 'locks',
          uprightAngleDeg: 90,
          outline: ensureCCW([
            [-halfL - Hwall, -outerSideHalfW],
            [-halfL - Hwall, outerSideHalfW],
            [-halfL - Hwall - bridgeW, halfW - innerInsetY],
            [-halfL - Hwall - bridgeW, -halfW + innerInsetY],
          ]),
          hinge: {
            p1: [-halfL - Hwall, -outerSideHalfW],
            p2: [-halfL - Hwall, outerSideHalfW],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.34,
            stageEnd: 0.45,
          },
          children: [
            {
              id: 'left-inner-wall',
              label: 'Left Inner Rollover',
              shortCode: 'L-IN',
              faceRole: 'inner',
              partGroup: 'locks',
              uprightAngleDeg: -90,
              outline: buildInnerWallWithTabs('left'),
              hinge: {
                p1: [-halfL - Hwall - bridgeW, -halfW + innerInsetY],
                p2: [-halfL - Hwall - bridgeW, halfW - innerInsetY],
                foldDirection: 'inward',
                targetAngleDeg: 90,
                stageStart: 0.42,
                stageEnd: 0.55,
              },
              children: [],
            },
          ],
        },
      ],
    };

    // --- RIGHT DOUBLE-WALL ROLLOVER SIDE (CREATES RIGHT SIDE LOCKING SLOT "KHE HỘP") ---
    const rightOuterWall: PanelNode2D = {
      id: 'right-wall',
      label: 'Right Side Wall',
      shortCode: 'RIGHT',
      faceRole: 'right',
      partGroup: 'width',
      printable: true,
      uprightAngleDeg: -90,
      outline: rectPoly(halfL, -outerSideHalfW, halfL + Hwall, outerSideHalfW),
      hinge: {
        p1: [halfL, -halfW],
        p2: [halfL, halfW],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.22,
        stageEnd: 0.36,
      },
      children: [
        {
          id: 'right-bridge',
          label: 'Right Top Rim',
          shortCode: 'R-RIM',
          faceRole: 'bridge',
          partGroup: 'locks',
          uprightAngleDeg: -90,
          outline: ensureCCW([
            [halfL + Hwall, -outerSideHalfW],
            [halfL + Hwall + bridgeW, -halfW + innerInsetY],
            [halfL + Hwall + bridgeW, halfW - innerInsetY],
            [halfL + Hwall, outerSideHalfW],
          ]),
          hinge: {
            p1: [halfL + Hwall, -outerSideHalfW],
            p2: [halfL + Hwall, outerSideHalfW],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.34,
            stageEnd: 0.45,
          },
          children: [
            {
              id: 'right-inner-wall',
              label: 'Right Inner Rollover',
              shortCode: 'R-IN',
              faceRole: 'inner',
              partGroup: 'locks',
              uprightAngleDeg: 90,
              outline: buildInnerWallWithTabs('right'),
              hinge: {
                p1: [halfL + Hwall + bridgeW, -halfW + innerInsetY],
                p2: [halfL + Hwall + bridgeW, halfW - innerInsetY],
                foldDirection: 'inward',
                targetAngleDeg: 90,
                stageStart: 0.42,
                stageEnd: 0.55,
              },
              children: [],
            },
          ],
        },
      ],
    };

    const rootPanel: PanelNode2D = {
      id: 'base',
      label: 'Base Panel',
      shortCode: 'BASE',
      faceRole: 'base',
      partGroup: 'length',
      printable: true,
      uprightAngleDeg: 0,
      outline: rectPoly(-halfL, -halfW, halfL, halfW),
      holes: baseHoles,
      children: [frontWall, backWall, leftOuterWall, rightOuterWall],
    };

    return finalizeSolvedDieline({
      templateId: this.id,
      templateCode: this.code,
      templateName: this.name,
      params: { ...rawParams, thicknessMm: t, lengthMm: Lreq, widthMm: Wreq, heightMm: Hreq, lockTabWidthMm: tabW },
      material,
      innerMm: { length: Linner, width: Winner, height: Hinner },
      outerMm: { length: Louter, width: Wouter, height: Houter },
      rootPanel,
      contentAnchor: {
        panelId: 'base',
        center2D: [0, 0],
        floorOffsetMm: t * 0.5,
      },
      clampNotices,
    });
  },
};
