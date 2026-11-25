import type {
  BoardMaterialPreset,
  CarrierPackLayout,
  PackagingParams,
  PackagingTemplateDefinition,
  PanelNode2D,
  Point2D,
} from '../types';
import {
  ensureCCW,
  handHolePoly,
  notchedRectPoly,
  rectPoly,
  roundedRectPoly,
} from '../geometry/polygon-ops';
import { clampNum, finalizeSolvedDieline } from './helpers';

/**
 * F&B PACK — Beverage 4 / 6 / 8-Pack Bottle & Can Carrier.
 * Purpose-built for LabelLab's beverage audience:
 *  - Reinforced open-top display basket with pitched side gable walls & inset corner tabs
 *  - Central arched carry handle spine with ergonomic stadium finger grip cutout
 *  - Slotted internal cross-divider partitions (2×2 = 4-pack, 3×2 = 6-pack, 4×2 = 8-pack)
 *  - Seamless 1-click integration with "Pack Your Bottles" to seat real 3D bottles inside each cell!
 */
export const BEVERAGE_CARRIER_TEMPLATE: PackagingTemplateDefinition = {
  id: 'beverage-carrier',
  code: 'F&B PACK',
  name: 'Beverage 4/6-Pack Carrier',
  shortName: 'Drink Carrier',
  category: 'carrier',
  tagline: 'Bottle & can basket carrier with arched handle & cell dividers',
  description:
    'Signature craft beverage carrier with central arched carry handle, ergonomic finger grip, and protective internal bottle dividers. Ready for 4-pack, 6-pack, or 8-pack combos.',
  defaultMaterialId: 'kraft-e',
  defaultDimensions: { length: 210, width: 142, height: 112 },
  minDimensions: { length: 110, width: 95, height: 55 },
  maxDimensions: { length: 520, width: 280, height: 220 },
  heroFold: 1.0,
  openPreviewFold: 0.66,
  features: {
    lockTabs: false,
    dustFlapTaper: true,
    flapGap: false,
    tuckStyle: false,
    thumbNotch: false,
    handHoles: false,
    displayScoop: true,
    windowCutout: true,
    carrierPack: true,
    dividerGrid: true,
    bottlePacking: true,
  },
  sizePresets: [
    {
      id: 'carrier-6-glass290',
      label: '6-Pack 290ml Glass (3×2)',
      detail: '198 × 132 × 114 mm (Inner)',
      lengthMm: 198,
      widthMm: 132,
      heightMm: 114,
      dimensionMode: 'inner',
      beverageFit: '6 × 290ml Glass',
    },
    {
      id: 'carrier-6-can330',
      label: '6-Pack 330ml Cans (3×2)',
      detail: '208 × 140 × 86 mm (Inner)',
      lengthMm: 208,
      widthMm: 140,
      heightMm: 86,
      dimensionMode: 'inner',
      beverageFit: '6 × 330ml Cans',
    },
    {
      id: 'carrier-4-craft',
      label: '4-Pack Craft Bottles (2×2)',
      detail: '140 × 140 × 116 mm (Inner)',
      lengthMm: 140,
      widthMm: 140,
      heightMm: 116,
      dimensionMode: 'inner',
      materialId: 'kraft-350',
      beverageFit: '4 × 330ml Craft',
    },
    {
      id: 'carrier-8-slim',
      label: '8-Pack 250ml Slim (4×2)',
      detail: '234 × 118 × 104 mm (Inner)',
      lengthMm: 234,
      widthMm: 118,
      heightMm: 104,
      dimensionMode: 'inner',
      materialId: 'white-e',
      beverageFit: '8 × 250ml Slim',
    },
  ],

  solve(rawParams: PackagingParams, material: BoardMaterialPreset) {
    const clampNotices: string[] = [];
    const t = clampNum(rawParams.thicknessMm, 0.4, 4.0);
    const gap = clampNum(rawParams.slotClearanceMm, 0.1, 1.2);
    const Lreq = clampNum(rawParams.lengthMm, 110, 520);
    const Wreq = clampNum(rawParams.widthMm, 95, 280);
    const Hreq = clampNum(rawParams.heightMm, 55, 220);

    const carrierPack: CarrierPackLayout =
      rawParams.carrierPack === '4-pack' || rawParams.carrierPack === '8-pack'
        ? rawParams.carrierPack
        : '6-pack';
    const cols = carrierPack === '4-pack' ? 2 : carrierPack === '8-pack' ? 4 : 3;

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
      Lbase = Linner;
      Wbase = Winner;
      Hwall = Hinner;
      Louter = Lbase + 2 * t;
      Wouter = Wbase + 2 * t;
      Houter = Hwall + t;
    } else {
      Louter = Lreq;
      Wouter = Wreq;
      Houter = Hreq;
      Lbase = Math.max(80, Louter - 2 * t);
      Wbase = Math.max(70, Wouter - 2 * t);
      Hwall = Math.max(45, Houter - t);
      Linner = Lbase;
      Winner = Wbase;
      Hinner = Hwall;
    }

    const halfL = Lbase * 0.5;
    const halfW = Wbase * 0.5;
    // Central handle stands tall above bottle shoulders/caps for comfortable grip.
    const Hhandle = Math.max(Hwall + 72, Math.round(Hwall * 1.65));
    const HsidePeak = Math.min(Hhandle - 18, Math.round(Hwall * 1.24));

    const flapLen = Math.max(14, Math.min(Hwall * 0.65, Wbase * 0.34, 34));
    const taperAngle = clampNum(rawParams.dustFlapTaperDeg, 0, 20);
    const taperDrop = Math.min(Hwall * 0.24, Math.tan((taperAngle * Math.PI) / 180) * flapLen);
    const relief = Math.min(1.5, t * 0.6);
    const flapBaseHalfL = Math.max(14, halfL - t - gap);

    // Front wall: optional retail display scoop OR branding window cutout
    let frontOutline: Point2D[];
    const frontHoles: Point2D[][] = [];
    const frontFilms: Point2D[][] = [];
    if (rawParams.displayScoop) {
      const scoopDepth = clampNum(rawParams.displayScoopDepthMm, 10, Hwall * 0.52);
      const scoopWidth = Math.max(32, Lbase * 0.62);
      frontOutline = notchedRectPoly(
        -halfL,
        -halfW - Hwall,
        halfL,
        -halfW,
        'bottom',
        scoopWidth,
        scoopDepth,
        14,
      );
    } else {
      frontOutline = rectPoly(-halfL, -halfW - Hwall, halfL, -halfW);
      if (rawParams.windowCutout) {
        const margin = Math.max(10, t * 5);
        const maxWinW = Math.max(18, Lbase - margin * 2);
        const maxWinH = Math.max(14, Hwall - margin * 2);
        if (maxWinW >= 24 && maxWinH >= 18) {
          const winW = clampNum(rawParams.windowWidthMm, 20, maxWinW);
          const winH = clampNum(rawParams.windowHeightMm, 16, maxWinH);
          const winR = clampNum(rawParams.windowRadiusMm, 0, Math.min(winW, winH) * 0.45);
          const cy = -halfW - Hwall * 0.5;
          frontHoles.push(
            roundedRectPoly(-winW * 0.5, cy - winH * 0.5, winW * 0.5, cy + winH * 0.5, winR, 6, true),
          );
          if (rawParams.windowFilm) {
            frontFilms.push(
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
          clampNotices.push('Carrier front wall is too compact for the requested display window.');
        }
      }
    }

    const frontWall: PanelNode2D = {
      id: 'front-wall',
      label: 'Front Display Wall',
      shortCode: 'FRONT',
      faceRole: 'front',
      partGroup: 'height',
      printable: true,
      uprightAngleDeg: 180,
      outline: frontOutline,
      holes: frontHoles,
      windowFilms: frontFilms,
      hinge: {
        p1: [-halfL, -halfW],
        p2: [halfL, -halfW],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.0,
        stageEnd: 0.28,
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
            [-flapBaseHalfL, -halfW - relief],
            [-flapBaseHalfL - flapLen, -halfW - relief - taperDrop * 0.3],
            [-flapBaseHalfL - flapLen, -halfW - Hwall + relief + taperDrop],
            [-flapBaseHalfL, -halfW - Hwall + relief],
          ]),
          hinge: {
            p1: [-flapBaseHalfL, -halfW - relief],
            p2: [-flapBaseHalfL, -halfW - Hwall + relief],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.16,
            stageEnd: 0.38,
            renderCreaseFillet: false,
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
            [flapBaseHalfL, -halfW - relief],
            [flapBaseHalfL, -halfW - Hwall + relief],
            [flapBaseHalfL + flapLen, -halfW - Hwall + relief + taperDrop],
            [flapBaseHalfL + flapLen, -halfW - relief - taperDrop * 0.3],
          ]),
          hinge: {
            p1: [flapBaseHalfL, -halfW - relief],
            p2: [flapBaseHalfL, -halfW - Hwall + relief],
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

    const backWall: PanelNode2D = {
      id: 'back-wall',
      label: 'Back Display Wall',
      shortCode: 'BACK',
      faceRole: 'back',
      partGroup: 'height',
      printable: true,
      uprightAngleDeg: 0,
      outline: rectPoly(-halfL, halfW, halfL, halfW + Hwall),
      hinge: {
        p1: [-halfL, halfW],
        p2: [halfL, halfW],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.0,
        stageEnd: 0.28,
      },
      children: [
        {
          id: 'back-left-flap',
          label: 'Back-Left Corner Flap',
          shortCode: 'BL',
          faceRole: 'flap',
          partGroup: 'flaps',
          uprightAngleDeg: 90,
          outline: ensureCCW([
            [-flapBaseHalfL, halfW + relief],
            [-flapBaseHalfL, halfW + Hwall - relief],
            [-flapBaseHalfL - flapLen, halfW + Hwall - relief - taperDrop],
            [-flapBaseHalfL - flapLen, halfW + relief + taperDrop * 0.3],
          ]),
          hinge: {
            p1: [-flapBaseHalfL, halfW + relief],
            p2: [-flapBaseHalfL, halfW + Hwall - relief],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.16,
            stageEnd: 0.38,
            renderCreaseFillet: false,
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
            [flapBaseHalfL, halfW + relief],
            [flapBaseHalfL + flapLen, halfW + relief + taperDrop * 0.3],
            [flapBaseHalfL + flapLen, halfW + Hwall - relief - taperDrop],
            [flapBaseHalfL, halfW + Hwall - relief],
          ]),
          hinge: {
            p1: [flapBaseHalfL, halfW + relief],
            p2: [flapBaseHalfL, halfW + Hwall - relief],
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

    // Pitched side end walls rising slightly toward the central spine for a signature carrier look.
    const gableFlat = Math.min(20, Wbase * 0.18);
    const leftWall: PanelNode2D = {
      id: 'left-wall',
      label: 'Left End Wall',
      shortCode: 'LEFT',
      faceRole: 'left',
      partGroup: 'width',
      printable: true,
      uprightAngleDeg: 90,
      outline: ensureCCW([
        [-halfL, -halfW],
        [-halfL, halfW],
        [-halfL - Hwall, halfW],
        [-halfL - HsidePeak, gableFlat * 0.5],
        [-halfL - HsidePeak, -gableFlat * 0.5],
        [-halfL - Hwall, -halfW],
      ]),
      hinge: {
        p1: [-halfL, -halfW],
        p2: [-halfL, halfW],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.26,
        stageEnd: 0.5,
      },
      children: [],
    };

    const rightWall: PanelNode2D = {
      id: 'right-wall',
      label: 'Right End Wall',
      shortCode: 'RIGHT',
      faceRole: 'right',
      partGroup: 'width',
      printable: true,
      uprightAngleDeg: -90,
      outline: ensureCCW([
        [halfL, -halfW],
        [halfL + Hwall, -halfW],
        [halfL + HsidePeak, -gableFlat * 0.5],
        [halfL + HsidePeak, gableFlat * 0.5],
        [halfL + Hwall, halfW],
        [halfL, halfW],
      ]),
      hinge: {
        p1: [halfL, -halfW],
        p2: [halfL, halfW],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.26,
        stageEnd: 0.5,
      },
      children: [],
    };

    // --- PIECE 2: CENTRAL ARCHED CARRY HANDLE SPINE (Stands upright along Z = 0) ---
    const sheetGap = Math.max(16, t * 7);
    const handleLen = Math.max(60, Linner - 2 * gap);
    const halfHandleL = handleLen * 0.5;
    const handleY0 = halfW + Hwall + sheetGap;
    const handleY1 = handleY0 + Hhandle;

    // Ergonomic tapered shoulder arch rising cleanly above basket height Hwall
    const shoulderY = handleY0 + Math.min(Hwall + 10, Hhandle * 0.62);
    const archTopHalfW = Math.max(44, Math.min(halfHandleL * 0.72, 86));
    const archCornerR = Math.min(14, (Hhandle - (shoulderY - handleY0)) * 0.35);
    const handleOutline = ensureCCW([
      [-halfHandleL, handleY0],
      [halfHandleL, handleY0],
      [halfHandleL, shoulderY],
      [archTopHalfW, handleY1 - archCornerR],
      [archTopHalfW - archCornerR, handleY1],
      [-archTopHalfW + archCornerR, handleY1],
      [-archTopHalfW, handleY1 - archCornerR],
      [-halfHandleL, shoulderY],
    ]);

    const gripW = clampNum(archTopHalfW * 1.25, 42, Math.min(96, handleLen * 0.55));
    const gripH = 22;
    const gripCy = handleY1 - Math.max(20, gripH * 0.95);
    const handleHoles: Point2D[][] = [handHolePoly(0, gripCy, gripW, gripH)];

    const centerHandle: PanelNode2D = {
      id: 'center-handle',
      label: 'Center Carry Handle',
      shortCode: 'HANDLE',
      faceRole: 'inner',
      partGroup: 'dividers',
      printable: true,
      uprightAngleDeg: 0,
      outline: handleOutline,
      holes: handleHoles,
      assemblyMotion: {
        pivot2D: [0, handleY0],
        translateMm: [0, t * 0.5, handleY0],
        rotateDeg: [90, 0, 0],
        stageStart: 0.38,
        stageEnd: 0.68,
        closeStageStart: 0.68,
        closeStageEnd: 1.0,
        openOffsetMm: [0, Math.max(42, Hwall * 0.68), 0],
      },
      children: [],
    };

    // --- PIECE 3: INTERNAL CROSS-CELL BOTTLE DIVIDERS (1 for 4-pack, 2 for 6-pack, 3 for 8-pack) ---
    const crossDividers: PanelNode2D[] = [];
    if (rawParams.dividerGrid !== false) {
      const divCount = cols - 1;
      const divSpan = Math.max(40, Winner - 2 * gap);
      const divH = Math.max(36, Math.round(Hwall * 0.9));
      const divY0 = handleY1 + sheetGap;
      const divSpacing2D = divSpan + Math.max(12, t * 5);
      const totalRowW = (divCount - 1) * divSpacing2D;

      for (let i = 0; i < divCount; i++) {
        const divCx2D = -totalRowW * 0.5 + i * divSpacing2D;
        const targetX = -halfHandleL + ((i + 1) / cols) * handleLen;
        crossDividers.push({
          id: `divider-${i + 1}`,
          label: `Cell Divider ${i + 1}`,
          shortCode: `DIV ${i + 1}`,
          faceRole: 'inner',
          partGroup: 'dividers',
          printable: false,
          uprightAngleDeg: 0,
          outline: rectPoly(divCx2D - divSpan * 0.5, divY0, divCx2D + divSpan * 0.5, divY0 + divH),
          assemblyMotion: {
            pivot2D: [divCx2D, divY0],
            // Euler XYZ [90, 0, 90] stands the panel vertically along +Y and aligns its width along Z!
            translateMm: [targetX - divCx2D, t * 0.5 + 0.15, divY0],
            rotateDeg: [90, 0, 90],
            stageStart: 0.42,
            stageEnd: 0.72,
            closeStageStart: 0.72,
            closeStageEnd: 1.0,
            openOffsetMm: [0, Math.max(42, Hwall * 0.68), 0],
          },
          children: [],
        });
      }
    }

    const rootPanel: PanelNode2D = {
      id: 'base',
      label: 'Carrier Base',
      shortCode: 'BASE',
      faceRole: 'base',
      partGroup: 'length',
      printable: true,
      uprightAngleDeg: 0,
      outline: rectPoly(-halfL, -halfW, halfL, halfW),
      children: [frontWall, backWall, leftWall, rightWall, centerHandle, ...crossDividers],
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
        carrierPack,
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
