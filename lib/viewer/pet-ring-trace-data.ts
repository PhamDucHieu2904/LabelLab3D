import * as THREE from 'three';
import type { ProductAsset } from '../viewer-config';
import { buildGlassNeckTraceData, type GlassNeckTraceData, type GlassNeckTraceKind } from './glass-neck-trace-data';
import { isPetRingMaterial } from './pet-ring-material';

export interface PetRingTraceData extends GlassNeckTraceData {
  ringTriangles: number;
  closureTriangles: number;
  boundaryLoops: number;
}

/** Complete the hidden inner sleeve for optical ray intersections only. The
 * authored Ring is a flange joined to the bottle's outer wall: treating the
 * whole bottle cavity as solid PET would give the wrong exit/refraction. */
export function createPetRingTraceData(root: THREE.Object3D,
  asset: Pick<ProductAsset, 'packaging' | 'materialSlots'>,
  selectOpaque?: (mesh: THREE.Mesh, material: THREE.Material) => 3 | 4 | 5 | undefined): PetRingTraceData {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert(), temporary = new THREE.Group();
  const ringPts: number[] = [], ringNrms: number[] = [];
  const temporaryGeometries: THREE.BufferGeometry[] = [], temporaryMaterials: THREE.Material[] = [];
  const transform = new THREE.Matrix4(), normalTransform = new THREE.Matrix3();
  const v = new THREE.Vector3(), nVec = new THREE.Vector3();

  function addGeometry(points: Float32Array | number[], ns: Float32Array | number[], uv: Float32Array | number[], kind: GlassNeckTraceKind) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(ns, 3));
    if (uv.length) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const material = new THREE.MeshBasicMaterial();
    material.userData.petTraceKind = kind;
    temporary.add(new THREE.Mesh(geometry, material));
    temporaryGeometries.push(geometry);
    temporaryMaterials.push(material);
  }

  /** Build radial lathe proxy directly from BufferAttribute without allocating per-vertex arrays/objects. */
  function addRadialProxyFromAttribute(
    position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
    index: THREE.BufferAttribute | null,
    start: number,
    end: number,
    mat: THREE.Matrix4,
    kind: GlassNeckTraceKind,
  ) {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    const seen = new Uint8Array(position.count);
    const uniqueIds: number[] = [];
    for (let i = start; i + 2 < end; i += 3) {
      for (let j = 0; j < 3; j++) {
        const id = index ? index.getX(i + j) : i + j;
        if (seen[id]) continue;
        seen[id] = 1;
        uniqueIds.push(id);
        v.fromBufferAttribute(position, id).applyMatrix4(mat);
        if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
        if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
        if (v.z < minZ) minZ = v.z; if (v.z > maxZ) maxZ = v.z;
      }
    }
    const height = maxY - minY;
    if (!(height > 0)) return;
    const cx = (minX + maxX) * 0.5, cz = (minZ + maxZ) * 0.5;
    const levels = new Map<number, { y: number; r: number }>(), tolerance = height * 1e-5;
    for (let k = 0; k < uniqueIds.length; k++) {
      v.fromBufferAttribute(position, uniqueIds[k]).applyMatrix4(mat);
      const y = v.y;
      const key = Math.round((y - minY) / tolerance);
      const r = Math.hypot(v.x - cx, v.z - cz);
      const previous = levels.get(key);
      if (!previous || r > previous.r) levels.set(key, { y, r });
    }
    const ordered = [...levels.values()].sort((a, b) => a.y - b.y);
    const profile: THREE.Vector2[] = [];
    let cursor = 0;
    for (let i = 0; i <= 16; i++) {
      const y = minY + height * i / 16;
      while (cursor + 1 < ordered.length && ordered[cursor + 1].y < y) cursor++;
      const a = ordered[cursor], b = ordered[Math.min(cursor + 1, ordered.length - 1)];
      const t = b.y > a.y ? THREE.MathUtils.clamp((y - a.y) / (b.y - a.y), 0, 1) : 0;
      profile.push(new THREE.Vector2(THREE.MathUtils.lerp(a.r, b.r, t), y));
    }
    profile.unshift(new THREE.Vector2(0, minY));
    profile.push(new THREE.Vector2(0, maxY));
    const proxy = new THREE.LatheGeometry(profile, 48);
    const p = proxy.getAttribute('position'), n = proxy.getAttribute('normal'), pIndex = proxy.index!;
    const ps = new Float32Array(pIndex.count * 3), ns = new Float32Array(pIndex.count * 3);
    for (let i = 0; i < pIndex.count; i++) {
      const id = pIndex.getX(i), o = i * 3;
      ps[o] = p.getX(id) + cx; ps[o + 1] = p.getY(id); ps[o + 2] = p.getZ(id) + cz;
      ns[o] = n.getX(id); ns[o + 1] = n.getY(id); ns[o + 2] = n.getZ(id);
    }
    addGeometry(ps, ns, [], kind);
    proxy.dispose();
  }

  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    if (node.userData.nataLiquidBack || node.userData.aloeLiquidBack || node.userData.bottleLiquidBack) return;
    const geometry = node.geometry, position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
    if (!position) return;
    const index = geometry.index, uvAttr = geometry.getAttribute('uv');
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    transform.multiplyMatrices(inverse, node.matrixWorld);
    normalTransform.getNormalMatrix(transform);
    const totalCount = index?.count ?? position.count;
    const rangeStart = Math.max(0, geometry.drawRange.start);
    const rangeEnd = Math.min(totalCount, rangeStart + (geometry.drawRange.count === Infinity ? totalCount : geometry.drawRange.count));
    const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: totalCount, materialIndex: 0 }];
    for (const group of groups) {
      const material = materials[group.materialIndex ?? 0] ?? materials[0];
      if (/liquid\s*back/i.test(material.name)) continue;
      const ring = isPetRingMaterial(asset as ProductAsset, material);
      const kind: GlassNeckTraceKind | undefined = ring ? 1 : selectOpaque?.(node, material)
        ?? ((asset.materialSlots?.liquid ?? []).includes(material.name) ? 5
          : (asset.materialSlots?.cap ?? []).includes(material.name) || /cap/i.test(material.name) ? 3 : undefined);
      if (!kind) continue;
      const start = Math.max(group.start, rangeStart);
      const end = Math.min(group.start + group.count, rangeEnd);
      const triCount = Math.floor((end - start) / 3);
      if (triCount <= 0) continue;

      if (!ring && (kind === 5 || (kind === 3 && triCount > 20000))) {
        addRadialProxyFromAttribute(position, index, start, end, transform, kind);
        continue;
      }

      if (ring) {
        for (let i = start; i + 2 < end; i += 3) {
          for (let j = 0; j < 3; j++) {
            const id = index ? index.getX(i + j) : i + j;
            v.fromBufferAttribute(position, id).applyMatrix4(transform);
            ringPts.push(v.x, v.y, v.z);
            if (normal) {
              nVec.fromBufferAttribute(normal, id).applyMatrix3(normalTransform).normalize();
              ringNrms.push(nVec.x, nVec.y, nVec.z);
            } else {
              ringNrms.push(0, 0, 0);
            }
          }
        }
      } else {
        const vertCount = triCount * 3;
        const points = new Float32Array(vertCount * 3);
        const ns = new Float32Array(vertCount * 3);
        const uvs = new Float32Array(vertCount * 2);
        let pOut = 0, uOut = 0;
        for (let i = start; i + 2 < end; i += 3) {
          for (let j = 0; j < 3; j++) {
            const id = index ? index.getX(i + j) : i + j;
            v.fromBufferAttribute(position, id).applyMatrix4(transform);
            points[pOut] = v.x; points[pOut + 1] = v.y; points[pOut + 2] = v.z;
            if (normal) {
              nVec.fromBufferAttribute(normal, id).applyMatrix3(normalTransform).normalize();
              ns[pOut] = nVec.x; ns[pOut + 1] = nVec.y; ns[pOut + 2] = nVec.z;
            }
            pOut += 3;
            uvs[uOut++] = uvAttr?.getX(id) ?? 0;
            uvs[uOut++] = uvAttr?.getY(id) ?? 0;
          }
        }
        addGeometry(points, ns, uvs, kind);
      }
    }
  });

  const ringVertCount = ringPts.length / 3;
  let bMinX = Infinity, bMinY = Infinity, bMinZ = Infinity;
  let bMaxX = -Infinity, bMaxY = -Infinity, bMaxZ = -Infinity;
  for (let i = 0; i < ringPts.length; i += 3) {
    const x = ringPts[i], y = ringPts[i + 1], z = ringPts[i + 2];
    if (x < bMinX) bMinX = x; if (x > bMaxX) bMaxX = x;
    if (y < bMinY) bMinY = y; if (y > bMaxY) bMaxY = y;
    if (z < bMinZ) bMinZ = z; if (z > bMaxZ) bMaxZ = z;
  }
  const tolerance = Math.max(Math.hypot(bMaxX - bMinX, bMaxY - bMinY, bMaxZ - bMinZ) * 1e-7, 1e-10);
  const invTol = 1 / tolerance;
  const weldedX: number[] = [], weldedY: number[] = [], weldedZ: number[] = [];
  const ids = new Map<string, number>();
  const indices = new Int32Array(ringVertCount);
  for (let i = 0; i < ringVertCount; i++) {
    const x = ringPts[i * 3], y = ringPts[i * 3 + 1], z = ringPts[i * 3 + 2];
    const key = `${Math.round(x * invTol)},${Math.round(y * invTol)},${Math.round(z * invTol)}`;
    let id = ids.get(key);
    if (id === undefined) {
      id = weldedX.length;
      ids.set(key, id);
      weldedX.push(x); weldedY.push(y); weldedZ.push(z);
    }
    indices[i] = id;
  }
  const edges = new Map<number, { a: number; b: number; count: number }>();
  const stride = Math.max(1, weldedX.length);
  for (let i = 0; i < indices.length; i += 3) {
    for (let j = 0; j < 3; j++) {
      const a = indices[i + j], b = indices[i + (j + 1) % 3];
      if (a === b) continue;
      const key = a < b ? a * stride + b : b * stride + a;
      const previous = edges.get(key);
      if (previous) previous.count++;
      else edges.set(key, { a, b, count: 1 });
    }
  }
  const next = new Map<number, number>();
  for (const e of edges.values()) if (e.count === 1) next.set(e.a, e.b);
  const loops: number[][] = [];
  while (next.size) {
    const first = next.keys().next().value!, loop: number[] = [];
    let cursor = first;
    while (next.has(cursor)) {
      loop.push(cursor);
      const following = next.get(cursor)!;
      next.delete(cursor);
      cursor = following;
    }
    if (cursor !== first || loop.length < 3) throw new Error('PET ring has an invalid optical boundary');
    loops.push(loop);
  }
  const ringTriangles = ringVertCount / 3;
  let closureTriangles = 0;
  if (loops.length) {
    if (loops.length !== 2 || loops[0].length !== loops[1].length) throw new Error('PET ring optical sleeve requires two matching boundary loops');
    const centerX = (bMinX + bMaxX) * 0.5, centerZ = (bMinZ + bMaxZ) * 0.5;
    const match = (id: number) => {
      const px = weldedX[id], pz = weldedZ[id];
      let best = loops[1][0], score = Infinity;
      for (let k = 0; k < loops[1].length; k++) {
        const candidate = loops[1][k];
        const dx = weldedX[candidate] - px, dz = weldedZ[candidate] - pz;
        const d = dx * dx + dz * dz;
        if (d < score) { score = d; best = candidate; }
      }
      return best;
    };
    const append = (a: number, b: number, c: number) => {
      for (const id of [a, b, c]) {
        const x = weldedX[id], y = weldedY[id], z = weldedZ[id];
        ringPts.push(x, y, z);
        const nx = centerX - x, nz = centerZ - z;
        const len = Math.hypot(nx, nz) || 1;
        ringNrms.push(nx / len, 0, nz / len);
      }
      closureTriangles++;
    };
    for (let i = 0; i < loops[0].length; i++) {
      const a = loops[0][i], b = loops[0][(i + 1) % loops[0].length], d = match(a), c = match(b);
      append(b, a, d);
      append(b, d, c);
    }
  }
  addGeometry(ringPts, ringNrms, [], 1);
  try {
    const data = buildGlassNeckTraceData(temporary, (_mesh, material) => material.userData.petTraceKind);
    return { ...data, ringTriangles, closureTriangles, boundaryLoops: loops.length };
  } finally {
    temporaryGeometries.forEach(g => g.dispose());
    temporaryMaterials.forEach(m => m.dispose());
  }
}
