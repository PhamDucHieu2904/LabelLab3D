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
 * FEFCO 0201 — Regular Slotted Container (RSC / Standard A1 Shipping Carton).
 * Rooted on the Back Bottom Flap so at fold = 0 the full blank lies flat on the floor,
 * and as fold progresses 0 → 1 the four vertical walls erect and flaps close cleanly
 * without any Z-fighting (minor flaps sit one board-thickness inside major flaps).
 */
export const FEFCO_0201_RSC_TEMPLATE: PackagingTemplateDefinition = {
  id: 'fefco-0201-rsc',
  code: 'FEFCO 0201',
  name: 'Standard Shipping Carton (RSC)',
  shortName: 'RSC Carton',
  category: 'carton',
  tagline: 'Classic A1 regular slotted corrugated shipping box',
  description:
    'The universal shipping carton for 12/24-pack beverage cases, logistics, and e-commerce fulfillment. Features configurable flap gap and optional side carry handles.',
  defaultMaterialId: 'kraft-b',
  defaultDimensions: { length: 400, width: 270, height: 180 },
  minDimensions: { length: 100, width: 80, height: 60 },
  maxDimensions: { length: 1000, width: 800, height: 800 },
  heroFold: 0.92,
  openPreviewFold: 0.72,
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
      id: 'can-24-case',
      label: '24-Can 330ml Case',
      detail: '406 × 272 × 125 mm (Inner)',
      lengthMm: 406,
      widthMm: 272,
      heightMm: 125,
      dimensionMode: 'inner',
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
      beverageFit: '24 × 290ml Glass',
    },
    {
      id: 'ship-medium',
      label: 'Medium Parcel Box',
      detail: '350 × 250 × 200 mm (Outer)',
      lengthMm: 350,
      widthMm: 250,
      heightMm: 200,
      dimensionMode: 'outer',
    },
  ],

  solve(rawParams: PackagingParams, material: BoardMaterialPreset) {
    const clampNotices: string[] = [];
    const t = clampNum(rawParams.thicknessMm, 0.4, 8);
    const gap = clampNum(rawParams.slotClearanceMm, 0.1, 1.5);
    const Lreq = clampNum(rawParams.lengthMm, 100, 1000);
    const Wreq = clampNum(rawParams.widthMm, 80, 800);
    const Hreq = clampNum(rawParams.heightMm, 60, 800);

    let L: number;
    let W: number;
    let H: number;
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
      L = Linner + t;
      W = Winner + t;
      H = Hinner + 2 * t;
      Louter = Linner + 2 * t;
      Wouter = Winner + 2 * t;
      Houter = Hinner + 4 * t;
    } else {
      Louter = Lreq;
      Wouter = Wreq;
      Houter = Hreq;
      Linner = Math.max(40, Louter - 2 * t);
      Winner = Math.max(40, Wouter - 2 * t);
      Hinner = Math.max(30, Houter - 4 * t);
      L = Linner + t;
      W = Winner + t;
      H = Hinner + 2 * t;
    }

    const flapGap = clampNum(rawParams.flapGapMm, 0, Math.min(40, W * 0.4));
    const majorFlapLen = Math.max(15, W * 0.5 - flapGap * 0.5 - 0.3);
    const minorFlapLen = Math.max(15, Math.min(W * 0.48, L * 0.46));
    const slotRelief = Math.max(1.2, t * 0.7);
    const glueTabW = Math.min(40, Math.max(22, t * 8 + 18));

    // Coordinate layout in flat 2D (mm):
    // BackWall spans x ∈ [-L/2, +L/2], y ∈ [0, H].
    // Root = BottomBackFlap spans x ∈ [-L/2 + slotRelief, +L/2 - slotRelief], y ∈ [-majorFlapLen, 0].
    const xBackL = -L * 0.5;
    const xBackR = L * 0.5;
    const xLeftL = xBackL - W;
    const xRightR = xBackR + W;
    const xFrontR = xRightR + L;

    const leftHoles: Point2D[][] = [];
    const rightHoles: Point2D[][] = [];
    if (rawParams.handHoles) {
      const availW = W - 28;
      const availH = H - 36;
      if (availW >= 40 && availH >= 20) {
        const hhW = clampNum(rawParams.handHoleWidthMm, 36, Math.min(110, availW));
        const hhH = clampNum(rawParams.handHoleHeightMm, 16, Math.min(34, availH));
        const yCenter = H * 0.74;
        leftHoles.push(handHolePoly((xLeftL + xBackL) * 0.5, yCenter, hhW, hhH));
        rightHoles.push(handHolePoly((xBackR + xRightR) * 0.5, yCenter, hhW, hhH));
      } else {
        clampNotices.push('Increase width or height slightly to fit shipping hand holes.');
      }
    }

    const frontWall: PanelNode2D = {
      id: 'front-wall',
      label: 'Front Panel',
      shortCode: 'FRONT',
      faceRole: 'front',
      partGroup: 'length',
      printable: true,
      uprightAngleDeg: 0,
      outline: rectPoly(xRightR, 0, xFrontR, H),
      hinge: {
        p1: [xRightR, 0],
        p2: [xRightR, H],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.22,
        stageEnd: 0.48,
      },
      children: [
        {
          id: 'bottom-front-flap',
          label: 'Bottom Front Flap',
          shortCode: 'B-FRT',
          faceRole: 'flap',
          partGroup: 'flaps',
          uprightAngleDeg: 180,
          outline: rectPoly(xRightR + slotRelief, -majorFlapLen, xFrontR - slotRelief, 0),
          hinge: {
            p1: [xRightR + slotRelief, 0],
            p2: [xFrontR - slotRelief, 0],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.58,
            stageEnd: 0.78,
          },
          children: [],
        },
        {
          id: 'top-front-flap',
          label: 'Top Front Flap',
          shortCode: 'T-FRT',
          faceRole: 'top',
          partGroup: 'lid',
          printable: true,
          uprightAngleDeg: 0,
          outline: rectPoly(xRightR + slotRelief, H, xFrontR - slotRelief, H + majorFlapLen),
          hinge: {
            p1: [xRightR + slotRelief, H],
            p2: [xFrontR - slotRelief, H],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.78,
            stageEnd: 1.0,
          },
          children: [],
        },
      ],
    };

    const rightWall: PanelNode2D = {
      id: 'right-wall',
      label: 'Right Side Panel',
      shortCode: 'RIGHT',
      faceRole: 'right',
      partGroup: 'width',
      printable: true,
      uprightAngleDeg: 0,
      outline: rectPoly(xBackR, 0, xRightR, H),
      holes: rightHoles,
      hinge: {
        p1: [xBackR, 0],
        p2: [xBackR, H],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.16,
        stageEnd: 0.42,
      },
      children: [
        frontWall,
        {
          id: 'bottom-right-flap',
          label: 'Bottom Right Minor Flap',
          shortCode: 'B-RGT',
          faceRole: 'flap',
          partGroup: 'flaps',
          uprightAngleDeg: 180,
          outline: rectPoly(xBackR + slotRelief, -minorFlapLen, xRightR - slotRelief, 0),
          hinge: {
            p1: [xBackR + slotRelief, 0],
            p2: [xRightR - slotRelief, 0],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.44,
            stageEnd: 0.62,
            pivotOffsetMm: t + gap,
          },
          children: [],
        },
        {
          id: 'top-right-flap',
          label: 'Top Right Minor Flap',
          shortCode: 'T-RGT',
          faceRole: 'flap',
          partGroup: 'lid',
          uprightAngleDeg: 0,
          outline: rectPoly(xBackR + slotRelief, H, xRightR - slotRelief, H + minorFlapLen),
          hinge: {
            p1: [xBackR + slotRelief, H],
            p2: [xRightR - slotRelief, H],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.66,
            stageEnd: 0.84,
            pivotOffsetMm: t + gap,
          },
          children: [],
        },
      ],
    };

    const leftWall: PanelNode2D = {
      id: 'left-wall',
      label: 'Left Side Panel',
      shortCode: 'LEFT',
      faceRole: 'left',
      partGroup: 'width',
      printable: true,
      uprightAngleDeg: 0,
      outline: rectPoly(xLeftL, 0, xBackL, H),
      holes: leftHoles,
      hinge: {
        p1: [xBackL, 0],
        p2: [xBackL, H],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.16,
        stageEnd: 0.42,
      },
      children: [
        {
          id: 'glue-tab',
          label: 'Manufacturer Glue Joint',
          shortCode: 'GLUE',
          faceRole: 'glue',
          partGroup: 'flaps',
          uprightAngleDeg: 0,
          outline: ensureCCW([
            [xLeftL, 0],
            [xLeftL, H],
            [xLeftL - glueTabW, H - 8],
            [xLeftL - glueTabW, 8],
          ]),
          hinge: {
            p1: [xLeftL, 0],
            p2: [xLeftL, H],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.28,
            stageEnd: 0.5,
            pivotOffsetMm: t + gap,
          },
          children: [],
        },
        {
          id: 'bottom-left-flap',
          label: 'Bottom Left Minor Flap',
          shortCode: 'B-LFT',
          faceRole: 'flap',
          partGroup: 'flaps',
          uprightAngleDeg: 180,
          outline: rectPoly(xLeftL + slotRelief, -minorFlapLen, xBackL - slotRelief, 0),
          hinge: {
            p1: [xLeftL + slotRelief, 0],
            p2: [xBackL - slotRelief, 0],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.44,
            stageEnd: 0.62,
            pivotOffsetMm: t + gap,
          },
          children: [],
        },
        {
          id: 'top-left-flap',
          label: 'Top Left Minor Flap',
          shortCode: 'T-LFT',
          faceRole: 'flap',
          partGroup: 'lid',
          uprightAngleDeg: 0,
          outline: rectPoly(xLeftL + slotRelief, H, xBackL - slotRelief, H + minorFlapLen),
          hinge: {
            p1: [xLeftL + slotRelief, H],
            p2: [xBackL - slotRelief, H],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.66,
            stageEnd: 0.84,
            pivotOffsetMm: t + gap,
          },
          children: [],
        },
      ],
    };

    const backWall: PanelNode2D = {
      id: 'back-wall',
      label: 'Back Panel',
      shortCode: 'BACK',
      faceRole: 'back',
      partGroup: 'height',
      printable: true,
      uprightAngleDeg: 0,
      outline: rectPoly(xBackL, 0, xBackR, H),
      hinge: {
        p1: [xBackL + slotRelief, 0],
        p2: [xBackR - slotRelief, 0],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.0,
        stageEnd: 0.24,
      },
      children: [
        leftWall,
        rightWall,
        {
          id: 'top-back-flap',
          label: 'Top Back Flap',
          shortCode: 'T-BCK',
          faceRole: 'top',
          partGroup: 'lid',
          printable: true,
          uprightAngleDeg: 0,
          outline: rectPoly(xBackL + slotRelief, H, xBackR - slotRelief, H + majorFlapLen),
          hinge: {
            p1: [xBackL + slotRelief, H],
            p2: [xBackR - slotRelief, H],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.78,
            stageEnd: 1.0,
          },
          children: [],
        },
      ],
    };

    const rootPanel: PanelNode2D = {
      id: 'base',
      label: 'Bottom Back Flap',
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
      params: { ...rawParams, thicknessMm: t, lengthMm: Lreq, widthMm: Wreq, heightMm: Hreq, flapGapMm: flapGap },
      material,
      innerMm: { length: Linner, width: Winner, height: Hinner },
      outerMm: { length: Louter, width: Wouter, height: Houter },
      rootPanel,
      contentAnchor: {
        panelId: rootPanel.id,
        center2D: [0, -W * 0.5],
        floorOffsetMm: t * 1.5 + gap,
      },
      clampNotices,
    });
  },
};
