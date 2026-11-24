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

  // --- Group 2: Cut Edges (outer contour + hole walls) ---
  const edgeStart = indices.length;
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

      const [x1, yBot, z1] = cad2DToLocal3D(p1, originX, originY, -halfT);
      const [x2, yTop, z2] = cad2DToLocal3D(p2, originX, originY, +halfT);
      const u1 = arcMm;
      const u2 = arcMm + len;
      arcMm += len;

      const v0 = pushVertex(x1, yBot, z1, nx, 0, nz, u1, 0, fluteExposure, 1, 1);
      const v1 = pushVertex(x2, yBot, z2, nx, 0, nz, u2, 0, fluteExposure, 1, 1);
      const v2 = pushVertex(x2, yTop, z2, nx, 0, nz, u2, 1, fluteExposure, 1, 1);
      const v3 = pushVertex(x1, yTop, z1, nx, 0, nz, u1, 1, fluteExposure, 1, 1);

      // Verify winding: (v1 - v0) = (dx, 0, -dy), (v3 - v0) = (0, +t, 0).
      // (dx, 0, -dy) x (0, t, 0) = (t*dy, 0, t*dx) => matches (nx, 0, nz)!
      indices.push(v0, v1, v2, v0, v2, v3);
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
