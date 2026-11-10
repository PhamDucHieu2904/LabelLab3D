const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {parseGlb,hash}=require('../lib/bottle-compression.cjs');
const {decodeDracoPrimitives}=require('../lib/draco-bottle-compression.cjs');
const THREE=require('three');

for(const kind of ['basil','chia','milk']) test(`updated pull-cap ${kind} keeps authored closed Water and correct inclusions`,async()=>{
 const file=path.resolve(__dirname,`../../public/models/bottles/glass-290-pullcap-${kind}.glb`);
 assert.ok(fs.existsSync(file),`${kind} asset is published`);
 const bytes=fs.readFileSync(file), manifest=JSON.parse(fs.readFileSync(file.replace('.glb','.manifest.json')));
 const {document:d}=parseGlb(bytes);
 assert.equal(hash(bytes),manifest.sha256);
 assert.ok(bytes.length<=512000,'web asset remains below 500 KiB');
 assert.equal(manifest.defaultLiquid,kind);
 assert.equal(manifest.geometryRepair.waterBottom.addedTriangles,0,'updated source water is already closed');
 assert.equal(manifest.geometryRepair.waterTop.sourceClosed,true);
 const decoded=await decodeDracoPrimitives(bytes),water=d.nodes.find(n=>n.name==='Water');
 const p=decoded.find(p=>p.mi===water.mesh);
 const pos=p.attributes.POSITION,top=Math.max(...Array.from(pos).filter((_,i)=>i%3===1));
 let upward=0;
 for(let i=0;i<p.indices.length;i+=3){const vs=[0,1,2].map(j=>p.indices[i+j]*3);if(vs.every(v=>Math.abs(pos[v+1]-top)<1e-4)){const [a,b,c]=vs;const ny=(pos[b+2]-pos[a+2])*(pos[c]-pos[a])-(pos[b]-pos[a])*(pos[c+2]-pos[a+2]);if(ny>0)upward++;}}
 assert.ok(upward>0,'authored liquid top is present and faces upward');
 const owner=d.nodes.find(n=>n.extras?.basilWebSeeds);
 if(kind==='basil'){assert.equal(owner.extras.basilWebSeeds.count,330);assert.deepEqual(manifest.materialSlots.inclusions,['basil-web-seed-gel']);}
 else {assert.equal(owner,undefined);assert.equal(manifest.seedInstances,undefined);}
 const seed=d.nodes.find(n=>n.name==='Seeds');
 if(kind==='chia'){assert.ok(seed.mesh!==undefined);assert.deepEqual(manifest.materialSlots.inclusions,['Chia Seeds']);}
 if(kind==='milk'){assert.equal(seed.mesh,undefined);assert.equal(manifest.materialSlots.inclusions,undefined);}
 assert.equal(d.materials.find(m=>m.name==='Water').extras.bottleLiquidKind,kind);
 assert.ok(manifest.compression.topologyPreserved);
});

for(const kind of ['basil','chia']) test(`pull-cap ${kind} label clears low-poly Body silhouette without changing height`,async()=>{
 const file=path.resolve(__dirname,`../../public/models/bottles/glass-290-pullcap-${kind}.glb`);
 const bytes=fs.readFileSync(file),{document:d}=parseGlb(bytes),decoded=await decodeDracoPrimitives(bytes);

 const node=name=>d.nodes.find(n=>n.name===name), mesh=(name)=>{const n=node(name),p=decoded.find(x=>x.mi===n.mesh),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p.attributes.POSITION,3));g.setIndex(new THREE.BufferAttribute(p.indices,1));const o=new THREE.Mesh(g,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));o.position.fromArray(n.translation||[0,0,0]);o.scale.fromArray(n.scale||[1,1,1]);if(n.rotation)o.quaternion.fromArray(n.rotation);const root=new THREE.Object3D();root.scale.setScalar(.1);root.add(o);root.updateMatrixWorld();return o};
 const label=mesh('Label'),body=mesh('Body'),pos=label.geometry.getAttribute('position'),index=label.geometry.index,ray=new THREE.Raycaster();
 let minGap=Infinity,minY=Infinity,maxY=-Infinity;
 for(let f=0;f<index.count/3;f++) {const points=[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1),new THREE.Vector3(.5,.5,0),new THREE.Vector3(0,.5,.5),new THREE.Vector3(.5,0,.5),new THREE.Vector3(1/3,1/3,1/3)];const verts=[0,1,2].map(c=>new THREE.Vector3().fromBufferAttribute(pos,index.getX(f*3+c)));for(const bary of points){const v=verts[0].clone().multiplyScalar(bary.x).addScaledVector(verts[1],bary.y).addScaledVector(verts[2],bary.z).applyMatrix4(label.matrixWorld);minY=Math.min(minY,v.y);maxY=Math.max(maxY,v.y);if(v.y>.085)continue;const radial=new THREE.Vector3(v.x,0,v.z),radius=radial.length();ray.set(new THREE.Vector3(0,v.y,0),radial.normalize());const hits=ray.intersectObject(body);if(hits.length)minGap=Math.min(minGap,(radius-hits.at(-1).distance)*1000);}}
 assert.ok(minGap>=.005,`label/body radial clearance ${minGap}mm`); assert.ok(Math.abs(minY-.0692)<.00001); assert.ok(Math.abs(maxY-.1487)<.00001);
 label.geometry.dispose(); label.material.dispose(); body.geometry.dispose(); body.material.dispose();
});

