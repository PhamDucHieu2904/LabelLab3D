import type {
  BoardMaterialPreset,
  PackagingParams,
  PackagingTemplateDefinition,
  PanelNode2D,
  Point2D,
} from '../types';
import { ensureCCW, ensureCW, notchedRectPoly, rectPoly, roundedRectPoly } from '../geometry/polygon-ops';
import { clampNum, finalizeSolvedDieline } from './helpers';

/**
 * FEFCO 0427 — Roll-End Tuck-Top Mailer Box (E-commerce / Subscription Box).
 * Features:
 *  - Double-wall rollover left/right sides with base lock tabs (like 0421)
 *  - Hinged Top Lid with front tuck tongue & side dust wings
 *  - Optional thumb notch on Front Wall and Top Display Window with PET film
 *  - At fold = 0.72 the box is fully assembled with lid dramatically open for showcase!
 */
export const FEFCO_0427_MAILER_TEMPLATE: PackagingTemplateDefinition = {
  id: 'fefco-0427-mailer',
  code: 'FEFCO 0427',
  name: 'Self-Locking Mailer Box',
  shortName: 'Mailer Box',
  category: 'mailer',
  tagline: 'Premium e-commerce tuck-top mailer with double side walls',
  description:
    'Fold-and-lock corrugated mailer featuring crush-resistant rollover sides, integrated lid wings, optional display window, and effortless unboxing.',
  defaultMaterialId: 'kraft-e',
  defaultDimensions: { length: 260, width: 200, height: 80 },
  minDimensions: { length: 90, width: 80, height: 30 },
  maxDimensions: { length: 700, width: 550, height: 220 },
  heroFold: 0.76,
  openPreviewFold: 0.72,
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
      id: 'mailer-ecom',
      label: 'E-Commerce Standard',
      detail: '260 × 200 × 80 mm',
      lengthMm: 260,
      widthMm: 200,
      heightMm: 80,
      dimensionMode: 'inner',
    },
    {
      id: 'mailer-apparel',
      label: 'Apparel / T-Shirt Box',
      detail: '320 × 240 × 65 mm',
      lengthMm: 320,
      widthMm: 240,
      heightMm: 65,
      dimensionMode: 'inner',
      materialId: 'black-e',
    },
    {
      id: 'mailer-gift-pack',
      label: '3-Bottle Beverage Gift',
      detail: '240 × 210 × 85 mm',
      lengthMm: 240,
      widthMm: 210,
      heightMm: 85,
      dimensionMode: 'inner',
      materialId: 'white-e',
      beverageFit: '3 × 290ml Glass Gift',
    },
    {
      id: 'mailer-compact',
      label: 'Cosmetic Subscription',
      detail: '180 × 150 × 60 mm',
      lengthMm: 180,
      widthMm: 150,
      heightMm: 60,
      dimensionMode: 'inner',
      materialId: 'white-e',
    },
  ],

  solve(rawParams: PackagingParams, material: BoardMaterialPreset) {
    const clampNotices: string[] = [];
    const t = clampNum(rawParams.thicknessMm, 0.4, 5);
    const gap = clampNum(rawParams.slotClearanceMm, 0.1, 1.5);
    const Lreq = clampNum(rawParams.lengthMm, 90, 700);
    const Wreq = clampNum(rawParams.widthMm, 80, 550);
    const Hreq = clampNum(rawParams.heightMm, 30, 220);

    const bridgeW = t + 2 * gap;
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
      Wbase = Winner + t;
      Hwall = Hinner + t;
      Louter = Lbase + 2 * t;
      Wouter = Wbase + 2 * t;
      Houter = Hwall + 2 * t;
    } else {
      Louter = Lreq;
      Wouter = Wreq;
      Houter = Hreq;
      Lbase = Math.max(50, Louter - 2 * t);
      Wbase = Math.max(45, Wouter - 2 * t);
      Hwall = Math.max(24, Houter - 2 * t);
      Linner = Math.max(30, Lbase - 2 * sideWallStack);
      Winner = Math.max(30, Wbase - t);
      Hinner = Math.max(18, Hwall - t);
    }

    const halfL = Lbase * 0.5;
    const halfW = Wbase * 0.5;
    const flapLen = Math.max(16, Math.min(Hwall * 0.86, Wbase * 0.42));
    const taperAngle = clampNum(rawParams.dustFlapTaperDeg, 0, 20);
    const taperDrop = Math.min(Hwall * 0.22, Math.tan((taperAngle * Math.PI) / 180) * flapLen);

    const tabCount: 1 | 2 = rawParams.lockTabCount === 1 ? 1 : 2;
    const maxTabW = tabCount === 2 ? Math.max(12, Wbase * 0.25) : Math.max(16, Wbase * 0.44);
    const tabW = clampNum(rawParams.lockTabWidthMm, 12, maxTabW);
    const slotW = tabW + 2 * gap;
    const slotThickness = t + 2 * gap;
    const tabCentersY = tabCount === 2 ? [-Wbase * 0.26, Wbase * 0.26] : [0];
    const tabDepth = Math.min(10, Math.max(4, t * 2 + 1.8));
    const innerHeight = Math.max(12, Hwall - t - 0.35);

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

    const buildInnerWall = (side: 'left' | 'right'): Point2D[] => {
      const yMin = -halfW + t + 0.6;
      const yMax = halfW - t - 0.6;
      const chamfer = Math.min(2, tabDepth * 0.35);
      const sorted = [...tabCentersY].sort((a, b) => a - b);
      if (side === 'left') {
        const xH = -halfL - Hwall - bridgeW;
        const xB = xH - innerHeight;
        const xT = xB - tabDepth;
        const pts: Point2D[] = [[xH, yMin], [xH, yMax], [xB, yMax]];
        for (let i = sorted.length - 1; i >= 0; i--) {
          const cy = sorted[i];
          pts.push([xB, cy + tabW * 0.5], [xT, cy + tabW * 0.5 - chamfer], [xT, cy - tabW * 0.5 + chamfer], [xB, cy - tabW * 0.5]);
        }
        pts.push([xB, yMin]);
        return ensureCCW(pts);
      }
      const xH = halfL + Hwall + bridgeW;
      const xB = xH + innerHeight;
      const xT = xB + tabDepth;
      const pts: Point2D[] = [[xH, yMax], [xH, yMin], [xB, yMin]];
      for (let i = 0; i < sorted.length; i++) {
        const cy = sorted[i];
        pts.push([xB, cy - tabW * 0.5], [xT, cy - tabW * 0.5 + chamfer], [xT, cy + tabW * 0.5 - chamfer], [xB, cy + tabW * 0.5]);
      }
      pts.push([xB, yMax]);
      return ensureCCW(pts);
    };

    // Optional Top Lid display window cutout
    const lidHoles: Point2D[][] = [];
    const lidFilms: Point2D[][] = [];
    const lidY0 = halfW + Hwall;
    const lidY1 = lidY0 + Wbase;
    if (rawParams.windowCutout) {
      const margin = Math.max(14, t * 6);
      const maxWinW = Math.max(18, Lbase - margin * 2 - sideWallStack * 2);
      const maxWinH = Math.max(18, Wbase - margin * 2);
      if (maxWinW >= 24 && maxWinH >= 24) {
        const winW = clampNum(rawParams.windowWidthMm, 20, maxWinW);
        const winH = clampNum(rawParams.windowHeightMm, 20, maxWinH);
        const winR = clampNum(rawParams.windowRadiusMm, 0, Math.min(winW, winH) * 0.45);
        const cy = (lidY0 + lidY1) * 0.5;
        lidHoles.push(roundedRectPoly(-winW * 0.5, cy - winH * 0.5, winW * 0.5, cy + winH * 0.5, winR, 6, true));
        if (rawParams.windowFilm) {
          lidFilms.push(roundedRectPoly(-winW * 0.5 - 2, cy - winH * 0.5 - 2, winW * 0.5 + 2, cy + winH * 0.5 + 2, winR, 6, false));
        }
      } else {
        clampNotices.push('Lid is too small for the requested display window.');
      }
    }

    const frontOutline = rawParams.thumbNotch
      ? notchedRectPoly(
          -halfL,
          -halfW - Hwall,
          halfL,
          -halfW,
          'bottom',
          clampNum(rawParams.thumbNotchRadiusMm * 2, 14, Math.min(48, Lbase * 0.35)),
          clampNum(rawParams.thumbNotchRadiusMm, 7, Math.min(22, Hwall * 0.42)),
          10,
        )
      : rectPoly(-halfL, -halfW - Hwall, halfL, -halfW);

    const relief = Math.min(1.5, t * 0.75);
    const flapBaseHalfL = Math.max(12, halfL - t - gap);
    const tuckLen = Math.max(18, Math.min(Hwall - t - 1.5, Hwall * 0.85));
    const wingW = Math.max(16, Math.min(Hwall * 0.78, Wbase * 0.42));
    const lidHalfL = halfL - t * 0.4;

    const topLid: PanelNode2D = {
      id: 'top-lid',
      label: 'Top Lid',
      shortCode: 'TOP',
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
        stageStart: 0.68,
        stageEnd: 0.94,
      },
      children: [
        {
          id: 'lid-front-tuck',
          label: 'Lid Front Tuck',
          shortCode: 'TUCK',
          faceRole: 'tab',
          partGroup: 'lid',
          uprightAngleDeg: 0,
          outline: ensureCCW([
            [-lidHalfL + sideWallStack, lidY1],
            [lidHalfL - sideWallStack, lidY1],
            [lidHalfL - sideWallStack - 5, lidY1 + tuckLen],
            [-lidHalfL + sideWallStack + 5, lidY1 + tuckLen],
          ]),
          hinge: {
            p1: [-lidHalfL + sideWallStack, lidY1],
            p2: [lidHalfL - sideWallStack, lidY1],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.8,
            stageEnd: 1.0,
            pivotOffsetMm: t + gap,
          },
          children: [],
        },
        {
          id: 'lid-left-wing',
          label: 'Lid Left Dust Wing',
          shortCode: 'L-WNG',
          faceRole: 'flap',
          partGroup: 'flaps',
          uprightAngleDeg: 90,
          outline: ensureCCW([
            [-lidHalfL, lidY0 + 3],
            [-lidHalfL, lidY1 - 2],
            [-lidHalfL - wingW, lidY1 - 10],
            [-lidHalfL - wingW, lidY0 + 12],
          ]),
          hinge: {
            p1: [-lidHalfL, lidY0 + 3],
            p2: [-lidHalfL, lidY1 - 2],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.62,
            stageEnd: 0.84,
            pivotOffsetMm: sideWallStack + gap,
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
          outline: ensureCCW([
            [lidHalfL, lidY0 + 3],
            [lidHalfL + wingW, lidY0 + 12],
            [lidHalfL + wingW, lidY1 - 10],
            [lidHalfL, lidY1 - 2],
          ]),
          hinge: {
            p1: [lidHalfL, lidY0 + 3],
            p2: [lidHalfL, lidY1 - 2],
            foldDirection: 'inward',
            targetAngleDeg: 90,
            stageStart: 0.62,
            stageEnd: 0.84,
            pivotOffsetMm: sideWallStack + gap,
          },
          children: [],
        },
      ],
    };

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
        p1: [-halfL, -halfW],
        p2: [halfL, -halfW],
        foldDirection: 'inward',
        targetAngleDeg: 90,
        stageStart: 0.0,
        stageEnd: 0.24,
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
            stageStart: 0.18,
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
            stageStart: 0.18,
            stageEnd: 0.38,
            renderCreaseFillet: false,
          },
          children: [],
        },
      ],
    };

    const backWall: PanelNode2D = {
      id: 'back-wall',
      label: 'Back Spine Wall',
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
        stageEnd: 0.24,
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
            stageStart: 0.18,
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
            stageStart: 0.18,
            stageEnd: 0.38,
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
        stageStart: 0.34,
        stageEnd: 0.54,
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
            stageStart: 0.5,
            stageEnd: 0.64,
          },
          children: [
            {
              id: 'left-inner-wall',
              label: 'Left Inner Rollover',
              shortCode: 'L-IN',
              faceRole: 'inner',
              partGroup: 'locks',
              uprightAngleDeg: -90,
              outline: buildInnerWall('left'),
              hinge: {
                p1: [-halfL - Hwall - bridgeW, -halfW + t + 0.6],
                p2: [-halfL - Hwall - bridgeW, halfW - t - 0.6],
                foldDirection: 'inward',
                targetAngleDeg: 90,
                stageStart: 0.56,
                stageEnd: 0.72,
              },
              children: [],
            },
          ],
        },
      ],
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
        stageStart: 0.34,
        stageEnd: 0.54,
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
            stageStart: 0.5,
            stageEnd: 0.64,
          },
          children: [
            {
              id: 'right-inner-wall',
              label: 'Right Inner Rollover',
              shortCode: 'R-IN',
              faceRole: 'inner',
              partGroup: 'locks',
              uprightAngleDeg: 90,
              outline: buildInnerWall('right'),
              hinge: {
                p1: [halfL + Hwall + bridgeW, -halfW + t + 0.6],
                p2: [halfL + Hwall + bridgeW, halfW - t - 0.6],
                foldDirection: 'inward',
                targetAngleDeg: 90,
                stageStart: 0.56,
                stageEnd: 0.72,
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
      children: [frontWall, backWall, leftWall, rightWall],
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
