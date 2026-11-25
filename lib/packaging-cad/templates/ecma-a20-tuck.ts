import type {
  BoardMaterialPreset,
  PackagingParams,
  PackagingTemplateDefinition,
  PanelNode2D,
  Point2D,
} from '../types';
import { ensureCCW, notchedRectPoly, rectPoly, roundedRectPoly } from '../geometry/polygon-ops';
import { clampNum, finalizeSolvedDieline } from './helpers';

/**
 * ECMA A20.20 / A21.20 — Straight & Reverse Tuck End Folding Carton.
 * Retail / cosmetic / single-bottle packaging carton with:
 *  - 1-click toggle between Reverse Tuck (A21.20) and Straight Tuck (A20.20)
 *  - Custom tuck tongue length, dust flap taper, optional thumb notch
 *  - Optional Front Display Window cutout with transparent PET film!
 */
export const ECMA_A20_TUCK_TEMPLATE: PackagingTemplateDefinition = {
  id: 'ecma-a20-tuck',
  code: 'ECMA A20 / A21',
  name: 'Tuck End Retail Box',
  shortName: 'Tuck End Box',
  category: 'folding-box',
  tagline: 'Straight or reverse tuck folding carton for bottles, cosmetics & retail',
  description:
    'Crisp paperboard folding carton with rounded tuck-in tongues, dust flaps, optional thumb notch, and customizable front display window.',
  defaultMaterialId: 'ivory-350',
  defaultDimensions: { length: 75, width: 75, height: 185 },
  minDimensions: { length: 30, width: 25, height: 45 },
  maxDimensions: { length: 320, width: 260, height: 450 },
  heroFold: 0.94,
  openPreviewFold: 0.74,
  features: {
    lockTabs: false,
    dustFlapTaper: true,
    flapGap: false,
    tuckStyle: true,
    thumbNotch: true,
    handHoles: false,
    displayScoop: false,
    windowCutout: true,
    bottlePacking: true,
  },
  sizePresets: [
    {
      id: 'glass-290-single',
      label: 'Single 290ml Bottle Box',
      detail: '68 × 68 × 192 mm (Inner)',
      lengthMm: 68,
      widthMm: 68,
      heightMm: 192,
      dimensionMode: 'inner',
      beverageFit: '1 × 290ml Glass Bottle',
    },
    {
      id: 'cosmetic-serum',
      label: 'Cosmetic Serum Box',
      detail: '45 × 45 × 125 mm (Inner)',
      lengthMm: 45,
      widthMm: 45,
      heightMm: 125,
      dimensionMode: 'inner',
    },
    {
      id: 'skincare-jar',
      label: 'Skincare Jar Carton',
      detail: '78 × 78 × 74 mm (Inner)',
      lengthMm: 78,
      widthMm: 78,
      heightMm: 74,
      dimensionMode: 'inner',
    },
    {
      id: 'tea-kraft',
      label: 'Kraft Tea Box',
      detail: '95 × 65 × 150 mm (Inner)',
      lengthMm: 95,
      widthMm: 65,
      heightMm: 150,
      dimensionMode: 'inner',
      materialId: 'kraft-350',
    },
  ],

  solve(rawParams: PackagingParams, material: BoardMaterialPreset) {
    const clampNotices: string[] = [];
    const t = clampNum(rawParams.thicknessMm, 0.25, 3.0);
    const gap = clampNum(rawParams.slotClearanceMm, 0.08, 1.0);
    const Lreq = clampNum(rawParams.lengthMm, 30, 320);
    const Wreq = clampNum(rawParams.widthMm, 25, 260);
    const Hreq = clampNum(rawParams.heightMm, 45, 450);

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
      H = Hinner + t;
      Louter = Linner + 2 * t;
      Wouter = Winner + 2 * t;
      Houter = Hinner + 2 * t;
    } else {
      Louter = Lreq;
      Wouter = Wreq;
      Houter = Hreq;
      Linner = Math.max(20, Louter - 2 * t);
      Winner = Math.max(18, Wouter - 2 * t);
      Hinner = Math.max(30, Houter - 2 * t);
      L = Linner + t;
      W = Winner + t;
      H = Hinner + t;
    }

    const tuckLen = clampNum(rawParams.tuckFlapLengthMm, 10, Math.min(45, H * 0.45));
    const dustLen = Math.max(12, Math.min(W * 0.72, L * 0.46));
    const taper = Math.min(dustLen * 0.25, Math.tan((clampNum(rawParams.dustFlapTaperDeg, 2, 22) * Math.PI) / 180) * dustLen);
    const glueW = Math.max(10, Math.min(20, W * 0.32));
    const reverse = rawParams.tuckStyle !== 'straight';

    // Flat 2D coordinates:
    // Root = BottomPanel (spans x ∈ [-L/2, L/2], y ∈ [-W, 0]) -> stands upright when walls fold up!
    // BackWall attached at y = 0, spans x ∈ [-L/2, L/2], y ∈ [0, H].
    // LeftWall attached at x = -L/2, spans [-L/2 - W, -L/2].
    // RightWall attached at x = +L/2, spans [+L/2, +L/2 + W].
    // FrontWall attached to RightWall at x = +L/2 + W, spans [+L/2 + W, +L/2 + W + L].
    const xBL = -L * 0.5;
    const xBR = L * 0.5;
    const xLL = xBL - W;
    const xRR = xBR + W;
    const xFR = xRR + L;

    const frontHoles: Point2D[][] = [];
    const frontFilms: Point2D[][] = [];
    if (rawParams.windowCutout) {
      const margin = Math.max(8, t * 8);
      const maxWinW = Math.max(10, L - margin * 2);
      const maxWinH = Math.max(12, H - margin * 2);
      if (maxWinW >= 16 && maxWinH >= 18) {
        const winW = clampNum(rawParams.windowWidthMm, 14, maxWinW);
        const winH = clampNum(rawParams.windowHeightMm, 16, maxWinH);
        const winR = clampNum(rawParams.windowRadiusMm, 0, Math.min(winW, winH) * 0.45);
        const cx = (xRR + xFR) * 0.5;
        const cy = H * 0.5;
        frontHoles.push(roundedRectPoly(cx - winW * 0.5, cy - winH * 0.5, cx + winW * 0.5, cy + winH * 0.5, winR, 6, true));
        if (rawParams.windowFilm) {
          frontFilms.push(roundedRectPoly(cx - winW * 0.5 - 1.5, cy - winH * 0.5 - 1.5, cx + winW * 0.5 + 1.5, cy + winH * 0.5 + 1.5, winR, 6, false));
        }
      } else {
        clampNotices.push('Box face is too narrow for the requested window cutout.');
      }
    }

    const buildTuckTonguePoly = (xMin: number, xMax: number, yHinge: number, dirY: 1 | -1): Point2D[] => {
      const r = Math.min(6, tuckLen * 0.45, (xMax - xMin) * 0.2);
      const yTip = yHinge + dirY * tuckLen;
      const inset = Math.min(1.8, (xMax - xMin) * 0.04);
      const pts: Point2D[] = [];
      if (dirY === 1) {
        pts.push([xMin + inset, yHinge], [xMax - inset, yHinge]);
        for (let i = 0; i <= 5; i++) {
          const a = (Math.PI / 2) * (i / 5);
          pts.push([xMax - inset - r + Math.cos(a) * r, yTip - r + Math.sin(a) * r]);
        }
        for (let i = 0; i <= 5; i++) {
          const a = Math.PI / 2 + (Math.PI / 2) * (i / 5);
          pts.push([xMin + inset + r + Math.cos(a) * r, yTip - r + Math.sin(a) * r]);
        }
      } else {
        pts.push([xMax - inset, yHinge], [xMin + inset, yHinge]);
        for (let i = 0; i <= 5; i++) {
          const a = Math.PI + (Math.PI / 2) * (i / 5);
          pts.push([xMin + inset + r + Math.cos(a) * r, yTip + r + Math.sin(a) * r]);
        }
        for (let i = 0; i <= 5; i++) {
          const a = (Math.PI * 3) / 2 + (Math.PI / 2) * (i / 5);
          pts.push([xMax - inset - r + Math.cos(a) * r, yTip + r + Math.sin(a) * r]);
        }
      }
      return ensureCCW(pts);
    };

    const frontOutline = rawParams.thumbNotch
      ? notchedRectPoly(
          xRR,
          0,
          xFR,
          H,
          'top',
          clampNum(rawParams.thumbNotchRadiusMm * 2, 10, Math.min(28, L * 0.42)),
          clampNum(rawParams.thumbNotchRadiusMm, 5, Math.min(14, H * 0.16)),
          10,
        )
      : rectPoly(xRR, 0, xFR, H);

    const topLidOnBack = !reverse;
    const topLidNode = (xMin: number, xMax: number): PanelNode2D => ({
      id: 'top-lid',
      label: 'Top Lid',
      shortCode: 'TOP',
      faceRole: 'top',
      partGroup: 'lid',
      printable: true,
      uprightAngleDeg: 0,
      outline: rectPoly(xMin, H, xMax, H + W),
      hinge: {
        p1: [xMin, H],
        p2: [xMax, H],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.72,
        stageEnd: 0.92,
      },
      children: [
        {
          id: 'top-tuck-tongue',
          label: 'Top Tuck Flap',
          shortCode: 'TUCK',
          faceRole: 'tab',
          partGroup: 'lid',
          uprightAngleDeg: 0,
          outline: buildTuckTonguePoly(xMin, xMax, H + W, 1),
          hinge: {
            p1: [xMin + 1, H + W],
            p2: [xMax - 1, H + W],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.84,
            stageEnd: 1.0,
            pivotOffsetMm: t + gap,
          },
          children: [],
        },
      ],
    });

    const frontWall: PanelNode2D = {
      id: 'front-wall',
      label: 'Front Panel',
      shortCode: 'FRONT',
      faceRole: 'front',
      partGroup: 'length',
      printable: true,
      uprightAngleDeg: 0,
      outline: frontOutline,
      holes: frontHoles,
      windowFilms: frontFilms,
      hinge: {
        p1: [xRR, 0],
        p2: [xRR, H],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.22,
        stageEnd: 0.46,
      },
      children: topLidOnBack ? [] : [topLidNode(xRR, xFR)],
    };

    const rightWall: PanelNode2D = {
      id: 'right-wall',
      label: 'Right Side Panel',
      shortCode: 'RIGHT',
      faceRole: 'right',
      partGroup: 'width',
      printable: true,
      uprightAngleDeg: 0,
      outline: rectPoly(xBR, 0, xRR, H),
      hinge: {
        p1: [xBR, 0],
        p2: [xBR, H],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.16,
        stageEnd: 0.4,
      },
      children: [
        frontWall,
        {
          id: 'bottom-right-dust',
          label: 'Bottom Right Dust Flap',
          shortCode: 'B-RD',
          faceRole: 'flap',
          partGroup: 'flaps',
          uprightAngleDeg: 180,
          outline: ensureCCW([
            [xBR + 0.8, 0],
            [xRR - 0.8, 0],
            [xRR - 0.8 - taper, -dustLen],
            [xBR + 0.8 + taper, -dustLen],
          ]),
          hinge: {
            p1: [xBR + 0.8, 0],
            p2: [xRR - 0.8, 0],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.42,
            stageEnd: 0.6,
            pivotOffsetMm: t + gap,
          },
          children: [],
        },
        {
          id: 'top-right-dust',
          label: 'Top Right Dust Flap',
          shortCode: 'T-RD',
          faceRole: 'flap',
          partGroup: 'flaps',
          uprightAngleDeg: 0,
          outline: ensureCCW([
            [xBR + 0.8, H],
            [xRR - 0.8, H],
            [xRR - 0.8 - taper, H + dustLen],
            [xBR + 0.8 + taper, H + dustLen],
          ]),
          hinge: {
            p1: [xBR + 0.8, H],
            p2: [xRR - 0.8, H],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.6,
            stageEnd: 0.78,
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
      outline: rectPoly(xLL, 0, xBL, H),
      hinge: {
        p1: [xBL, 0],
        p2: [xBL, H],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.16,
        stageEnd: 0.4,
      },
      children: [
        {
          id: 'glue-tab',
          label: 'Side Glue Flap',
          shortCode: 'GLUE',
          faceRole: 'glue',
          partGroup: 'flaps',
          uprightAngleDeg: 0,
          outline: ensureCCW([
            [xLL, 0],
            [xLL, H],
            [xLL - glueW, H - 5],
            [xLL - glueW, 5],
          ]),
          hinge: {
            p1: [xLL, 0],
            p2: [xLL, H],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.28,
            stageEnd: 0.48,
            pivotOffsetMm: t + gap,
          },
          children: [],
        },
        {
          id: 'bottom-left-dust',
          label: 'Bottom Left Dust Flap',
          shortCode: 'B-LD',
          faceRole: 'flap',
          partGroup: 'flaps',
          uprightAngleDeg: 180,
          outline: ensureCCW([
            [xLL + 0.8, 0],
            [xBL - 0.8, 0],
            [xBL - 0.8 - taper, -dustLen],
            [xLL + 0.8 + taper, -dustLen],
          ]),
          hinge: {
            p1: [xLL + 0.8, 0],
            p2: [xBL - 0.8, 0],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.42,
            stageEnd: 0.6,
            pivotOffsetMm: t + gap,
          },
          children: [],
        },
        {
          id: 'top-left-dust',
          label: 'Top Left Dust Flap',
          shortCode: 'T-LD',
          faceRole: 'flap',
          partGroup: 'flaps',
          uprightAngleDeg: 0,
          outline: ensureCCW([
            [xLL + 0.8, H],
            [xBL - 0.8, H],
            [xBL - 0.8 - taper, H + dustLen],
            [xLL + 0.8 + taper, H + dustLen],
          ]),
          hinge: {
            p1: [xLL + 0.8, H],
            p2: [xBL - 0.8, H],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.6,
            stageEnd: 0.78,
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
      outline: rectPoly(xBL, 0, xBR, H),
      hinge: {
        p1: [xBL, 0],
        p2: [xBR, 0],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.0,
        stageEnd: 0.24,
      },
      children: [leftWall, rightWall, ...(topLidOnBack ? [topLidNode(xBL, xBR)] : [])],
    };

    const bottomTuckTongue: PanelNode2D = {
      id: 'bottom-tuck-tongue',
      label: 'Bottom Tuck Flap',
      shortCode: 'B-TCK',
      faceRole: 'tab',
      partGroup: 'flaps',
      uprightAngleDeg: 180,
      outline: buildTuckTonguePoly(xBL, xBR, -W, -1),
      hinge: {
        p1: [xBL + 1, -W],
        p2: [xBR - 1, -W],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.5,
        stageEnd: 0.68,
        pivotOffsetMm: t + gap,
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
      uprightAngleDeg: 180,
      outline: rectPoly(xBL, -W, xBR, 0),
      children: [backWall, bottomTuckTongue],
    };

    return finalizeSolvedDieline({
      templateId: this.id,
      templateCode: this.code,
      templateName: this.name,
      params: { ...rawParams, thicknessMm: t, lengthMm: Lreq, widthMm: Wreq, heightMm: Hreq, tuckFlapLengthMm: tuckLen },
      material,
      innerMm: { length: Linner, width: Winner, height: Hinner },
      outerMm: { length: Louter, width: Wouter, height: Houter },
      rootPanel,
      contentAnchor: {
        panelId: rootPanel.id,
        center2D: [0, -W * 0.5],
        floorOffsetMm: t * 0.5,
      },
      clampNotices,
    });
  },
};
