const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const THREE = require('three');
const load = require('../lib/load-ts-source.cjs').createSourceLoader();
const filename = path.resolve(__dirname, '../../lib/viewer/pet-ring-trace-data.ts');
const fs = require('node:fs');
const { parseGlb } = require('../lib/bottle-compression.cjs');
const { decodeDracoPrimitives, readAccessor } = require('../lib/draco-bottle-compression.cjs');
const { MeshoptDecoder } = require('meshoptimizer');

test('optical collar closure preserves the authored exterior and closes only its inner sleeve', () => {
  const { createPetRingTraceData } = load(filename);
  // Remove the inner cylindrical strip of a closed annular flange.
  const geometry = new THREE.LatheGeometry([
    new THREE.Vector2(1, -.1), new THREE.Vector2(1.4, -.1),
    new THREE.Vector2(1.4, .1), new THREE.Vector2(1, .1),
  ], 24);
  const material = new THREE.MeshPhysicalMaterial(); material.name = 'Ring';
  const mesh = new THREE.Mesh(geometry, material), root = new THREE.Group(); root.add(mesh);
  mesh.position.set(.3, 1, -.2); root.scale.setScalar(.1); root.updateMatrixWorld(true);
  const positions = Array.from(geometry.attributes.position.array), indices = Array.from(geometry.index.array);
  const data = createPetRingTraceData(root, { packaging: 'pet', materialSlots: {} });
  assert.equal(data.boundaryLoops, 2);
  assert.equal(data.closureTriangles, 48);
  assert.equal(data.ringTriangles, indices.length / 3);
  assert.equal(data.triangleCount, data.ringTriangles + data.closureTriangles);
  const packed = data.triangles.image.data, edges = new Map();
  for (let i = 0; i < data.triangleCount; i++) {
    const o = i * 24, a = new THREE.Vector3().fromArray(packed,o), b = new THREE.Vector3().fromArray(packed,o+4).add(a), c = new THREE.Vector3().fromArray(packed,o+8).add(a);
    const keys = [a,b,c].map(p => p.toArray().map(x => x.toFixed(5)).join(','));
    for (let j = 0; j < 3; j++) { const a=keys[j],b=keys[(j+1)%3],key=[a,b].sort().join('|'),entry=edges.get(key)??[0,0];entry[0]++;entry[1]+=a<b?1:-1;edges.set(key,entry); }
  }
  for (const edge of edges.values()) assert.deepEqual(edge,[2,0],'closed trace has opposite winding at every shared edge');
  assert.deepEqual(Array.from(geometry.attributes.position.array), positions);
  assert.deepEqual(Array.from(geometry.index.array), indices);
  assert.equal(root.children.length, 1);
  assert.ok(data.bounds.min.y > .8, 'trace coordinates retain mesh transform but exclude root scale');
  data.dispose();
});

test('all nine authored PET collars have valid closed optical sleeves without source edits', async () => {
  const { createPetRingTraceData } = load(filename);
  const { preparePetRingGeometry } = load(path.resolve(__dirname, '../../lib/viewer/pet-ring-geometry.ts'));
  await MeshoptDecoder.ready;
  for (const file of ['pet-320-nata','pet-320-full-nata','pet-325-juice','pet-330-energy','pet-350-juice','pet-500-short-label','pet-1000-juice','pet-1000-short-juice','pet-1500-juice']) {
    const bytes = fs.readFileSync(path.resolve(__dirname, `../../public/models/bottles/${file}.glb`));
    const { document: doc, binary } = parseGlb(bytes);
    const decoded = doc.extensionsRequired?.includes('KHR_draco_mesh_compression') ? await decodeDracoPrimitives(bytes) : null;
    const access = id => {
      const a = doc.accessors[id], original = doc.bufferViews[a.bufferView], ext = original.extensions?.EXT_meshopt_compression;
      if (!ext) return readAccessor(doc, binary, id);
      const target = new Uint8Array(ext.count * ext.byteStride);
      MeshoptDecoder.decodeGltfBuffer(target, ext.count, ext.byteStride, binary.subarray(ext.byteOffset ?? 0, (ext.byteOffset ?? 0) + ext.byteLength), ext.mode, ext.filter);
      const copy = { ...doc, bufferViews: doc.bufferViews.slice() }; copy.bufferViews[a.bufferView] = { ...original, byteOffset: 0, byteStride: ext.byteStride };
      return readAccessor(copy, Buffer.from(target), id);
    };
    const nodes = doc.nodes.map(n => {
      const node = new THREE.Group();
      if (n.matrix) { node.matrix.fromArray(n.matrix); node.matrix.decompose(node.position, node.quaternion, node.scale); }
      else { node.position.fromArray(n.translation ?? [0,0,0]); node.quaternion.fromArray(n.rotation ?? [0,0,0,1]); node.scale.fromArray(n.scale ?? [1,1,1]); }
      if (n.mesh !== undefined) for (const [pi, p] of doc.meshes[n.mesh].primitives.entries()) {
        const q = decoded?.find(q => q.mi === n.mesh && q.pi === pi), g = new THREE.BufferGeometry();
        for (const [semantic,id] of Object.entries(p.attributes)) g.setAttribute(semantic === 'TEXCOORD_0' ? 'uv' : semantic.toLowerCase(), new THREE.BufferAttribute(q?.attributes[semantic] ?? access(id), semantic === 'TEXCOORD_0' ? 2 : 3));
        g.setIndex(new THREE.BufferAttribute(q?.indices ?? access(p.indices), 1));
        const m = new THREE.MeshPhysicalMaterial(); m.name = doc.materials[p.material].name;
        node.add(new THREE.Mesh(g,m));
      }
      return node;
    });
    doc.nodes.forEach((n,i) => (n.children ?? []).forEach(j => nodes[i].add(nodes[j])));
    const root = new THREE.Group(); doc.scenes[doc.scene ?? 0].nodes.forEach(i => root.add(nodes[i])); root.updateMatrixWorld(true);
    if (file === 'pet-1000-short-juice') preparePetRingGeometry(root,{id:file,packaging:'pet'});
    const before = []; root.traverse(n => { if (n.isMesh) before.push(n.geometry,n.material); });
    const manifestFile=path.resolve(__dirname,`../../public/models/bottles/${file}.manifest.json`);
    const materialSlots=(fs.existsSync(manifestFile)?JSON.parse(fs.readFileSync(manifestFile,'utf8')).materialSlots:{})??{};
    // The two original exports predate the manifest semantic slots.
    materialSlots.liquid ??= doc.materials.map(m=>m.name).filter(n=>/water|liquid/i.test(n));
    const data = createPetRingTraceData(root,{packaging:'pet',materialSlots});
    assert.equal(data.boundaryLoops,2,file); assert.ok(data.closureTriangles >= 48,file);
    let liquidCount=0,capCount=0;const packed=data.triangles.image.data;
    for(let i=0;i<data.triangleCount;i++){if(packed[i*24+7]===5)liquidCount++;if(packed[i*24+7]===3)capCount++;}
    assert.ok(liquidCount>0 && liquidCount<=1728*materialSlots.liquid.length,file+' bounded liquid profile');
    assert.ok(capCount>0 && capCount<=20000,file+' bounded cap profile');
    const after = []; root.traverse(n => { if (n.isMesh) after.push(n.geometry,n.material); }); assert.deepEqual(after,before,file);
    data.dispose();
  }
});

test('dense cap and liquid use bounded optical silhouettes with a tapered neck', () => {
  const { createPetRingTraceData } = load(filename);
  const root = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(1,-.1),new THREE.Vector2(1.4,-.1),new THREE.Vector2(1.4,.1),new THREE.Vector2(1,.1)],24),new THREE.MeshPhysicalMaterial());ring.material.name='Ring';root.add(ring);
  const liquid = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0,-3),new THREE.Vector2(2,-3),new THREE.Vector2(2,-1),new THREE.Vector2(.9,0),new THREE.Vector2(.9,.5),new THREE.Vector2(0,.5)],256),new THREE.MeshPhysicalMaterial());liquid.material.name='Water';root.add(liquid);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.2,1.2,1,256,50),new THREE.MeshPhysicalMaterial());cap.position.y=1;cap.material.name='Cap';root.add(cap);
  const data=createPetRingTraceData(root,{packaging:'pet',materialSlots:{liquid:['Water'],cap:['Cap']}});
  assert.ok(data.triangleCount < 6000, 'optical proxy cost is bounded independently of source tessellation');
  const packed=data.triangles.image.data;let water=0,capCount=0,neckRadius=0;
  for(let i=0;i<data.triangleCount;i++){const o=i*24;if(packed[o+7]===5){water++;const y=packed[o+1];if(y>.1)neckRadius=Math.max(neckRadius,Math.hypot(packed[o],packed[o+2]));}if(packed[o+7]===3)capCount++;}
  assert.ok(water>0);assert.ok(capCount>0);assert.ok(neckRadius<1.1, 'water proxy follows neck radius rather than body radius');
  const duplicate=liquid.clone();duplicate.userData.nataLiquidBack=true;root.add(duplicate);
  const withBack=createPetRingTraceData(root,{packaging:'pet',materialSlots:{liquid:['Water'],cap:['Cap']}});
  assert.equal(withBack.triangleCount,data.triangleCount,'render-only rear water never duplicates optical proxy');withBack.dispose();data.dispose();
});
