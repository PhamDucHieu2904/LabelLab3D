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

type Tri = { a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3; normals: THREE.Vector3[]; uv: THREE.Vector2[]; kind: GlassNeckTraceKind; bounds: THREE.Box3; centroid: THREE.Vector3 };
type Node = { lo: THREE.Vector3; hi: THREE.Vector3; first: number; count: number; escape: number };

function texture(values: Float32Array, name: string): THREE.DataTexture {
  const width = 1024, height = Math.max(1, Math.ceil(values.length / (width * 4)));
  const data = new Float32Array(width * height * 4); data.set(values);
  const result = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  result.name = name; result.minFilter = THREE.NearestFilter; result.magFilter = THREE.NearestFilter;
  result.generateMipmaps = false; result.colorSpace = THREE.NoColorSpace; result.needsUpdate = true;
  return result;
}

/** Build compact local-space geometry and a stackless BVH for the pull-cap optical pass. */
export function buildGlassNeckTraceData(root: THREE.Object3D, select: (mesh: THREE.Mesh, material: THREE.Material) => GlassNeckTraceKind | undefined): GlassNeckTraceData {
  root.updateMatrixWorld(true);
  const rootInverse = root.matrixWorld.clone().invert(), triangles: Tri[] = [], bounds = new THREE.Box3();
  const p = new THREE.Vector3(), q = new THREE.Vector3(), r = new THREE.Vector3(), n = new THREE.Vector3();
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    const geometry = node.geometry, pos = geometry.getAttribute('position'); if (!pos) return;
    const index = geometry.getIndex(), uvAttr = geometry.getAttribute('uv'), normalAttr = geometry.getAttribute('normal');
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    const localToRoot = new THREE.Matrix4().multiplyMatrices(rootInverse, node.matrixWorld), normalMatrix = new THREE.Matrix3().getNormalMatrix(localToRoot);
    const rangeStart = Math.max(0, geometry.drawRange.start), rangeEnd = Math.min(index ? index.count : pos.count, rangeStart + (geometry.drawRange.count === Infinity ? Infinity : geometry.drawRange.count));
    const groups = geometry.groups.length ? geometry.groups : [{ start: rangeStart, count: rangeEnd - rangeStart, materialIndex: 0 }];
    for (const group of groups) {
      const material = materials[group.materialIndex] ?? materials[0], kind = material && select(node, material); if (!kind) continue;
      const start = Math.max(rangeStart, group.start), end = Math.min(rangeEnd, group.start + group.count);
      for (let offset = start; offset + 2 < end; offset += 3) {
        const id = (j: number) => index ? index.getX(offset + j) : offset + j;
        p.fromBufferAttribute(pos, id(0)).applyMatrix4(localToRoot); q.fromBufferAttribute(pos, id(1)).applyMatrix4(localToRoot); r.fromBufferAttribute(pos, id(2)).applyMatrix4(localToRoot);
        const face = new THREE.Vector3().subVectors(q, p).cross(new THREE.Vector3().subVectors(r, p)); if (face.lengthSq() < 1e-20) continue;
        const ns = [0, 1, 2].map(j => normalAttr ? n.fromBufferAttribute(normalAttr, id(j)).applyMatrix3(normalMatrix).normalize().clone() : face.clone().normalize());
        const uvs = [0, 1, 2].map(j => uvAttr ? new THREE.Vector2().fromBufferAttribute(uvAttr, id(j)) : new THREE.Vector2());
        const tb = new THREE.Box3().setFromPoints([p, q, r]), centroid = tb.getCenter(new THREE.Vector3());
        triangles.push({ a: p.clone(), b: q.clone(), c: r.clone(), normals: ns, uv: uvs, kind, bounds: tb, centroid }); bounds.union(tb);
      }
    }
  });
  if (!triangles.length) throw new Error('Glass neck trace data has no selected triangles');
  const nodes: Node[] = [], order: Tri[] = [];
  const build = (items: Tri[]): number => {
    const slot = nodes.length; nodes.push({ lo: new THREE.Vector3(), hi: new THREE.Vector3(), first: 0, count: 0, escape: 0 });
    const box = new THREE.Box3(); items.forEach(t => box.union(t.bounds));
    if (items.length <= 8) { const first = order.length; order.push(...items); nodes[slot] = { lo: box.min.clone(), hi: box.max.clone(), first, count: items.length, escape: slot + 1 }; return slot; }
    const centers = new THREE.Box3(); items.forEach(t => centers.expandByPoint(t.centroid));
    const extent = centers.getSize(new THREE.Vector3()); const axis = extent.x >= extent.y && extent.x >= extent.z ? 'x' : extent.y >= extent.z ? 'y' : 'z';
    items.sort((a, b) => a.centroid[axis] - b.centroid[axis]); const mid = Math.ceil(items.length / 2); build(items.slice(0, mid)); build(items.slice(mid));
    const end = nodes.length; nodes[slot] = { lo: box.min.clone(), hi: box.max.clone(), first: 0, count: 0, escape: end }; return slot;
  };
  build(triangles.slice());
  const triValues = new Float32Array(order.length * 24), uvValues = new Float32Array(order.length * 8);
  order.forEach((t, i) => { const o = i * 24, e1 = t.b.clone().sub(t.a), e2 = t.c.clone().sub(t.a); triValues.set([...t.a.toArray(), 0, ...e1.toArray(), t.kind, ...e2.toArray(), Math.max(1e-30, e1.clone().cross(e2).length() * 1e-8), ...t.normals.flatMap(v => [...v.toArray(), 0])], o); const u = i * 8; uvValues.set([t.uv[0].x, t.uv[0].y, t.uv[1].x, t.uv[1].y, t.uv[2].x, t.uv[2].y, 0, 0], u); });
  const nodeValues = new Float32Array(nodes.length * 12); nodes.forEach((x, i) => { const o = i * 12; nodeValues.set([...x.lo.toArray(), x.escape, ...x.hi.toArray(), 0, x.first, x.count, 0], o); });
  const trianglesTexture = texture(triValues, 'glass-neck-triangles'), nodesTexture = texture(nodeValues, 'glass-neck-nodes'), uvsTexture = texture(uvValues, 'glass-neck-uvs');
  return { triangles: trianglesTexture, nodes: nodesTexture, uvs: uvsTexture, width: 1024, epsilon: Math.max(1e-9, Math.sqrt(bounds.getSize(new THREE.Vector3()).lengthSq()) * 1e-6), bounds: bounds.clone(), triangleCount: order.length, dispose: () => { trianglesTexture.dispose(); nodesTexture.dispose(); uvsTexture.dispose(); } };
}
