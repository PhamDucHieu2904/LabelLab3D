const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {parseGlb,hash}=require('../lib/bottle-compression.cjs');
const {decodeDracoPrimitives}=require('../lib/draco-bottle-compression.cjs');
const cases=[['pet-1500-juice',156300,1500],['pet-325-juice',52276,325],['pet-1000-short-juice',53826,1000],['pp-2000',42844,2000],['pp-1250',77116,1250],['pp-1000',82980,1000],['pp-1000-2',52508,1000],['pp-500',36484,500],['pp-500-2',64824,500]];
for(const [id,triangles,volume] of cases)test(`${id}: real Draco download preserves geometry, UV sets and independent semantic parts`,async()=>{
 const file=path.resolve(__dirname,`../../public/models/bottles/${id}.glb`);assert.ok(fs.existsSync(file),'batch Draco asset must exist');
 const bytes=fs.readFileSync(file),m=JSON.parse(fs.readFileSync(file.replace(/\.glb$/,'.manifest.json'))),{document:d}=parseGlb(bytes);
 assert.equal(hash(bytes),m.sha256);assert.equal(bytes.length,m.bytes);assert.ok(bytes.length<1000000);
 assert.equal(m.volumeMl,volume);assert.equal(m.compression.triangles,triangles);assert.equal(m.compression.simplification,false);
 if(id==='pp-2000')assert.equal(m.compression.method,'sequential','PP 2L must use sequential Draco to retain all source faces');
 if(id==='pet-1500-juice')assert.equal(m.sourceSha256,'4358cf5401ac012c5f8c37fa99f558ad58f3d548aa4b879a564c2e2e8fabbbd5','Use the repaired 1.5 L source');
 assert.ok(m.compression.maxPositionErrorMeters<=.00001);assert.ok(m.compression.maxUvErrorAt4096px<=.5);assert.ok(m.compression.maxNormalAngleDegrees<=.1);
 assert.ok(d.extensionsRequired.includes('KHR_draco_mesh_compression'));assert.deepEqual(d.nodes.at(-1).scale,[.1,.1,.1]);
 for(const [role,names] of Object.entries(m.materialSlots))for(const name of names)assert.ok(d.materials.some(mat=>mat.name===name),`${role}: ${name}`);
 for(const name of [...m.materialSlots.cap,...m.materialSlots.label]) {const mat=d.materials.find(mat=>mat.name===name);assert.equal(mat.doubleSided,true);assert.equal(mat.alphaMode,'OPAQUE');assert.equal(mat.pbrMetallicRoughness.baseColorFactor[3],1);}
 if(id.startsWith('pp-')){assert.equal(m.packaging,'pp');assert.equal(m.materialSlots.liquid,undefined);for(const name of m.materialSlots.body){const mat=d.materials.find(mat=>mat.name===name);assert.equal(mat.alphaMode,'OPAQUE');assert.equal(mat.extensions?.KHR_materials_transmission,undefined);}}
 if(id==='pet-1000-short-juice') {const node=d.nodes.find(n=>n.name==='Water'),liquid=d.meshes[node.mesh].primitives.map(p=>d.materials[p.material].name);assert.deepEqual(liquid,['Water']);assert.ok(!m.materialSlots.body.includes('Water'));}
 const decoded=await decodeDracoPrimitives(bytes);assert.equal(decoded.reduce((n,p)=>n+p.indices.length/3,0),triangles);
 for(const [i,p] of decoded.entries())for(const [semantic,array] of Object.entries(p.attributes))assert.equal(hash(Buffer.from(array.buffer)),m.compression.decodedAttributeHashes[i][semantic]);
 if(id.startsWith('pp-') && id !== 'pp-500-2')assert.ok(decoded.some(p=>p.attributes.TEXCOORD_1),'PP second UV channel retained when supplied by the source');
});
