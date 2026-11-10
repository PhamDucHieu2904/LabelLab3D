const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path=require('node:path'); const THREE=require('three');
const load=require('../lib/load-ts-source.cjs').createSourceLoader();
const { configureGlass300Base } = load(path.resolve(__dirname,'../../lib/viewer/glass-300-base.ts'));
const { parseGlb }=require('../lib/bottle-compression.cjs'); const {decodeDracoPrimitives}=require('../lib/draco-bottle-compression.cjs');

test('glass-300 Base preserves clear glass and the milk radiance behind measured metric thickness', async()=>{
 const bytes=fs.readFileSync('public/models/bottles/glass-300-milk.glb'); const {document:d}=parseGlb(bytes); const n=d.nodes.find(x=>x.name==='Base'); const part=(await decodeDracoPrimitives(bytes)).find(x=>x.mi===n.mesh); const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(part.attributes.POSITION,3));
 const mesh=new THREE.Mesh(g,new THREE.MeshPhysicalMaterial()); mesh.name='Base'; mesh.position.fromArray(n.translation);mesh.scale.fromArray(n.scale); const root=new THREE.Group();root.scale.setScalar(.1);root.add(mesh);root.updateMatrixWorld(true); const meshToMetric=new THREE.Matrix4().copy(mesh.matrixWorld);
 configureGlass300Base(mesh.material,mesh,meshToMetric);
 assert.ok(mesh.material.thickness>.00485&&mesh.material.thickness<.00487,`thickness ${mesh.material.thickness}`); assert.equal(mesh.material.color.getHexString(),'ffffff'); assert.equal(mesh.material.attenuationColor.getHexString(),'ffffff', 'clear Base cannot tint opaque milk gray'); assert.equal(mesh.material.attenuationDistance,Infinity); assert.equal(mesh.material.ior,1.52); assert.equal(mesh.material.roughness,.042); assert.equal(mesh.material.transmission,1); assert.equal(mesh.material.transparent,true); assert.equal(mesh.material.depthWrite,true); assert.equal(mesh.material.side,THREE.FrontSide); assert.equal(mesh.material.customProgramCacheKey(),'glass-300-base-clear-v2');
 g.dispose();mesh.material.dispose();
});

test('glass-300 Base keeps metric thickness stable under render object scaling',()=>{const m=new THREE.MeshPhysicalMaterial();const g=new THREE.BoxGeometry(.2,.0486,.2);const mesh=new THREE.Mesh(g,m);const metric=new THREE.Matrix4().makeScale(.1,.1,.1);configureGlass300Base(m,mesh,metric);const before=m.thickness;mesh.scale.set(2,3,4);assert.equal(m.thickness,before);g.dispose();m.dispose();});

test('glass-300 Base uses actual pooled render object transforms without mutating geometry',()=>{
 const g=new THREE.BoxGeometry(.2,.0486,.2), position=g.getAttribute('position'), values=Array.from(position.array);
 const mesh=new THREE.Mesh(g,new THREE.MeshPhysicalMaterial()), metric=new THREE.Matrix4().makeScale(.1,.1,.1);
 configureGlass300Base(mesh.material,mesh,metric);
 const shader={uniforms:{},vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader};
 mesh.material.onBeforeCompile(shader,{});
 const draw=new THREE.Mesh(g,mesh.material);draw.scale.set(.2,.3,.4);draw.updateMatrixWorld(true);
 mesh.material.onBeforeRender({},new THREE.Scene(),new THREE.PerspectiveCamera(),g,draw,null);
 assert.ok(Math.abs(shader.uniforms.glass300BaseWorldThickness.value-.01944)<1e-7);
 assert.equal(shader.uniforms.aloeClearRadiance.value,1);
 const cached=shader.uniforms.glass300BaseWorldThickness;
 draw.scale.setScalar(.05);draw.updateMatrixWorld(true);
 mesh.material.onBeforeRender({getContextAttributes:()=>({premultipliedAlpha:true})},new THREE.Scene(),new THREE.PerspectiveCamera(),g,draw,null);
 assert.equal(shader.uniforms.glass300BaseWorldThickness,cached);
 assert.ok(Math.abs(cached.value-.00243)<1e-7);assert.equal(shader.uniforms.aloeClearRadiance.value,.5);
 assert.ok(shader.fragmentShader.includes('return normalize( refractionVector ) * glass300BaseWorldThickness;'));
 assert.ok(!shader.fragmentShader.includes('return normalize( refractionVector ) * thickness * modelScale;'));
 assert.ok(shader.fragmentShader.includes('aloeCapturedCoverage'));assert.ok(shader.fragmentShader.includes('material.transmissionAlpha'));assert.ok(shader.fragmentShader.includes('gl_FragColor=vec4((totalDiffuse*capturedCoverage+totalSpecular)/max(coverage,.0001),coverage)'));
 assert.equal(mesh.geometry,g);assert.equal(g.getAttribute('position'),position);assert.deepEqual(Array.from(position.array),values);
 g.dispose();mesh.material.dispose();
});

test('glass-300 Base keeps colorless transmission under pooled world scale',()=>{
 const g=new THREE.BoxGeometry(.2,.0486,.2),m=new THREE.MeshPhysicalMaterial(),mesh=new THREE.Mesh(g,m),metric=new THREE.Matrix4().makeScale(.1,.1,.1);
 configureGlass300Base(m,mesh,metric); const shader={uniforms:{},vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader}; m.onBeforeCompile(shader,{}); mesh.scale.set(2,3,4);mesh.updateMatrixWorld(true);m.onBeforeRender({getContextAttributes:()=>({premultipliedAlpha:false})},new THREE.Scene(),new THREE.PerspectiveCamera(),g,mesh,null);
 assert.equal(m.attenuationDistance,Infinity); assert.equal(m.attenuationColor.getHexString(),'ffffff'); assert.ok(Math.abs(shader.uniforms.glass300BaseWorldThickness.value-.1944)<1e-6);
 g.dispose();m.dispose();
});



