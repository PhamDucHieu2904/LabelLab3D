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
 * RIGID 2PC — Telescoping Lid & Base Luxury Rigid Box (Set-Up Box).
 * True 2-piece CAD assembly laid out non-overlapping on one 1:1 mm sheet:
 *  - Piece 1 (Base Tray): rigid 4-wall tray with inset corner reinforcement flaps
 *  - Piece 2 (Telescoping Lid): accurately oversized by `2t + 2*lidGap` so it flips 180°
 *    and telescopes smoothly down over the base walls with zero clipping or Z-fighting
 *  - Configurable lid skirt depth (`lidDepthMm`), optional front thumb notch, and top window
 */
export const RIGID_LID_BASE_TEMPLATE: PackagingTemplateDefinition = {
  id: 'rigid-lid-base',
  code: 'RIGID 2PC',
  name: 'Lid & Base Rigid Box',
  shortName: 'Lid & Base Box',
  category: 'rigid-box',
  tagline: 'Two-piece telescoping luxury rigid gift box with lift-off lid',
  description:
    'Premium 2-piece set-up box with separate base tray and oversized telescoping lid. Ideal for luxury spirits, fragrances, electronics, and gift kits.',
  defaultMaterialId: 'rigid-20',
  defaultDimensions: { length: 220, width: 160, height: 85 },
  minDimensions: { length: 65, width: 55, height: 28 },
  maxDimensions: { length: 600, width: 480, height: 280 },
  heroFold: 0.78,
  openPreviewFold: 0.72,
  features: {
    lockTabs: false,
    dustFlapTaper: true,
    flapGap: false,
    tuckStyle: false,
    thumbNotch: true,
    handHoles: false,
    displayScoop: false,
    windowCutout: true,
    lidDepth: true,
    bottlePacking: true,
  },
  sizePresets: [
    {
      id: 'rigid-gift-std',
      label: 'Luxury Gift Box',
      detail: '220 × 160 × 85 mm (Inner)',
      lengthMm: 220,
      widthMm: 160,
      heightMm: 85,
      dimensionMode: 'inner',
      materialId: 'rigid-20',
    },
    {
      id: 'rigid-2bottle-set',
      label: '2-Bottle Gift Set',
      detail: '150 × 210 × 76 mm (Inner)',
      lengthMm: 150,
      widthMm: 210,
      heightMm: 76,
      dimensionMode: 'inner',
      materialId: 'black-e',
      beverageFit: '2 × 290ml Gift',
    },
    {
      id: 'rigid-tech-box',
      label: 'Phone / Tech Box',
      detail: '175 × 95 × 52 mm (Inner)',
      lengthMm: 175,
      widthMm: 95,
      heightMm: 52,
      dimensionMode: 'inner',
      materialId: 'rigid-20',
    },
    {
      id: 'rigid-jewelry',
      label: 'Boutique Square Box',
      detail: '120 × 120 × 60 mm (Inner)',
      lengthMm: 120,
      widthMm: 120,
      heightMm: 60,
      dimensionMode: 'inner',
      materialId: 'ivory-350',
    },
  ],

  solve(rawParams: PackagingParams, material: BoardMaterialPreset) {
    const clampNotices: string[] = [];
    const t = clampNum(rawParams.thicknessMm, 0.35, 5.0);
    const gap = clampNum(rawParams.slotClearanceMm, 0.1, 1.5);
    const lidGap = Math.max(0.7, gap * 2.2);
    const Lreq = clampNum(rawParams.lengthMm, 65, 600);
    const Wreq = clampNum(rawParams.widthMm, 55, 480);
    const Hreq = clampNum(rawParams.heightMm, 28, 280);

    // Overall outer footprint belongs to the overhanging lid:
    // Base inner = (Lbase, Wbase), Base outer = (Lbase + 2t, Wbase + 2t)
    // Lid inner = Base outer + 2*lidGap = (Lbase + 2t + 2*lidGap, Wbase + 2t + 2*lidGap)
    // Lid outer = Lid inner + 2t = (Lbase + 4t + 2*lidGap, Wbase + 4t + 2*lidGap)
    let Lbase: number;
    let Wbase: number;
    let Hbase: number;
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
      Lbase = Linner;
      Wbase = Winner;
      Hbase = Hinner;
      Louter = Lbase + 4 * t + 2 * lidGap;
      Wouter = Wbase + 4 * t + 2 * lidGap;
      Houter = Hbase + 2 * t + gap;
    } else {
      Louter = Lreq;
      Wouter = Wreq;
      Houter = Hreq;
      Lbase = Math.max(40, Louter - 4 * t - 2 * lidGap);
      Wbase = Math.max(36, Wouter - 4 * t - 2 * lidGap);
      Hbase = Math.max(20, Houter - 2 * t - gap);
      Linner = Lbase;
      Winner = Wbase;
      Hinner = Hbase;
    }

    const lidHMax = Math.max(16, Hbase);
    const lidHMin = Math.min(lidHMax, 16);
    const lidH = clampNum(rawParams.lidDepthMm || Math.round(Hbase * 0.42), lidHMin, lidHMax);
    if (rawParams.lidDepthMm > lidHMax + 0.5) {
      clampNotices.push(`Lid skirt depth clamped to ${lidH.toFixed(0)} mm to match base height.`);
    }

    const halfLb = Lbase * 0.5;
    const halfWb = Wbase * 0.5;
    const Llid = Lbase + 2 * t + 2 * lidGap;
    const Wlid = Wbase + 2 * t + 2 * lidGap;
    const halfLl = Llid * 0.5;
    const halfWl = Wlid * 0.5;

    const taperAngle = clampNum(rawParams.dustFlapTaperDeg, 0, 20);
    const relief = Math.min(1.2, t * 0.5);

    // Base corner reinforcement tabs (inset by t + gap so zero Z-fighting against side walls)
    const baseFlapLen = Math.max(12, Math.min(Hbase * 0.85, Wbase * 0.28, 26));
    const baseTaper = Math.min(Hbase * 0.2, Math.tan((taperAngle * Math.PI) / 180) * baseFlapLen);
    const baseFlapHalfL = Math.max(10, halfLb - t - gap);

    const baseFrontWall: PanelNode2D = {
      id: 'front-wall',
      label: 'Base Front Wall',
      shortCode: 'FRONT',
      faceRole: 'front',
      partGroup: 'height',
      printable: true,
      uprightAngleDeg: 180,
      outline: rectPoly(-halfLb, -halfWb - Hbase, halfLb, -halfWb),
      hinge: {
        p1: [-halfLb, -halfWb],
        p2: [halfLb, -halfWb],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.0,
        stageEnd: 0.3,
      },
      children: [
        {
          id: 'base-fl-tab',
          label: 'Base Front-Left Tab',
          shortCode: 'B-FL',
          faceRole: 'flap',
          partGroup: 'flaps',
          uprightAngleDeg: 90,
          outline: ensureCCW([
            [-baseFlapHalfL, -halfWb - relief],
            [-baseFlapHalfL - baseFlapLen, -halfWb - relief - baseTaper * 0.3],
            [-baseFlapHalfL - baseFlapLen, -halfWb - Hbase + relief + baseTaper],
            [-baseFlapHalfL, -halfWb - Hbase + relief],
          ]),
          hinge: {
            p1: [-baseFlapHalfL, -halfWb - relief],
            p2: [-baseFlapHalfL, -halfWb - Hbase + relief],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.14,
            stageEnd: 0.36,
            renderCreaseFillet: false,
          },
          children: [],
        },
        {
          id: 'base-fr-tab',
          label: 'Base Front-Right Tab',
          shortCode: 'B-FR',
          faceRole: 'flap',
          partGroup: 'flaps',
          uprightAngleDeg: -90,
          outline: ensureCCW([
            [baseFlapHalfL, -halfWb - relief],
            [baseFlapHalfL, -halfWb - Hbase + relief],
            [baseFlapHalfL + baseFlapLen, -halfWb - Hbase + relief + baseTaper],
            [baseFlapHalfL + baseFlapLen, -halfWb - relief - baseTaper * 0.3],
          ]),
          hinge: {
            p1: [baseFlapHalfL, -halfWb - relief],
            p2: [baseFlapHalfL, -halfWb - Hbase + relief],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.14,
            stageEnd: 0.36,
            renderCreaseFillet: false,
          },
          children: [],
        },
      ],
    };

    const baseBackWall: PanelNode2D = {
      id: 'back-wall',
      label: 'Base Back Wall',
      shortCode: 'BACK',
      faceRole: 'back',
      partGroup: 'height',
      printable: true,
      uprightAngleDeg: 0,
      outline: rectPoly(-halfLb, halfWb, halfLb, halfWb + Hbase),
      hinge: {
        p1: [-halfLb, halfWb],
        p2: [halfLb, halfWb],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.0,
        stageEnd: 0.3,
      },
      children: [
        {
          id: 'base-bl-tab',
          label: 'Base Back-Left Tab',
          shortCode: 'B-BL',
          faceRole: 'flap',
          partGroup: 'flaps',
          uprightAngleDeg: 90,
          outline: ensureCCW([
            [-baseFlapHalfL, halfWb + relief],
            [-baseFlapHalfL, halfWb + Hbase - relief],
            [-baseFlapHalfL - baseFlapLen, halfWb + Hbase - relief - baseTaper],
            [-baseFlapHalfL - baseFlapLen, halfWb + relief + baseTaper * 0.3],
          ]),
          hinge: {
            p1: [-baseFlapHalfL, halfWb + relief],
            p2: [-baseFlapHalfL, halfWb + Hbase - relief],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.14,
            stageEnd: 0.36,
            renderCreaseFillet: false,
          },
          children: [],
        },
        {
          id: 'base-br-tab',
          label: 'Base Back-Right Tab',
          shortCode: 'B-BR',
          faceRole: 'flap',
          partGroup: 'flaps',
          uprightAngleDeg: -90,
          outline: ensureCCW([
            [baseFlapHalfL, halfWb + relief],
            [baseFlapHalfL + baseFlapLen, halfWb + relief + baseTaper * 0.3],
            [baseFlapHalfL + baseFlapLen, halfWb + Hbase - relief - baseTaper],
            [baseFlapHalfL, halfWb + Hbase - relief],
          ]),
          hinge: {
            p1: [baseFlapHalfL, halfWb + relief],
            p2: [baseFlapHalfL, halfWb + Hbase - relief],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.14,
            stageEnd: 0.36,
            renderCreaseFillet: false,
          },
          children: [],
        },
      ],
    };

    const baseLeftWall: PanelNode2D = {
      id: 'left-wall',
      label: 'Base Left Wall',
      shortCode: 'LEFT',
      faceRole: 'left',
      partGroup: 'width',
      printable: true,
      uprightAngleDeg: 90,
      outline: rectPoly(-halfLb - Hbase, -halfWb, -halfLb, halfWb),
      hinge: {
        p1: [-halfLb, -halfWb],
        p2: [-halfLb, halfWb],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.22,
        stageEnd: 0.44,
      },
      children: [],
    };

    const baseRightWall: PanelNode2D = {
      id: 'right-wall',
      label: 'Base Right Wall',
      shortCode: 'RIGHT',
      faceRole: 'right',
      partGroup: 'width',
      printable: true,
      uprightAngleDeg: -90,
      outline: rectPoly(halfLb, -halfWb, halfLb + Hbase, halfWb),
      hinge: {
        p1: [halfLb, -halfWb],
        p2: [halfLb, halfWb],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.22,
        stageEnd: 0.44,
      },
      children: [],
    };

    // --- PIECE 2: TELESCOPING LID (Laid cleanly above base on the flat 2D sheet) ---
    const sheetGap = Math.max(18, t * 7);
    const lidCenterY = halfWb + Hbase + sheetGap + lidH + halfWl;

    // Optional top display window with transparent PET film on the lid roof
    const lidHoles: Point2D[][] = [];
    const lidFilms: Point2D[][] = [];
    if (rawParams.windowCutout) {
      const margin = Math.max(14, t * 6);
      const maxWinW = Math.max(18, Llid - margin * 2);
      const maxWinH = Math.max(18, Wlid - margin * 2);
      if (maxWinW >= 22 && maxWinH >= 22) {
        const winW = clampNum(rawParams.windowWidthMm, 18, maxWinW);
        const winH = clampNum(rawParams.windowHeightMm, 18, maxWinH);
        const winR = clampNum(rawParams.windowRadiusMm, 0, Math.min(winW, winH) * 0.45);
        lidHoles.push(
          roundedRectPoly(
            -winW * 0.5,
            lidCenterY - winH * 0.5,
            winW * 0.5,
            lidCenterY + winH * 0.5,
            winR,
            6,
            true,
          ),
        );
        if (rawParams.windowFilm) {
          lidFilms.push(
            roundedRectPoly(
              -winW * 0.5 - 2,
              lidCenterY - winH * 0.5 - 2,
              winW * 0.5 + 2,
              lidCenterY + winH * 0.5 + 2,
              winR,
              6,
              false,
            ),
          );
        }
      } else {
        clampNotices.push('Lid roof is too compact for the requested display window.');
      }
    }

    const lidFlapLen = Math.max(10, Math.min(lidH * 0.85, Wlid * 0.24, 22));
    const lidTaper = Math.min(lidH * 0.22, Math.tan((taperAngle * Math.PI) / 180) * lidFlapLen);
    const lidFlapHalfL = Math.max(10, halfLl - t - gap);

    // After flipping 180° around X, the +Y2D wall becomes the FRONT (+Z) skirt facing the viewer!
    const lidFrontSkirtOutline = rawParams.thumbNotch
      ? notchedRectPoly(
          -halfLl,
          lidCenterY + halfWl,
          halfLl,
          lidCenterY + halfWl + lidH,
          'top',
          clampNum(rawParams.thumbNotchRadiusMm * 2, 14, Math.min(44, Llid * 0.34)),
          clampNum(rawParams.thumbNotchRadiusMm, 6, Math.min(18, lidH * 0.44)),
          10,
        )
      : rectPoly(-halfLl, lidCenterY + halfWl, halfLl, lidCenterY + halfWl + lidH);

    const lidFrontSkirt: PanelNode2D = {
      id: 'lid-front',
      label: 'Lid Front Skirt',
      shortCode: 'L-FRT',
      faceRole: 'front',
      partGroup: 'lid',
      printable: true,
      uprightAngleDeg: 180,
      outline: lidFrontSkirtOutline,
      hinge: {
        p1: [-halfLl, lidCenterY + halfWl],
        p2: [halfLl, lidCenterY + halfWl],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.04,
        stageEnd: 0.34,
      },
      children: [
        {
          id: 'lid-fl-tab',
          label: 'Lid Front-Left Tab',
          shortCode: 'L-FL',
          faceRole: 'flap',
          partGroup: 'flaps',
          uprightAngleDeg: 90,
          outline: ensureCCW([
            [-lidFlapHalfL, lidCenterY + halfWl + relief],
            [-lidFlapHalfL, lidCenterY + halfWl + lidH - relief],
            [-lidFlapHalfL - lidFlapLen, lidCenterY + halfWl + lidH - relief - lidTaper],
            [-lidFlapHalfL - lidFlapLen, lidCenterY + halfWl + relief + lidTaper * 0.3],
          ]),
          hinge: {
            p1: [-lidFlapHalfL, lidCenterY + halfWl + relief],
            p2: [-lidFlapHalfL, lidCenterY + halfWl + lidH - relief],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.16,
            stageEnd: 0.38,
            renderCreaseFillet: false,
          },
          children: [],
        },
        {
          id: 'lid-fr-tab',
          label: 'Lid Front-Right Tab',
          shortCode: 'L-FR',
          faceRole: 'flap',
          partGroup: 'flaps',
          uprightAngleDeg: -90,
          outline: ensureCCW([
            [lidFlapHalfL, lidCenterY + halfWl + relief],
            [lidFlapHalfL + lidFlapLen, lidCenterY + halfWl + relief + lidTaper * 0.3],
            [lidFlapHalfL + lidFlapLen, lidCenterY + halfWl + lidH - relief - lidTaper],
            [lidFlapHalfL, lidCenterY + halfWl + lidH - relief],
          ]),
          hinge: {
            p1: [lidFlapHalfL, lidCenterY + halfWl + relief],
            p2: [lidFlapHalfL, lidCenterY + halfWl + lidH - relief],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.16,
            stageEnd: 0.38,
            renderCreaseFillet: false,
          },
          children: [],
        },
      ],
    };

    const lidBackSkirt: PanelNode2D = {
      id: 'lid-back',
      label: 'Lid Back Skirt',
      shortCode: 'L-BCK',
      faceRole: 'back',
      partGroup: 'lid',
      printable: true,
      uprightAngleDeg: 0,
      outline: rectPoly(-halfLl, lidCenterY - halfWl - lidH, halfLl, lidCenterY - halfWl),
      hinge: {
        p1: [-halfLl, lidCenterY - halfWl],
        p2: [halfLl, lidCenterY - halfWl],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.04,
        stageEnd: 0.34,
      },
      children: [
        {
          id: 'lid-bl-tab',
          label: 'Lid Back-Left Tab',
          shortCode: 'L-BL',
          faceRole: 'flap',
          partGroup: 'flaps',
          uprightAngleDeg: 90,
          outline: ensureCCW([
            [-lidFlapHalfL, lidCenterY - halfWl - relief],
            [-lidFlapHalfL - lidFlapLen, lidCenterY - halfWl - relief - lidTaper * 0.3],
            [-lidFlapHalfL - lidFlapLen, lidCenterY - halfWl - lidH + relief + lidTaper],
            [-lidFlapHalfL, lidCenterY - halfWl - lidH + relief],
          ]),
          hinge: {
            p1: [-lidFlapHalfL, lidCenterY - halfWl - relief],
            p2: [-lidFlapHalfL, lidCenterY - halfWl - lidH + relief],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.16,
            stageEnd: 0.38,
            renderCreaseFillet: false,
          },
          children: [],
        },
        {
          id: 'lid-br-tab',
          label: 'Lid Back-Right Tab',
          shortCode: 'L-BR',
          faceRole: 'flap',
          partGroup: 'flaps',
          uprightAngleDeg: -90,
          outline: ensureCCW([
            [lidFlapHalfL, lidCenterY - halfWl - relief],
            [lidFlapHalfL, lidCenterY - halfWl - lidH + relief],
            [lidFlapHalfL + lidFlapLen, lidCenterY - halfWl - lidH + relief + lidTaper],
            [lidFlapHalfL + lidFlapLen, lidCenterY - halfWl - relief - lidTaper * 0.3],
          ]),
          hinge: {
            p1: [lidFlapHalfL, lidCenterY - halfWl - relief],
            p2: [lidFlapHalfL, lidCenterY - halfWl - lidH + relief],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.16,
            stageEnd: 0.38,
            renderCreaseFillet: false,
          },
          children: [],
        },
      ],
    };

    const lidLeftSkirt: PanelNode2D = {
      id: 'lid-left',
      label: 'Lid Left Skirt',
      shortCode: 'L-LFT',
      faceRole: 'left',
      partGroup: 'lid',
      printable: true,
      uprightAngleDeg: -90,
      outline: rectPoly(-halfLl - lidH, lidCenterY - halfWl, -halfLl, lidCenterY + halfWl),
      hinge: {
        p1: [-halfLl, lidCenterY - halfWl],
        p2: [-halfLl, lidCenterY + halfWl],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.22,
        stageEnd: 0.44,
      },
      children: [],
    };

    const lidRightSkirt: PanelNode2D = {
      id: 'lid-right',
      label: 'Lid Right Skirt',
      shortCode: 'L-RGT',
      faceRole: 'right',
      partGroup: 'lid',
      printable: true,
      uprightAngleDeg: 90,
      outline: rectPoly(halfLl, lidCenterY - halfWl, halfLl + lidH, lidCenterY + halfWl),
      hinge: {
        p1: [halfLl, lidCenterY - halfWl],
        p2: [halfLl, lidCenterY + halfWl],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.22,
        stageEnd: 0.44,
      },
      children: [],
    };

    const topLidPiece: PanelNode2D = {
      id: 'top-lid',
      label: 'Top Lid Roof',
      shortCode: 'TOP LID',
      faceRole: 'top',
      partGroup: 'lid',
      printable: true,
      uprightAngleDeg: 180,
      outline: rectPoly(-halfLl, lidCenterY - halfWl, halfLl, lidCenterY + halfWl),
      holes: lidHoles,
      windowFilms: lidFilms,
      assemblyMotion: {
        pivot2D: [0, lidCenterY],
        translateMm: [0, Hbase + t + gap, lidCenterY],
        arcLiftMm: Math.max(44, halfWl * 0.7),
        rotateDeg: [180, 0, 0],
        stageStart: 0.42,
        stageEnd: 0.72,
        closeStageStart: 0.72,
        closeStageEnd: 1.0,
        openOffsetMm: [0, Math.max(54, lidH * 1.55), 0],
      },
      children: [lidFrontSkirt, lidBackSkirt, lidLeftSkirt, lidRightSkirt],
    };

    const rootPanel: PanelNode2D = {
      id: 'base',
      label: 'Base Panel',
      shortCode: 'BASE',
      faceRole: 'base',
      partGroup: 'length',
      printable: true,
      uprightAngleDeg: 0,
      outline: rectPoly(-halfLb, -halfWb, halfLb, halfWb),
      children: [baseFrontWall, baseBackWall, baseLeftWall, baseRightWall, topLidPiece],
    };

    return finalizeSolvedDieline({
      templateId: this.id,
      templateCode: this.code,
      templateName: this.name,
      params: { ...rawParams, thicknessMm: t, lengthMm: Lreq, widthMm: Wreq, heightMm: Hreq, lidDepthMm: lidH },
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
