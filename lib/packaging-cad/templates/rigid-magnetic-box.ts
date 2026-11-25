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
 * RIGID MAG — Magnetic Closure Book-Style Luxury Rigid Gift Box.
 * Single-piece rigid greyboard presentation box:
 *  - Rigid 4-wall inner presentation tray with inset corner wraps
 *  - Extended hinged back spine & overhanging book-cover top lid
 *  - Chamfered front magnetic closure flap wrapping smoothly over the front wall
 *  - Hero fold = 0.78 showcases the open hinged lid & interior presentation tray!
 */
export const RIGID_MAGNETIC_BOX_TEMPLATE: PackagingTemplateDefinition = {
  id: 'rigid-magnetic-box',
  code: 'RIGID MAG',
  name: 'Magnetic Closure Rigid Box',
  shortName: 'Magnetic Box',
  category: 'rigid-box',
  tagline: 'Book-style luxury rigid gift box with magnetic wrap-around flap',
  description:
    'Hinged clamshell rigid box with overhanging book-cover lid and sleek front magnetic closure flap. Designed for premium spirits, cosmetics, corporate kits, and unboxing showcases.',
  defaultMaterialId: 'rigid-20',
  defaultDimensions: { length: 240, width: 180, height: 80 },
  minDimensions: { length: 85, width: 70, height: 32 },
  maxDimensions: { length: 580, width: 440, height: 240 },
  heroFold: 0.78,
  openPreviewFold: 0.62,
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
      id: 'mag-gift-std',
      label: 'Luxury Gift Kit',
      detail: '240 × 180 × 80 mm (Inner)',
      lengthMm: 240,
      widthMm: 180,
      heightMm: 80,
      dimensionMode: 'inner',
      materialId: 'rigid-20',
    },
    {
      id: 'mag-noir-collector',
      label: 'Matte Black Collector',
      detail: '260 × 200 × 90 mm (Inner)',
      lengthMm: 260,
      widthMm: 200,
      heightMm: 90,
      dimensionMode: 'inner',
      materialId: 'black-e',
    },
    {
      id: 'mag-spirit-bottle',
      label: 'Single Spirit / Wine Box',
      detail: '95 × 265 × 95 mm (Inner)',
      lengthMm: 95,
      widthMm: 265,
      heightMm: 95,
      dimensionMode: 'inner',
      materialId: 'rigid-20',
      beverageFit: '1 × Premium Bottle',
    },
    {
      id: 'mag-cosmetic-set',
      label: 'Cosmetic Duo Box',
      detail: '190 × 135 × 65 mm (Inner)',
      lengthMm: 190,
      widthMm: 135,
      heightMm: 65,
      dimensionMode: 'inner',
      materialId: 'ivory-350',
    },
  ],

  solve(rawParams: PackagingParams, material: BoardMaterialPreset) {
    const clampNotices: string[] = [];
    const t = clampNum(rawParams.thicknessMm, 0.4, 5.0);
    const gap = clampNum(rawParams.slotClearanceMm, 0.1, 1.5);
    const Lreq = clampNum(rawParams.lengthMm, 85, 580);
    const Wreq = clampNum(rawParams.widthMm, 70, 440);
    const Hreq = clampNum(rawParams.heightMm, 32, 240);

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
      Wouter = Wbase + 3 * t + gap;
      Houter = Hwall + 2 * t + gap;
    } else {
      Louter = Lreq;
      Wouter = Wreq;
      Houter = Hreq;
      Lbase = Math.max(55, Louter - 2 * t);
      Wbase = Math.max(45, Wouter - 3 * t - gap);
      Hwall = Math.max(24, Houter - 2 * t - gap);
      Linner = Lbase;
      Winner = Wbase;
      Hinner = Hwall;
    }

    const halfL = Lbase * 0.5;
    const halfW = Wbase * 0.5;
    const Hspine = Hwall + t + gap;
    const lidHalfL = halfL + t + gap * 0.4;
    const lidDepth = Wbase + t + gap;
    const flapDrop = Math.min(Hwall * 0.62, Math.max(22, Hwall * 0.48));
    const flapChamfer = Math.min(12, flapDrop * 0.28, lidHalfL * 0.18);

    const flapLen = Math.max(12, Math.min(Hwall * 0.82, Wbase * 0.28, 28));
    const taperAngle = clampNum(rawParams.dustFlapTaperDeg, 0, 20);
    const taperDrop = Math.min(Hwall * 0.22, Math.tan((taperAngle * Math.PI) / 180) * flapLen);
    const relief = Math.min(1.2, t * 0.5);
    const flapBaseHalfL = Math.max(12, halfL - t - gap);

    const frontOutline = rawParams.thumbNotch
      ? notchedRectPoly(
          -halfL,
          -halfW - Hwall,
          halfL,
          -halfW,
          'bottom',
          clampNum(rawParams.thumbNotchRadiusMm * 2, 14, Math.min(44, Lbase * 0.34)),
          clampNum(rawParams.thumbNotchRadiusMm, 6, Math.min(18, Hwall * 0.38)),
          10,
        )
      : rectPoly(-halfL, -halfW - Hwall, halfL, -halfW);

    const frontWall: PanelNode2D = {
      id: 'front-wall',
      label: 'Front Tray Wall',
      shortCode: 'FRONT',
      faceRole: 'front',
      partGroup: 'height',
      printable: true,
      uprightAngleDeg: 180,
      outline: frontOutline,
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
          label: 'Front-Left Wrap Tab',
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
            stageStart: 0.14,
            stageEnd: 0.34,
            renderCreaseFillet: false,
          },
          children: [],
        },
        {
          id: 'front-right-flap',
          label: 'Front-Right Wrap Tab',
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
            stageStart: 0.14,
            stageEnd: 0.34,
            renderCreaseFillet: false,
          },
          children: [],
        },
      ],
    };

    const leftWall: PanelNode2D = {
      id: 'left-wall',
      label: 'Left Side Wall',
      shortCode: 'LEFT',
      faceRole: 'left',
      partGroup: 'width',
      printable: true,
      uprightAngleDeg: 90,
      outline: rectPoly(-halfL - Hwall, -halfW, -halfL, halfW),
      hinge: {
        p1: [-halfL, -halfW],
        p2: [-halfL, halfW],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.24,
        stageEnd: 0.48,
      },
      children: [],
    };

    const rightWall: PanelNode2D = {
      id: 'right-wall',
      label: 'Right Side Wall',
      shortCode: 'RIGHT',
      faceRole: 'right',
      partGroup: 'width',
      printable: true,
      uprightAngleDeg: -90,
      outline: rectPoly(halfL, -halfW, halfL + Hwall, halfW),
      hinge: {
        p1: [halfL, -halfW],
        p2: [halfL, halfW],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.24,
        stageEnd: 0.48,
      },
      children: [],
    };

    // Hinged Top Book Cover Lid & Magnetic Front Flap
    const lidY0 = halfW + Hspine;
    const lidY1 = lidY0 + lidDepth;
    const lidHoles: Point2D[][] = [];
    const lidFilms: Point2D[][] = [];
    if (rawParams.windowCutout) {
      const margin = Math.max(14, t * 6);
      const maxWinW = Math.max(18, lidHalfL * 2 - margin * 2);
      const maxWinH = Math.max(18, lidDepth - margin * 2);
      if (maxWinW >= 24 && maxWinH >= 24) {
        const winW = clampNum(rawParams.windowWidthMm, 20, maxWinW);
        const winH = clampNum(rawParams.windowHeightMm, 20, maxWinH);
        const winR = clampNum(rawParams.windowRadiusMm, 0, Math.min(winW, winH) * 0.45);
        const cy = (lidY0 + lidY1) * 0.5;
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
        clampNotices.push('Book cover lid is too compact for the requested display window.');
      }
    }

    const magneticFlap: PanelNode2D = {
      id: 'magnetic-flap',
      label: 'Magnetic Closure Flap',
      shortCode: 'MAG FLAP',
      faceRole: 'tab',
      partGroup: 'lid',
      printable: true,
      uprightAngleDeg: 0,
      outline: ensureCCW([
        [-lidHalfL, lidY1],
        [lidHalfL, lidY1],
        [lidHalfL, lidY1 + flapDrop - flapChamfer],
        [lidHalfL - flapChamfer, lidY1 + flapDrop],
        [-lidHalfL + flapChamfer, lidY1 + flapDrop],
        [-lidHalfL, lidY1 + flapDrop - flapChamfer],
      ]),
      hinge: {
        p1: [-lidHalfL, lidY1],
        p2: [lidHalfL, lidY1],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.82,
        stageEnd: 1.0,
      },
      children: [],
    };

    const topLid: PanelNode2D = {
      id: 'top-lid',
      label: 'Book Cover Lid',
      shortCode: 'TOP LID',
      faceRole: 'top',
      partGroup: 'lid',
      printable: true,
      uprightAngleDeg: 0,
      outline: rectPoly(-lidHalfL, lidY0, lidHalfL, lidY1),
      holes: lidHoles,
      windowFilms: lidFilms,
      hinge: {
        p1: [-lidHalfL, lidY0],
        p2: [lidHalfL, lidY0],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.52,
        stageEnd: 0.88,
      },
      children: [magneticFlap],
    };

    const backWall: PanelNode2D = {
      id: 'back-wall',
      label: 'Book Spine Back Wall',
      shortCode: 'SPINE',
      faceRole: 'back',
      partGroup: 'height',
      printable: true,
      uprightAngleDeg: 0,
      outline: rectPoly(-halfL, halfW, halfL, halfW + Hspine),
      hinge: {
        p1: [-halfL, halfW],
        p2: [halfL, halfW],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.0,
        stageEnd: 0.28,
      },
      children: [
        topLid,
        {
          id: 'back-left-flap',
          label: 'Back-Left Wrap Tab',
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
            stageStart: 0.14,
            stageEnd: 0.34,
            renderCreaseFillet: false,
          },
          children: [],
        },
        {
          id: 'back-right-flap',
          label: 'Back-Right Wrap Tab',
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
            stageStart: 0.14,
            stageEnd: 0.34,
            renderCreaseFillet: false,
          },
          children: [],
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
      children: [frontWall, backWall, leftWall, rightWall],
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
        panelId: rootPanel.id,
        center2D: [0, 0],
        floorOffsetMm: t * 0.5,
      },
      clampNotices,
    });
  },
};
