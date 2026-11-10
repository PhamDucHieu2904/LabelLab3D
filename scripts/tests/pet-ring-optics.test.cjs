const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path'),THREE=require('three');
const load=require('../lib/load-ts-source.cjs').createSourceLoader();
test('PET collar binds closed optical volume and live cap finish through pooled transforms, then disposes',()=>{
 const {createPetRingMaterialContext}=load(path.resolve(__dirname,'../../lib/viewer/pet-ring-context.ts'));
 const root=new THREE.Group(),source=new THREE.MeshPhysicalMaterial();source.name='Ring';
 const mesh=new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(.01,0),new THREE.Vector2(.014,0),new THREE.Vector2(.014,.002),new THREE.Vector2(.01,.002)],24),source);
 const cap=new THREE.Mesh(new THREE.CylinderGeometry(.011,.011,.005,24),new THREE.MeshStandardMaterial());cap.material.name='Cap';cap.position.y=.004;root.add(mesh,cap);
 const ctx=createPetRingMaterialContext(root,{packaging:'pet',materialSlots:{cap:['Cap']}});
 const material=source.clone();ctx.configure(material,mesh);ctx.registerCap(cap.material);
 const shader={uniforms:{},vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader};material.onBeforeCompile(shader,{});
 const clone=mesh.clone(),parent=new THREE.Group();parent.scale.setScalar(3);parent.add(clone);parent.updateMatrixWorld(true);
 const camera=new THREE.PerspectiveCamera();camera.position.z=.2;camera.updateMatrixWorld();
 cap.material.color.set('#1133cc');material.onBeforeRender({getContextAttributes:()=>({premultipliedAlpha:false})},new THREE.Scene(),camera,mesh.geometry,clone,null);
 assert.equal(shader.uniforms.petRingCapColor.value.getHexString(),'1133cc','cap color must reach ring reflection after live edit');
 assert.equal(shader.uniforms.petRingToScene.value.elements[0],3,'visible pooled draw controls trace transform');
 assert.ok(shader.uniforms.petRingTriangles.value.image.data.length>0);
 assert.equal(shader.uniforms.petRingIor.value,1.57);
 material.roughness=.25;material.onBeforeRender({getContextAttributes:()=>({premultipliedAlpha:false})},new THREE.Scene(),camera,mesh.geometry,clone,null);
 assert.equal(shader.uniforms.petRingRoughness.value,.25,'explicit roughness must reach the custom optical shader');
 const disposed=[];for(const key of ['petRingTriangles','petRingNodes','petRingUvs'])shader.uniforms[key].value.addEventListener('dispose',()=>disposed.push(key));ctx.dispose();assert.equal(disposed.length,3);
});


test('pooled PET appearances share immutable optical geometry until the final owner disposes',()=>{
 const {createPetRingMaterialContext}=load(path.resolve(__dirname,'../../lib/viewer/pet-ring-context.ts'));
 const root=new THREE.Group(),source=new THREE.MeshPhysicalMaterial();source.name='Ring';
 const mesh=new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(.01,0),new THREE.Vector2(.014,0),new THREE.Vector2(.014,.002),new THREE.Vector2(.01,.002)],24),source);root.add(mesh);
 const clone=root.clone(true),asset={packaging:'pet',materialSlots:{}};
 const a=createPetRingMaterialContext(root,asset),b=createPetRingMaterialContext(clone,asset);
 function shader(ctx,mesh){const m=source.clone();ctx.configure(m,mesh);const s={uniforms:{},vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader};m.onBeforeCompile(s,{});return s;}
 const x=shader(a,mesh),y=shader(b,clone.children[0]);
 assert.equal(x.uniforms.petRingTriangles.value,y.uniforms.petRingTriangles.value,'pooled flavors must not duplicate immutable BVH textures');
 let disposed=0;x.uniforms.petRingTriangles.value.addEventListener('dispose',()=>disposed++);a.dispose();assert.equal(disposed,0);b.dispose();assert.equal(disposed,1);
});
