import type {
  BoardMaterialPreset,
  ContentAnchorSpec,
  CreaseSegment2D,
  DimensionTripleMm,
  FlatPanelSummary,
  PackagingParams,
  PanelNode2D,
  Point2D,
  SolvedDieline,
} from '../types';
import {
  computeNetAreaM2,
  measureTreeBounds2D,
  polygonBounds,
  polygonCentroid,
  walkPanels,
} from '../geometry/polygon-ops';

export function clampNum(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function roundMm(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Collect flat panel metadata, cut loops, hole loops, crease lines, sheet area
 * and estimated weight from a constructed parametric PanelNode2D tree.
 */
export function finalizeSolvedDieline(input: {
  templateId: string;
  templateCode: string;
  templateName: string;
  params: PackagingParams;
  material: BoardMaterialPreset;
  innerMm: DimensionTripleMm;
  outerMm: DimensionTripleMm;
  rootPanel: PanelNode2D;
  contentAnchor?: ContentAnchorSpec;
  clampNotices: string[];
}): SolvedDieline {
  const {
    templateId,
    templateCode,
    templateName,
    params,
    material,
    innerMm,
    outerMm,
    rootPanel,
    contentAnchor,
    clampNotices,
  } = input;

  const blankBounds = measureTreeBounds2D(rootPanel);
  const blankAreaM2 = computeNetAreaM2(rootPanel);
  const estimatedWeightG = Math.round(blankAreaM2 * material.gsm * 10) / 10;

  const flatPanels: FlatPanelSummary[] = [];
  const cutLoops: Point2D[][] = [];
  const holeLoops: Point2D[][] = [];
  const creaseSegments: CreaseSegment2D[] = [];

  walkPanels(rootPanel, (node) => {
    const holes = node.holes ?? [];
    flatPanels.push({
      id: node.id,
      label: node.label,
      shortCode: node.shortCode,
      faceRole: node.faceRole,
      partGroup: node.partGroup,
      bounds: polygonBounds(node.outline),
      centroid: polygonCentroid(node.outline),
      uprightAngleDeg: node.uprightAngleDeg,
      printable: Boolean(node.printable),
      outline: node.outline,
      holes,
    });
    cutLoops.push(node.outline);
    for (const hole of holes) holeLoops.push(hole);
    if (node.hinge) {
      creaseSegments.push({
        p1: node.hinge.p1,
        p2: node.hinge.p2,
        foldDirection: node.hinge.foldDirection,
        panelId: node.id,
      });
    }
  });

  return {
    templateId,
    templateCode,
    templateName,
    params,
    material,
    innerMm: {
      length: roundMm(innerMm.length),
      width: roundMm(innerMm.width),
      height: roundMm(innerMm.height),
    },
    outerMm: {
      length: roundMm(outerMm.length),
      width: roundMm(outerMm.width),
      height: roundMm(outerMm.height),
    },
    blankBounds,
    blankAreaM2,
    estimatedWeightG,
    rootPanel,
    contentAnchor: contentAnchor ?? {
      panelId: rootPanel.id,
      center2D: [0, 0],
      floorOffsetMm: params.thicknessMm * 0.5,
    },
    flatPanels,
    cutLoops,
    holeLoops,
    creaseSegments,
    clampNotices,
  };
}
