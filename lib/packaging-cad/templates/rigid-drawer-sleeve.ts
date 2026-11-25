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
 * SLIDE BOX — Luxury Sliding Drawer & Outer Sleeve Box (Matchbox Rigid Slider).
 * True 2-piece CAD blank laid out side-by-side on one 1:1 mm sheet:
 *  - Piece 1 (Outer Sleeve): 4-panel tubular wrap with glue joint, optional thumb grip notch,
 *    and optional top display window with PET film
 *  - Piece 2 (Inner Sliding Drawer): 4-wall drawer tray with inset corner flaps that glides
 *    smoothly straight inside the sleeve along X!
 *  - Packed bottles anchor directly to `drawer-base` so contents glide out with the drawer!
 */
export const RIGID_DRAWER_SLEEVE_TEMPLATE: PackagingTemplateDefinition = {
  id: 'rigid-drawer-sleeve',
  code: 'SLIDE BOX',
  name: 'Drawer & Sleeve Box',
  shortName: 'Drawer Box',
  category: 'rigid-box',
  tagline: 'Matchbox-style sliding inner tray inside a crisp outer sleeve',
  description:
    'Two-piece sliding drawer box where the inner tray glides smoothly out of a wrap-around sleeve. Popular for confections, tea tins, luxury gifts, and tasting samplers.',
  defaultMaterialId: 'ivory-350',
  defaultDimensions: { length: 210, width: 130, height: 55 },
  minDimensions: { length: 70, width: 55, height: 22 },
  maxDimensions: { length: 520, width: 380, height: 220 },
  heroFold: 0.8,
  openPreviewFold: 0.68,
  features: {
    lockTabs: false,
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
      id: 'drawer-sampler',
      label: 'Tasting Sampler Drawer',
      detail: '210 × 130 × 55 mm (Inner)',
      lengthMm: 210,
      widthMm: 130,
      heightMm: 55,
      dimensionMode: 'inner',
      materialId: 'ivory-350',
    },
    {
      id: 'drawer-macaron',
      label: 'Bakery / Macaron Slider',
      detail: '220 × 90 × 52 mm (Inner)',
      lengthMm: 220,
      widthMm: 90,
      heightMm: 52,
      dimensionMode: 'inner',
      materialId: 'kraft-350',
    },
    {
      id: 'drawer-luxury-black',
      label: 'Rigid Noir Slider',
      detail: '195 × 145 × 65 mm (Inner)',
      lengthMm: 195,
      widthMm: 145,
      heightMm: 65,
      dimensionMode: 'inner',
      materialId: 'black-e',
    },
    {
      id: 'drawer-mini-gift',
      label: 'Accessory Matchbox',
      detail: '115 × 85 × 34 mm (Inner)',
      lengthMm: 115,
      widthMm: 85,
      heightMm: 34,
      dimensionMode: 'inner',
      materialId: 'rigid-20',
    },
  ],

  solve(rawParams: PackagingParams, material: BoardMaterialPreset) {
    const clampNotices: string[] = [];
    const t = clampNum(rawParams.thicknessMm, 0.3, 4.0);
    const gap = clampNum(rawParams.slotClearanceMm, 0.1, 1.5);
    const slideGap = Math.max(0.8, gap * 2.4);
    const Lreq = clampNum(rawParams.lengthMm, 70, 520);
    const Wreq = clampNum(rawParams.widthMm, 55, 380);
    const Hreq = clampNum(rawParams.heightMm, 22, 220);

    // Drawer inner cavity = (Linner, Winner, Hinner)
    // Drawer outer = (Linner + 2t, Winner + 2t, Hinner + t)
    // Sleeve inner = (Drawer outer L + slideGap, Drawer outer W + 2*slideGap, Drawer outer H + 2*slideGap)
    // Sleeve outer = (Sleeve inner L, Sleeve inner W + 2t, Sleeve inner H + 2t)
    let Ld: number;
    let Wd: number;
    let Hd: number;
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
      Ld = Linner;
      Wd = Winner;
      Hd = Hinner;
      Louter = Ld + 2 * t + slideGap;
      Wouter = Wd + 4 * t + 2 * slideGap;
      Houter = Hd + 3 * t + 2 * slideGap;
    } else {
      Louter = Lreq;
      Wouter = Wreq;
      Houter = Hreq;
      Ld = Math.max(45, Louter - 2 * t - slideGap);
      Wd = Math.max(36, Wouter - 4 * t - 2 * slideGap);
      Hd = Math.max(16, Houter - 3 * t - 2 * slideGap);
      Linner = Ld;
      Winner = Wd;
      Hinner = Hd;
    }

    const Ls = Ld + 2 * t + slideGap;
    const Ws = Wd + 2 * t + 2 * slideGap;
    const Hs = Hd + t + 2 * slideGap;
    const halfLs = Ls * 0.5;
    const halfWs = Ws * 0.5;
    const halfLd = Ld * 0.5;
    const halfWd = Wd * 0.5;

    const notchDiam = clampNum(rawParams.thumbNotchRadiusMm * 2, 14, Math.min(36, Ws * 0.42));
    const notchDepth = clampNum(rawParams.thumbNotchRadiusMm, 6, Math.min(18, Ls * 0.2));

    // --- PIECE 1: OUTER SLEEVE (Centered at (0, 0), open ends at ±X) ---
    const sleeveBottomOutline = rawParams.thumbNotch
      ? notchedRectPoly(-halfLs, -halfWs, halfLs, halfWs, 'right', notchDiam, notchDepth, 10)
      : rectPoly(-halfLs, -halfWs, halfLs, halfWs);

    const topY0 = halfWs + Hs;
    const topY1 = topY0 + Ws;
    const sleeveTopOutline = rawParams.thumbNotch
      ? notchedRectPoly(-halfLs, topY0, halfLs, topY1, 'right', notchDiam, notchDepth, 10)
      : rectPoly(-halfLs, topY0, halfLs, topY1);

    const topHoles: Point2D[][] = [];
    const topFilms: Point2D[][] = [];
    if (rawParams.windowCutout) {
      const margin = Math.max(12, t * 6);
      const maxWinW = Math.max(18, Ls - margin * 2 - (rawParams.thumbNotch ? notchDepth : 0));
      const maxWinH = Math.max(16, Ws - margin * 2);
      if (maxWinW >= 22 && maxWinH >= 18) {
        const winW = clampNum(rawParams.windowWidthMm, 18, maxWinW);
        const winH = clampNum(rawParams.windowHeightMm, 16, maxWinH);
        const winR = clampNum(rawParams.windowRadiusMm, 0, Math.min(winW, winH) * 0.45);
        const cx = rawParams.thumbNotch ? -notchDepth * 0.35 : 0;
        const cy = (topY0 + topY1) * 0.5;
        topHoles.push(
          roundedRectPoly(cx - winW * 0.5, cy - winH * 0.5, cx + winW * 0.5, cy + winH * 0.5, winR, 6, true),
        );
        if (rawParams.windowFilm) {
          topFilms.push(
            roundedRectPoly(
              cx - winW * 0.5 - 2,
              cy - winH * 0.5 - 2,
              cx + winW * 0.5 + 2,
              cy + winH * 0.5 + 2,
              winR,
              6,
              false,
            ),
          );
        }
      } else {
        clampNotices.push('Sleeve top panel is too compact for the requested display window.');
      }
    }

    const glueW = Math.max(10, Math.min(20, Ws * 0.24));
    const sleeveFront: PanelNode2D = {
      id: 'sleeve-front',
      label: 'Sleeve Front Wall',
      shortCode: 'S-FRT',
      faceRole: 'front',
      partGroup: 'height',
      printable: true,
      uprightAngleDeg: 180,
      outline: rectPoly(-halfLs, -halfWs - Hs, halfLs, -halfWs),
      hinge: {
        p1: [-halfLs, -halfWs],
        p2: [halfLs, -halfWs],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.0,
        stageEnd: 0.25,
      },
      children: [
        {
          id: 'sleeve-glue',
          label: 'Sleeve Glue Tab',
          shortCode: 'GLUE',
          faceRole: 'glue',
          partGroup: 'flaps',
          uprightAngleDeg: 180,
          outline: ensureCCW([
            [-halfLs + 1, -halfWs - Hs],
            [halfLs - 1, -halfWs - Hs],
            [halfLs - 6, -halfWs - Hs - glueW],
            [-halfLs + 6, -halfWs - Hs - glueW],
          ]),
          hinge: {
            p1: [-halfLs + 1, -halfWs - Hs],
            p2: [halfLs - 1, -halfWs - Hs],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.22,
            stageEnd: 0.44,
            pivotOffsetMm: t + gap,
            renderCreaseFillet: false,
          },
          children: [],
        },
      ],
    };

    const sleeveBack: PanelNode2D = {
      id: 'sleeve-back',
      label: 'Sleeve Back Wall',
      shortCode: 'S-BCK',
      faceRole: 'back',
      partGroup: 'height',
      printable: true,
      uprightAngleDeg: 0,
      outline: rectPoly(-halfLs, halfWs, halfLs, halfWs + Hs),
      hinge: {
        p1: [-halfLs, halfWs],
        p2: [halfLs, halfWs],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.0,
        stageEnd: 0.25,
      },
      children: [
        {
          id: 'top-lid',
          label: 'Sleeve Top Face',
          shortCode: 'TOP',
          faceRole: 'top',
          partGroup: 'lid',
          printable: true,
          uprightAngleDeg: 0,
          outline: sleeveTopOutline,
          holes: topHoles,
          windowFilms: topFilms,
          hinge: {
            p1: [-halfLs, topY0],
            p2: [halfLs, topY0],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.18,
            stageEnd: 0.44,
          },
          children: [],
        },
      ],
    };

    // --- PIECE 2: INNER SLIDING DRAWER (Laid cleanly to the right of Sleeve on 2D sheet) ---
    const sheetGap = Math.max(18, t * 7);
    const drawerCx = halfLs + sheetGap + Hd + halfLd;
    const taperAngle = clampNum(rawParams.dustFlapTaperDeg, 0, 20);
    const flapLen = Math.max(10, Math.min(Hd * 0.82, Wd * 0.28, 24));
    const taperDrop = Math.min(Hd * 0.22, Math.tan((taperAngle * Math.PI) / 180) * flapLen);
    const relief = Math.min(1.2, t * 0.5);
    const flapHalfL = Math.max(10, halfLd - t - gap);

    const drawerFront: PanelNode2D = {
      id: 'front-wall',
      label: 'Drawer Front Wall',
      shortCode: 'D-FRT',
      faceRole: 'front',
      partGroup: 'length',
      printable: true,
      uprightAngleDeg: 180,
      outline: rectPoly(drawerCx - halfLd, -halfWd - Hd, drawerCx + halfLd, -halfWd),
      hinge: {
        p1: [drawerCx - halfLd, -halfWd],
        p2: [drawerCx + halfLd, -halfWd],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.04,
        stageEnd: 0.3,
      },
      children: [
        {
          id: 'drawer-fl-tab',
          label: 'Drawer Front-Left Tab',
          shortCode: 'D-FL',
          faceRole: 'flap',
          partGroup: 'flaps',
          uprightAngleDeg: 90,
          outline: ensureCCW([
            [drawerCx - flapHalfL, -halfWd - relief],
            [drawerCx - flapHalfL - flapLen, -halfWd - relief - taperDrop * 0.3],
            [drawerCx - flapHalfL - flapLen, -halfWd - Hd + relief + taperDrop],
            [drawerCx - flapHalfL, -halfWd - Hd + relief],
          ]),
          hinge: {
            p1: [drawerCx - flapHalfL, -halfWd - relief],
            p2: [drawerCx - flapHalfL, -halfWd - Hd + relief],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.16,
            stageEnd: 0.36,
            renderCreaseFillet: false,
          },
          children: [],
        },
        {
          id: 'drawer-fr-tab',
          label: 'Drawer Front-Right Tab',
          shortCode: 'D-FR',
          faceRole: 'flap',
          partGroup: 'flaps',
          uprightAngleDeg: -90,
          outline: ensureCCW([
            [drawerCx + flapHalfL, -halfWd - relief],
            [drawerCx + flapHalfL, -halfWd - Hd + relief],
            [drawerCx + flapHalfL + flapLen, -halfWd - Hd + relief + taperDrop],
            [drawerCx + flapHalfL + flapLen, -halfWd - relief - taperDrop * 0.3],
          ]),
          hinge: {
            p1: [drawerCx + flapHalfL, -halfWd - relief],
            p2: [drawerCx + flapHalfL, -halfWd - Hd + relief],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.16,
            stageEnd: 0.36,
            renderCreaseFillet: false,
          },
          children: [],
        },
      ],
    };

    const drawerBack: PanelNode2D = {
      id: 'back-wall',
      label: 'Drawer Back Wall',
      shortCode: 'D-BCK',
      faceRole: 'back',
      partGroup: 'length',
      printable: true,
      uprightAngleDeg: 0,
      outline: rectPoly(drawerCx - halfLd, halfWd, drawerCx + halfLd, halfWd + Hd),
      hinge: {
        p1: [drawerCx - halfLd, halfWd],
        p2: [drawerCx + halfLd, halfWd],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.04,
        stageEnd: 0.3,
      },
      children: [
        {
          id: 'drawer-bl-tab',
          label: 'Drawer Back-Left Tab',
          shortCode: 'D-BL',
          faceRole: 'flap',
          partGroup: 'flaps',
          uprightAngleDeg: 90,
          outline: ensureCCW([
            [drawerCx - flapHalfL, halfWd + relief],
            [drawerCx - flapHalfL, halfWd + Hd - relief],
            [drawerCx - flapHalfL - flapLen, halfWd + Hd - relief - taperDrop],
            [drawerCx - flapHalfL - flapLen, halfWd + relief + taperDrop * 0.3],
          ]),
          hinge: {
            p1: [drawerCx - flapHalfL, halfWd + relief],
            p2: [drawerCx - flapHalfL, halfWd + Hd - relief],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.16,
            stageEnd: 0.36,
            renderCreaseFillet: false,
          },
          children: [],
        },
        {
          id: 'drawer-br-tab',
          label: 'Drawer Back-Right Tab',
          shortCode: 'D-BR',
          faceRole: 'flap',
          partGroup: 'flaps',
          uprightAngleDeg: -90,
          outline: ensureCCW([
            [drawerCx + flapHalfL, halfWd + relief],
            [drawerCx + flapHalfL + flapLen, halfWd + relief + taperDrop * 0.3],
            [drawerCx + flapHalfL + flapLen, halfWd + Hd - relief - taperDrop],
            [drawerCx + flapHalfL, halfWd + Hd - relief],
          ]),
          hinge: {
            p1: [drawerCx + flapHalfL, halfWd + relief],
            p2: [drawerCx + flapHalfL, halfWd + Hd - relief],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.16,
            stageEnd: 0.36,
            renderCreaseFillet: false,
          },
          children: [],
        },
      ],
    };

    const drawerLeft: PanelNode2D = {
      id: 'left-wall',
      label: 'Drawer Rear End',
      shortCode: 'D-LFT',
      faceRole: 'left',
      partGroup: 'width',
      printable: true,
      uprightAngleDeg: 90,
      outline: rectPoly(drawerCx - halfLd - Hd, -halfWd, drawerCx - halfLd, halfWd),
      hinge: {
        p1: [drawerCx - halfLd, -halfWd],
        p2: [drawerCx - halfLd, halfWd],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.22,
        stageEnd: 0.42,
      },
      children: [],
    };

    const drawerRight: PanelNode2D = {
      id: 'right-wall',
      label: 'Drawer Pull Face',
      shortCode: 'PULL',
      faceRole: 'right',
      partGroup: 'width',
      printable: true,
      uprightAngleDeg: -90,
      outline: rectPoly(drawerCx + halfLd, -halfWd, drawerCx + halfLd + Hd, halfWd),
      hinge: {
        p1: [drawerCx + halfLd, -halfWd],
        p2: [drawerCx + halfLd, halfWd],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.22,
        stageEnd: 0.42,
      },
      children: [],
    };

    const drawerPiece: PanelNode2D = {
      id: 'drawer-base',
      label: 'Inner Drawer Base',
      shortCode: 'DRAWER',
      faceRole: 'base',
      partGroup: 'length',
      printable: true,
      uprightAngleDeg: 0,
      outline: rectPoly(drawerCx - halfLd, -halfWd, drawerCx + halfLd, halfWd),
      assemblyMotion: {
        pivot2D: [drawerCx, 0],
        // Slides cleanly along -X directly inside the outer sleeve resting above sleeve floor.
        translateMm: [-drawerCx, t + slideGap * 0.5, 0],
        stageStart: 0.4,
        stageEnd: 0.66,
        closeStageStart: 0.66,
        closeStageEnd: 1.0,
        openOffsetMm: [Ld * 0.72, 0, 0],
      },
      children: [drawerFront, drawerBack, drawerLeft, drawerRight],
    };

    const rootPanel: PanelNode2D = {
      id: 'base',
      label: 'Sleeve Bottom Face',
      shortCode: 'SLEEVE',
      faceRole: 'base',
      partGroup: 'length',
      printable: true,
      uprightAngleDeg: 0,
      outline: sleeveBottomOutline,
      children: [sleeveFront, sleeveBack, drawerPiece],
    };

    return finalizeSolvedDieline({
      templateId: this.id,
      templateCode: this.code,
      templateName: this.name,
      params: { ...rawParams, thicknessMm: t, lengthMm: Lreq, widthMm: Wreq, heightMm: Hreq },
      material,
      innerMm: { length: Linner, width: Winner, height: Hinner },
      outerMm: { length: Louter, width: Wouter, height: Houter },
      rootPanel,
      contentAnchor: {
        panelId: 'drawer-base',
        center2D: [drawerCx, 0],
        floorOffsetMm: t * 0.5,
      },
      clampNotices,
    });
  },
};
