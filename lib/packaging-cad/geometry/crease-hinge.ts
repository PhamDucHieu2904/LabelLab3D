import * as THREE from 'three';
import { MM_TO_METRE, type BoundingBox2D, type Point2D } from '../types';
import { projectDielineUV } from './solid-builder';

export interface CreaseFilletHandle {
  readonly mesh: THREE.Mesh;
  /** Update the rounded corner strip in-place for the current fold angle (radians). */
  updateAngle(angleRad: number): void;
  dispose(): void;
}

/**
 * Builds a dynamic cylindrical crease bend strip spanning along a hinge edge `(p1, p2)`
 * at radius `thicknessMm` centered on the hinge pivot axis.
 *
 * When flat (`angle = 0`), the strip collapses seamlessly to zero width.
 * As the child panel folds to `90°`, the strip sweeps smoothly around the outer corner
 * with exact Global Outside UVs so printed artwork wraps continuously with zero gap!
 */
export function createCreaseFillet(options: {
  p1: Point2D;
  p2: Point2D;
  /** Oriented unit hinge axis in 3D XZ plane (already oriented so +angle folds inward/+Y). */
  axis3D: THREE.Vector3;
  /** Direction in parent local XZ pointing from hinge into the child panel when flat. */
  childOutward3D: THREE.Vector3;
  foldDirection: 'inward' | 'outward';
  thicknessMm: number;
  blankBounds: BoundingBox2D;
  outsideMaterial: THREE.Material;
  segments?: number;
}): CreaseFilletHandle {
  const {
    p1,
    p2,
    axis3D,
    childOutward3D,
    foldDirection,
    thicknessMm,
    blankBounds,
    outsideMaterial,
    segments = 4,
  } = options;

  const segs = Math.max(2, Math.min(8, Math.round(segments)));
  const radiusM = Math.max(0.15, thicknessMm) * MM_TO_METRE;
  const edgeLenM = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) * MM_TO_METRE;
  const halfLenM = edgeLenM * 0.5;

  // Center of the hinge segment in 2D mm -> used for exact UV projection.
  const [u1, v1] = projectDielineUV(p1, blankBounds, 'outside');
  const [u2, v2] = projectDielineUV(p2, blankBounds, 'outside');

  // Local frame centered at the hinge pivot (mid-point of hinge edge, at inner face y = ±t/2).
  // `uAxis` runs from p1 -> p2 along the hinge edge (length = edgeLenM).
  const rawEdge = new THREE.Vector3(
    (p2[0] - p1[0]) * MM_TO_METRE,
    0,
    -(p2[1] - p1[1]) * MM_TO_METRE,
  );
  const uAxis = rawEdge.lengthSq() > 1e-12 ? rawEdge.clone().normalize() : new THREE.Vector3(1, 0, 0);

  // Start radial vector from pivot to the OUTER face of the board when flat.
  // For inward fold: pivot is at top (+t/2), outer face is at bottom (-t/2) -> radial = (0, -1, 0).
  // For outward fold: pivot is at bottom (-t/2), outer face is at top (+t/2) -> radial = (0, +1, 0).
  const startNormal = new THREE.Vector3(0, foldDirection === 'inward' ? -1 : 1, 0);

  // Check handedness so front faces point outward along the radial normal.
  // Tangent along increasing fold angle at theta=0 is `rotAxis × startNormal`.
  const rotAxis = axis3D.clone().normalize();
  const signedRotAxis = foldDirection === 'inward' ? rotAxis.clone() : rotAxis.clone().negate();
  const initialTangent = new THREE.Vector3().crossVectors(signedRotAxis, startNormal);
  // Ensure tangent points AWAY from parent (or aligns with childOutward3D).
  const flipWinding = uAxis.clone().cross(initialTangent).dot(startNormal) < 0;

  // Suppress unused variable warning while keeping option explicit for clarity.
  void childOutward3D;

  const vertCount = (segs + 1) * 2;
  const positions = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const indices: number[] = [];

  for (let i = 0; i <= segs; i++) {
    uvs[i * 4 + 0] = u1;
    uvs[i * 4 + 1] = v1;
    uvs[i * 4 + 2] = u2;
    uvs[i * 4 + 3] = v2;
  }

  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    if (flipWinding) {
      indices.push(a, c, b, b, c, d);
    } else {
      indices.push(a, b, c, b, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  const normAttr = new THREE.BufferAttribute(normals, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  normAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', posAttr);
  geometry.setAttribute('normal', normAttr);
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);

  const mesh = new THREE.Mesh(geometry, outsideMaterial);
  mesh.name = 'crease-fillet';
  mesh.frustumCulled = false;

  const tempNormal = new THREE.Vector3();
  const tempQuat = new THREE.Quaternion();
  const p1Offset = uAxis.clone().multiplyScalar(-halfLenM);
  const p2Offset = uAxis.clone().multiplyScalar(halfLenM);

  const updateAngle = (angleRad: number) => {
    const absAngle = Math.abs(angleRad);
    if (absAngle < 0.015) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    const signedAngle = foldDirection === 'inward' ? absAngle : -absAngle;
    for (let i = 0; i <= segs; i++) {
      const frac = i / segs;
      const theta = signedAngle * frac;
      tempQuat.setFromAxisAngle(rotAxis, theta);
      tempNormal.copy(startNormal).applyQuaternion(tempQuat).normalize();

      const rx = tempNormal.x * radiusM;
      const ry = tempNormal.y * radiusM;
      const rz = tempNormal.z * radiusM;

      const idx0 = i * 2 * 3;
      positions[idx0 + 0] = p1Offset.x + rx;
      positions[idx0 + 1] = p1Offset.y + ry;
      positions[idx0 + 2] = p1Offset.z + rz;
      normals[idx0 + 0] = tempNormal.x;
      normals[idx0 + 1] = tempNormal.y;
      normals[idx0 + 2] = tempNormal.z;

      const idx1 = (i * 2 + 1) * 3;
      positions[idx1 + 0] = p2Offset.x + rx;
      positions[idx1 + 1] = p2Offset.y + ry;
      positions[idx1 + 2] = p2Offset.z + rz;
      normals[idx1 + 0] = tempNormal.x;
      normals[idx1 + 1] = tempNormal.y;
      normals[idx1 + 2] = tempNormal.z;
    }
    posAttr.needsUpdate = true;
    normAttr.needsUpdate = true;
  };

  updateAngle(0);

  return {
    mesh,
    updateAngle,
    dispose() {
      geometry.dispose();
    },
  };
}
