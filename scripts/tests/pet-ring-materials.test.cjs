const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const THREE=require('three');
const cache=new Map();
function load(file){const name=file.endsWith('.ts')?file:`${file}.ts`;if(cache.has(name))return cache.get(name).exports;const m=new Module(name,module);m.filename=name;m.paths=module.paths;cache.set(name,m);m.require=request=>request.startsWith('.')?load(path.resolve(path.dirname(name),request)):require(request);m._compile(ts.transpileModule(fs.readFileSync(name,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,name);return m.exports;}
const {createAppearanceHandle}=load(path.resolve(__dirname,'../../lib/viewer/appearance.ts'));
const {setBottleBackdrop}=load(path.resolve(__dirname,'../../lib/viewer/bottle-backdrop.ts'));
const {createPooledAppearanceHandle}=load(path.resolve(__dirname,'../../lib/viewer/pooled-appearance.ts'));

function fixture(profile='juice-pet-v1',standard=false){
 const root=new THREE.Group(),meshes={};
 for(const name of ['Body','Ring','Water','Cap','Label']){
  const material=standard?new THREE.MeshStandardMaterial():new THREE.MeshPhysicalMaterial();material.name=name;
  material.userData={bottleProfile:profile,...(name==='Ring'?{juiceRing:true}:{})};
  if(name==='Water')material.color.set('#e8b64f');
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(.015,.015,.005,24),material);mesh.name=name;root.add(mesh);meshes[name]=mesh;
 }
 const asset={id:'ring-fixture',name:'PET',packaging:'pet',materialSlots:{body:['Body','Ring'],liquid:['Water'],cap:['Cap'],label:['Label']}};
 return {root,meshes,asset};
}

test('PET ring receives the separate Studio matte for refraction and releases it for transparent PNG',async()=>{
 const {root,meshes,asset}=fixture();const handle=createAppearanceHandle(root,asset);await handle.apply({});
 const ring=meshes.Ring.material,scene=new THREE.Scene(),backdrop=new THREE.Texture(),region=new THREE.Vector4(.1,.2,.6,.5);
 const shader={uniforms:{},vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader};ring.onBeforeCompile(shader,{});
 root.updateMatrixWorld(true);setBottleBackdrop(scene,backdrop,region);
 ring.onBeforeRender({getContextAttributes:()=>({premultipliedAlpha:false})},scene,new THREE.PerspectiveCamera(),meshes.Ring.geometry,meshes.Ring,null);
 assert.equal(shader.uniforms.bottleBackdropEnabled?.value,1,'Studio matte must reach the Ring draw');
 assert.equal(shader.uniforms.bottleBackdrop.value,backdrop);
 assert.deepEqual(shader.uniforms.bottleBackdropRegion.value.toArray(),region.toArray(),'export crop uses the same matte coordinates');
 setBottleBackdrop(scene,null);
 ring.onBeforeRender({getContextAttributes:()=>({premultipliedAlpha:false})},scene,new THREE.PerspectiveCamera(),meshes.Ring.geometry,meshes.Ring,null);
 assert.equal(shader.uniforms.bottleBackdropEnabled.value,0,'transparent export disables matte refraction');
 assert.equal(shader.uniforms.bottleBackdrop.value,null,'pooled material must not retain a released matte');
 handle.dispose();backdrop.dispose();
});

test('PET ring is an independent thick transmitting material even with imported alpha 1',async()=>{
 const {root,meshes,asset}=fixture();const handle=createAppearanceHandle(root,asset,{editable:true});
 await handle.apply({slots:{body:{metalness:.8,roughness:.7},cap:{color:'#ff0000'},liquid:{color:'#00ff00'}}});
 const ring=meshes.Ring.material;
 assert.ok(ring instanceof THREE.MeshPhysicalMaterial);
 assert.ok(ring.transmission>.85,'ring must refract instead of opaque ivory');
 assert.ok(ring.thickness>=.002,'solid collar has millimetres of optical thickness');
 assert.ok(ring.ior>=1.5 && ring.ior<1.65);
 assert.equal(ring.opacity,1,'physical transmission keeps surface coverage');
 assert.equal(ring.color.getHexString(),'ffffff');assert.equal(ring.metalness,0);assert.ok(ring.roughness<.15);
 assert.ok(handle.materialValues().ring,'ring gets its own semantic binding');
 handle.setLiveOverrides({body:{metalness:1,roughness:.95},liquid:{color:'#ff0000'},cap:{color:'#0000ff'}});
 assert.equal(ring.metalness,0);assert.ok(ring.roughness<.15);assert.equal(ring.color.getHexString(),'ffffff');
 assert.equal(meshes.Body.material.roughness,.95);
 const shader={uniforms:{},vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader};
 ring.onBeforeCompile(shader,{});
 assert.ok(shader.uniforms.petRingTriangles?.value,'actual flange interfaces own the optical path');
 assert.doesNotMatch(shader.fragmentShader,/1\.0 - diffuseColor\.a/,'imported alpha must not turn all clear PET into haze');
 handle.dispose();
});

test('PET ring keeps clear transmitted radiance instead of broad neutral diffuse haze',async()=>{
 const {root,meshes,asset}=fixture();const handle=createAppearanceHandle(root,asset,{editable:true});await handle.apply({});
 const ring=meshes.Ring.material;
 const shader={uniforms:{},vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader};
 ring.onBeforeCompile(shader,{});
 assert.doesNotMatch(shader.fragmentShader,/ringDiffuse\s*\*\s*ringScatterCoverage/,'clear PET must not fill the whole ring with neutral diffuse haze');
 assert.ok(ring.transmission>.99,'clear polymer transmits between localized reflections');
 handle.dispose();
});

test('standard imported PET Ring upgrades to physical material and metric rays survive source scale',async()=>{
 const {root,meshes,asset}=fixture('juice-pet-v1',true);meshes.Ring.scale.set(.2,1.3,.2);root.updateMatrixWorld(true);
 const handle=createAppearanceHandle(root,asset,{editable:true});await handle.apply({});
 const ring=meshes.Ring.material;assert.ok(ring instanceof THREE.MeshPhysicalMaterial);
 const shader={uniforms:{},vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader};ring.onBeforeCompile(shader,{});
 root.updateMatrixWorld(true);ring.onBeforeRender({getContextAttributes:()=>({premultipliedAlpha:false})},new THREE.Scene(),new THREE.PerspectiveCamera(),meshes.Ring.geometry,meshes.Ring,null);
 assert.ok(Math.abs(shader.uniforms.petRingWorldThickness.value-.0024)<1e-9);
 root.scale.setScalar(2);root.updateMatrixWorld(true);ring.onBeforeRender({getContextAttributes:()=>({premultipliedAlpha:false})},new THREE.Scene(),new THREE.PerspectiveCamera(),meshes.Ring.geometry,meshes.Ring,null);
 assert.ok(Math.abs(shader.uniforms.petRingWorldThickness.value-.0048)<1e-9);
 handle.dispose();
});

test('pooled PET Ring stays independent through appearance swaps and follows the visible draw transform',async()=>{
 const {root,meshes,asset}=fixture('juice-pet-v1',true);
 meshes.Ring.scale.set(.2,1.3,.2);
 const originals=Object.fromEntries(Object.entries(meshes).map(([name,mesh])=>[name,mesh.material]));
 const first={id:'first',slots:{body:{metalness:.1,roughness:.35},cap:{color:'#ff3300'},liquid:{color:'#00cc66'}}};
 const second={id:'second',slots:{body:{metalness:.8,roughness:.72},cap:{color:'#0033ff'},liquid:{color:'#cc0066'}}};
 const warmed=[],disposedRings=[];
 const pool=createPooledAppearanceHandle(root,asset,{editable:true,capacity:2,warmup:async prepared=>{warmed.push(prepared);}});
 pool.setWindow([first,second]);
 const renderParent=new THREE.Group();renderParent.scale.setScalar(2);renderParent.add(root);
 const renderer={getContextAttributes:()=>({premultipliedAlpha:false})},camera=new THREE.PerspectiveCamera();
 function optics(material){return {color:material.color.getHexString(),metalness:material.metalness,roughness:material.roughness,transmission:material.transmission,ior:material.ior,thickness:material.thickness};}
 function thicknessAtVisibleDraw(material,scale){
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader};
  material.onBeforeCompile(shader,{});renderParent.scale.setScalar(scale);renderParent.updateMatrixWorld(true);
  material.onBeforeRender(renderer,new THREE.Scene(),camera,meshes.Ring.geometry,meshes.Ring,null);
  assert.ok(Math.abs(shader.uniforms.petRingWorldThickness.value-.0024*scale)<1e-9,`visible draw uses ${scale}x overall scale without inheriting the source anisotropy`);
 }
 try {
  await pool.apply(first);const ringFirst=meshes.Ring.material,firstOptics=optics(ringFirst);
  ringFirst.addEventListener('dispose',()=>disposedRings.push('first'));
  assert.notEqual(ringFirst,originals.Ring);assert.ok(pool.materialValues().ring);
  assert.equal(meshes.Cap.material.color.getHexString(),'ff3300');assert.equal(meshes.Body.material.roughness,.35);
  pool.setLiveOverrides({body:{metalness:1,roughness:.95},cap:{color:'#ffcc00'},liquid:{color:'#0055ff'}});
  assert.deepEqual(optics(ringFirst),firstOptics);assert.equal(meshes.Cap.material.color.getHexString(),'ffcc00');
  thicknessAtVisibleDraw(ringFirst,2);

  await pool.apply(second);const ringSecond=meshes.Ring.material;
  ringSecond.addEventListener('dispose',()=>disposedRings.push('second'));
  assert.notEqual(ringSecond,ringFirst,'each pooled appearance owns its material instance');
  assert.deepEqual(optics(ringSecond),firstOptics);assert.equal(meshes.Body.material.roughness,.72);assert.equal(meshes.Cap.material.color.getHexString(),'0033ff');
  pool.setLiveOverrides({body:{metalness:.6,roughness:.8},cap:{color:'#006600'},liquid:{color:'#aa3300'}});
  assert.deepEqual(optics(ringSecond),firstOptics);thicknessAtVisibleDraw(ringSecond,3);

  await pool.apply(first);assert.equal(meshes.Ring.material,ringFirst,'swap back reuses the cached Ring material');
  assert.deepEqual(optics(meshes.Ring.material),firstOptics);thicknessAtVisibleDraw(ringFirst,4);
  assert.equal(warmed.length,2,'only the two material sets were prepared');
  assert.notEqual(warmed[0].getObjectByName('Ring'),meshes.Ring,'the visible Ring is not the source clone');
 } finally {pool.dispose();}
 assert.equal(meshes.Ring.material,originals.Ring,'disposing restores the imported material');
 assert.deepEqual(disposedRings.sort(),['first','second'],'both owned Ring material sets are disposed exactly once');
});


test('unprofiled PET ring follows restored original cap after a temporary appearance',async()=>{
 const {root,meshes,asset}=fixture('unprofiled');meshes.Cap.material.color.set('#ff0000');
 const handle=createAppearanceHandle(root,asset);await handle.apply({slots:{cap:{color:'#0033ff'}}});await handle.apply({});
 const shader={uniforms:{},vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader};
 meshes.Ring.material.onBeforeCompile(shader,{});root.updateMatrixWorld(true);
 meshes.Ring.material.onBeforeRender({getContextAttributes:()=>({premultipliedAlpha:false})},new THREE.Scene(),new THREE.PerspectiveCamera(),meshes.Ring.geometry,meshes.Ring,null);
 assert.equal(meshes.Cap.material.color.getHexString(),'ff0000');
 assert.equal(shader.uniforms.petRingCapColor.value.getHexString(),'ff0000','reflection must follow the visible restored cap');handle.dispose();
});
