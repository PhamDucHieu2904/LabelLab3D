const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const THREE=require('three');
const load=require('../lib/load-ts-source.cjs').createSourceLoader();
const resolve=name=>path.resolve(__dirname,'../../',name);

function buildVariant(kind){
  const root=new THREE.Group();
  const basil=kind==='basil';
  const profile=basil?'basil-web-v1':'glass-290-v1';
  const names=basil
    ? [['basil-web-outer','Body'],['basil-web-neck','Neck'],['basil-gold-cap','Golden Cap'],['printed-label','Label'],['basil-web-liquid','Water']]
    : [['Body','Body'],['Neck','Neck'],['GoldenCap','Golden Cap'],['PaperLabel','Label'],['Water','Water']];
  const slots=basil
    ? {body:['basil-web-outer','basil-web-neck'],cap:['basil-gold-cap'],label:['printed-label'],liquid:['basil-web-liquid'],inclusions:[]}
    : {body:['Body','Neck'],cap:['GoldenCap'],label:['PaperLabel'],liquid:['Water'],...(kind==='chia'?{inclusions:['Chia Seeds']}:{})};
  const meshes={};
  for(const [name,nodeName] of names){
    const material=new THREE.MeshPhysicalMaterial({color:'#ffffff'}); material.name=name;
    material.userData= basil ? {basilProfile:profile} : {bottleProfile:profile,...(name==='Water'?{bottleLiquidKind:kind}:{})};
    const geometry=name.toLowerCase().includes('neck') || name==='Neck'
      ? new THREE.CylinderGeometry(.015,.015,.03,32,2,true)
      : name==='Water' || name==='basil-web-liquid' ? new THREE.CylinderGeometry(.028,.028,.10,32) : new THREE.BoxGeometry(.06,.06,.06);
    const mesh=new THREE.Mesh(geometry,material); mesh.name=nodeName; mesh.userData=basil?{basilProfile:profile}:{bottleProfile:profile}; root.add(mesh); meshes[nodeName]=mesh;
  }
  if(kind==='chia'){
    const material=new THREE.MeshPhysicalMaterial({color:'#302a24'});material.name='Chia Seeds';material.userData={bottleProfile:profile};
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(.002,8,6),material);mesh.name='Chia Seeds';root.add(mesh);meshes['Chia Seeds']=mesh;
  }
  return {root,meshes,asset:{id:basil?'basil-strawberry':`glass-290-${kind}`,packaging:'glass',materialSlots:slots}};
}

test('all 290 ml screw-cap variants use the hollow glass Neck tracer',()=>{
  const {basilWebMaterialRole,createBasilWebBottleMaterialContext}=load(resolve('lib/viewer/basil-web-materials'));
  for(const kind of ['basil','chia','milk']){
    const {root,meshes,asset}=buildVariant(kind); root.updateMatrixWorld(true);
    const context=createBasilWebBottleMaterialContext(root,asset); assert.ok(context,kind);
    for(const mesh of Object.values(meshes)){
      const material=mesh.material;
      const role=basilWebMaterialRole(asset,mesh,material);
      if(role) context.configure(material,mesh,role,kind==='milk'?'#fff5e4':'#f14e78');
    }
    const neck=meshes.Neck;
    assert.equal(neck.material.customProgramCacheKey(),'pullcap-hollow-glass-neck-v1',kind);
    assert.equal(neck.material.transmission,1,kind);
    assert.equal(neck.material.thickness,.0026,kind);
    root.traverse(node=>{if(node instanceof THREE.Mesh){node.geometry.dispose();node.material.dispose();}});
    context.dispose?.();
  }
});

test('screw-cap Chia and Milk GLBs carry the Neck tracer wall metadata',()=>{
  for(const kind of ['chia','milk']){
    const glb=fs.readFileSync(resolve(`public/models/bottles/glass-290-${kind}.glb`));
    const {document}=require('../lib/bottle-compression.cjs').parseGlb(glb);
    const neck=document.materials.find(material=>material.name==='Neck');
    assert.ok(neck,kind); assert.equal(neck.extras?.basilWebNeckWallMetres,.0013,kind);
  }
});
