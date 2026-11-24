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
  handHolePoly,
  notchedRectPoly,
  rectPoly,
  roundedRectPoly,
} from '../geometry/polygon-ops';
import { clampNum, finalizeSolvedDieline } from './helpers';

/**
 * FEFCO 0421 / 0422 — Roll End Self-Locking Display Tray.
 * Flagship reference template matching Pacdora Model 120030:
 *  - Central base panel with die-cut lock slots (2 or 4 slots)
 *  - Front & back walls with tapered corner dust flaps
 *  - Double-wall rollover left & right sides sandwiching the corner flaps
 *  - Integrated lock tabs snapping directly into the base slots at fold = 1.0
 *  - Extended LabelLab features: optional front display scoop, carry hand holes,
 *    window cutout, configurable lock tab count/width, and full Pro CAD clearances.
 */
export const FEFCO_0421_TRAY_TEMPLATE: PackagingTemplateDefinition = {
  id: 'fefco-0421-tray',
  code: 'FEFCO 0421',
  name: 'Roll End Display Tray',
  shortName: 'Display Tray',
  category: 'tray',
  tagline: 'Self-locking double-wall corrugated tray — zero glue required',
  description:
    'Reinforced rollover side walls lock into base slots to trap corner flaps cleanly. Ideal for beverage 12/24-packs, retail shelf displays, and gift sets.',
  defaultMaterialId: 'kraft-e',
  defaultDimensions: { length: 320, width: 200, height: 60 },
  minDimensions: { length: 80, width: 65, height: 22 },
  maxDimensions: { length: 900, width: 700, height: 260 },
  heroFold: 1.0,
  openPreviewFold: 0.52,
  features: {
    lockTabs: true,
    dustFlapTaper: true,
    flapGap: false,
    tuckStyle: false,
    thumbNotch: false,
    handHoles: true,
    displayScoop: true,
    windowCutout: true,
  },
  sizePresets: [
    {
      id: 'standard-320',
      label: 'Standard Display',
      detail: '320 × 200 × 60 mm',
      lengthMm: 320,
      widthMm: 200,
      heightMm: 60,
      dimensionMode: 'outer',
    },
    {
      id: 'can-330-12',
      label: '12-Can Tray (4×3)',
      detail: '272 × 204 × 58 mm (Inner)',
      lengthMm: 272,
      widthMm: 204,
      heightMm: 58,
      dimensionMode: 'inner',
      beverageFit: '12 × 330ml Cans',
    },
    {
      id: 'can-330-24',
      label: '24-Can Tray (6×4)',
      detail: '406 × 272 × 60 mm (Inner)',
      lengthMm: 406,
      widthMm: 272,
      heightMm: 60,
      dimensionMode: 'inner',
      materialId: 'kraft-b',
      beverageFit: '24 × 330ml Cans',
    },
    {
      id: 'glass-290-12',
      label: '12-Bottle 290ml Tray',
      detail: '256 × 192 × 75 mm (Inner)',
      lengthMm: 256,
      widthMm: 192,
      heightMm: 75,
      dimensionMode: 'inner',
      beverageFit: '12 × 290ml Glass',
    },
    {
      id: 'gift-a4',
      label: 'A4 Gift Tray',
      detail: '310 × 225 × 55 mm (Inner)',
      lengthMm: 310,
      widthMm: 225,
      heightMm: 55,
      dimensionMode: 'inner',
      materialId: 'white-e',
    },
  ],

  solve(rawParams: PackagingParams, material: BoardMaterialPreset) {
    const clampNotices: string[] = [];
    const t = clampNum(rawParams.thicknessMm, 0.25, 8);
    const gap = clampNum(rawParams.slotClearanceMm, 0.1, 1.5);
    const Lreq = clampNum(rawParams.lengthMm, 80, 900);
    const Wreq = clampNum(rawParams.widthMm, 65, 700);
    const Hreq = clampNum(rawParams.heightMm, 22, 260);

    // Bridge spans over the sandwiched corner dust flap (thickness t) plus two clearances.
    const bridgeW = t + 2 * gap;
    // Distance from outer side crease to inner rollover wall's interior face.
    const sideWallStack = bridgeW + t;

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
      Lbase = Linner + 2 * sideWallStack;
      Wbase = Winner;
      Hwall = Hinner + t;
      Louter = Lbase + 2 * t;
      Wouter = Wbase + 2 * t;
      Houter = Hwall + t;
    } else {
      Louter = Lreq;
      Wouter = Wreq;
      Houter = Hreq;
      Lbase = Math.max(40, Louter - 2 * t);
      Wbase = Math.max(35, Wouter - 2 * t);
      Hwall = Math.max(18, Houter - t);
      Linner = Math.max(20, Lbase - 2 * sideWallStack);
      Winner = Wbase;
      Hinner = Math.max(14, Hwall - t);
    }

    const halfL = Lbase * 0.5;
    const halfW = Wbase * 0.5;

    // Corner flaps fold from front/back walls and sit sandwiched inside the rollover side walls.
    const maxFlapLen = Math.min(Hwall * 0.92, Wbase * 0.43);
    const flapLen = Math.max(14, maxFlapLen);
    const taperAngle = clampNum(rawParams.dustFlapTaperDeg, 0, 20);
    const taperDrop = Math.min(Hwall * 0.25, Math.tan((taperAngle * Math.PI) / 180) * flapLen);

    // Lock tabs & base slots aligned to exact rollover landing plane: x = ±(halfL - bridgeW - t/2).
    const tabCount: 1 | 2 = rawParams.lockTabCount === 1 ? 1 : 2;
    const maxTabW = tabCount === 2 ? Math.max(12, Wbase * 0.26) : Math.max(16, Wbase * 0.48);
    const tabW = clampNum(rawParams.lockTabWidthMm, 12, maxTabW);
    if (tabW < rawParams.lockTabWidthMm - 0.5) {
      clampNotices.push(`Lock tab width clamped to ${tabW.toFixed(0)} mm to preserve side wall margin.`);
    }
    const slotW = tabW + 2 * gap;
    const slotThickness = t + 2 * gap;
    const tabCentersY = tabCount === 2 ? [-Wbase * 0.27, Wbase * 0.27] : [0];
    const tabDepth = Math.min(12, Math.max(4.5, t * 2.2 + 2.0));

    // Base lock slot holes (CW polygons)
    const baseHoles: Point2D[][] = [];
    const leftSlotInnerX = -halfL + bridgeW + t + gap * 0.6;
    const leftSlotOuterX = leftSlotInnerX - slotThickness;
    const rightSlotOuterX = halfL - bridgeW - t - gap * 0.6;
    const rightSlotInnerX = rightSlotOuterX + slotThickness;

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

    // Optional front wall display scoop or front window cutout
    let frontOutline: Point2D[];
    const frontHoles: Point2D[][] = [];
    const frontFilms: Point2D[][] = [];
    if (rawParams.displayScoop) {
      const scoopDepth = clampNum(rawParams.displayScoopDepthMm, 8, Hwall * 0.62);
      const scoopWidth = Math.max(24, Lbase * 0.58);
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
        const margin = Math.max(10, t * 4);
        const maxWinW = Math.max(12, Lbase - margin * 2 - sideWallStack * 2);
        const maxWinH = Math.max(10, Hwall - margin * 2);
        if (maxWinW >= 18 && maxWinH >= 14) {
          const winW = clampNum(rawParams.windowWidthMm, 16, maxWinW);
          const winH = clampNum(rawParams.windowHeightMm, 12, maxWinH);
          const winR = clampNum(rawParams.windowRadiusMm, 0, Math.min(winW, winH) * 0.45);
          const cy = -halfW - Hwall * 0.5;
          const hole = roundedRectPoly(-winW * 0.5, cy - winH * 0.5, winW * 0.5, cy + winH * 0.5, winR, 6, true);
          frontHoles.push(hole);
          if (rawParams.windowFilm) {
            frontFilms.push(roundedRectPoly(-winW * 0.5 - 2, cy - winH * 0.5 - 2, winW * 0.5 + 2, cy + winH * 0.5 + 2, winR, 6, false));
          }
        } else {
          clampNotices.push('Tray height is too compact for a front window cutout.');
        }
      }
    }

    const relief = Math.min(1.5, t * 0.75);
    const innerHeight = Math.max(10, Hwall - t - 0.35);
    // Inset corner dust flaps by (t + gap) from the outer side wall crease so when folded 90°,
    // each dust flap sits cleanly sandwiched BETWEEN the outer wall and inner rollover wall with ZERO Z-fighting!
    const flapInsetX = t + gap;
    const flapBaseHalfL = Math.max(10, halfL - flapInsetX);

    // Helper: construct rollover inner wall polygon WITH protruding bottom locking tabs.
    const buildInnerWallWithTabs = (side: 'left' | 'right'): Point2D[] => {
      const yMin = -halfW + t + 0.6;
      const yMax = halfW - t - 0.6;
      const chamfer = Math.min(2.5, tabDepth * 0.35);
      const sortedTabs = [...tabCentersY].sort((a, b) => a - b);

      if (side === 'left') {
        const xHinge = -halfL - Hwall - bridgeW;
        const xBottom = xHinge - innerHeight;
        const xTip = xBottom - tabDepth;
        const pts: Point2D[] = [[xHinge, yMin], [xHinge, yMax], [xBottom, yMax]];
        // Walk from yMax down to yMin creating protruding tabs toward -X.
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
      } else {
        const xHinge = halfL + Hwall + bridgeW;
        const xBottom = xHinge + innerHeight;
        const xTip = xBottom + tabDepth;
        const pts: Point2D[] = [[xHinge, yMax], [xHinge, yMin], [xBottom, yMin]];
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
      }
    };

    // Optional matching carry hand holes punched cleanly through BOTH outer & inner side walls.
    const leftOuterHoles: Point2D[][] = [];
    const leftInnerHoles: Point2D[][] = [];
    const rightOuterHoles: Point2D[][] = [];
    const rightInnerHoles: Point2D[][] = [];
    if (rawParams.handHoles) {
      const availW = Wbase - flapLen * 2 - 12;
      const availH = Hwall - 24;
      if (availW >= 32 && availH >= 16) {
        const hhW = clampNum(rawParams.handHoleWidthMm, 30, Math.min(110, availW));
        const hhH = clampNum(rawParams.handHoleHeightMm, 14, Math.min(34, availH));
        // Positioned centered along Y, slightly above midpoint of wall height.
        const distFromTop = Math.max(hhH * 0.5 + 10, Hwall * 0.36);
        const leftOuterCx = -halfL - (Hwall - distFromTop);
        const leftInnerCx = -halfL - Hwall - bridgeW - distFromTop;
        const rightOuterCx = halfL + (Hwall - distFromTop);
        const rightInnerCx = halfL + Hwall + bridgeW + distFromTop;
        // Note: on side walls, wall length runs along Y, wall height runs along X -> swap width/height!
        leftOuterHoles.push(handHolePoly(leftOuterCx, 0, hhH, hhW));
        leftInnerHoles.push(handHolePoly(leftInnerCx, 0, hhH, hhW));
        rightOuterHoles.push(handHolePoly(rightOuterCx, 0, hhH, hhW));
        rightInnerHoles.push(handHolePoly(rightInnerCx, 0, hhH, hhW));
      } else {
        clampNotices.push('Increase tray height or width slightly to fit side carry hand holes.');
      }
    }

    const frontWall: PanelNode2D = {
      id: 'front-wall',
      label: 'Front Wall',
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
            [-flapBaseHalfL - flapLen, -halfW - relief - taperDrop * 0.4],
            [-flapBaseHalfL - flapLen, -halfW - Hwall + relief + taperDrop],
            [-flapBaseHalfL, -halfW - Hwall + relief],
          ]),
          hinge: {
            p1: [-flapBaseHalfL, -halfW - relief],
            p2: [-flapBaseHalfL, -halfW - Hwall + relief],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.22,
            stageEnd: 0.46,
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
            [flapBaseHalfL + flapLen, -halfW - relief - taperDrop * 0.4],
          ]),
          hinge: {
            p1: [flapBaseHalfL, -halfW - relief],
            p2: [flapBaseHalfL, -halfW - Hwall + relief],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.22,
            stageEnd: 0.46,
            renderCreaseFillet: false,
          },
          children: [],
        },
      ],
    };

    const backWall: PanelNode2D = {
      id: 'back-wall',
      label: 'Back Wall',
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
            [-flapBaseHalfL - flapLen, halfW + relief + taperDrop * 0.4],
          ]),
          hinge: {
            p1: [-flapBaseHalfL, halfW + relief],
            p2: [-flapBaseHalfL, halfW + Hwall - relief],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.22,
            stageEnd: 0.46,
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
            [flapBaseHalfL + flapLen, halfW + relief + taperDrop * 0.4],
            [flapBaseHalfL + flapLen, halfW + Hwall - relief - taperDrop],
            [flapBaseHalfL, halfW + Hwall - relief],
          ]),
          hinge: {
            p1: [flapBaseHalfL, halfW + relief],
            p2: [flapBaseHalfL, halfW + Hwall - relief],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.22,
            stageEnd: 0.46,
            renderCreaseFillet: false,
          },
          children: [],
        },
      ],
    };

    const leftOuterWall: PanelNode2D = {
      id: 'left-wall',
      label: 'Left Side Wall',
      shortCode: 'LEFT',
      faceRole: 'left',
      partGroup: 'width',
      printable: true,
      uprightAngleDeg: 90,
      outline: rectPoly(-halfL - Hwall, -halfW, -halfL, halfW),
      holes: leftOuterHoles,
      hinge: {
        p1: [-halfL, -halfW],
        p2: [-halfL, halfW],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.42,
        stageEnd: 0.68,
      },
      children: [
        {
          id: 'left-bridge',
          label: 'Left Top Rim',
          shortCode: 'L-RIM',
          faceRole: 'bridge',
          partGroup: 'locks',
          uprightAngleDeg: 90,
          outline: rectPoly(-halfL - Hwall - bridgeW, -halfW + t * 0.6, -halfL - Hwall, halfW - t * 0.6),
          hinge: {
            p1: [-halfL - Hwall, -halfW + t * 0.6],
            p2: [-halfL - Hwall, halfW - t * 0.6],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.64,
            stageEnd: 0.84,
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
              holes: leftInnerHoles,
              hinge: {
                p1: [-halfL - Hwall - bridgeW, -halfW + t + 0.6],
                p2: [-halfL - Hwall - bridgeW, halfW - t - 0.6],
                foldDirection: 'inward',
                targetAngleDeg: 90,
                stageStart: 0.74,
                stageEnd: 1.0,
              },
              children: [],
            },
          ],
        },
      ],
    };

    const rightOuterWall: PanelNode2D = {
      id: 'right-wall',
      label: 'Right Side Wall',
      shortCode: 'RIGHT',
      faceRole: 'right',
      partGroup: 'width',
      printable: true,
      uprightAngleDeg: -90,
      outline: rectPoly(halfL, -halfW, halfL + Hwall, halfW),
      holes: rightOuterHoles,
      hinge: {
        p1: [halfL, -halfW],
        p2: [halfL, halfW],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.42,
        stageEnd: 0.68,
      },
      children: [
        {
          id: 'right-bridge',
          label: 'Right Top Rim',
          shortCode: 'R-RIM',
          faceRole: 'bridge',
          partGroup: 'locks',
          uprightAngleDeg: -90,
          outline: rectPoly(halfL + Hwall, -halfW + t * 0.6, halfL + Hwall + bridgeW, halfW - t * 0.6),
          hinge: {
            p1: [halfL + Hwall, -halfW + t * 0.6],
            p2: [halfL + Hwall, halfW - t * 0.6],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.64,
            stageEnd: 0.84,
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
              holes: rightInnerHoles,
              hinge: {
                p1: [halfL + Hwall + bridgeW, -halfW + t + 0.6],
                p2: [halfL + Hwall + bridgeW, halfW - t - 0.6],
                foldDirection: 'inward',
                targetAngleDeg: 90,
                stageStart: 0.74,
                stageEnd: 1.0,
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
      clampNotices,
    });
  },
};
