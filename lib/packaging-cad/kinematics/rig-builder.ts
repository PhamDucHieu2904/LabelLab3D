import * as THREE from 'three';
import {
  MM_TO_METRE,
  type PackagingPartGroup,
  type PanelNode2D,
  type SolvedDieline,
} from '../types';
import { polygonCentroid } from '../geometry/polygon-ops';
import { buildPanelSolidGeometry, buildWindowFilmGeometry, cad2DToLocal3D } from '../geometry/solid-builder';
import { createCreaseFillet, type CreaseFilletHandle } from '../geometry/crease-hinge';
import type { PackagingMaterialSet } from '../materials/corrugated-materials';

export interface RigJoint {
  readonly panelId: string;
  readonly partGroup: PackagingPartGroup;
  readonly pivotGroup: THREE.Group;
  readonly axis: THREE.Vector3;
  readonly foldDirection: 'inward' | 'outward';
  readonly targetAngleRad: number;
  readonly stageStart: number;
  readonly stageEnd: number;
  readonly fillet: CreaseFilletHandle | null;
}

export interface BuiltPackagingRig {
  readonly root: THREE.Group;
  readonly joints: readonly RigJoint[];
  readonly panelMeshes: ReadonlyMap<string, { mesh: THREE.Mesh; partGroup: PackagingPartGroup }>;
  /** Apply staged folding progress t ∈ [0, 1] smoothly in < 0.1 ms with zero allocations. */
  setFoldProgress(progress: number): void;
  /** Highlight a specific parameter group (e.g. when hovering a numeric field in Inspector). */
  setHighlightGroup(group: PackagingPartGroup | null): void;
  /** Toggle subtle technical crease guidelines on the flat/folding model. */
  setCreaseLinesVisible(visible: boolean): void;
  /** Measure upright world bounding box of the assembled/unfolding box in metres. */
  measureBounds(): THREE.Box3;
  /** Dispose all owned BufferGeometries and highlight clones cleanly (zero VRAM leak). */
  dispose(): void;
}

/** Smooth C1 cubic ease-in-out for natural cardboard folding motion. */
export function easeInOutCubic(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** Compute normalized stage angle in radians for a single joint at global progress `foldProgress`. */
export function computeJointAngleRad(
  foldProgress: number,
  stageStart: number,
  stageEnd: number,
  targetAngleRad: number,
): number {
  const span = Math.max(1e-4, stageEnd - stageStart);
  const localT = (foldProgress - stageStart) / span;
  return targetAngleRad * easeInOutCubic(localT);
}

/**
 * Construct a complete Forward Kinematics 3D Folding Rig from a SolvedDieline.
 * Every child panel pivots cleanly around its exact 2D crease line with thickness offset
 * and a dynamic curved crease fillet strip so corners stay airtight at 90° and 180°.
 */
export function buildPackagingRig(
  solved: SolvedDieline,
  materials: PackagingMaterialSet,
  options?: { creaseSegments?: number },
): BuiltPackagingRig {
  const root = new THREE.Group();
  root.name = `packaging-rig:${solved.templateId}`;

  const joints: RigJoint[] = [];
  const ownedGeometries: THREE.BufferGeometry[] = [];
  const ownedLineMaterials: THREE.Material[] = [];
  const panelMeshes = new Map<string, { mesh: THREE.Mesh; partGroup: PackagingPartGroup }>();
  const creaseLinesGroup: THREE.LineSegments[] = [];

  const thicknessMm = solved.params.thicknessMm;
  const halfT = thicknessMm * 0.5;
  const baseMaterials: THREE.Material[] = [materials.outside, materials.inside, materials.edge];

  // Shared highlight overlay material (subtle electric blue sheen when hovering a parameter).
  const highlightOutside = materials.outside.clone();
  highlightOutside.emissive.set('#2563eb');
  highlightOutside.emissiveIntensity = 0.28;
  const highlightInside = materials.inside.clone();
  highlightInside.emissive.set('#2563eb');
  highlightInside.emissiveIntensity = 0.24;
  const highlightEdge = materials.edge.clone();
  highlightEdge.emissive.set('#3b82f6');
  highlightEdge.emissiveIntensity = 0.35;
  const highlightMaterials: THREE.Material[] = [highlightOutside, highlightInside, highlightEdge];

  const creaseLineMat = new THREE.LineBasicMaterial({
    color: '#0f766e',
    transparent: true,
    opacity: 0.45,
    depthTest: true,
  });
  ownedLineMaterials.push(creaseLineMat);

  const buildNode = (
    node: PanelNode2D,
    parentGroup: THREE.Group,
    parentOriginX: number,
    parentOriginY: number,
    parentPivotYmm: number,
  ) => {
    let localOriginX = parentOriginX;
    let localOriginY = parentOriginY;
    let localPivotYmm = parentPivotYmm;
    let hostGroup = parentGroup;

    if (node.hinge) {
      const { p1, p2, foldDirection, targetAngleDeg, stageStart, stageEnd, pivotOffsetMm = 0, renderCreaseFillet = true } = node.hinge;
      const midX = (p1[0] + p2[0]) * 0.5;
      const midY = (p1[1] + p2[1]) * 0.5;

      // Place pivot at the inner side of the bend (+halfT for inward/valley fold, -halfT for outward/mountain fold)
      // so the inner edges touch cleanly without interpenetration while the crease fillet rounds the outside.
      const pivotYmm = (foldDirection === 'inward' ? halfT : -halfT) + pivotOffsetMm;

      const pivotGroup = new THREE.Group();
      pivotGroup.name = `hinge:${node.id}`;
      const [px, py, pz] = cad2DToLocal3D(
        [midX, midY],
        parentOriginX,
        parentOriginY,
        pivotYmm - parentPivotYmm,
      );
      pivotGroup.position.set(px, py, pz);
      parentGroup.add(pivotGroup);

      // Compute invariant oriented 3D hinge axis so positive rotation ALWAYS folds toward +Y (inward).
      const edge3D = new THREE.Vector3(
        (p2[0] - p1[0]) * MM_TO_METRE,
        0,
        -(p2[1] - p1[1]) * MM_TO_METRE,
      ).normalize();
      const centroid = polygonCentroid(node.outline);
      const toCentroid3D = new THREE.Vector3(
        (centroid[0] - midX) * MM_TO_METRE,
        0,
        -(centroid[1] - midY) * MM_TO_METRE,
      );
      const cross = new THREE.Vector3().crossVectors(edge3D, toCentroid3D);
      const axis = cross.y >= 0 ? edge3D : edge3D.negate();

      // Add crisp subtle crease line along the hinge on parent side.
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(
          (p1[0] - midX) * MM_TO_METRE,
          0.00018,
          -(p1[1] - midY) * MM_TO_METRE,
        ),
        new THREE.Vector3(
          (p2[0] - midX) * MM_TO_METRE,
          0.00018,
          -(p2[1] - midY) * MM_TO_METRE,
        ),
      ]);
      ownedGeometries.push(lineGeo);
      const creaseLine = new THREE.LineSegments(lineGeo, creaseLineMat);
      creaseLine.visible = solved.params.showCreaseLines;
      pivotGroup.add(creaseLine);
      creaseLinesGroup.push(creaseLine);

      // Dynamic rounded crease fillet attached in parent's static frame at the hinge pivot position!
      let fillet: CreaseFilletHandle | null = null;
      if (renderCreaseFillet && thicknessMm >= 0.3) {
        fillet = createCreaseFillet({
          p1,
          p2,
          axis3D: axis,
          childOutward3D: toCentroid3D,
          foldDirection,
          thicknessMm,
          blankBounds: solved.blankBounds,
          outsideMaterial: materials.outside,
          segments: options?.creaseSegments ?? 4,
        });
        fillet.mesh.position.set(px, py, pz);
        parentGroup.add(fillet.mesh);
      }

      joints.push({
        panelId: node.id,
        partGroup: node.partGroup,
        pivotGroup,
        axis,
        foldDirection,
        targetAngleRad: THREE.MathUtils.degToRad(targetAngleDeg),
        stageStart,
        stageEnd,
        fillet,
      });

      localOriginX = midX;
      localOriginY = midY;
      localPivotYmm = pivotYmm;
      hostGroup = pivotGroup;
    }

    // Build panel solid mesh shifted vertically by `-localPivotYmm` so its midplane stays aligned with parent sheet when flat.
    const solidGeo = buildPanelSolidGeometry({
      node,
      originX: localOriginX,
      originY: localOriginY,
      thicknessMm,
      blankBounds: solved.blankBounds,
      fluteDirection: solved.params.fluteDirection,
    });
    if (Math.abs(localPivotYmm) > 1e-6) {
      solidGeo.translate(0, -localPivotYmm * MM_TO_METRE, 0);
    }
    ownedGeometries.push(solidGeo);

    const mesh = new THREE.Mesh(solidGeo, baseMaterials);
    mesh.name = `panel:${node.id}`;
    mesh.userData.panelId = node.id;
    mesh.userData.partGroup = node.partGroup;
    hostGroup.add(mesh);
    panelMeshes.set(node.id, { mesh, partGroup: node.partGroup });

    if (node.windowFilms?.length && solved.params.windowFilm) {
      const filmGeo = buildWindowFilmGeometry(node.windowFilms, localOriginX, localOriginY);
      if (filmGeo) {
        if (Math.abs(localPivotYmm) > 1e-6) filmGeo.translate(0, -localPivotYmm * MM_TO_METRE, 0);
        ownedGeometries.push(filmGeo);
        const filmMesh = new THREE.Mesh(filmGeo, materials.windowFilm);
        filmMesh.name = `window-film:${node.id}`;
        hostGroup.add(filmMesh);
      }
    }

    for (const child of node.children) {
      buildNode(child, hostGroup, localOriginX, localOriginY, localPivotYmm);
    }
  };

  buildNode(solved.rootPanel, root, 0, 0, 0);

  let creaseLinesEnabled = solved.params.showCreaseLines;
  const setFoldProgress = (progress: number) => {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
    for (const joint of joints) {
      const angle = computeJointAngleRad(clamped, joint.stageStart, joint.stageEnd, joint.targetAngleRad);
      const signed = joint.foldDirection === 'inward' ? angle : -angle;
      joint.pivotGroup.quaternion.setFromAxisAngle(joint.axis, signed);
      joint.fillet?.updateAngle(angle);
    }
    // Hide 3D crease helper lines once folded cleanly (> 45%) so finished box corners stay pristine.
    const showLines = creaseLinesEnabled && clamped < 0.45;
    for (const line of creaseLinesGroup) line.visible = showLines;
    root.updateMatrixWorld(true);
  };

  let activeHighlight: PackagingPartGroup | null = null;
  const setHighlightGroup = (group: PackagingPartGroup | null) => {
    if (group === activeHighlight) return;
    activeHighlight = group;
    // Sync highlight clones with latest live outside/inside maps & colors.
    if (group) {
      highlightOutside.color.copy(materials.outside.color);
      highlightOutside.map = materials.outside.map;
      highlightOutside.roughness = materials.outside.roughness;
      highlightOutside.metalness = materials.outside.metalness;
      highlightOutside.needsUpdate = true;
      highlightInside.color.copy(materials.inside.color);
      highlightInside.map = materials.inside.map;
      highlightInside.roughness = materials.inside.roughness;
      highlightInside.needsUpdate = true;
      highlightEdge.color.copy(materials.edge.color);
    }
    for (const entry of panelMeshes.values()) {
      const match = group !== null && (
        entry.partGroup === group ||
        (group === 'length' && (entry.partGroup === 'length' || entry.mesh.userData.panelId === 'base')) ||
        (group === 'width' && (entry.partGroup === 'width' || entry.mesh.userData.panelId === 'base')) ||
        (group === 'material')
      );
      entry.mesh.material = match ? highlightMaterials : baseMaterials;
    }
  };

  const setCreaseLinesVisible = (visible: boolean) => {
    creaseLinesEnabled = visible;
    for (const line of creaseLinesGroup) line.visible = visible;
  };

  const measureBounds = (): THREE.Box3 => {
    root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    for (const { mesh } of panelMeshes.values()) {
      mesh.geometry.computeBoundingBox();
      if (mesh.geometry.boundingBox) {
        const worldBox = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
        box.union(worldBox);
      }
    }
    if (box.isEmpty()) {
      box.setFromCenterAndSize(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.2, 0.05, 0.2));
    }
    return box;
  };

  setFoldProgress(solved.params.foldProgress);

  return {
    root,
    joints,
    panelMeshes,
    setFoldProgress,
    setHighlightGroup,
    setCreaseLinesVisible,
    measureBounds,
    dispose() {
      for (const joint of joints) joint.fillet?.dispose();
      for (const geo of ownedGeometries) geo.dispose();
      for (const mat of ownedLineMaterials) mat.dispose();
      highlightOutside.dispose();
      highlightInside.dispose();
      highlightEdge.dispose();
    },
  };
}
