const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const THREE=require('three');
const load=require('../lib/load-ts-source.cjs').createSourceLoader();
const resolve=name=>path.resolve(__dirname,'../../',name);

test('pull-cap Basil is independently selectable with silver cap and persistent native Basil optics',()=>{
 const {LAB_MODELS,getLabModelFamily,getModelMaterialDefaults,filterLabModelFamilies}=load(resolve('lib/labellab/catalog'));
 const {parsePreferences}=load(resolve('lib/labellab/preferences'));
 const id='glass-290-pullcap-basil',model=LAB_MODELS.find(m=>m.id===id);
 assert.ok(model,'pull-cap model must be available');
 const family=getLabModelFamily(id);assert.equal(family.id,'glass-290-pull-cap');
 assert.deepEqual(family.variants.map(v=>[v.modelId,v.order]),[[id,0],['glass-290-pullcap-chia',1],['glass-290-pullcap-milk',2]]);
 assert.ok(filterLabModelFamilies('pull cap').includes(family));
 assert.equal(model.asset.volumeMl,290);assert.equal(model.asset.cameraFraming,'bounds');
 assert.deepEqual(model.asset.materialSlots.inclusions,['basil-web-seed-gel']);
 const defaults=getModelMaterialDefaults(id),parsed=parsePreferences({modelId:id});
 for(const key of ['liquidType','liquidColor','liquidCustomized','capColor','capMetalness','capRoughness','bodyRoughness','liquidClarity','liquidDensity']) assert.equal(parsed[key],defaults[key],key);
 assert.equal(defaults.liquidType,'basil-seed');assert.equal(defaults.liquidCustomized,false);
 assert.equal(defaults.capColor,'#c0c0c0');assert.equal(defaults.capMetalness,1);
 assert.equal(defaults.capRoughness,.5527864098548889);
 assert.equal(model.appearance.slots.label.baseColorMap,undefined);
 const edited=parsePreferences({modelId:id,capColor:'#ff0000',liquidColor:'#112233',liquidCustomized:true});
 assert.equal(edited.capColor,'#ff0000');assert.equal(edited.liquidColor,'#112233');assert.equal(edited.liquidCustomized,true);
});

test('pull-cap seed metadata produces one metric-correct hydrated layer through the pooled renderer',async()=>{
 const {parseGlb}=require('../lib/bottle-compression.cjs');
 const {document:d}=parseGlb(fs.readFileSync(resolve('public/models/bottles/glass-290-pullcap-basil.glb')));
 const metadata=d.nodes.find(n=>n.extras?.basilWebSeeds).extras.basilWebSeeds;
 const {isBasilWebSeedMetadata}=load(resolve('lib/viewer/basil-web-seed-contract'));
 assert.equal(isBasilWebSeedMetadata(metadata),true);
 const root=new THREE.Group(),owner=new THREE.Group();owner.scale.setScalar(.1);owner.userData.basilWebSeeds=metadata;root.add(owner);
 const slots={body:['Body','Neck','GlassBase'],cap:['SilverCap'],label:['PaperLabel'],liquid:['Water'],inclusions:['basil-web-seed-gel']};
 for(const name of ['Body','Neck','SilverCap','PaperLabel','Water']){
  const mat=new THREE.MeshPhysicalMaterial();mat.name=name;mat.userData.basilProfile='basil-web-v1';
  if(name==='Neck') mat.userData.basilWebNeckWallMetres=.0013;
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(.34,.34,1.4,16),mat);mesh.name=name;owner.add(mesh);
 }
 const {createPooledAppearanceHandle}=load(resolve('lib/viewer/pooled-appearance'));
 const {prepareBasilWebLayers}=load(resolve('lib/viewer/basil-web-materials'));
 const {renderBottleScene}=load(resolve('lib/viewer/bottle-materials'));
 const asset={id:'glass-290-pullcap-basil',packaging:'glass',materialSlots:slots};
 const pool=createPooledAppearanceHandle(root,asset,{editable:true});
 await pool.apply({slots:{cap:{color:'#c0c0c0',metalness:1,roughness:.5527864098548889},liquid:{color:'#f14e78'}}});
 const gels=owner.children.filter(n=>n.userData.basilWebGenerated);assert.equal(gels.length,1);
 const neck=owner.children.find(n=>n.name==='Neck');
 assert.equal(neck.material.side,THREE.FrontSide,'whole-shell Neck trace runs once from the visible interface');
 assert.equal(neck.material.thickness,.0026,'neck optical path includes its two glass walls in metres');
 assert.equal(neck.material.ior,1.52);assert.equal(neck.material.transmission,1);
 assert.equal(neck.material.customProgramCacheKey(),'pullcap-hollow-glass-neck-v1');
 const gel=gels[0];assert.equal(gel.count,330);assert.ok(gel instanceof THREE.InstancedMesh);
 assert.equal(gel.material.customProgramCacheKey(),'basil-web-source-core-gel-v2');
 const matrix=new THREE.Matrix4(),ratios=gel.geometry.getAttribute('basilCoreRatio');
 for(let i=0;i<gel.count;i++){
  gel.getMatrixAt(i,matrix);assert.ok(matrix.determinant()>0);
  const values=matrix.elements,seed=metadata.seeds[i];
  for(let j=0;j<3;j++){
   const r=1/Math.hypot(...seed[['inverseX','inverseY','inverseZ'][j]]);
   const outer=Math.hypot(...values.slice(j*4,j*4+3));
   assert.ok(Math.abs((outer-r)*.1-.0008321520913910748)<1e-8,'hydrated thickness must match Unity in metres');
   assert.ok(Math.abs(ratios.array[i*3+j]-r/(r+metadata.gelThicknessNative))<1e-6);
  }
 }
 prepareBasilWebLayers(root,asset);assert.equal(owner.children.filter(n=>n.userData.basilWebGenerated).length,1);
 const beauty={},capture={};let target=beauty;const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
 const renderer={getRenderTarget:()=>target,render:()=>{
  for(const pass of [capture,beauty]){target=pass;for(const mesh of owner.children.filter(n=>n instanceof THREE.Mesh)){
   const count=mesh.geometry.drawRange.count,captured=mesh===gel||mesh.name==='Water',solid=['SilverCap','PaperLabel'].includes(mesh.name);
   mesh.onBeforeRender(renderer,scene,camera,mesh.geometry,mesh.material,null);
   if(captured||solid)assert.equal(mesh.geometry.drawRange.count,(pass===capture)===captured?count:0,mesh.name);
   mesh.onAfterRender(renderer,scene,camera,mesh.geometry,mesh.material,null);
  }}
 }};
 renderBottleScene(renderer,scene,camera);
 assert.equal(owner.children.find(n=>n.name==='SilverCap').material.color.getHexString(),'c0c0c0');
 pool.dispose();root.traverse(n=>{if(n instanceof THREE.Mesh){n.geometry.dispose();n.material.dispose();}});
});
