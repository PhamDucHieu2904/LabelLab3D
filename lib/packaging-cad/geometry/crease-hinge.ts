import * as THREE from 'three';
import { MM_TO_METRE, type BoundingBox2D, type FluteDirection, type Point2D } from '../types';
import { projectDielineUV } from './solid-builder';

export interface CreaseFilletHandle {
  readonly mesh: THREE.Mesh;
  /** Update the rounded corner strip in-place for the current fold angle (radians). */
  updateAngle(angleRad: number): void;
  dispose(): void;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Builds a watertight dynamic cylindrical crease bend strip spanning along a hinge edge `(p1, p2)`
 * at radius `thicknessMm` centered on the hinge pivot axis, complete with:
 *  - Physical 1:1 mm isotropic UV progression across the curved arc (zero cardboard grain stretching!)
 *  - Solid corrugated cardboard sector end caps at both `p1` and `p2` (zero hollow corner gaps!)
 *
 * When flat (`angle = 0`), the mesh hides cleanly. As the child panel folds to `90°`, the strip
 * sweeps smoothly around the outer corner while its end caps seal the cross-section solidly.
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
  edgeMaterial?: THREE.Material;
  fluteDirection?: FluteDirection;
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
    edgeMaterial,
    fluteDirection = 'along-L',
    segments = 8,
  } = options;

  const segs = Math.max(2, Math.min(12, Math.round(segments)));
  const radiusMm = Math.max(0.15, thicknessMm);
  const radiusM = radiusMm * MM_TO_METRE;
  const dx2 = p2[0] - p1[0];
  const dy2 = p2[1] - p1[1];
  const edgeLenMm = Math.hypot(dx2, dy2);
  const edgeLenM = edgeLenMm * MM_TO_METRE;
  const halfLenM = edgeLenM * 0.5;

  // Unit 2D hinge tangent (p1 -> p2) and perpendicular pointing from parent into child panel.
  const invLen2 = edgeLenMm > 1e-6 ? 1 / edgeLenMm : 1;
  const ux2 = edgeLenMm > 1e-6 ? dx2 * invLen2 : 1;
  const uy2 = edgeLenMm > 1e-6 ? dy2 * invLen2 : 0;
  let perpX2 = -uy2;
  let perpY2 = ux2;
  // Convert childOutward3D (x, 0, z) back to 2D CAD (x, -z) to orient perp2D into child panel.
  const child2X = childOutward3D.x;
  const child2Y = -childOutward3D.z;
  if (perpX2 * child2X + perpY2 * child2Y < 0) {
    perpX2 = -perpX2;
    perpY2 = -perpY2;
  }

  // End-cap cut faces have outward normal along ±e2D = (ux2, uy2), matching cut edges perpendicular to e2D.
  const capFluteExposure = fluteDirection === 'along-L' ? Math.abs(ux2) : Math.abs(uy2);

  // Local frame centered at the hinge pivot (mid-point of hinge edge, at inner face y = ±t/2).
  // `uAxis` runs from p1 -> p2 along the hinge edge (length = edgeLenM).
  const rawEdge = new THREE.Vector3(dx2 * MM_TO_METRE, 0, -dy2 * MM_TO_METRE);
  const uAxis = rawEdge.lengthSq() > 1e-12 ? rawEdge.clone().normalize() : new THREE.Vector3(1, 0, 0);

  // Start radial vector from pivot to the OUTER face of the board when flat.
  // For inward fold: pivot is at top (+t/2), outer face is at bottom (-t/2) -> radial = (0, -1, 0).
  // For outward fold: pivot is at bottom (-t/2), outer face is at top (+t/2) -> radial = (0, +1, 0).
  const startNormal = new THREE.Vector3(0, foldDirection === 'inward' ? -1 : 1, 0);

  // Check handedness so front faces point outward along the radial normal.
  const rotAxis = axis3D.clone().normalize();
  const signedRotAxis = foldDirection === 'inward' ? rotAxis.clone() : rotAxis.clone().negate();
  const initialTangent = new THREE.Vector3().crossVectors(signedRotAxis, startNormal);
  const flipWinding = uAxis.clone().cross(initialTangent).dot(startNormal) < 0;

  // Vertex layout:
  //   [0 .. stripVertCount - 1]: curved outer strip (2 verts per ring i = 0..segs)
  //   Cap 1 (at p1Offset, outward normal -uAxis) — 3-band concentric sector matching solid-builder.ts:
  //     - Center (r = 0): inner paper liner
  //     - Ring A (r = 0.16 * R): inner liner -> core boundary (duplicated for crisp liner-to-core edge)
  //     - Ring B (r = 0.84 * R): core -> outer liner boundary (duplicated for crisp core-to-liner edge)
  //     - Ring C (r = 1.00 * R): outer paper liner
  //   Cap 2 (at p2Offset, outward normal +uAxis) — identical 3-band concentric sector.
  const ringCount = segs + 1;
  const stripVertCount = ringCount * 2;
  const capVertsPerEnd = 1 + ringCount * 5;
  const cap1Base = stripVertCount;
  const cap2Base = cap1Base + capVertsPerEnd;
  const totalVertCount = cap2Base + capVertsPerEnd;

  // Offsets inside each end-cap block:
  //   0: center (r = 0, inner liner)
  //   1 + 0*ringCount: r1In  (r = 0.16*R, inner liner edge)
  //   1 + 1*ringCount: r1Core (r = 0.16*R, core start)
  //   1 + 2*ringCount: r2Core (r = 0.84*R, core end)
  //   1 + 3*ringCount: r2Out  (r = 0.84*R, outer liner start)
  //   1 + 4*ringCount: r3Out  (r = 1.00*R, outer liner edge)
  const offR1In = 1;
  const offR1Core = 1 + ringCount;
  const offR2Core = 1 + ringCount * 2;
  const offR2Out = 1 + ringCount * 3;
  const offR3Out = 1 + ringCount * 4;

  const positions = new Float32Array(totalVertCount * 3);
  const normals = new Float32Array(totalVertCount * 3);
  const uvs = new Float32Array(totalVertCount * 2);
  const colors = new Float32Array(totalVertCount * 3);
  const indices: number[] = [];

  // Initialize strip vertex colors to neutral white (1, 1, 1).
  for (let i = 0; i < stripVertCount; i++) {
    colors[i * 3 + 0] = 1;
    colors[i * 3 + 1] = 1;
    colors[i * 3 + 2] = 1;
  }

  // Group 0: Curved outer face indices.
  const stripIndexStart = 0;
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
  const stripIndexCount = indices.length - stripIndexStart;

  // Group 1: Watertight 3-ply corrugated end-cap indices (outward normal -uAxis at p1, +uAxis at p2).
  // Across consecutive rim vertices r[i] -> r[i+1], radial[i] x radial[i+1] always points along +signedRotAxis.
  const capIndexStart = indices.length;
  const signedMatchesU = signedRotAxis.dot(uAxis) >= 0;

  const pushCapIndices = (base: number, flipCap: boolean) => {
    const pushTri = (a: number, b: number, c: number) => {
      if (flipCap) indices.push(a, c, b);
      else indices.push(a, b, c);
    };
    // For radial rings a (inner) -> b (outer) advancing from angle i (0) -> i+1 (1):
    // (b0 - a0) x (b1 - a0) aligns with radial[i] x radial[i+1] = +signedRotAxis (same handedness as pushTri!).
    const pushQuad = (a0: number, a1: number, b0: number, b1: number) => {
      pushTri(a0, b0, b1);
      pushTri(a0, b1, a1);
    };
    for (let i = 0; i < segs; i++) {
      // Inner liner wedge: center -> r1In[i] -> r1In[i+1]
      pushTri(base, base + offR1In + i, base + offR1In + i + 1);
      // Corrugated core band: r1Core -> r2Core
      pushQuad(
        base + offR1Core + i,
        base + offR1Core + i + 1,
        base + offR2Core + i,
        base + offR2Core + i + 1,
      );
      // Outer liner band: r2Out -> r3Out
      pushQuad(
        base + offR2Out + i,
        base + offR2Out + i + 1,
        base + offR3Out + i,
        base + offR3Out + i + 1,
      );
    }
  };

  // p1 outward normal = -uAxis; p2 outward normal = +uAxis
  pushCapIndices(cap1Base, signedMatchesU);
  pushCapIndices(cap2Base, !signedMatchesU);
  const capIndexCount = indices.length - capIndexStart;

  const p1Offset = uAxis.clone().multiplyScalar(-halfLenM);
  const p2Offset = uAxis.clone().multiplyScalar(halfLenM);

  // Match solid-builder.ts exact 3-band edge encoding:
  //   Inward fold: pivot (r=0) is INSIDE face (v=1, side=1), outer arc (r=R) is OUTSIDE face (v=0, side=0).
  //   Outward fold: pivot (r=0) is OUTSIDE face (v=0, side=0), outer arc (r=R) is INSIDE face (v=1, side=1).
  const isInward = foldDirection === 'inward';
  const vCenter = isInward ? 1.0 : 0.0;
  const vInnerSh = isInward ? 0.84 : 0.16;
  const vOuterSh = isInward ? 0.16 : 0.84;
  const vOuterRim = isInward ? 0.0 : 1.0;
  const sideCenter = isInward ? 1 : 0;
  const sideOuter = isInward ? 0 : 1;

  const initCapVertex = (
    vIdx: number,
    nx: number,
    ny: number,
    nz: number,
    vCoord: number,
    bevelRim: number,
    sideSign: number,
  ) => {
    normals[vIdx * 3 + 0] = nx;
    normals[vIdx * 3 + 1] = ny;
    normals[vIdx * 3 + 2] = nz;
    uvs[vIdx * 2 + 0] = 0;
    uvs[vIdx * 2 + 1] = vCoord;
    colors[vIdx * 3 + 0] = capFluteExposure;
    colors[vIdx * 3 + 1] = bevelRim;
    colors[vIdx * 3 + 2] = sideSign;
  };

  const initCapEnd = (base: number, offset: THREE.Vector3, nx: number, ny: number, nz: number) => {
    positions[base * 3 + 0] = offset.x;
    positions[base * 3 + 1] = offset.y;
    positions[base * 3 + 2] = offset.z;
    initCapVertex(base, nx, ny, nz, vCenter, 1.0, sideCenter);
    for (let i = 0; i <= segs; i++) {
      initCapVertex(base + offR1In + i, nx, ny, nz, vInnerSh, 0.72, sideCenter);
      initCapVertex(base + offR1Core + i, nx, ny, nz, vInnerSh, 0.0, 0.5);
      initCapVertex(base + offR2Core + i, nx, ny, nz, vOuterSh, 0.0, 0.5);
      initCapVertex(base + offR2Out + i, nx, ny, nz, vOuterSh, 0.72, sideOuter);
      initCapVertex(base + offR3Out + i, nx, ny, nz, vOuterRim, 1.0, sideOuter);
    }
  };

  initCapEnd(cap1Base, p1Offset, -uAxis.x, -uAxis.y, -uAxis.z);
  initCapEnd(cap2Base, p2Offset, uAxis.x, uAxis.y, uAxis.z);

  const geometry = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  const normAttr = new THREE.BufferAttribute(normals, 3);
  const uvAttr = new THREE.BufferAttribute(uvs, 2);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  normAttr.setUsage(THREE.DynamicDrawUsage);
  uvAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', posAttr);
  geometry.setAttribute('normal', normAttr);
  geometry.setAttribute('uv', uvAttr);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.addGroup(stripIndexStart, stripIndexCount, 0);
  geometry.addGroup(capIndexStart, capIndexCount, 1);

  const meshMaterial: THREE.Material | THREE.Material[] = edgeMaterial
    ? [outsideMaterial, edgeMaterial]
    : [outsideMaterial, outsideMaterial];
  const mesh = new THREE.Mesh(geometry, meshMaterial);
  mesh.name = 'crease-fillet';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;

  const tempNormal = new THREE.Vector3();
  const tempQuat = new THREE.Quaternion();
  const samplePt1: [number, number] = [0, 0];
  const samplePt2: [number, number] = [0, 0];

  const writeCapRingPos = (
    vIdx: number,
    baseOffset: THREE.Vector3,
    rx: number,
    ry: number,
    rz: number,
    scale: number,
    arcU: number,
  ) => {
    positions[vIdx * 3 + 0] = baseOffset.x + rx * scale;
    positions[vIdx * 3 + 1] = baseOffset.y + ry * scale;
    positions[vIdx * 3 + 2] = baseOffset.z + rz * scale;
    uvs[vIdx * 2 + 0] = arcU;
  };

  const updateAngle = (angleRad: number) => {
    const absAngle = Math.abs(angleRad);
    if (absAngle < 0.015) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    const signedAngle = foldDirection === 'inward' ? absAngle : -absAngle;
    const arcLenMm = radiusMm * absAngle;

    for (let i = 0; i <= segs; i++) {
      const frac = i / segs;
      const theta = signedAngle * frac;
      tempQuat.setFromAxisAngle(rotAxis, theta);
      tempNormal.copy(startNormal).applyQuaternion(tempQuat).normalize();

      const rx = tempNormal.x * radiusM;
      const ry = tempNormal.y * radiusM;
      const rz = tempNormal.z * radiusM;

      // Strip vertices
      const x1 = p1Offset.x + rx;
      const y1 = p1Offset.y + ry;
      const z1 = p1Offset.z + rz;
      const x2 = p2Offset.x + rx;
      const y2 = p2Offset.y + ry;
      const z2 = p2Offset.z + rz;

      const idx0 = i * 2 * 3;
      positions[idx0 + 0] = x1;
      positions[idx0 + 1] = y1;
      positions[idx0 + 2] = z1;
      normals[idx0 + 0] = tempNormal.x;
      normals[idx0 + 1] = tempNormal.y;
      normals[idx0 + 2] = tempNormal.z;

      const idx1 = (i * 2 + 1) * 3;
      positions[idx1 + 0] = x2;
      positions[idx1 + 1] = y2;
      positions[idx1 + 2] = z2;
      normals[idx1 + 0] = tempNormal.x;
      normals[idx1 + 1] = tempNormal.y;
      normals[idx1 + 2] = tempNormal.z;

      // Physical 1:1 mm UV progression across the curved bend centered on the crease line.
      // Preserves exact paper grain / normal-map scale and positive tangent handedness.
      const offsetMm = (frac - 0.5) * arcLenMm;
      samplePt1[0] = clamp(p1[0] + perpX2 * offsetMm, blankBounds.minX, blankBounds.maxX);
      samplePt1[1] = clamp(p1[1] + perpY2 * offsetMm, blankBounds.minY, blankBounds.maxY);
      samplePt2[0] = clamp(p2[0] + perpX2 * offsetMm, blankBounds.minX, blankBounds.maxX);
      samplePt2[1] = clamp(p2[1] + perpY2 * offsetMm, blankBounds.minY, blankBounds.maxY);
      const [u1, v1] = projectDielineUV(samplePt1, blankBounds, 'outside');
      const [u2, v2] = projectDielineUV(samplePt2, blankBounds, 'outside');
      uvs[i * 4 + 0] = u1;
      uvs[i * 4 + 1] = v1;
      uvs[i * 4 + 2] = u2;
      uvs[i * 4 + 3] = v2;

      // Update 3-ply solid end-cap rings at both ends (0.16*R inner liner, 0.16..0.84*R core, 0.84..1.0*R outer liner).
      // Use full physical arc length `arcLenMm` uniformly across all rings so sinusoidal flute waves match 1:1 with cut edges.
      const arcU = frac * arcLenMm;
      writeCapRingPos(cap1Base + offR1In + i, p1Offset, rx, ry, rz, 0.16, arcU);
      writeCapRingPos(cap1Base + offR1Core + i, p1Offset, rx, ry, rz, 0.16, arcU);
      writeCapRingPos(cap1Base + offR2Core + i, p1Offset, rx, ry, rz, 0.84, arcU);
      writeCapRingPos(cap1Base + offR2Out + i, p1Offset, rx, ry, rz, 0.84, arcU);
      writeCapRingPos(cap1Base + offR3Out + i, p1Offset, rx, ry, rz, 1.0, arcU);

      writeCapRingPos(cap2Base + offR1In + i, p2Offset, rx, ry, rz, 0.16, arcU);
      writeCapRingPos(cap2Base + offR1Core + i, p2Offset, rx, ry, rz, 0.16, arcU);
      writeCapRingPos(cap2Base + offR2Core + i, p2Offset, rx, ry, rz, 0.84, arcU);
      writeCapRingPos(cap2Base + offR2Out + i, p2Offset, rx, ry, rz, 0.84, arcU);
      writeCapRingPos(cap2Base + offR3Out + i, p2Offset, rx, ry, rz, 1.0, arcU);
    }
    posAttr.needsUpdate = true;
    normAttr.needsUpdate = true;
    uvAttr.needsUpdate = true;
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
