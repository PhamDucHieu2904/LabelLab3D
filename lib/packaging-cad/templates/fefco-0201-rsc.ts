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
 * FEFCO 0201 — Top-Open Regular Slotted Container (RSC / Standard A1 Shipping Carton).
 *
 * Industry-standard 4-panel horizontal wrap-around shipping carton opening from the Top:
 *  - Outside print-side-up dieline matches classic FEFCO 0201 left-to-right layout:
 *      [Trapezoidal Glue Tab] — [Front (L)] — [Right (W)] — [Back (L)] — [Left (W)]
 *    with 4 equal-length rectangular top flaps & 4 equal-length rectangular bottom flaps
 *    separated by crisp rotary-slotter reliefs.
 *  - True millimeter board stackup (`pivotOffsetMm = 0` on every joint for watertight curved
 *    crease fillets):
 *      • Inner minor flaps (Left/Right) step inward by `t + gap` so they fold cleanly INSIDE
 *        the outer major flaps (Front/Back) at both top and bottom with zero Z-fighting.
 *      • Manufacturer's glue tab tucks cleanly behind Left Wall inside face (`gap` clearance)
 *        while Left Wall's `+t` lip caps the Front-Left vertical corner flush.
 *  - Staged top-opening kinematics:
 *      • Walls & bottom flaps seal completely by `fold = 0.64`, so `0.64 → 1.00` smoothly
 *        animates ONLY the top flaps opening/closing (`heroFold = 0.89`, `openPreviewFold = 0.68`).
 *  - Native 1-click "Pack Your Bottles" interior cavity anchoring.
 */
export const FEFCO_0201_RSC_TEMPLATE: PackagingTemplateDefinition = {
  id: 'fefco-0201-rsc',
  code: 'FEFCO 0201',
  name: 'Top-Open Shipping Carton (RSC)',
  shortName: 'Top-Open Carton',
  category: 'carton',
  tagline: 'Classic A1 regular slotted corrugated carton with top-opening flaps',
  description:
    'Standard top-loading corrugated shipping carton (FEFCO 0201 / A1 RSC) with four equal-length top & bottom flaps, trapezoidal manufacturer glue joint, configurable flap seam gap, and optional side carry hand holes.',
  defaultMaterialId: 'kraft-b',
  defaultDimensions: { length: 360, width: 240, height: 220 },
  minDimensions: { length: 100, width: 80, height: 60 },
  maxDimensions: { length: 1000, width: 800, height: 800 },
  heroFold: 0.89,
  openPreviewFold: 0.68,
  features: {
    lockTabs: false,
    dustFlapTaper: false,
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
      id: 'ship-standard',
      label: 'Standard Carton (A1)',
      detail: '360 × 240 × 220 mm (Inner)',
      lengthMm: 360,
      widthMm: 240,
      heightMm: 220,
      dimensionMode: 'inner',
      materialId: 'kraft-b',
    },
    {
      id: 'can-24-case',
      label: '24-Can 330ml Case',
      detail: '406 × 272 × 125 mm (Inner)',
      lengthMm: 406,
      widthMm: 272,
      heightMm: 125,
      dimensionMode: 'inner',
      materialId: 'kraft-b',
      beverageFit: '24 × 330ml Cans',
    },
    {
      id: 'pet-500-12',
      label: '12-Bottle 500ml Case',
      detail: '276 × 208 × 215 mm (Inner)',
      lengthMm: 276,
      widthMm: 208,
      heightMm: 215,
      dimensionMode: 'inner',
      materialId: 'white-b',
      beverageFit: '12 × 500ml PET',
    },
    {
      id: 'glass-290-24',
      label: '24-Bottle 290ml Case',
      detail: '384 × 256 × 192 mm (Inner)',
      lengthMm: 384,
      widthMm: 256,
      heightMm: 192,
      dimensionMode: 'inner',
      materialId: 'kraft-b',
      beverageFit: '24 × 290ml Glass',
    },
    {
      id: 'master-carton',
      label: 'Large Master Carton',
      detail: '500 × 350 × 300 mm (Outer)',
      lengthMm: 500,
      widthMm: 350,
      heightMm: 300,
      dimensionMode: 'outer',
      materialId: 'kraft-b',
    },
  ],

  solve(rawParams: PackagingParams, material: BoardMaterialPreset) {
    const clampNotices: string[] = [];
    const t = clampNum(rawParams.thicknessMm, 0.4, 8);
    const gap = clampNum(rawParams.slotClearanceMm, 0.1, 1.5);
    const Lreq = clampNum(rawParams.lengthMm, 100, 1000);
    const Wreq = clampNum(rawParams.widthMm, 80, 800);
    const Hreq = clampNum(rawParams.heightMm, 60, 800);

    // Each top & bottom end stacks (inner minor flap t + clearance gap + outer major flap t).
    // Along Length (L), the manufacturer glue tab tucks cleanly OUTSIDE the clear interior cavity
    // behind Left Wall (`t + gap` allowance) so packed bottles/cans never clip the glue joint.
    const outerStep = t + gap;
    const lengthStackTotal = 3 * t + gap; // Right Wall (t) + Glue Tab (t) + gap + Left Wall (t)
    const heightStackTotal = 2 * (outerStep + t); // 4t + 2*gap

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
      Linner = Math.max(50, Louter - lengthStackTotal);
      Winner = Math.max(50, Wouter - 2 * t);
      Hinner = Math.max(36, Houter - heightStackTotal);
    }

    // Major wall height spans between outer top & bottom major flap creases (`Hinner + 2*outerStep`).
    // Minor wall height spans cleanly between inner top & bottom minor flap creases (`Hinner`).
    const Hmajor = Hinner + 2 * outerStep;
    // Back wall widens leftward by `outerStep` (`t + gap`) so Left Wall wraps cleanly outside
    // the folded Glue Tab while preserving an unobstructed `Linner` interior cavity.
    const Lback = Linner + outerStep;

    // Flaps: classic FEFCO 0201 has straight rectangular equal-length outer edges across all 4 panels.
    const flapGap = clampNum(rawParams.flapGapMm, 0, Math.min(35, Winner * 0.4));
    const majorFlapLen = Math.max(14, Winner * 0.5 - flapGap * 0.5 - 0.2);
    // Align minor flap outer edge flush with major flap outer edge (`majorFlapLen + outerStep`),
    // clamping safely below `Lback / 2 - 1.5` so opposing Left & Right minor flaps never touch.
    const minorFlapLen = Math.max(14, Math.min(majorFlapLen + outerStep, Lback * 0.5 - 1.5));

    const slotRelief = Math.max(1.0, t * 0.55);
    const glueTabW = clampNum(t * 7 + 16, 20, Math.min(40, Winner * 0.32));

    // Internal 2D CAD X layout (mirrored horizontally on Outside print-side-up dieline):
    //   Left Wall  (W + t)      : [xLeftOuter, xBackL]  (far RIGHT on Outside SVG)
    //   Back Wall  (Linner+step): [xBackL,     xBackR]
    //   Right Wall (Winner)     : [xBackR,     xRightR]
    //   Front Wall (Linner)     : [xRightR,    xFrontR] (+t corner caps above/below glue tab)
    //   Glue Tab   (glueTabW)   : [xFrontR,    xFrontR + glueTabW] (far LEFT on Outside SVG!)
    const xBackR = Linner * 0.5;
    const xBackL = -Linner * 0.5 - outerStep;
    const xLeftInner = xBackL - Winner;
    const xLeftOuter = xLeftInner - t; // +t lip meets Front Wall's outside face flush at Front-Left corner
    const xRightR = xBackR + Winner;
    const xFrontR = xRightR + Linner;
    const xFrontCap = xFrontR + t; // seals top/bottom corner strips flush beside Left Wall's inside face

    // Vertical Y coordinates on flat sheet:
    //   Major bottom crease : 0              | Minor bottom crease : outerStep
    //   Major top crease    : Hmajor         | Minor top crease    : Hmajor - outerStep
    const yMinorBot = outerStep;
    const yMinorTop = Hmajor - outerStep;
    const yGlueMin = yMinorBot + gap;
    const yGlueMax = yMinorTop - gap;
    const glueSpanY = Math.max(12, yGlueMax - yGlueMin);
    const glueTaper = clampNum(Math.min(14, glueTabW * 0.45, glueSpanY * 0.16), 2, 16);

    // Optional die-cut carry hand holes centered on upper third of Left & Right side walls
    const leftHoles: Point2D[][] = [];
    const rightHoles: Point2D[][] = [];
    if (rawParams.handHoles) {
      const availW = Winner - 28;
      const availH = Hinner - 36;
      if (availW >= 40 && availH >= 18) {
        const hhW = clampNum(rawParams.handHoleWidthMm, 36, Math.min(110, availW));
        const hhH = clampNum(rawParams.handHoleHeightMm, 16, Math.min(34, availH));
        const yCenter = yMinorBot + Hinner * 0.72;
        leftHoles.push(handHolePoly((xLeftInner + xBackL) * 0.5, yCenter, hhW, hhH));
        rightHoles.push(handHolePoly((xBackR + xRightR) * 0.5, yCenter, hhW, hhH));
      } else {
        clampNotices.push('Increase carton width or height slightly to fit side carry hand holes.');
      }
    }

    // --- MANUFACTURER GLUE TAB (child of Front Wall, far-left on Outside SVG) ---
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
        stageStart: 0.24,
        stageEnd: 0.44,
        renderCreaseFillet: true,
      },
      children: [],
    };

    // --- FRONT WALL + GLUE TAB + FRONT TOP/BOTTOM MAJOR FLAPS ---
    // Top & bottom corner strips extend `+t` to `xFrontCap` strictly outside the glue-tab Y band
    // so the front-left vertical corner is 100% sealed flush beside Left Wall with zero corner notch.
    const frontWallOutline = ensureCCW([
      [xRightR, 0],
      [xFrontCap, 0],
      [xFrontCap, yGlueMin - 0.15],
      [xFrontR, yGlueMin - 0.15],
      [xFrontR, yGlueMax + 0.15],
      [xFrontCap, yGlueMax + 0.15],
      [xFrontCap, Hmajor],
      [xRightR, Hmajor],
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
      hinge: {
        p1: [xRightR, yMinorBot],
        p2: [xRightR, yMinorTop],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.18,
        stageEnd: 0.40,
      },
      children: [
        glueTab,
        {
          id: 'bottom-front-flap',
          label: 'Bottom Front Major Flap',
          shortCode: 'B-FRT',
          faceRole: 'flap',
          partGroup: 'flaps',
          printable: true,
          uprightAngleDeg: 0,
          outline: rectPoly(xRightR + slotRelief, -majorFlapLen, xFrontCap, 0),
          hinge: {
            p1: [xRightR + slotRelief, 0],
            p2: [xFrontCap, 0],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.50,
            stageEnd: 0.64,
            renderCreaseFillet: true,
          },
          children: [],
        },
        {
          id: 'top-front-flap',
          label: 'Top Front Major Flap',
          shortCode: 'T-FRT',
          faceRole: 'top',
          partGroup: 'lid',
          printable: true,
          uprightAngleDeg: 0,
          outline: rectPoly(xRightR + slotRelief, Hmajor, xFrontCap, Hmajor + majorFlapLen),
          hinge: {
            p1: [xRightR + slotRelief, Hmajor],
            p2: [xFrontCap, Hmajor],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.78,
            stageEnd: 1.0,
            renderCreaseFillet: true,
          },
          children: [],
        },
      ],
    };

    // --- RIGHT SIDE WALL + FRONT WALL + RIGHT TOP/BOTTOM MINOR FLAPS ---
    const rightWall: PanelNode2D = {
      id: 'right-wall',
      label: 'Right Side Panel',
      shortCode: 'RIGHT',
      faceRole: 'right',
      partGroup: 'width',
      printable: true,
      uprightAngleDeg: 0,
      outline: rectPoly(xBackR, yMinorBot, xRightR, yMinorTop),
      holes: rightHoles,
      hinge: {
        p1: [xBackR, yMinorBot],
        p2: [xBackR, yMinorTop],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.12,
        stageEnd: 0.34,
      },
      children: [
        frontWall,
        {
          id: 'bottom-right-flap',
          label: 'Bottom Right Minor Flap',
          shortCode: 'B-RGT',
          faceRole: 'flap',
          partGroup: 'flaps',
          printable: false,
          uprightAngleDeg: 180,
          outline: rectPoly(xBackR + slotRelief, yMinorBot - minorFlapLen, xRightR - slotRelief, yMinorBot),
          hinge: {
            p1: [xBackR + slotRelief, yMinorBot],
            p2: [xRightR - slotRelief, yMinorBot],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.38,
            stageEnd: 0.54,
            renderCreaseFillet: true,
          },
          children: [],
        },
        {
          id: 'top-right-flap',
          label: 'Top Right Minor Flap',
          shortCode: 'T-RGT',
          faceRole: 'flap',
          partGroup: 'lid',
          printable: false,
          uprightAngleDeg: 0,
          outline: rectPoly(xBackR + slotRelief, yMinorTop, xRightR - slotRelief, yMinorTop + minorFlapLen),
          hinge: {
            p1: [xBackR + slotRelief, yMinorTop],
            p2: [xRightR - slotRelief, yMinorTop],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.64,
            stageEnd: 0.80,
            renderCreaseFillet: true,
          },
          children: [],
        },
      ],
    };

    // --- LEFT SIDE WALL + LEFT TOP/BOTTOM MINOR FLAPS ---
    const leftWall: PanelNode2D = {
      id: 'left-wall',
      label: 'Left Side Panel',
      shortCode: 'LEFT',
      faceRole: 'left',
      partGroup: 'width',
      printable: true,
      uprightAngleDeg: 0,
      outline: rectPoly(xLeftOuter, yMinorBot, xBackL, yMinorTop),
      holes: leftHoles,
      hinge: {
        p1: [xBackL, yMinorBot],
        p2: [xBackL, yMinorTop],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.12,
        stageEnd: 0.34,
      },
      children: [
        {
          id: 'bottom-left-flap',
          label: 'Bottom Left Minor Flap',
          shortCode: 'B-LFT',
          faceRole: 'flap',
          partGroup: 'flaps',
          printable: false,
          uprightAngleDeg: 180,
          outline: rectPoly(xLeftInner + slotRelief, yMinorBot - minorFlapLen, xBackL - slotRelief, yMinorBot),
          hinge: {
            p1: [xLeftInner + slotRelief, yMinorBot],
            p2: [xBackL - slotRelief, yMinorBot],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.38,
            stageEnd: 0.54,
            renderCreaseFillet: true,
          },
          children: [],
        },
        {
          id: 'top-left-flap',
          label: 'Top Left Minor Flap',
          shortCode: 'T-LFT',
          faceRole: 'flap',
          partGroup: 'lid',
          printable: false,
          uprightAngleDeg: 0,
          outline: rectPoly(xLeftInner + slotRelief, yMinorTop, xBackL - slotRelief, yMinorTop + minorFlapLen),
          hinge: {
            p1: [xLeftInner + slotRelief, yMinorTop],
            p2: [xBackL - slotRelief, yMinorTop],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.64,
            stageEnd: 0.80,
            renderCreaseFillet: true,
          },
          children: [],
        },
      ],
    };

    // --- BACK WALL + LEFT/RIGHT WALLS + TOP BACK MAJOR FLAP ---
    const backWall: PanelNode2D = {
      id: 'back-wall',
      label: 'Back Panel',
      shortCode: 'BACK',
      faceRole: 'back',
      partGroup: 'height',
      printable: true,
      uprightAngleDeg: 0,
      outline: rectPoly(xBackL, 0, xBackR, Hmajor),
      hinge: {
        p1: [xBackL + slotRelief, 0],
        p2: [xBackR - slotRelief, 0],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.0,
        stageEnd: 0.22,
      },
      children: [
        leftWall,
        rightWall,
        {
          id: 'top-back-flap',
          label: 'Top Back Major Flap',
          shortCode: 'T-BCK',
          faceRole: 'top',
          partGroup: 'lid',
          printable: true,
          uprightAngleDeg: 180,
          outline: rectPoly(xBackL + slotRelief, Hmajor, xBackR - slotRelief, Hmajor + majorFlapLen),
          hinge: {
            p1: [xBackL + slotRelief, Hmajor],
            p2: [xBackR - slotRelief, Hmajor],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.78,
            stageEnd: 1.0,
            renderCreaseFillet: true,
          },
          children: [],
        },
      ],
    };

    // --- ROOT: BOTTOM BACK MAJOR FLAP (rests flat on Y = 0 studio floor) ---
    const rootPanel: PanelNode2D = {
      id: 'base',
      label: 'Bottom Back Major Flap',
      shortCode: 'BASE',
      faceRole: 'base',
      partGroup: 'length',
      printable: true,
      uprightAngleDeg: 180,
      outline: rectPoly(xBackL + slotRelief, -majorFlapLen, xBackR - slotRelief, 0),
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
        flapGapMm: flapGap,
      },
      material,
      innerMm: { length: Linner, width: Winner, height: Hinner },
      outerMm: { length: Louter, width: Wouter, height: Houter },
      rootPanel,
      contentAnchor: {
        panelId: rootPanel.id,
        center2D: [0, -Winner * 0.5],
        floorOffsetMm: t * 1.5 + gap,
      },
      clampNotices,
    });
  },
};
