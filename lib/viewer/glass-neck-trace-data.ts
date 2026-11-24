import * as THREE from 'three';

export type GlassNeckTraceKind = 1 | 3 | 4 | 5;
export interface GlassNeckTraceData {
  triangles: THREE.DataTexture;
  nodes: THREE.DataTexture;
  uvs: THREE.DataTexture;
  width: number;
  epsilon: number;
  bounds: THREE.Box3;
  triangleCount: number;
  dispose(): void;
}

function texture(values: Float32Array, name: string): THREE.DataTexture {
  const width = 1024, height = Math.max(1, Math.ceil(values.length / (width * 4)));
  const data = new Float32Array(width * height * 4);
  data.set(values);
  const result = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  result.name = name;
  result.minFilter = THREE.NearestFilter;
  result.magFilter = THREE.NearestFilter;
  result.generateMipmaps = false;
  result.colorSpace = THREE.NoColorSpace;
  result.needsUpdate = true;
  return result;
}

/** Build compact local-space geometry and a stackless BVH for the pull-cap optical pass.
 * Uses flat typed arrays and in-place midpoint partitioning to avoid per-triangle GC churn. */
export function buildGlassNeckTraceData(
  root: THREE.Object3D,
  select: (mesh: THREE.Mesh, material: THREE.Material) => GlassNeckTraceKind | undefined,
): GlassNeckTraceData {
  root.updateMatrixWorld(true);
  const rootInverse = root.matrixWorld.clone().invert();
  const localToRoot = new THREE.Matrix4();
  const normalMatrix = new THREE.Matrix3();
  const p = new THREE.Vector3(), q = new THREE.Vector3(), r = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), face = new THREE.Vector3();
  const n0 = new THREE.Vector3(), n1 = new THREE.Vector3(), n2 = new THREE.Vector3();

  type SelectedSlice = {
    mesh: THREE.Mesh;
    pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
    index: THREE.BufferAttribute | null;
    uvAttr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | null;
    normalAttr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | null;
    start: number;
    end: number;
    kind: GlassNeckTraceKind;
  };
  const slices: SelectedSlice[] = [];
  let maxTriangles = 0;

  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    const geometry = node.geometry, pos = geometry.getAttribute('position');
    if (!pos) return;
    const index = geometry.getIndex();
    const uvAttr = geometry.getAttribute('uv') ?? null;
    const normalAttr = geometry.getAttribute('normal') ?? null;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    const totalCount = index ? index.count : pos.count;
    const rangeStart = Math.max(0, geometry.drawRange.start);
    const rangeEnd = Math.min(totalCount, rangeStart + (geometry.drawRange.count === Infinity ? totalCount : geometry.drawRange.count));
    const groups = geometry.groups.length ? geometry.groups : [{ start: rangeStart, count: rangeEnd - rangeStart, materialIndex: 0 }];
    for (const group of groups) {
      const material = materials[group.materialIndex ?? 0] ?? materials[0];
      const kind = material && select(node, material);
      if (!kind) continue;
      const start = Math.max(rangeStart, group.start);
      const end = Math.min(rangeEnd, group.start + group.count);
      if (end - start >= 3) {
        slices.push({ mesh: node, pos, index, uvAttr, normalAttr, start, end, kind });
        maxTriangles += Math.floor((end - start) / 3);
      }
    }
  });

  if (maxTriangles === 0) throw new Error('Glass neck trace data has no selected triangles');

  const rawTri = new Float32Array(maxTriangles * 24);
  const rawUv = new Float32Array(maxTriangles * 8);
  const triMinX = new Float32Array(maxTriangles), triMinY = new Float32Array(maxTriangles), triMinZ = new Float32Array(maxTriangles);
  const triMaxX = new Float32Array(maxTriangles), triMaxY = new Float32Array(maxTriangles), triMaxZ = new Float32Array(maxTriangles);
  const centX = new Float32Array(maxTriangles), centY = new Float32Array(maxTriangles), centZ = new Float32Array(maxTriangles);

  let triCount = 0;
  let bMinX = Infinity, bMinY = Infinity, bMinZ = Infinity;
  let bMaxX = -Infinity, bMaxY = -Infinity, bMaxZ = -Infinity;
  let lastMesh: THREE.Mesh | null = null;

  for (let s = 0; s < slices.length; s++) {
    const slice = slices[s];
    if (slice.mesh !== lastMesh) {
      lastMesh = slice.mesh;
      localToRoot.multiplyMatrices(rootInverse, slice.mesh.matrixWorld);
      normalMatrix.getNormalMatrix(localToRoot);
    }
    const { pos, index, uvAttr, normalAttr, start, end, kind } = slice;
    for (let offset = start; offset + 2 < end; offset += 3) {
      const i0 = index ? index.getX(offset) : offset;
      const i1 = index ? index.getX(offset + 1) : offset + 1;
      const i2 = index ? index.getX(offset + 2) : offset + 2;
      p.fromBufferAttribute(pos, i0).applyMatrix4(localToRoot);
      q.fromBufferAttribute(pos, i1).applyMatrix4(localToRoot);
      r.fromBufferAttribute(pos, i2).applyMatrix4(localToRoot);
      e1.subVectors(q, p);
      e2.subVectors(r, p);
      face.crossVectors(e1, e2);
      const faceLenSq = face.lengthSq();
      if (faceLenSq < 1e-20) continue;

      const idx = triCount++;
      const o = idx * 24;
      rawTri[o] = p.x; rawTri[o + 1] = p.y; rawTri[o + 2] = p.z; rawTri[o + 3] = 0;
      rawTri[o + 4] = e1.x; rawTri[o + 5] = e1.y; rawTri[o + 6] = e1.z; rawTri[o + 7] = kind;
      rawTri[o + 8] = e2.x; rawTri[o + 9] = e2.y; rawTri[o + 10] = e2.z;
      rawTri[o + 11] = Math.max(1e-30, Math.sqrt(faceLenSq) * 1e-8);

      if (normalAttr) {
        n0.fromBufferAttribute(normalAttr, i0).applyMatrix3(normalMatrix).normalize();
        n1.fromBufferAttribute(normalAttr, i1).applyMatrix3(normalMatrix).normalize();
        n2.fromBufferAttribute(normalAttr, i2).applyMatrix3(normalMatrix).normalize();
      } else {
        face.multiplyScalar(1 / Math.sqrt(faceLenSq));
        n0.copy(face); n1.copy(face); n2.copy(face);
      }
      rawTri[o + 12] = n0.x; rawTri[o + 13] = n0.y; rawTri[o + 14] = n0.z; rawTri[o + 15] = 0;
      rawTri[o + 16] = n1.x; rawTri[o + 17] = n1.y; rawTri[o + 18] = n1.z; rawTri[o + 19] = 0;
      rawTri[o + 20] = n2.x; rawTri[o + 21] = n2.y; rawTri[o + 22] = n2.z; rawTri[o + 23] = 0;

      const u = idx * 8;
      if (uvAttr) {
        rawUv[u] = uvAttr.getX(i0); rawUv[u + 1] = uvAttr.getY(i0);
        rawUv[u + 2] = uvAttr.getX(i1); rawUv[u + 3] = uvAttr.getY(i1);
        rawUv[u + 4] = uvAttr.getX(i2); rawUv[u + 5] = uvAttr.getY(i2);
      }

      const mnX = Math.min(p.x, q.x, r.x), mnY = Math.min(p.y, q.y, r.y), mnZ = Math.min(p.z, q.z, r.z);
      const mxX = Math.max(p.x, q.x, r.x), mxY = Math.max(p.y, q.y, r.y), mxZ = Math.max(p.z, q.z, r.z);
      triMinX[idx] = mnX; triMinY[idx] = mnY; triMinZ[idx] = mnZ;
      triMaxX[idx] = mxX; triMaxY[idx] = mxY; triMaxZ[idx] = mxZ;
      centX[idx] = (mnX + mxX) * 0.5;
      centY[idx] = (mnY + mxY) * 0.5;
      centZ[idx] = (mnZ + mxZ) * 0.5;
      if (mnX < bMinX) bMinX = mnX; if (mnY < bMinY) bMinY = mnY; if (mnZ < bMinZ) bMinZ = mnZ;
      if (mxX > bMaxX) bMaxX = mxX; if (mxY > bMaxY) bMaxY = mxY; if (mxZ > bMaxZ) bMaxZ = mxZ;
    }
  }

  if (triCount === 0) throw new Error('Glass neck trace data has no selected triangles');

  const perm = new Int32Array(triCount);
  for (let i = 0; i < triCount; i++) perm[i] = i;

  // Worst-case binary tree node count is <= 2 * triCount.
  let nodeCap = Math.max(16, Math.min(triCount * 2, Math.ceil(triCount / 2) + 32));
  let nodeBuf = new Float32Array(nodeCap * 12);
  let nodeCount = 0;
  let orderedCount = 0;
  const order = new Int32Array(triCount);

  const ensureNodeCap = () => {
    if (nodeCount < nodeCap) return;
    nodeCap = Math.max(nodeCap * 2, nodeCount + 64);
    const next = new Float32Array(nodeCap * 12);
    next.set(nodeBuf);
    nodeBuf = next;
  };

  const build = (start: number, end: number): void => {
    ensureNodeCap();
    const slot = nodeCount++;
    let loX = Infinity, loY = Infinity, loZ = Infinity;
    let hiX = -Infinity, hiY = -Infinity, hiZ = -Infinity;
    for (let i = start; i < end; i++) {
      const t = perm[i];
      if (triMinX[t] < loX) loX = triMinX[t];
      if (triMinY[t] < loY) loY = triMinY[t];
      if (triMinZ[t] < loZ) loZ = triMinZ[t];
      if (triMaxX[t] > hiX) hiX = triMaxX[t];
      if (triMaxY[t] > hiY) hiY = triMaxY[t];
      if (triMaxZ[t] > hiZ) hiZ = triMaxZ[t];
    }
    const count = end - start;
    if (count <= 8) {
      const first = orderedCount;
      for (let i = start; i < end; i++) order[orderedCount++] = perm[i];
      const o = slot * 12;
      nodeBuf[o] = loX; nodeBuf[o + 1] = loY; nodeBuf[o + 2] = loZ; nodeBuf[o + 3] = slot + 1;
      nodeBuf[o + 4] = hiX; nodeBuf[o + 5] = hiY; nodeBuf[o + 6] = hiZ; nodeBuf[o + 7] = 0;
      nodeBuf[o + 8] = first; nodeBuf[o + 9] = count; nodeBuf[o + 10] = 0; nodeBuf[o + 11] = 0;
      return;
    }

    let cMinX = Infinity, cMinY = Infinity, cMinZ = Infinity;
    let cMaxX = -Infinity, cMaxY = -Infinity, cMaxZ = -Infinity;
    for (let i = start; i < end; i++) {
      const t = perm[i];
      const x = centX[t], y = centY[t], z = centZ[t];
      if (x < cMinX) cMinX = x; if (x > cMaxX) cMaxX = x;
      if (y < cMinY) cMinY = y; if (y > cMaxY) cMaxY = y;
      if (z < cMinZ) cMinZ = z; if (z > cMaxZ) cMaxZ = z;
    }
    const extX = cMaxX - cMinX, extY = cMaxY - cMinY, extZ = cMaxZ - cMinZ;
    const cent = extX >= extY && extX >= extZ ? centX : extY >= extZ ? centY : centZ;
    const split = extX >= extY && extX >= extZ ? (cMinX + cMaxX) * 0.5
      : extY >= extZ ? (cMinY + cMaxY) * 0.5 : (cMinZ + cMaxZ) * 0.5;

    let left = start, right = end - 1;
    while (left <= right) {
      if (cent[perm[left]] < split) left++;
      else {
        const tmp = perm[left];
        perm[left] = perm[right];
        perm[right] = tmp;
        right--;
      }
    }
    let mid = left;
    if (mid <= start || mid >= end) mid = start + ((count + 1) >> 1);

    build(start, mid);
    build(mid, end);

    const o = slot * 12;
    nodeBuf[o] = loX; nodeBuf[o + 1] = loY; nodeBuf[o + 2] = loZ; nodeBuf[o + 3] = nodeCount;
    nodeBuf[o + 4] = hiX; nodeBuf[o + 5] = hiY; nodeBuf[o + 6] = hiZ; nodeBuf[o + 7] = 0;
    nodeBuf[o + 8] = 0; nodeBuf[o + 9] = 0; nodeBuf[o + 10] = 0; nodeBuf[o + 11] = 0;
  };

  build(0, triCount);

  const triValues = new Float32Array(triCount * 24);
  const uvValues = new Float32Array(triCount * 8);
  for (let i = 0; i < triCount; i++) {
    const src = order[i];
    triValues.set(rawTri.subarray(src * 24, src * 24 + 24), i * 24);
    uvValues.set(rawUv.subarray(src * 8, src * 8 + 8), i * 8);
  }
  const nodeValues = nodeBuf.subarray(0, nodeCount * 12);
  const trianglesTexture = texture(triValues, 'glass-neck-triangles');
  const nodesTexture = texture(nodeValues, 'glass-neck-nodes');
  const uvsTexture = texture(uvValues, 'glass-neck-uvs');
  const bounds = new THREE.Box3(new THREE.Vector3(bMinX, bMinY, bMinZ), new THREE.Vector3(bMaxX, bMaxY, bMaxZ));
  const dx = bMaxX - bMinX, dy = bMaxY - bMinY, dz = bMaxZ - bMinZ;
  return {
    triangles: trianglesTexture,
    nodes: nodesTexture,
    uvs: uvsTexture,
    width: 1024,
    epsilon: Math.max(1e-9, Math.hypot(dx, dy, dz) * 1e-6),
    bounds,
    triangleCount: triCount,
    dispose: () => { trianglesTexture.dispose(); nodesTexture.dispose(); uvsTexture.dispose(); },
  };
}
