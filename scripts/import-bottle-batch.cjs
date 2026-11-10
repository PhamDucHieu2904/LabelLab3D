const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {parseGlb,writeGlb,hash}=require('./lib/bottle-compression.cjs');
const {compressDraco}=require('./lib/draco-bottle-compression.cjs');

const sourceRoot='D:/3D model/Model Bottle Can/Blender Model 1/';
const BATCH_BOTTLES=[
  {id:'pet-1500-juice',source:sourceRoot+'Pet 1500ml model full label web.glb',volumeMl:1500,packaging:'pet',slots:{body:['PlasticBody'],ring:['Ring'],cap:['PlasticCap'],label:['Label'],liquid:['Water']}},
  {id:'pet-325-juice',source:'D:/3D model/325mlModel web.glb',volumeMl:325,packaging:'pet',slots:{body:['PlasticBody'],ring:['Ring'],cap:['Cap'],label:['Label'],liquid:['Water']}},
  {id:'pet-1000-short-juice',source:sourceRoot+'Pet 1L bottle model short web.glb',volumeMl:1000,packaging:'pet',splitWater:true,slots:{body:['Body'],cap:['Cap'],label:['Label'],liquid:['Water']}},
  {id:'pp-2000',source:sourceRoot+'PP 2L model web.glb',volumeMl:2000,packaging:'pp',slots:{body:['Body'],cap:['Cap'],label:['Label']},encodingMethod:'sequential'},
  {id:'pp-1250',source:sourceRoot+'PP 1.25L Model bottle web.glb',volumeMl:1250,packaging:'pp',slots:{body:['PPBody'],cap:['Cap'],label:['Label']}},
  {id:'pp-1000',source:sourceRoot+'PP 1L model web.glb',volumeMl:1000,packaging:'pp',slots:{body:['Body'],cap:['Cap'],label:['Label']}},
  {id:'pp-1000-2',source:sourceRoot+'PP 1L ver 2.glb',volumeMl:1000,packaging:'pp',slots:{body:['Body'],cap:['Cap'],label:['Label']}},
  {id:'pp-500',source:sourceRoot+'500 ml pp bottle web.glb',volumeMl:500,packaging:'pp',slots:{body:['Body'],cap:['Cap'],label:['Label']}},
  {id:'pp-500-2',source:sourceRoot+'500mlPPbottel2 web.glb',volumeMl:500,packaging:'pp',slots:{body:['Body'],cap:['Cap'],label:['Label']}},
];

/** Adapt only units and semantic materials; the source geometry buffers stay intact. */
function adaptBottle(input,entry) {
  const {document:d,binary}=parseGlb(input);
  assert.ok(!d.skins?.length&&!d.animations?.length,'This static-bottle adapter expects no skins/animations');
  if(entry.splitWater) {
    const water=d.nodes.find(node=>node.name==='Water');assert.ok(water?.mesh!==undefined,'Missing Water node');
    const mesh=d.meshes[water.mesh];
    assert.ok(d.nodes.filter(node=>node.mesh===water.mesh).length===1,'Water mesh must be independently bound');
    for(const primitive of mesh.primitives) {
      const material=structuredClone(d.materials[primitive.material]);material.name='Water';
      primitive.material=d.materials.length;d.materials.push(material);
    }
  }
  for(const name of Object.values(entry.slots).flat())assert.ok(d.materials.some(m=>m.name===name),`Missing material ${name}`);
  const root=d.nodes.length;
  d.nodes.push({name:entry.id+'_Web_Metres',scale:[.1,.1,.1],children:d.scenes[d.scene??0].nodes});
  d.scenes[d.scene??0].nodes=[root];
  const pp=entry.packaging==='pp';
  for(const m of d.materials) {
    delete m.extensions;
    m.alphaMode='OPAQUE';delete m.alphaCutoff;
    m.pbrMetallicRoughness={baseColorFactor:[1,1,1,1],metallicFactor:0,roughnessFactor:.28};
    m.doubleSided=entry.slots.cap.includes(m.name)||entry.slots.label.includes(m.name);
    m.extras={...m.extras,bottleProfile:pp?'pp-opaque-v1':'juice-pet-v1',...(m.name==='Ring'?{juiceRing:true}:{})};
    if(entry.slots.body.includes(m.name)||entry.slots.ring?.includes(m.name)) {
      m.pbrMetallicRoughness.roughnessFactor=pp?.3:m.name==='Ring'?.19:.075;
      if(!pp)m.extensions={KHR_materials_transmission:{transmissionFactor:m.name==='Ring'?.7:.96},KHR_materials_volume:{thicknessFactor:.0008},KHR_materials_ior:{ior:1.46}};
    } else if(entry.slots.cap.includes(m.name))m.pbrMetallicRoughness.roughnessFactor=.29;
    else if(entry.slots.liquid?.includes(m.name)) {
      m.pbrMetallicRoughness.baseColorFactor=[.80695,.46778,.07819,1];m.pbrMetallicRoughness.roughnessFactor=.12;
      m.extensions={KHR_materials_transmission:{transmissionFactor:.35},KHR_materials_volume:{thicknessFactor:.025},KHR_materials_ior:{ior:1.35}};
    }
  }
  if(!pp)d.extensionsUsed=[...new Set([...(d.extensionsUsed??[]),'KHR_materials_transmission','KHR_materials_volume','KHR_materials_ior'])];
  d.asset.extras={...d.asset.extras,labellabImport:{sourceName:path.basename(entry.source),sourceSha256:hash(input),units:'metres',geometry:'all triangles and UV sets retained'}};
  return writeGlb(d,binary);
}

async function importBatch(entries=BATCH_BOTTLES) {
  const results=[];
  // Validate every output before publishing any member of the batch.
  for(const entry of entries) {
    const input=fs.readFileSync(entry.source),adapted=adaptBottle(input,entry),{bytes,compression}=await compressDraco(adapted,{method:entry.encodingMethod ?? 'edgebreaker'});
    assert.ok(bytes.length<1000000,`${entry.id}: ${bytes.length} exceeds 1MB target`);
    const manifest={id:entry.id,src:`/models/bottles/${entry.id}.glb`,sourceName:path.basename(entry.source),sourceBytes:input.length,sourceSha256:hash(input),bytes:bytes.length,sha256:hash(bytes),binarySha256:hash(parseGlb(bytes).binaryChunk),units:'metres',sourceToMetres:.1,volumeMl:entry.volumeMl,packaging:entry.packaging,materialSlots:entry.slots,defaultLiquid:entry.slots.liquid?'fruit-juice':null,compression};
    results.push({entry,bytes,manifest});
    console.log(`${entry.id}: ${input.length} -> ${bytes.length} bytes; ${compression.triangles} triangles; ${compression.maxPositionErrorMeters*1000} mm / ${compression.maxUvErrorAt4096px} px4K / ${compression.maxNormalAngleDegrees} deg`);
  }
  for(const {entry,bytes,manifest} of results) {
    const output=path.resolve(__dirname,`../public/models/bottles/${entry.id}.glb`);
    fs.writeFileSync(output,bytes);fs.writeFileSync(output.replace(/\.glb$/,'.manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  }
  return results.map(result=>result.manifest);
}
if(require.main===module)importBatch().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={BATCH_BOTTLES,adaptBottle,importBatch};
