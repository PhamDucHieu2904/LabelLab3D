const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {parseGlb, writeGlb, hash} = require('./lib/bottle-compression.cjs');
const {compressDraco, decodeDracoPrimitives, readAccessor} = require('./lib/draco-bottle-compression.cjs');

function appendCanonicalShell(d, binary, basil) {
  const views = d.bufferViews, accessors = d.accessors; let buf = Buffer.from(binary);
  const add = (array, type, componentType, target) => { const bytes = Buffer.from(array.buffer, array.byteOffset, array.byteLength), off = buf.length; buf = Buffer.concat([buf, bytes]); const vi = views.push({buffer:0, byteOffset:off, byteLength:bytes.length, ...(target ? {target} : {})}) - 1; return accessors.push({bufferView:vi, componentType, count:array.length / ({SCALAR:1,VEC2:2,VEC3:3}[type]), type}) - 1; };
  const waterIndex=d.nodes.find(n=>n.name==='Water').mesh;
  for (const [meshIndex, basilMesh] of [[0, 0], [4, 1], [waterIndex, 4]]) {
    const q = basil.find(x => x.mi === basilMesh); const attrs = {};
    for (const [semantic, values] of Object.entries(q.attributes)) { const a = new Float32Array(values); if (semantic === 'POSITION') for (let i=0;i<a.length;i+=3) { a[i] *= 10; a[i+1] = a[i+1] * 10 + .9023135900497437; a[i+2] *= 10; } attrs[semantic] = add(a, semantic.startsWith('TEX')?'VEC2':'VEC3', 5126, 34962); }
    const indices = add(new Uint32Array(q.indices), 'SCALAR', 5125, 34963);
    d.meshes[meshIndex] = {primitives:[{attributes:attrs, indices, mode:4, material: d.materials.findIndex(m=>m.name === (basilMesh === 0 ? 'Body' : basilMesh === 1 ? 'Neck' : 'BasilWater'))}]};
  }
  return buf;
}

function packUsedGeometry(d, binary) {
  const used=[...new Set(d.nodes.filter(n=>n.mesh!==undefined).map(n=>n.mesh))], views=[], accessors=[], chunks=[]; let offset=0;
  const copy = ai => {const a=d.accessors[ai], values=readAccessor(d,binary,ai), raw=Buffer.from(values.buffer), padded=Buffer.alloc(Math.ceil(raw.length/4)*4);raw.copy(padded);const vi=views.push({buffer:0,byteOffset:offset,byteLength:raw.length})-1;offset+=padded.length;chunks.push(padded);return accessors.push({componentType:a.componentType,count:a.count,type:a.type,bufferView:vi})-1;};
  const meshes=used.map(i=>({...d.meshes[i],primitives:d.meshes[i].primitives.map(p=>({...p,indices:copy(p.indices),attributes:Object.fromEntries(Object.entries(p.attributes).map(([s,a])=>[s,copy(a)]))}))}));
  for(const n of d.nodes)if(n.mesh!==undefined)n.mesh=used.indexOf(n.mesh);
  d.meshes=meshes;d.accessors=accessors;d.bufferViews=views;d.buffers=[{byteLength:offset}];return Buffer.concat(chunks);
}

/** Canonical Basil shell/water; original cap, label and seed meshes/UVs retained. */
async function importGlass290(source, kind) {
  assert.ok(['chia', 'milk'].includes(kind), 'Expected chia or milk');
  const id = `glass-290-${kind}`, input = fs.readFileSync(source);
  let {document: d, binary} = parseGlb(input);
  const basilBytes = fs.readFileSync(path.resolve(__dirname, '../public/models/bottles/glass-290-basil-web.glb'));
  const basil = await decodeDracoPrimitives(basilBytes);
  binary = appendCanonicalShell(d, binary, basil);
  const base = d.nodes.find(n => n.name === 'Base'); if (base) delete base.mesh;
  const bodyNode=d.nodes.find(n=>n.name==='Body'), neckNode=d.nodes.find(n=>n.name==='Neck');
  if(bodyNode) { bodyNode.mesh=0; delete bodyNode.translation; delete bodyNode.rotation; bodyNode.scale=[1,1,1]; }
  if(neckNode) { neckNode.mesh=4; delete neckNode.translation; delete neckNode.rotation; neckNode.scale=[1,1,1]; }
  const waterNode=d.nodes.find(n=>n.name==='Water'); delete waterNode.translation; delete waterNode.rotation; waterNode.scale=[1,1,1];
  binary = packUsedGeometry(d, binary);
  const slots = {body: ['Body', 'Neck'], cap: ['GoldenCap'], label: ['PaperLabel'], liquid: ['Water'],
    ...(kind === 'chia' ? {inclusions: ['Chia Seeds']} : {})};
  for (const m of d.materials) {
    if (m.name === 'BasilWater') m.name = 'Water';
    if (m.name === 'Chia Seed - Dark') m.name = 'Chia Seeds';
  }
  for (const name of Object.values(slots).flat()) assert.ok(d.materials.some(m => m.name === name), `Missing ${name}`);
  const root = d.nodes.length;
  d.nodes.push({name: `Glass_290_${kind}_Metres`, scale: [.1, .1, .1], children: d.scenes[d.scene ?? 0].nodes});
  d.scenes[d.scene ?? 0].nodes = [root];
  const linear = v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
  const color = hex => hex.match(/../g).map(v => linear(parseInt(v, 16) / 255)).concat(1);
  for (const m of d.materials) {
    m.extras = {...m.extras, bottleProfile: 'glass-290-v1'};
    m.alphaMode = 'OPAQUE'; m.doubleSided = slots.cap.includes(m.name) || slots.label.includes(m.name);
    delete m.extensions;
    m.pbrMetallicRoughness = {baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: .28};
    if (slots.body.includes(m.name)) {
      m.pbrMetallicRoughness.roughnessFactor = .042;
      if (m.name === 'Neck') m.extras.basilWebNeckWallMetres = .0013;
      m.extensions = {KHR_materials_transmission: {transmissionFactor: 1}, KHR_materials_volume: {thicknessFactor: .002}, KHR_materials_ior: {ior: 1.52}};
    } else if (m.name === 'GoldenCap') {
      m.pbrMetallicRoughness.baseColorFactor = color('d8c738');
      m.pbrMetallicRoughness.metallicFactor = 1; m.pbrMetallicRoughness.roughnessFactor = .388;
    } else if (m.name === 'Water') {
      m.extras.bottleLiquidKind = kind;
      m.pbrMetallicRoughness.baseColorFactor = color(kind === 'chia' ? 'eee9d5' : 'fffdf5');
      m.pbrMetallicRoughness.roughnessFactor = .12;
      // Both variants use the Basil-style opaque captured reservoir. Chia's
      // source seed mesh is composited into that reservoir; native transmission
      // would sample the pink page backdrop and let seeds escape the label.
      m.extensions = {KHR_materials_transmission: {transmissionFactor: 0}, KHR_materials_volume: {thicknessFactor: .035}, KHR_materials_ior: {ior: 1.333}};
    } else if (m.name === 'Chia Seeds') {
      m.pbrMetallicRoughness.baseColorFactor = color('302a24'); m.pbrMetallicRoughness.roughnessFactor = .74;
    }
  }
  d.extensionsUsed = [...new Set([...(d.extensionsUsed ?? []), 'KHR_materials_transmission', 'KHR_materials_volume', 'KHR_materials_ior'])];
  const geometry = {canonicalSource:'glass-290-basil-web.glb',canonicalSourceSha256:hash(basilBytes),canonicalParts:['Body','Neck','Water'],sourcePartsRetained:['Golden Cap','Label',...(kind==='chia'?['Seeds']:[])],sourceUnitsPerCanonicalMetre:10,sourceYOffset:.9023135900497437};
  const neckOptics = {tracer:'pullcap-hollow-glass-neck-v1', wallThicknessMetres:.0013, geometrySource:'canonical Neck already closed', innerShellAdded:false};
  d.asset.extras = {...d.asset.extras, labellabImport: {sourceName: path.basename(source), sourceSha256: hash(input), units: 'metres', geometry}};
  const {bytes, compression} = await compressDraco(writeGlb(d, binary));
  assert.ok(bytes.length <= 512000, `${id} exceeds 500 KB budget: ${bytes.length}`);
  const manifest = {id, src: `/models/bottles/${id}.glb`, sourceName: path.basename(source), sourceBytes: input.length,
    sourceSha256: hash(input), bytes: bytes.length, sha256: hash(bytes), binarySha256: hash(parseGlb(bytes).binaryChunk), neckOptics,
    sourceToMetres: .1, units: 'metres', volumeMl: 290, defaultLiquid: kind, blankLabel: 'white', geometry, materialSlots: slots, compression};
  const output = path.resolve(__dirname, `../public/models/bottles/${id}.glb`);
  fs.writeFileSync(output, bytes); fs.writeFileSync(output.replace('.glb', '.manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`${id}: ${input.length} -> ${bytes.length} bytes; ${compression.triangles} triangles retained; max error ${compression.maxPositionErrorMeters * 1000} mm.`);
}
if (require.main === module) importGlass290(process.argv[2], process.argv[3]).catch(e => {console.error(e); process.exitCode = 1;});
module.exports = {importGlass290};
