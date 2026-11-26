import type {
  BoardMaterialPreset,
  PackagingParams,
  PackagingTemplateDefinition,
  PanelNode2D,
  Point2D,
} from '../types';
import { ensureCCW, handHolePoly, rectPoly } from '../geometry/polygon-ops';
import { clampNum, finalizeSolvedDieline } from './helpers';

/**
 * Build a G1-tangent tapered flap polygon with smoothly rounded outer corners
 * extending horizontally from `xHinge` toward `xHinge + dirX * length`.
 */
function buildHorizontalRoundedFlapPoly(input: {
  xHinge: number;
  yMin: number;
  yMax: number;
  length: number;
  dirX: 1 | -1;
  taperMm: number;
  cornerRadiusMm: number;
  arcSegments?: number;
}): Point2D[] {
  const { xHinge, yMin, yMax, length, dirX, arcSegments = 5 } = input;
  const span = Math.max(4, yMax - yMin);
  const len = Math.max(4, length);
  const taper = clampNum(input.taperMm, 0, Math.min(span * 0.28, len * 0.45));
  const alpha = Math.atan2(taper, len);
  const maxR = Math.min(len * 0.42, (span - 2 * taper) * 0.36);
  const r = clampNum(input.cornerRadiusMm, 0, Math.max(0, maxR));

  const xTip = xHinge + dirX * len;
  const pts: Point2D[] = [];

  if (r <= 0.25) {
    pts.push(
      [xHinge, yMin],
      [xTip, yMin + taper],
      [xTip, yMax - taper],
      [xHinge, yMax],
    );
    return ensureCCW(pts);
  }

  // Tangent setback along tip & slanted side edges for interior angle (π/2 + α):
  // s = r * (1 - sin α) / cos α
  const s = (r * (1 - Math.sin(alpha))) / Math.max(1e-4, Math.cos(alpha));
  const cx = xTip - dirX * r;
  const cyBot = yMin + taper + s;
  const cyTop = yMax - taper - s;

  const pushArc = (centerX: number, centerY: number, startAngle: number, endAngle: number) => {
    for (let i = 0; i <= arcSegments; i++) {
      const a = startAngle + ((endAngle - startAngle) * i) / arcSegments;
      pts.push([centerX + Math.cos(a) * r, centerY + Math.sin(a) * r]);
    }
  };

  if (dirX === 1) {
    pts.push([xHinge, yMin]);
    pushArc(cx, cyBot, -Math.PI / 2 + alpha, 0);
    pushArc(cx, cyTop, 0, Math.PI / 2 - alpha);
    pts.push([xHinge, yMax]);
  } else {
    pts.push([xHinge, yMax]);
    pushArc(cx, cyTop, Math.PI / 2 + alpha, Math.PI);
    pushArc(cx, cyBot, Math.PI, (Math.PI * 3) / 2 - alpha);
    pts.push([xHinge, yMin]);
  }

  return ensureCCW(pts);
}

/**
 * Build a G1-tangent tapered manufacturer glue tab with smoothly rounded outer corners
 * extending vertically downward (-Y) from `yHinge` to `yHinge - depth`.
 */
function buildBottomGlueTabPoly(input: {
  xMin: number;
  xMax: number;
  yHinge: number;
  depth: number;
  taperMm: number;
  cornerRadiusMm: number;
  arcSegments?: number;
}): Point2D[] {
  const { xMin, xMax, yHinge, depth, arcSegments = 5 } = input;
  const span = Math.max(10, xMax - xMin);
  const d = Math.max(6, depth);
  const taper = clampNum(input.taperMm, 0, Math.min(span * 0.2, d * 0.65));
  const alpha = Math.atan2(taper, d);
  const maxR = Math.min(d * 0.38, (span - 2 * taper) * 0.25);
  const r = clampNum(input.cornerRadiusMm, 0, Math.max(0, maxR));
  const yTip = yHinge - d;

  if (r <= 0.25) {
    return ensureCCW([
      [xMin, yHinge],
      [xMin + taper, yTip],
      [xMax - taper, yTip],
      [xMax, yHinge],
    ]);
  }

  const s = (r * (1 - Math.sin(alpha))) / Math.max(1e-4, Math.cos(alpha));
  const cy = yTip + r;
  const cxL = xMin + taper + s;
  const cxR = xMax - taper - s;
  const pts: Point2D[] = [[xMin, yHinge]];

  for (let i = 0; i <= arcSegments; i++) {
    const a = Math.PI + alpha + ((Math.PI * 1.5 - (Math.PI + alpha)) * i) / arcSegments;
    pts.push([cxL + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  for (let i = 0; i <= arcSegments; i++) {
    const a = -Math.PI / 2 + ((0 - alpha - -Math.PI / 2) * i) / arcSegments;
    pts.push([cxR + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  pts.push([xMax, yHinge]);

  return ensureCCW(pts);
}

/**
 * FEFCO 0201E — Side-Open Beer Case / End-Load Regular Slotted Carton (Thùng bia mở nắp hông).
 * Standard 4-panel horizontal wrap-around beverage case opening from the Left & Right side ends:
 *  - Continuous 4-panel body tube (Base, Front, Back, Top) with tapered rounded manufacturer glue joint
 *    tucked cleanly underneath the Top Panel (zero protrusion, zero Z-fighting)
 *  - Stepped outer-flap crease offset (`t + gap`) matching industrial corrugated die-cutting so outer
 *    major flaps wrap smoothly over inner dust flaps with exact millimeter clearance
 *  - Tapered rounded side-opening major flaps & inner dust flaps matching real 12/24-can beer cartons
 *  - Staged kinematics: Left side closes first, Right side opens last facing the 3/4 hero camera
 *  - Native 1-click "Pack Your Bottles" support (24×330ml 6×4, 12×330ml 4×3, 6-pack fridge case)
 */
export const FEFCO_0201E_BEER_CASE_TEMPLATE: PackagingTemplateDefinition = {
  id: 'fefco-0201e-beer-case',
  code: 'FEFCO 0201E',
  name: 'Side-Open Beer Case (End-Load)',
  shortName: 'Beer Case',
  category: 'carton',
  tagline: 'End-load beer & beverage carton with side-opening flaps',
  description:
    'Classic side-loading beer and beverage carton (24-can / 12-can case) that opens from the left and right ends. Features offset outer flap creases, tapered rounded major & dust flaps, manufacturer glue tab, and optional carry hand holes.',
  defaultMaterialId: 'kraft-b',
  defaultDimensions: { length: 406, width: 272, height: 122 },
  minDimensions: { length: 120, width: 90, height: 60 },
  maxDimensions: { length: 900, width: 700, height: 500 },
  heroFold: 0.91,
  openPreviewFold: 0.72,
  features: {
    lockTabs: false,
    dustFlapTaper: true,
    flapGap: true,
    tuckStyle: false,
    thumbNotch: false,
    handHoles: true,
    displayScoop: false,
    windowCutout: false,
    bottlePacking: true,
  },
  sizePresets: [
    {
      id: 'beer-24-can-330',
      label: '24-Can 330ml Beer Case (6×4)',
      detail: '406 × 272 × 122 mm (Inner)',
      lengthMm: 406,
      widthMm: 272,
      heightMm: 122,
      dimensionMode: 'inner',
      materialId: 'kraft-b',
      beverageFit: '24 × 330ml Cans',
    },
    {
      id: 'beer-12-can-330',
      label: '12-Can 330ml Case (4×3)',
      detail: '274 × 206 × 122 mm (Inner)',
      lengthMm: 274,
      widthMm: 206,
      heightMm: 122,
      dimensionMode: 'inner',
      materialId: 'white-b',
      beverageFit: '12 × 330ml Cans',
    },
    {
      id: 'beer-24-can-500',
      label: '24-Can 500ml Tallboy (6×4)',
      detail: '408 × 274 × 174 mm (Inner)',
      lengthMm: 408,
      widthMm: 274,
      heightMm: 174,
      dimensionMode: 'inner',
      materialId: 'kraft-b',
      beverageFit: '24 × 500ml Cans',
    },
    {
      id: 'beer-24-slim-320',
      label: '24-Can 320ml Sleek (6×4)',
      detail: '360 × 242 × 152 mm (Inner)',
      lengthMm: 360,
      widthMm: 242,
      heightMm: 152,
      dimensionMode: 'inner',
      materialId: 'white-e',
      beverageFit: '24 × 320ml Sleek',
    },
    {
      id: 'beer-6-can-fridge',
      label: '6-Can Fridge Pack (3×2)',
      detail: '206 × 140 × 122 mm (Inner)',
      lengthMm: 206,
      widthMm: 140,
      heightMm: 122,
      dimensionMode: 'inner',
      materialId: 'white-e',
      beverageFit: '6 × 330ml Cans',
    },
  ],

  solve(rawParams: PackagingParams, material: BoardMaterialPreset) {
    const clampNotices: string[] = [];
    const t = clampNum(rawParams.thicknessMm, 0.4, 8);
    const gap = clampNum(rawParams.slotClearanceMm, 0.1, 1.5);
    const Lreq = clampNum(rawParams.lengthMm, 120, 900);
    const Wreq = clampNum(rawParams.widthMm, 90, 700);
    const Hreq = clampNum(rawParams.heightMm, 60, 500);

    // Outer major flaps fold over inner dust flaps: each end adds (inner dust t + gap + outer major t).
    const outerStep = t + gap;
    const endStackTotal = 2 * (outerStep + t); // 4t + 2*gap

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
      Louter = Linner + endStackTotal;
      Wouter = Winner + 2 * t;
      Houter = Hinner + 2 * t;
    } else {
      Louter = Lreq;
      Wouter = Wreq;
      Houter = Hreq;
      Linner = Math.max(60, Louter - endStackTotal);
      Winner = Math.max(50, Wouter - 2 * t);
      Hinner = Math.max(36, Houter - 2 * t);
    }

    const halfL = Linner * 0.5;
    const halfW = Winner * 0.5;
    const Hwall = Hinner;
    // Front wall height reserves (t + gap) so the attached manufacturer glue tab folds 90° inward
    // directly underneath the Top Panel's interior surface with exact `gap` clearance.
    const Hfront = Math.max(20, Hwall - t - gap);

    // Outer crease X coordinates for Base & Top major flaps (stepped outward by `outerStep` over Front/Back).
    const xInnerL = -halfL;
    const xInnerR = halfL;
    const xOuterL = -halfL - outerStep;
    const xOuterR = halfL + outerStep;

    // Flap lengths & shapes
    const flapGap = clampNum(rawParams.flapGapMm, 0, Math.min(25, Hwall * 0.35));
    const majorFlapLen = Math.max(18, Hwall * 0.5 - flapGap * 0.5 - 0.2);
    // Match the flat-sheet outer tip line of major flaps (`majorFlapLen + outerStep`) whenever W permits,
    // while clamping safely below `Winner * 0.46` so opposing Front & Back dust flaps never collide.
    const dustFlapLen = Math.max(16, Math.min(majorFlapLen + outerStep, Winner * 0.46));

    const taperDeg = clampNum(rawParams.dustFlapTaperDeg, 0, 20);
    const taperTan = Math.tan((taperDeg * Math.PI) / 180);
    // Gentle authentic corrugated major-flap taper (~3.3° at default 6° slider) so closed side ends stay tight.
    const majorTaperMm = Math.min(Winner * 0.1, taperTan * majorFlapLen * 0.55);
    const dustTaperMm = Math.min(Hfront * 0.16, taperTan * dustFlapLen * 0.7);
    const flapCornerR = clampNum(Math.min(majorFlapLen * 0.14, 6), 2, 6);
    const slotRelief = Math.max(1.0, t * 0.55);
    const majorSlotRelief = Math.max(0.7, t * 0.32);

    const glueTabW = clampNum(t * 7 + 14, 18, Math.min(38, Winner * 0.32));
    const glueTabTaper = Math.min(12, glueTabW * 0.42, Linner * 0.08);
    const glueCornerR = clampNum(glueTabW * 0.16, 2, 4.5);

    // Optional carry hand holes punched cleanly on Front & Back walls
    const frontHoles: Point2D[][] = [];
    const backHoles: Point2D[][] = [];
    if (rawParams.handHoles) {
      const availW = Linner - 44;
      const availH = Hfront - 34;
      if (availW >= 40 && availH >= 18) {
        const hhW = clampNum(rawParams.handHoleWidthMm, 36, Math.min(110, availW));
        const hhH = clampNum(rawParams.handHoleHeightMm, 16, Math.min(30, availH));
        // Positioned in upper-middle third of Front & Back walls for ergonomic beer-case carrying.
        const distFromBottom = Math.min(Hfront - hhH * 0.5 - 12, Math.max(hhH * 0.5 + 12, Hfront * 0.68));
        frontHoles.push(handHolePoly(0, -halfW - distFromBottom, hhW, hhH));
        backHoles.push(handHolePoly(0, halfW + distFromBottom, hhW, hhH));
      } else {
        clampNotices.push('Increase carton length or height slightly to fit carry hand holes.');
      }
    }

    // --- 2D Y-band layout (bottom to top on flat sheet):
    //   1. Manufacturer Glue Tab : y ∈ [-halfW - Hfront - glueTabW, -halfW - Hfront]
    //   2. Front Wall (narrow H) : y ∈ [-halfW - Hfront, -halfW]
    //   3. Base / Bottom (wide W): y ∈ [-halfW, +halfW]
    //   4. Back Wall (narrow H)  : y ∈ [+halfW, +halfW + Hwall]
    //   5. Top Panel (wide W+t)  : y ∈ [+halfW + Hwall, +halfW + Hwall + Winner + t]
    const yFrontTip = -halfW - Hfront;
    const yBackTop = halfW + Hwall;
    const yTopInnerFront = yBackTop + Winner;
    const yTopFrontEdge = yTopInnerFront + t;
    const yTopFlapMax = yTopInnerFront - majorSlotRelief;
    const yTopFlapMin = yBackTop + majorSlotRelief;

    // --- FRONT WALL + GLUE TAB + FRONT LEFT/RIGHT INNER DUST FLAPS ---
    const frontWall: PanelNode2D = {
      id: 'front-wall',
      label: 'Front Panel',
      shortCode: 'FRONT',
      faceRole: 'front',
      partGroup: 'height',
      printable: true,
      uprightAngleDeg: 180,
      outline: rectPoly(xInnerL, yFrontTip, xInnerR, -halfW),
      holes: frontHoles,
      hinge: {
        p1: [xInnerL, -halfW],
        p2: [xInnerR, -halfW],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.0,
        stageEnd: 0.28,
      },
      children: [
        {
          id: 'glue-tab',
          label: 'Manufacturer Glue Joint',
          shortCode: 'GLUE',
          faceRole: 'glue',
          partGroup: 'flaps',
          printable: false,
          uprightAngleDeg: 180,
          outline: buildBottomGlueTabPoly({
            xMin: xInnerL + slotRelief,
            xMax: xInnerR - slotRelief,
            yHinge: yFrontTip,
            depth: glueTabW,
            taperMm: glueTabTaper,
            cornerRadiusMm: glueCornerR,
          }),
          hinge: {
            p1: [xInnerL + slotRelief, yFrontTip],
            p2: [xInnerR - slotRelief, yFrontTip],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.16,
            stageEnd: 0.38,
            renderCreaseFillet: true,
          },
          children: [],
        },
        {
          id: 'front-left-dust',
          label: 'Front-Left Inner Dust Flap',
          shortCode: 'L-DF',
          faceRole: 'flap',
          partGroup: 'flaps',
          printable: false,
          uprightAngleDeg: 180,
          outline: buildHorizontalRoundedFlapPoly({
            xHinge: xInnerL,
            yMin: yFrontTip + slotRelief,
            yMax: -halfW - slotRelief,
            length: dustFlapLen,
            dirX: -1,
            taperMm: dustTaperMm,
            cornerRadiusMm: flapCornerR,
          }),
          hinge: {
            p1: [xInnerL, yFrontTip + slotRelief],
            p2: [xInnerL, -halfW - slotRelief],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.48,
            stageEnd: 0.64,
            renderCreaseFillet: true,
          },
          children: [],
        },
        {
          id: 'front-right-dust',
          label: 'Front-Right Inner Dust Flap',
          shortCode: 'R-DF',
          faceRole: 'flap',
          partGroup: 'flaps',
          printable: false,
          uprightAngleDeg: 180,
          outline: buildHorizontalRoundedFlapPoly({
            xHinge: xInnerR,
            yMin: yFrontTip + slotRelief,
            yMax: -halfW - slotRelief,
            length: dustFlapLen,
            dirX: 1,
            taperMm: dustTaperMm,
            cornerRadiusMm: flapCornerR,
          }),
          hinge: {
            p1: [xInnerR, yFrontTip + slotRelief],
            p2: [xInnerR, -halfW - slotRelief],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.66,
            stageEnd: 0.82,
            renderCreaseFillet: true,
          },
          children: [],
        },
      ],
    };

    // --- TOP PANEL + TOP LEFT/RIGHT OUTER MAJOR FLAPS ---
    // Chamfer the front +t capping lip smoothly from ±xOuter back to ±xInner so the top-front
    // corners align cleanly over the rounded front-to-dust-flap bends with zero overhanging wings.
    const topWallOutline = ensureCCW([
      [xOuterL, yBackTop],
      [xOuterR, yBackTop],
      [xOuterR, yTopInnerFront],
      [xInnerR, yTopFrontEdge],
      [xInnerL, yTopFrontEdge],
      [xOuterL, yTopInnerFront],
    ]);

    const topWall: PanelNode2D = {
      id: 'top-wall',
      label: 'Top Panel',
      shortCode: 'TOP',
      faceRole: 'top',
      partGroup: 'width',
      printable: true,
      uprightAngleDeg: 180,
      outline: topWallOutline,
      hinge: {
        p1: [xInnerL, yBackTop],
        p2: [xInnerR, yBackTop],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.24,
        stageEnd: 0.5,
      },
      children: [
        {
          id: 'top-left-flap',
          label: 'Left Upper Side Flap',
          shortCode: 'L-TOP',
          faceRole: 'left',
          partGroup: 'lid',
          printable: true,
          uprightAngleDeg: -90,
          outline: buildHorizontalRoundedFlapPoly({
            xHinge: xOuterL,
            yMin: yTopFlapMin,
            yMax: yTopFlapMax,
            length: majorFlapLen,
            dirX: -1,
            taperMm: majorTaperMm,
            cornerRadiusMm: flapCornerR,
          }),
          hinge: {
            p1: [xOuterL, yTopFlapMin],
            p2: [xOuterL, yTopFlapMax],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.6,
            stageEnd: 0.78,
            renderCreaseFillet: true,
          },
          children: [],
        },
        {
          id: 'top-right-flap',
          label: 'Right Upper Side Flap',
          shortCode: 'R-TOP',
          faceRole: 'right',
          partGroup: 'lid',
          printable: true,
          uprightAngleDeg: 90,
          outline: buildHorizontalRoundedFlapPoly({
            xHinge: xOuterR,
            yMin: yTopFlapMin,
            yMax: yTopFlapMax,
            length: majorFlapLen,
            dirX: 1,
            taperMm: majorTaperMm,
            cornerRadiusMm: flapCornerR,
          }),
          hinge: {
            p1: [xOuterR, yTopFlapMin],
            p2: [xOuterR, yTopFlapMax],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.8,
            stageEnd: 1.0,
            renderCreaseFillet: true,
          },
          children: [],
        },
      ],
    };

    // --- BACK WALL + TOP PANEL + BACK LEFT/RIGHT INNER DUST FLAPS ---
    const backWall: PanelNode2D = {
      id: 'back-wall',
      label: 'Back Panel',
      shortCode: 'BACK',
      faceRole: 'back',
      partGroup: 'height',
      printable: true,
      uprightAngleDeg: 0,
      outline: rectPoly(xInnerL, halfW, xInnerR, yBackTop),
      holes: backHoles,
      hinge: {
        p1: [xInnerL, halfW],
        p2: [xInnerR, halfW],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.0,
        stageEnd: 0.28,
      },
      children: [
        topWall,
        {
          id: 'back-left-dust',
          label: 'Back-Left Inner Dust Flap',
          shortCode: 'L-DB',
          faceRole: 'flap',
          partGroup: 'flaps',
          printable: false,
          uprightAngleDeg: 0,
          outline: buildHorizontalRoundedFlapPoly({
            xHinge: xInnerL,
            yMin: halfW + slotRelief,
            yMax: yBackTop - slotRelief,
            length: dustFlapLen,
            dirX: -1,
            taperMm: dustTaperMm,
            cornerRadiusMm: flapCornerR,
          }),
          hinge: {
            p1: [xInnerL, halfW + slotRelief],
            p2: [xInnerL, yBackTop - slotRelief],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.48,
            stageEnd: 0.64,
            renderCreaseFillet: true,
          },
          children: [],
        },
        {
          id: 'back-right-dust',
          label: 'Back-Right Inner Dust Flap',
          shortCode: 'R-DB',
          faceRole: 'flap',
          partGroup: 'flaps',
          printable: false,
          uprightAngleDeg: 0,
          outline: buildHorizontalRoundedFlapPoly({
            xHinge: xInnerR,
            yMin: halfW + slotRelief,
            yMax: yBackTop - slotRelief,
            length: dustFlapLen,
            dirX: 1,
            taperMm: dustTaperMm,
            cornerRadiusMm: flapCornerR,
          }),
          hinge: {
            p1: [xInnerR, halfW + slotRelief],
            p2: [xInnerR, yBackTop - slotRelief],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.66,
            stageEnd: 0.82,
            renderCreaseFillet: true,
          },
          children: [],
        },
      ],
    };

    // --- BASE / BOTTOM PANEL (ROOT) + BOTTOM LEFT/RIGHT OUTER MAJOR FLAPS ---
    const bottomLeftFlap: PanelNode2D = {
      id: 'bottom-left-flap',
      label: 'Left Lower Side Flap',
      shortCode: 'L-BOT',
      faceRole: 'left',
      partGroup: 'lid',
      printable: true,
      uprightAngleDeg: 90,
      outline: buildHorizontalRoundedFlapPoly({
        xHinge: xOuterL,
        yMin: -halfW + majorSlotRelief,
        yMax: halfW - majorSlotRelief,
        length: majorFlapLen,
        dirX: -1,
        taperMm: majorTaperMm,
        cornerRadiusMm: flapCornerR,
      }),
      hinge: {
        p1: [xOuterL, -halfW + majorSlotRelief],
        p2: [xOuterL, halfW - majorSlotRelief],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.6,
        stageEnd: 0.78,
        renderCreaseFillet: true,
      },
      children: [],
    };

    const bottomRightFlap: PanelNode2D = {
      id: 'bottom-right-flap',
      label: 'Right Lower Side Flap',
      shortCode: 'R-BOT',
      faceRole: 'right',
      partGroup: 'lid',
      printable: true,
      uprightAngleDeg: -90,
      outline: buildHorizontalRoundedFlapPoly({
        xHinge: xOuterR,
        yMin: -halfW + majorSlotRelief,
        yMax: halfW - majorSlotRelief,
        length: majorFlapLen,
        dirX: 1,
        taperMm: majorTaperMm,
        cornerRadiusMm: flapCornerR,
      }),
      hinge: {
        p1: [xOuterR, -halfW + majorSlotRelief],
        p2: [xOuterR, halfW - majorSlotRelief],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.8,
        stageEnd: 1.0,
        renderCreaseFillet: true,
      },
      children: [],
    };

    const rootPanel: PanelNode2D = {
      id: 'base',
      label: 'Bottom Panel',
      shortCode: 'BASE',
      faceRole: 'base',
      partGroup: 'length',
      printable: true,
      uprightAngleDeg: 0,
      outline: rectPoly(xOuterL, -halfW, xOuterR, halfW),
      children: [frontWall, backWall, bottomLeftFlap, bottomRightFlap],
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
        flapGapMm: flapGap,
        dustFlapTaperDeg: taperDeg,
      },
      material,
      innerMm: { length: Linner, width: Winner, height: Hinner },
      outerMm: { length: Louter, width: Wouter, height: Houter },
      rootPanel,
      contentAnchor: {
        panelId: rootPanel.id,
        center2D: [0, 0],
        floorOffsetMm: t * 0.5,
      },
      clampNotices,
    });
  },
};
