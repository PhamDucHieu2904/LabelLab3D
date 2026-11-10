const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {parseGlb,writeGlb,hash}=require('./lib/bottle-compression.cjs');
const {compressDraco}=require('./lib/draco-bottle-compression.cjs');

async function importBottle(source,kind) {
  const nata=kind==='320-full';assert.ok(nata||kind==='1000','Expected 320-full or 1000');
  const id=nata?'pet-320-full-nata':'pet-1000-juice', input=fs.readFileSync(source);
  const {document:d,binary}=parseGlb(input);
  const slots=nata?{body:['320mlBottleBody'],ring:['Ring'],cap:['PlasticCap'],label:['Label'],liquid:['NataDeCocoWater'],inclusions:['Nata de coco']}
    :{body:['PlasticBody'],ring:['Ring'],cap:['PlasticCap'],label:['Label'],liquid:['Water']};
  for(const name of Object.values(slots).flat()) assert.ok(d.materials.some(m=>m.name===name),`Missing ${name}`);
  const root=d.nodes.length;d.nodes.push({name:`PET_${nata?'320_Full':'1000'}_Web_Metres`,scale:[.1,.1,.1],children:d.scenes[d.scene??0].nodes});d.scenes[d.scene??0].nodes=[root];
  const physical=(m,transmission,thickness,ior)=>{m.extensions={KHR_materials_transmission:{transmissionFactor:transmission},KHR_materials_volume:{thicknessFactor:thickness},KHR_materials_ior:{ior}};};
  for(const m of d.materials) {
    m.extras={...m.extras,bottleProfile:nata?'nata-pet-v1':'juice-pet-v1',...(m.name==='Ring'?{[nata?'nataRing':'juiceRing']:true}:{})};
    m.pbrMetallicRoughness={baseColorFactor:[1,1,1,1],metallicFactor:0,roughnessFactor:.28};m.doubleSided=false;delete m.extensions;
    if(slots.body.includes(m.name)||slots.ring.includes(m.name)){m.pbrMetallicRoughness.roughnessFactor=m.name==='Ring'?.19:.075;physical(m,.96,m.name==='Ring'?.0009:.0008,1.46);}
    else if(slots.cap.includes(m.name)) m.pbrMetallicRoughness.roughnessFactor=.29;
    else if(slots.liquid.includes(m.name)) {m.pbrMetallicRoughness.baseColorFactor=nata?[1,.057805,.029557,1]:[.80695,.46778,.07819,1];m.pbrMetallicRoughness.roughnessFactor=.12;physical(m,nata?.85:.35,.025,1.35);}
    else if(slots.inclusions?.includes(m.name)){m.pbrMetallicRoughness.roughnessFactor=.18;physical(m,.6,.001,1.35);}
  }
  // Original geometry and node transforms remain intact; no liquid inset is
  // assumed for new shapes. Apply only the existing metre/material contract.
  d.extensionsUsed=[...new Set([...(d.extensionsUsed??[]),'KHR_materials_transmission','KHR_materials_volume','KHR_materials_ior'])];
  d.asset.extras={...d.asset.extras,labellabImport:{sourceName:path.basename(source),sourceSha256:hash(input),units:'metres',geometry:'all triangles retained'}};
  const adapted=writeGlb(d,binary), {bytes,compression}=await compressDraco(adapted);
  const budget=nata?1240124:1000000;
  assert.ok(bytes.length<=budget,`${id} ${bytes.length} exceeds ${budget} byte budget`);
  const manifest={id,src:`/models/bottles/${id}.glb`,sourceName:path.basename(source),sourceBytes:input.length,sourceSha256:hash(input),bytes:bytes.length,sha256:hash(bytes),binarySha256:hash(parseGlb(bytes).binaryChunk),sourceToMetres:.1,units:'metres',volumeMl:nata?320:1000,defaultLiquid:nata?'nata-de-coco':'fruit-juice',materialSlots:slots,compression};
  const output=path.resolve(__dirname,`../public/models/bottles/${id}.glb`);
  fs.writeFileSync(output,bytes);fs.writeFileSync(output.replace(/\.glb$/,'.manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  console.log(`${id}: ${input.length} -> ${bytes.length} bytes; ${compression.triangles} triangles; max error ${compression.maxPositionErrorMeters*1000} mm, ${compression.maxUvErrorAt4096px} px at 4K, ${compression.maxNormalAngleDegrees} degrees.`);
}
if(require.main===module) importBottle(process.argv[2],process.argv[3]).catch(error=>{console.error(error);process.exitCode=1;});
module.exports={importBottle};
