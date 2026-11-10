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
  const vertices: THREE.Vector3[] = [], normals: THREE.Vector3[] = [];
  const temporaryGeometries: THREE.BufferGeometry[] = [], temporaryMaterials: THREE.Material[] = [];
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    if (node.userData.nataLiquidBack || node.userData.aloeLiquidBack || node.userData.bottleLiquidBack) return;
    const geometry = node.geometry, position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
    if (!position) return;
    const index = geometry.index, materials = Array.isArray(node.material) ? node.material : [node.material];
    const transform = new THREE.Matrix4().multiplyMatrices(inverse, node.matrixWorld), normalTransform = new THREE.Matrix3().getNormalMatrix(transform);
    const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: index?.count ?? position.count, materialIndex: 0 }];
    for (const group of groups) {
      const material = materials[group.materialIndex] ?? materials[0];
      if (/liquid\s*back/i.test(material.name)) continue;
      const ring = isPetRingMaterial(asset as ProductAsset, material);
      const kind: GlassNeckTraceKind | undefined = ring ? 1 : selectOpaque?.(node, material)
        ?? ((asset.materialSlots?.liquid ?? []).includes(material.name) ? 5
          : (asset.materialSlots?.cap ?? []).includes(material.name) || /cap/i.test(material.name) ? 3 : undefined);
      if (!kind) continue;
      const points: number[] = [], ns: number[] = [], uvs: number[] = [];
      const start = Math.max(group.start, geometry.drawRange.start), end = Math.min(group.start + group.count, geometry.drawRange.start + geometry.drawRange.count);
      for (let i = start; i + 2 < end; i += 3) for (let j = 0; j < 3; j++) {
        const id = index ? index.getX(i + j) : i + j;
        const p = new THREE.Vector3().fromBufferAttribute(position, id).applyMatrix4(transform);
        const n = normal ? new THREE.Vector3().fromBufferAttribute(normal, id).applyMatrix3(normalTransform).normalize() : new THREE.Vector3();
        points.push(...p.toArray()); ns.push(...n.toArray());
        const uv = geometry.getAttribute('uv'); uvs.push(uv?.getX(id) ?? 0, uv?.getY(id) ?? 0);
        if (ring) { vertices.push(p); normals.push(n); }
      }
      if (!ring) {
        if (kind === 5 || (kind === 3 && points.length / 9 > 20000)) addRadialProxy(points, kind);
        else addGeometry(points, ns, uvs, kind);
      }
    }
  });
  function addGeometry(points: number[], ns: number[], uv: number[], kind: GlassNeckTraceKind) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(ns, 3));
    if (uv.length) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const material = new THREE.MeshBasicMaterial(); material.userData.petTraceKind = kind;
    temporary.add(new THREE.Mesh(geometry, material)); temporaryGeometries.push(geometry); temporaryMaterials.push(material);
  }
  function addRadialProxy(points: number[], kind: GlassNeckTraceKind) {
    const box = new THREE.Box3();
    for (let i=0;i<points.length;i+=3) box.expandByPoint(new THREE.Vector3().fromArray(points,i));
    const center=box.getCenter(new THREE.Vector3()), height=box.max.y-box.min.y;
    if (height <= 0) return;
    // Preserve authored axial radii; duplicate rear-water layers collapse into
    // the same silhouette instead of multiplying BVH work.
    const levels=new Map<number,{y:number;r:number}>(), tolerance=height*1e-5;
    for(let i=0;i<points.length;i+=3){const y=points[i+1],key=Math.round((y-box.min.y)/tolerance),r=Math.hypot(points[i]-center.x,points[i+2]-center.z),previous=levels.get(key);if(!previous||r>previous.r)levels.set(key,{y,r});}
    const ordered=[...levels.values()].sort((a,b)=>a.y-b.y), profile:THREE.Vector2[]=[];
    let cursor=0;
    for(let i=0;i<=16;i++){
      const y=box.min.y+height*i/16;
      while(cursor+1<ordered.length&&ordered[cursor+1].y<y)cursor++;
      const a=ordered[cursor],b=ordered[Math.min(cursor+1,ordered.length-1)],t=b.y>a.y?THREE.MathUtils.clamp((y-a.y)/(b.y-a.y),0,1):0;
      profile.push(new THREE.Vector2(THREE.MathUtils.lerp(a.r,b.r,t),y));
    }
    profile.unshift(new THREE.Vector2(0,box.min.y));profile.push(new THREE.Vector2(0,box.max.y));
    const proxy=new THREE.LatheGeometry(profile,48),p=proxy.getAttribute('position'),n=proxy.getAttribute('normal'),index=proxy.index!,ps:number[]=[],ns:number[]=[];
    for(let i=0;i<index.count;i++){const id=index.getX(i);ps.push(p.getX(id)+center.x,p.getY(id),p.getZ(id)+center.z);ns.push(n.getX(id),n.getY(id),n.getZ(id));}
    addGeometry(ps,ns,[],kind);proxy.dispose();
  }
  const bounds = new THREE.Box3().setFromPoints(vertices), tolerance = Math.max(bounds.getSize(new THREE.Vector3()).length() * 1e-7, 1e-10);
  const welded: THREE.Vector3[] = [], ids = new Map<string, number>();
  const indices = vertices.map(p => {
    const key = p.toArray().map(v => Math.round(v / tolerance)).join(',');
    if (!ids.has(key)) { ids.set(key, welded.length); welded.push(p); }
    return ids.get(key)!;
  });
  const edges = new Map<string, { a: number; b: number; count: number }>();
  for (let i = 0; i < indices.length; i += 3) for (let j = 0; j < 3; j++) {
    const a = indices[i + j], b = indices[i + (j + 1) % 3]; if (a === b) continue;
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    const previous = edges.get(key); if (previous) previous.count++; else edges.set(key, { a, b, count: 1 });
  }
  const next = new Map<number, number>();
  for (const e of edges.values()) if (e.count === 1) next.set(e.a, e.b);
  const loops: number[][] = [];
  while (next.size) {
    const first = next.keys().next().value!, loop: number[] = []; let cursor = first;
    while (next.has(cursor)) { loop.push(cursor); const following = next.get(cursor)!; next.delete(cursor); cursor = following; }
    if (cursor !== first || loop.length < 3) throw new Error('PET ring has an invalid optical boundary');
    loops.push(loop);
  }
  const points = vertices.flatMap(p => p.toArray()), ns = normals.flatMap(n => n.toArray());
  const ringTriangles = vertices.length / 3; let closureTriangles = 0;
  if (loops.length) {
    if (loops.length !== 2 || loops[0].length !== loops[1].length) throw new Error('PET ring optical sleeve requires two matching boundary loops');
    const center = bounds.getCenter(new THREE.Vector3());
    const match = (id: number) => {
      const p = welded[id]; let best = loops[1][0], score = Infinity;
      for (const candidate of loops[1]) { const q = welded[candidate], d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2; if (d < score) { score = d; best = candidate; } }
      return best;
    };
    const append = (a: number, b: number, c: number) => {
      for (const id of [a, b, c]) { const p = welded[id]; points.push(...p.toArray()); ns.push(...new THREE.Vector3(center.x - p.x, 0, center.z - p.z).normalize().toArray()); }
      closureTriangles++;
    };
    for (let i = 0; i < loops[0].length; i++) { const a = loops[0][i], b = loops[0][(i + 1) % loops[0].length], d = match(a), c = match(b); append(b, a, d); append(b, d, c); }
  }
  addGeometry(points, ns, [], 1);
  try {
    const data = buildGlassNeckTraceData(temporary, (_mesh, material) => material.userData.petTraceKind);
    return { ...data, ringTriangles, closureTriangles, boundaryLoops: loops.length };
  } finally { temporaryGeometries.forEach(g => g.dispose()); temporaryMaterials.forEach(m => m.dispose()); }
}
