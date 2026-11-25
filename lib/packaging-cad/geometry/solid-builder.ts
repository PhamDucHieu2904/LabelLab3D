import * as THREE from 'three';
import { MM_TO_METRE, type BoundingBox2D, type FluteDirection, type PanelNode2D, type Point2D } from '../types';
import { cleanPolygon, ensureCCW, ensureCW } from './polygon-ops';

/**
 * Convert a 2D CAD point (mm, +X right, +Y back) into local 3D metres
 * relative to a given local origin `(originX, originY)` on the flat sheet.
 */
export function cad2DToLocal3D(pt: Point2D, originX: number, originY: number, yOffsetMm = 0): [number, number, number] {
  return [
    (pt[0] - originX) * MM_TO_METRE,
    yOffsetMm * MM_TO_METRE,
    -(pt[1] - originY) * MM_TO_METRE,
  ];
}

/**
 * Map a 2D CAD point to normalized Global Dieline UV (flipY = false: v=0 top, v=1 bottom).
 * - Inside face is viewed from +Y looking down (-Y): u goes left-to-right (+X).
 * - Outside face is viewed from print-side-up (-Y looking +Y): u mirrors horizontally so
 *   every folded wall has right-handed, non-mirrored typography.
 */
export function projectDielineUV(
  pt: Point2D,
  blank: BoundingBox2D,
  side: 'outside' | 'inside',
): [number, number] {
  const w = Math.max(blank.width, 1e-4);
  const h = Math.max(blank.height, 1e-4);
  const v = (blank.maxY - pt[1]) / h;
  const u = side === 'inside'
    ? (pt[0] - blank.minX) / w
    : (blank.maxX - pt[0]) / w;
  return [u, v];
}

export interface PanelSolidBuildOptions {
  node: PanelNode2D;
  originX: number;
  originY: number;
  thicknessMm: number;
  blankBounds: BoundingBox2D;
  fluteDirection: FluteDirection;
}

/**
 * Build a true thickened 3D panel BufferGeometry with 3 distinct material groups:
 *   Group 0: Outside face (y = -t/2, normal -Y) -> Outside artwork + finish
 *   Group 1: Inside face  (y = +t/2, normal +Y) -> Inside artwork + finish
 *   Group 2: Cut edges & hole rims              -> Corrugated flute / paperboard core
 *
 * Vertex color encodes `r = fluteExposure (0..1)` on cut edges so cross-flute edges
 * render sinusoidal cardboard waves while parallel edges render flat liner ply.
 */
export function buildPanelSolidGeometry(options: PanelSolidBuildOptions): THREE.BufferGeometry {
  const { node, originX, originY, thicknessMm, blankBounds, fluteDirection } = options;
  const halfT = Math.max(0.15, thicknessMm) * 0.5;
  const contour = ensureCCW(node.outline);
  const holes = (node.holes ?? [])
    .map((hole) => ensureCW(cleanPolygon(hole)))
    .filter((hole) => hole.length >= 3);

  const contourVec = contour.map(([x, y]) => new THREE.Vector2(x, y));
  const holeVecs = holes.map((hole) => hole.map(([x, y]) => new THREE.Vector2(x, y)));

  const triangles = THREE.ShapeUtils.triangulateShape(contourVec, holeVecs);
  const allPts: Point2D[] = [...contour, ...holes.flat()];

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const pushVertex = (
    x: number, y: number, z: number,
    nx: number, ny: number, nz: number,
    u: number, v: number,
    r = 1, g = 1, b = 1,
  ): number => {
    const idx = positions.length / 3;
    positions.push(x, y, z);
    normals.push(nx, ny, nz);
    uvs.push(u, v);
    colors.push(r, g, b);
    return idx;
  };

  // --- Group 0: Outside Face (y = -halfT, normal (0, -1, 0)) ---
  const outsideStart = indices.length;
  const outsideBaseIdx = positions.length / 3;
  for (const pt of allPts) {
    const [x, y, z] = cad2DToLocal3D(pt, originX, originY, -halfT);
    const [u, v] = projectDielineUV(pt, blankBounds, 'outside');
    pushVertex(x, y, z, 0, -1, 0, u, v, 1, 1, 1);
  }
  // In 2D (x, y) CCW maps to (x, -z) in 3D: looking from +Y, triangle (a, b, c) is CW in XZ (normal -Y)!
  // So (a, b, c) faces -Y (outside), and (a, c, b) faces +Y (inside). Let's verify via cross product:
  // (1,0,0) -> (0,0,-1): v1=(1,0,0), v2=(0,0,-1) => v1 x v2 = (0, +1, 0)!
  // Wait: in 2D CCW: (0,0) -> (1,0) -> (1,1) maps to 3D: (0,0,0) -> (1,0,0) -> (1,0,-1).
  // e1 = (1,0,0), e2 = (1,0,-1) => e1 x e2 = (0, +1, 0) = +Y (INSIDE)!
  // Therefore: (a, c, b) has normal (0, -1, 0) = OUTSIDE, and (a, b, c) has normal (0, +1, 0) = INSIDE!
  for (const [a, b, c] of triangles) {
    indices.push(outsideBaseIdx + a, outsideBaseIdx + c, outsideBaseIdx + b);
  }
  const outsideCount = indices.length - outsideStart;

  // --- Group 1: Inside Face (y = +halfT, normal (0, +1, 0)) ---
  const insideStart = indices.length;
  const insideBaseIdx = positions.length / 3;
  for (const pt of allPts) {
    const [x, y, z] = cad2DToLocal3D(pt, originX, originY, +halfT);
    const [u, v] = projectDielineUV(pt, blankBounds, 'inside');
    pushVertex(x, y, z, 0, 1, 0, u, v, 1, 1, 1);
  }
  for (const [a, b, c] of triangles) {
    indices.push(insideBaseIdx + a, insideBaseIdx + b, insideBaseIdx + c);
  }
  const insideCount = indices.length - insideStart;

  // --- Group 2: Micro-Beveled Cut Edges (outer contour + hole walls) ---
  // Each cut edge uses a 3-band beveled profile:
  //   Band 0: Outside paper liner bevel lip  (v: 0.00 -> 0.16, color.g = 1, color.b = 0)
  //   Band 1: Corrugated / paperboard core   (v: 0.16 -> 0.84, color.g = 0, color.b = 0.5)
  //   Band 2: Inside paper liner bevel lip   (v: 0.84 -> 1.00, color.g = 1, color.b = 1)
  // Rolled corner normals catch crisp studio rim highlights along every die-cut edge
  // while keeping zero self-intersection on arbitrary concave polygons and holes.
  // Keep Band 0/1/2 flush on exact CAD contour vertices (`bevelOutM = 0`) so every
  // 90° corner and concave notch is 100% watertight with zero background-colored slit,
  // while the 3-band rolled normals still catch crisp studio rim highlights along cut edges.
  const edgeStart = indices.length;
  const bevelY = Math.min(halfT * 0.28, 0.24);
  const y0 = -halfT;
  const y1 = -halfT + bevelY;
  const y2 = halfT - bevelY;
  const y3 = halfT;

  const addEdgeLoop = (loop: readonly Point2D[]) => {
    let arcMm = 0;
    for (let i = 0; i < loop.length; i++) {
      const p1 = loop[i];
      const p2 = loop[(i + 1) % loop.length];
      const dx = p2[0] - p1[0];
      const dy = p2[1] - p1[1];
      const len = Math.hypot(dx, dy);
      if (len < 1e-5) continue;

      // For a CCW loop in 2D (x, y), the outward 2D normal is (+dy/len, -dx/len).
      // In 3D (x, -y), that outward normal is (+dy/len, 0, +dx/len).
      // For a CW hole loop, (+dy/len, -dx/len) naturally points INWARD into the hole!
      const nx = dy / len;
      const nz = dx / len;

      // Corrugated flute wave visibility: flutes run along X ('along-L') or Y ('along-W').
      // When an edge is perpendicular to flute direction, open sinusoidal flute tunnels are exposed!
      const ux = dx / len;
      const uy = dy / len;
      const fluteExposure = fluteDirection === 'along-L' ? Math.abs(uy) : Math.abs(ux);

      const [x1, yBot0, z1] = cad2DToLocal3D(p1, originX, originY, y0);
      const [x2, yBot1, z2] = cad2DToLocal3D(p2, originX, originY, y1);
      const yTop2 = y2 * MM_TO_METRE;
      const yTop3 = y3 * MM_TO_METRE;
      const u1 = arcMm;
      const u2 = arcMm + len;
      arcMm += len;

      // Outer bevel lip normal (tilted toward -Y outside face) & shoulder normal.
      const nOutLipX = nx * 0.58;
      const nOutLipY = -0.8146;
      const nOutLipZ = nz * 0.58;
      const nOutShX = nx * 0.968;
      const nOutShY = -0.251;
      const nOutShZ = nz * 0.968;
      const nInShX = nx * 0.968;
      const nInShY = 0.251;
      const nInShZ = nz * 0.968;
      const nInLipX = nx * 0.58;
      const nInLipY = 0.8146;
      const nInLipZ = nz * 0.58;

      // Band 0: Outside paper liner bevel (flush with outside face -> outer shoulder)
      const a0 = pushVertex(x1, yBot0, z1, nOutLipX, nOutLipY, nOutLipZ, u1, 0.0, fluteExposure, 1, 0);
      const a1 = pushVertex(x2, yBot0, z2, nOutLipX, nOutLipY, nOutLipZ, u2, 0.0, fluteExposure, 1, 0);
      const a2 = pushVertex(x2, yBot1, z2, nOutShX, nOutShY, nOutShZ, u2, 0.16, fluteExposure, 0.65, 0);
      const a3 = pushVertex(x1, yBot1, z1, nOutShX, nOutShY, nOutShZ, u1, 0.16, fluteExposure, 0.65, 0);
      indices.push(a0, a1, a2, a0, a2, a3);

      // Band 1: Recessed corrugated flute / paperboard core wall
      const b0 = pushVertex(x1, yBot1, z1, nx, 0, nz, u1, 0.16, fluteExposure, 0, 0.5);
      const b1 = pushVertex(x2, yBot1, z2, nx, 0, nz, u2, 0.16, fluteExposure, 0, 0.5);
      const b2 = pushVertex(x2, yTop2, z2, nx, 0, nz, u2, 0.84, fluteExposure, 0, 0.5);
      const b3 = pushVertex(x1, yTop2, z1, nx, 0, nz, u1, 0.84, fluteExposure, 0, 0.5);
      indices.push(b0, b1, b2, b0, b2, b3);

      // Band 2: Inside paper liner bevel (inner shoulder -> flush with inside face)
      const c0 = pushVertex(x1, yTop2, z1, nInShX, nInShY, nInShZ, u1, 0.84, fluteExposure, 0.65, 1);
      const c1 = pushVertex(x2, yTop2, z2, nInShX, nInShY, nInShZ, u2, 0.84, fluteExposure, 0.65, 1);
      const c2 = pushVertex(x2, yTop3, z2, nInLipX, nInLipY, nInLipZ, u2, 1.0, fluteExposure, 1, 1);
      const c3 = pushVertex(x1, yTop3, z1, nInLipX, nInLipY, nInLipZ, u1, 1.0, fluteExposure, 1, 1);
      indices.push(c0, c1, c2, c0, c2, c3);
    }
  };

  addEdgeLoop(contour);
  for (const hole of holes) addEdgeLoop(hole);
  const edgeCount = indices.length - edgeStart;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.addGroup(outsideStart, outsideCount, 0);
  geometry.addGroup(insideStart, insideCount, 1);
  geometry.addGroup(edgeStart, edgeCount, 2);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Build thin transparent PET film geometry for display window cutouts.
 */
export function buildWindowFilmGeometry(
  films: readonly Point2D[][],
  originX: number,
  originY: number,
): THREE.BufferGeometry | null {
  if (!films.length) return null;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (const poly of films) {
    const ccw = ensureCCW(poly);
    if (ccw.length < 3) continue;
    const tris = THREE.ShapeUtils.triangulateShape(ccw.map(([x, y]) => new THREE.Vector2(x, y)), []);
    const base = positions.length / 3;
    for (const pt of ccw) {
      const [x, y, z] = cad2DToLocal3D(pt, originX, originY, 0);
      positions.push(x, y, z);
      normals.push(0, -1, 0);
      uvs.push(0.5, 0.5);
    }
    for (const [a, b, c] of tris) {
      indices.push(base + a, base + c, base + b);
    }
  }
  if (!indices.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
