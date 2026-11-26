import * as THREE from 'three';
import { MM_TO_METRE } from '../types';
import { clampNum } from '../templates/helpers';

/**
 * Physical corrugated caliper (mm) for internal honeycomb cell partitions
 * ("vách tổ ong") inside a FEFCO 0201 Top-Open Shipping Carton.
 */
export function getHoneycombDividerThicknessMm(boardThicknessMm: number): number {
  return clampNum(Math.min(boardThicknessMm, 2.5), 1.4, 2.5);
}

export interface HoneycombPartitionInput {
  innerL: number;
  innerW: number;
  innerH: number;
  cols: number;
  rows: number;
  dividerThicknessMm: number;
  itemHeightMm: number;
}

/**
 * Build a true 3D interlocking slotted corrugated honeycomb partition grid
 * ("vách ngăn tổ ong") sitting cleanly inside `[−innerL/2, +innerL/2] × [0, partH] × [−innerW/2, +innerW/2]`.
 *
 * Structure:
 *  - `rows - 1` longitudinal strips running along X (slotted from top to mid-height at every column crossing)
 *  - `cols - 1` transverse strips running along Z (slotted from bottom to mid-height at every row crossing)
 *  - Zero Z-fighting at all wall crossings (interlocking half-height slots with 0.15 mm clearance)
 *  - Two material groups:
 *      Group 0 -> Unprinted matte corrugated partition liner faces (physical-mm paper UVs)
 *      Group 1 -> 3-ply corrugated cut rims (exposed sinusoidal flutes along top cut edges)
 *
 * Returns `null` when `cols <= 1 && rows <= 1` (1×1 single item needs no internal dividers).
 */
export function buildHoneycombPartitionGeometry(
  input: HoneycombPartitionInput,
): THREE.BufferGeometry | null {
  const cols = Math.max(1, Math.min(6, Math.round(input.cols)));
  const rows = Math.max(1, Math.min(4, Math.round(input.rows)));
  if (cols <= 1 && rows <= 1) return null;

  const innerL = Math.max(40, input.innerL);
  const innerW = Math.max(40, input.innerW);
  const innerH = Math.max(24, input.innerH);
  const divT = getHoneycombDividerThicknessMm(input.dividerThicknessMm);

  // Leave subtle 0.8 mm insertion clearance against interior carton walls on each side.
  const insetMm = 0.8;
  const partL = Math.max(20, innerL - insetMm * 2);
  const partW = Math.max(20, innerW - insetMm * 2);
  const halfPartL = partL * 0.5;
  const halfPartW = partW * 0.5;

  // Real beverage partition walls rise ~85% of bottle height (up to the shoulder) while staying
  // safely underneath closed top minor flaps (`innerH - 3 mm`).
  const targetH = Math.min(innerH - 3, Math.max(innerH * 0.72, input.itemHeightMm * 0.85));
  const partH = clampNum(targetH, Math.min(20, innerH - 2), Math.max(12, innerH - 2));
  const halfH = partH * 0.5;
  const slotClear = 0.15;
  const vertClear = 0.05;

  // Cell boundary coordinates centered identically with `computeBottlePackLayout` cell pitches.
  const xCross: number[] = [];
  for (let i = 1; i < cols; i++) {
    xCross.push(-innerL * 0.5 + (innerL / cols) * i);
  }
  const zCross: number[] = [];
  for (let j = 1; j < rows; j++) {
    zCross.push(-innerW * 0.5 + (innerW / rows) * j);
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const faceIndices: number[] = [];
  const edgeIndices: number[] = [];

  const pushVert = (
    xMm: number,
    yMm: number,
    zMm: number,
    nx: number,
    ny: number,
    nz: number,
    u: number,
    v: number,
    r = 1,
    g = 1,
    b = 1,
  ): number => {
    const idx = positions.length / 3;
    positions.push(xMm * MM_TO_METRE, yMm * MM_TO_METRE, zMm * MM_TO_METRE);
    normals.push(nx, ny, nz);
    uvs.push(u, v);
    colors.push(r, g, b);
    return idx;
  };

  const pushQuad = (
    target: number[],
    a: number,
    b: number,
    c: number,
    d: number,
  ) => {
    target.push(a, b, c, a, c, d);
  };

  // Physical-mm paper tile scale matching `corrugated-materials.ts` (~46 mm per texture repeat).
  const uvScale = 1 / 46;

  /**
   * Append one closed axis-aligned cardboard slab `[x0, x1] × [y0, y1] × [z0, z1]` (mm).
   * `axis = 'x'` means the strip runs along X (thickness along Z);
   * `axis = 'z'` means the strip runs along Z (thickness along X).
   */
  const addBoardSlab = (
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z0: number,
    z1: number,
    axis: 'x' | 'z',
  ) => {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dz = z1 - z0;
    if (dx <= 0.2 || dy <= 0.2 || dz <= 0.2) return;

    // 1. Large liner faces -> Group 0 (faceIndices)
    if (axis === 'x') {
      // +Z face (0, 0, +1)
      const f1a = pushVert(x0, y0, z1, 0, 0, 1, x0 * uvScale, y0 * uvScale);
      const f1b = pushVert(x1, y0, z1, 0, 0, 1, x1 * uvScale, y0 * uvScale);
      const f1c = pushVert(x1, y1, z1, 0, 0, 1, x1 * uvScale, y1 * uvScale);
      const f1d = pushVert(x0, y1, z1, 0, 0, 1, x0 * uvScale, y1 * uvScale);
      pushQuad(faceIndices, f1a, f1b, f1c, f1d);

      // -Z face (0, 0, -1)
      const f2a = pushVert(x1, y0, z0, 0, 0, -1, x1 * uvScale, y0 * uvScale);
      const f2b = pushVert(x0, y0, z0, 0, 0, -1, x0 * uvScale, y0 * uvScale);
      const f2c = pushVert(x0, y1, z0, 0, 0, -1, x0 * uvScale, y1 * uvScale);
      const f2d = pushVert(x1, y1, z0, 0, 0, -1, x1 * uvScale, y1 * uvScale);
      pushQuad(faceIndices, f2a, f2b, f2c, f2d);

      // Vertical cut ends (+X and -X) -> Group 1 (parallel to vertical flutes, fluteExposure = 0)
      const eRx0 = pushVert(x1, y0, z1, 1, 0, 0, 0, 0.0, 0, 0.85, 0);
      const eRx1 = pushVert(x1, y0, z0, 1, 0, 0, 0, 1.0, 0, 0.85, 1);
      const eRx2 = pushVert(x1, y1, z0, 1, 0, 0, dy, 1.0, 0, 0.85, 1);
      const eRx3 = pushVert(x1, y1, z1, 1, 0, 0, dy, 0.0, 0, 0.85, 0);
      pushQuad(edgeIndices, eRx0, eRx1, eRx2, eRx3);

      const eLx0 = pushVert(x0, y0, z0, -1, 0, 0, 0, 1.0, 0, 0.85, 1);
      const eLx1 = pushVert(x0, y0, z1, -1, 0, 0, 0, 0.0, 0, 0.85, 0);
      const eLx2 = pushVert(x0, y1, z1, -1, 0, 0, dy, 0.0, 0, 0.85, 0);
      const eLx3 = pushVert(x0, y1, z0, -1, 0, 0, dy, 1.0, 0, 0.85, 1);
      pushQuad(edgeIndices, eLx0, eLx1, eLx2, eLx3);

      // Top (+Y) & bottom (-Y) cut rims -> 3-band corrugated flute exposure = 1.0!
      const zA = z0 + dz * 0.16;
      const zB = z0 + dz * 0.84;
      const topBands: ReadonlyArray<[number, number, number, number, number, number]> = [
        [z0, zA, 0.0, 0.16, 0.9, 0.0],
        [zA, zB, 0.16, 0.84, 0.0, 0.5],
        [zB, z1, 0.84, 1.0, 0.9, 1.0],
      ];
      for (const [za, zb, va, vb, bevelG, sideB] of topBands) {
        // +Y top rim: (x0,y1,zb) -> (x1,y1,zb) -> (x1,y1,za) -> (x0,y1,za)
        const ta = pushVert(x0, y1, zb, 0, 1, 0, 0, vb, 1, bevelG, sideB);
        const tb = pushVert(x1, y1, zb, 0, 1, 0, dx, vb, 1, bevelG, sideB);
        const tc = pushVert(x1, y1, za, 0, 1, 0, dx, va, 1, bevelG, sideB);
        const td = pushVert(x0, y1, za, 0, 1, 0, 0, va, 1, bevelG, sideB);
        pushQuad(edgeIndices, ta, tb, tc, td);

        // -Y bottom rim: (x0,y0,za) -> (x1,y0,za) -> (x1,y0,zb) -> (x0,y0,zb)
        const ba = pushVert(x0, y0, za, 0, -1, 0, 0, va, 1, bevelG, sideB);
        const bb = pushVert(x1, y0, za, 0, -1, 0, dx, va, 1, bevelG, sideB);
        const bc = pushVert(x1, y0, zb, 0, -1, 0, dx, vb, 1, bevelG, sideB);
        const bd = pushVert(x0, y0, zb, 0, -1, 0, 0, vb, 1, bevelG, sideB);
        pushQuad(edgeIndices, ba, bb, bc, bd);
      }
    } else {
      // +X face (+1, 0, 0)
      const f1a = pushVert(x1, y0, z1, 1, 0, 0, z1 * uvScale, y0 * uvScale);
      const f1b = pushVert(x1, y0, z0, 1, 0, 0, z0 * uvScale, y0 * uvScale);
      const f1c = pushVert(x1, y1, z0, 1, 0, 0, z0 * uvScale, y1 * uvScale);
      const f1d = pushVert(x1, y1, z1, 1, 0, 0, z1 * uvScale, y1 * uvScale);
      pushQuad(faceIndices, f1a, f1b, f1c, f1d);

      // -X face (-1, 0, 0)
      const f2a = pushVert(x0, y0, z0, -1, 0, 0, z0 * uvScale, y0 * uvScale);
      const f2b = pushVert(x0, y0, z1, -1, 0, 0, z1 * uvScale, y0 * uvScale);
      const f2c = pushVert(x0, y1, z1, -1, 0, 0, z1 * uvScale, y1 * uvScale);
      const f2d = pushVert(x0, y1, z0, -1, 0, 0, z0 * uvScale, y1 * uvScale);
      pushQuad(faceIndices, f2a, f2b, f2c, f2d);

      // Vertical cut ends (+Z and -Z) -> Group 1 (fluteExposure = 0)
      const eFz0 = pushVert(x0, y0, z1, 0, 0, 1, 0, 0.0, 0, 0.85, 0);
      const eFz1 = pushVert(x1, y0, z1, 0, 0, 1, 0, 1.0, 0, 0.85, 1);
      const eFz2 = pushVert(x1, y1, z1, 0, 0, 1, dy, 1.0, 0, 0.85, 1);
      const eFz3 = pushVert(x0, y1, z1, 0, 0, 1, dy, 0.0, 0, 0.85, 0);
      pushQuad(edgeIndices, eFz0, eFz1, eFz2, eFz3);

      const eBz0 = pushVert(x1, y0, z0, 0, 0, -1, 0, 1.0, 0, 0.85, 1);
      const eBz1 = pushVert(x0, y0, z0, 0, 0, -1, 0, 0.0, 0, 0.85, 0);
      const eBz2 = pushVert(x0, y1, z0, 0, 0, -1, dy, 0.0, 0, 0.85, 0);
      const eBz3 = pushVert(x1, y1, z0, 0, 0, -1, dy, 1.0, 0, 0.85, 1);
      pushQuad(edgeIndices, eBz0, eBz1, eBz2, eBz3);

      // Top (+Y) & bottom (-Y) cut rims -> 3-band corrugated flute exposure = 1.0!
      const xA = x0 + dx * 0.16;
      const xB = x0 + dx * 0.84;
      const topBands: ReadonlyArray<[number, number, number, number, number, number]> = [
        [x0, xA, 0.0, 0.16, 0.9, 0.0],
        [xA, xB, 0.16, 0.84, 0.0, 0.5],
        [xB, x1, 0.84, 1.0, 0.9, 1.0],
      ];
      for (const [xa, xb, va, vb, bevelG, sideB] of topBands) {
        // +Y top rim: (xa,y1,z1) -> (xb,y1,z1) -> (xb,y1,z0) -> (xa,y1,z0)
        const ta = pushVert(xa, y1, z1, 0, 1, 0, 0, va, 1, bevelG, sideB);
        const tb = pushVert(xb, y1, z1, 0, 1, 0, 0, vb, 1, bevelG, sideB);
        const tc = pushVert(xb, y1, z0, 0, 1, 0, dz, vb, 1, bevelG, sideB);
        const td = pushVert(xa, y1, z0, 0, 1, 0, dz, va, 1, bevelG, sideB);
        pushQuad(edgeIndices, ta, tb, tc, td);

        // -Y bottom rim: (xa,y0,z0) -> (xb,y0,z0) -> (xb,y0,z1) -> (xa,y0,z1)
        const ba = pushVert(xa, y0, z0, 0, -1, 0, dz, va, 1, bevelG, sideB);
        const bb = pushVert(xb, y0, z0, 0, -1, 0, dz, vb, 1, bevelG, sideB);
        const bc = pushVert(xb, y0, z1, 0, -1, 0, 0, vb, 1, bevelG, sideB);
        const bd = pushVert(xa, y0, z1, 0, -1, 0, 0, va, 1, bevelG, sideB);
        pushQuad(edgeIndices, ba, bb, bc, bd);
      }
    }
  };

  // --- LONGITUDINAL STRIPS (along X, dividing rows) ---
  for (const zCenter of zCross) {
    const z0 = zCenter - divT * 0.5;
    const z1 = zCenter + divT * 0.5;
    if (xCross.length === 0) {
      addBoardSlab(-halfPartL, halfPartL, 0, partH, z0, z1, 'x');
    } else {
      // Lower continuous rail
      addBoardSlab(-halfPartL, halfPartL, 0, halfH, z0, z1, 'x');
      // Upper interlocking segments between column crossings
      for (let c = 0; c <= xCross.length; c++) {
        const segX0 = c === 0 ? -halfPartL : xCross[c - 1] + divT * 0.5 + slotClear;
        const segX1 = c === xCross.length ? halfPartL : xCross[c] - divT * 0.5 - slotClear;
        addBoardSlab(segX0, segX1, halfH, partH, z0, z1, 'x');
      }
    }
  }

  // --- TRANSVERSE STRIPS (along Z, dividing columns) ---
  for (const xCenter of xCross) {
    const x0 = xCenter - divT * 0.5;
    const x1 = xCenter + divT * 0.5;
    if (zCross.length === 0) {
      addBoardSlab(x0, x1, 0, partH, -halfPartW, halfPartW, 'z');
    } else {
      // Upper continuous rail (lifts cleanly by 0.05 mm above longitudinal lower rail)
      addBoardSlab(x0, x1, halfH + vertClear, partH, -halfPartW, halfPartW, 'z');
      // Lower interlocking legs between row crossings
      for (let r = 0; r <= zCross.length; r++) {
        const segZ0 = r === 0 ? -halfPartW : zCross[r - 1] + divT * 0.5 + slotClear;
        const segZ1 = r === zCross.length ? halfPartW : zCross[r] - divT * 0.5 - slotClear;
        addBoardSlab(x0, x1, 0, halfH + vertClear, segZ0, segZ1, 'z');
      }
    }
  }

  const allIndices = [...faceIndices, ...edgeIndices];
  if (!allIndices.length) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(allIndices);
  geometry.addGroup(0, faceIndices.length, 0);
  geometry.addGroup(faceIndices.length, edgeIndices.length, 1);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
