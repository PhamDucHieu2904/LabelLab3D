const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { writeGlb, parseGlb, hash } = require('../lib/bottle-compression.cjs');
const helper = path.resolve(__dirname, '../lib/draco-bottle-compression.cjs');

function fixture() {
  const arrays = [new Float32Array([0,0,0, 1,0,0, 0,1,0, 0,0,0]),
    new Float32Array([0,0,1, 0,0,1, 0,0,1, 0,1,0]),
    new Float32Array([0,0, 1,0, 0,1, 1,1]), new Uint16Array([0,1,2, 3,2,1])];
  let offset = 0;
  const views = arrays.map((a,i) => { const v={buffer:0,byteOffset:offset,byteLength:a.byteLength,target:i===3?34963:34962}; offset+=a.byteLength; return v; });
  const document = {asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,scale:[.1,.2,.3]}],
    buffers:[{byteLength:offset}],bufferViews:views,materials:[{name:'Label'}],
    accessors:arrays.map((a,i)=>({bufferView:i,componentType:i===3?5123:5126,count:i===3?6:4,type:i===3?'SCALAR':i===2?'VEC2':'VEC3',...(i===0?{min:[0,0,0],max:[1,1,0]}:{})})),
    meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1,TEXCOORD_0:2},indices:3,material:0}]}]};
  const binary=Buffer.concat(arrays.map(a=>Buffer.from(a.buffer)));
  return {document,binary,bytes:writeGlb(document,binary)};
}

test('Draco retains face winding and UV seams through the shipped decoder', async () => {
  assert.ok(fs.existsSync(helper), 'Draco bottle encoder must exist');
  const { compressDraco, compareDraco } = require(helper);
  const source=fixture(), packed=await compressDraco(source.bytes);
  assert.equal(packed.compression.triangles,2);
  assert.equal(packed.compression.topologyPreserved,true);
  assert.ok(parseGlb(packed.bytes).document.extensionsRequired.includes('KHR_draco_mesh_compression'));
  const changed=Buffer.from(source.binary);
  changed.writeUInt16LE(2,source.document.bufferViews[3].byteOffset+2);
  changed.writeUInt16LE(1,source.document.bufferViews[3].byteOffset+4);
  await assert.rejects(compareDraco(writeGlb(source.document,changed),packed.bytes),/position|winding|triangle/i);
  const moved=structuredClone(source.document); moved.nodes[0].scale=[1,1,1];
  await assert.rejects(compareDraco(writeGlb(moved,source.binary),packed.bytes),/scene/i);
});

for(const [id,triangles,budget] of [['pet-320-full-nata',214240,1240124],['pet-1000-juice',86548,1000000]]) {
  test(`${id}: real Draco asset keeps all triangles within the download and precision budgets`, async () => {
    const file=path.resolve(__dirname,`../../public/models/bottles/${id}.glb`);
    assert.ok(fs.existsSync(file),'compressed bottle must exist');
    const bytes=fs.readFileSync(file), manifest=JSON.parse(fs.readFileSync(file.replace(/\.glb$/,'.manifest.json')));
    assert.ok(bytes.length<=budget,`${bytes.length} exceeds ${budget}`);
    assert.equal(hash(bytes),manifest.sha256);
    assert.equal(manifest.compression.extension,'KHR_draco_mesh_compression');
    assert.equal(manifest.compression.triangles,triangles);
    assert.equal(manifest.compression.topologyPreserved,true);
    assert.equal(manifest.compression.simplification,false);
    assert.ok(manifest.compression.maxPositionErrorMeters<=.00001);
    assert.ok(manifest.compression.maxNormalAngleDegrees<=.1);
    assert.ok(manifest.compression.maxUvErrorAt4096px<=.5);
    const { decodeDracoPrimitives }=require(helper);
    const decoded=await decodeDracoPrimitives(bytes);
    assert.equal(decoded.reduce((sum,p)=>sum+p.indices.length/3,0),triangles);
    for(const [index,p] of decoded.entries()) assert.equal(hash(Buffer.from(p.attributes.POSITION.buffer)),manifest.compression.decodedPositionHashes[index]);
  });
}

test('Draco retains a distinct secondary UV set and rejects corruption in that set', async () => {
  const {compressDraco,compareDraco,decodeDracoPrimitives}=require(helper), source=fixture();
  const uv1=new Float32Array([.2,.1,.6,.9,.8,.3,.9,.8]);
  source.document.bufferViews.push({buffer:0,byteOffset:source.binary.length,byteLength:uv1.byteLength});
  source.document.accessors.push({bufferView:4,componentType:5126,count:4,type:'VEC2'});
  source.document.meshes[0].primitives[0].attributes.TEXCOORD_1=4;
  const binary=Buffer.concat([source.binary,Buffer.from(uv1.buffer)]);
  source.document.buffers[0].byteLength=binary.length;
  const packed=await compressDraco(writeGlb(source.document,binary));
  const decoded=await decodeDracoPrimitives(packed.bytes);
  assert.ok(decoded[0].attributes.TEXCOORD_1);
  assert.notDeepEqual(decoded[0].attributes.TEXCOORD_0,decoded[0].attributes.TEXCOORD_1);
  const corrupt=Buffer.from(binary);corrupt.writeFloatLE(.75,source.binary.length);
  await assert.rejects(compareDraco(writeGlb(source.document,corrupt),packed.bytes),/UV|triangle/);
});
