const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {writeGlb,parseGlb}=require('../lib/bottle-compression.cjs');
function fixture(names){return writeGlb({asset:{version:'2.0'},scene:0,scenes:[{nodes:[]}],nodes:[],materials:names.map(name=>({name})),buffers:[{byteLength:0}]},Buffer.alloc(0));}
test('batch importer preserves Ring optical baseline after separating its semantic slot',()=>{
 const {BATCH_BOTTLES,adaptBottle}=require('../import-bottle-batch.cjs');
 for(const entry of BATCH_BOTTLES.filter(entry=>entry.slots.ring)){
  const output=adaptBottle(fixture(Object.values(entry.slots).flat()),entry);
  const ring=parseGlb(output).document.materials.find(material=>material.name==='Ring');
  assert.equal(ring.pbrMetallicRoughness.roughnessFactor,.19);
  assert.equal(ring.extensions.KHR_materials_transmission.transmissionFactor,.7);
  assert.equal(ring.extensions.KHR_materials_volume.thicknessFactor,.0008);
 }
});
test('PET Draco importer preserves Ring optical baseline without publishing test assets',async()=>{
 const file=path.resolve(__dirname,'../import-pet-draco.cjs');
 for(const kind of ['320-full','1000']){
  const names=kind==='320-full'?['320mlBottleBody','Ring','PlasticCap','Label','NataDeCocoWater','Nata de coco']:['PlasticBody','Ring','PlasticCap','Label','Water'];
  const writes=[],source=fixture(names),loadedModule={exports:{}};
  const nativeRequire=require('node:module').createRequire(file);
  const fakeRequire=request=>request==='node:fs'?{readFileSync:()=>source,writeFileSync:(_file,bytes)=>writes.push(bytes)}:request==='./lib/draco-bottle-compression.cjs'?{compressDraco:async bytes=>({bytes,compression:{triangles:0,maxPositionErrorMeters:0,maxUvErrorAt4096px:0,maxNormalAngleDegrees:0}})}:nativeRequire(request);
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:fakeRequire,module:loadedModule,__dirname:path.dirname(file),console:{log(){}}});
  await loadedModule.exports.importBottle('test-source.glb',kind);
  const ring=parseGlb(writes[0]).document.materials.find(material=>material.name==='Ring');
  assert.equal(ring.pbrMetallicRoughness.roughnessFactor,.19);
  assert.equal(ring.extensions.KHR_materials_transmission.transmissionFactor,.96);
  assert.equal(ring.extensions.KHR_materials_volume.thicknessFactor,.0009);
 }
});
