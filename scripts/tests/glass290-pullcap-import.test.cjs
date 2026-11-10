const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const out=path.resolve(__dirname,'../../public/models/bottles/glass-290-pullcap-basil.glb');
test('pull-cap import publishes 330 fitted hydrated seeds with provenance',()=>{assert.ok(fs.existsSync(out),'run import-glass290-pullcap.cjs first');const manifest=JSON.parse(fs.readFileSync(out.replace('.glb','.manifest.json')));assert.equal(manifest.id,'glass-290-pullcap-basil');assert.equal(manifest.bytes,fs.statSync(out).size);assert.ok(manifest.bytes<=512000);assert.equal(manifest.seedInstances.count,330);assert.equal(manifest.seedInstances.gelThicknessNative,0.008321520913910748);assert.deepEqual(manifest.seedInstances.nativeToGlbMatrix,[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);assert.equal(manifest.sourceToMetres,.1);assert.equal(manifest.compression.extension,'KHR_draco_mesh_compression');assert.equal(manifest.compression.precisionBits.POSITION,18);assert.equal(manifest.compression.precisionBits.NORMAL,14);assert.equal(manifest.compression.precisionBits.TEXCOORD_0,16);});
const {parseGlb}=require('../lib/bottle-compression.cjs');const {decodeDracoPrimitives}=require('../lib/draco-bottle-compression.cjs');
test('pull-cap Water bottom is closed without boundary edges after seam weld',async()=>{const d=parseGlb(fs.readFileSync(out)).document, water=d.nodes.find(n=>n.name==='Water'),decoded=await decodeDracoPrimitives(fs.readFileSync(out)),p=decoded.find(p=>p.mi===water.mesh),pos=p.attributes.POSITION,ids=[],weld=new Map(),edges=new Map();for(let i=0;i<pos.length;i+=3){const key=[pos[i],pos[i+1],pos[i+2]].map(v=>Math.round(v/1e-5)).join(',');if(!weld.has(key))weld.set(key,weld.size);ids.push(weld.get(key));}for(let i=0;i<p.indices.length;i+=3)for(let k=0;k<3;k++){const a=ids[p.indices[i+k]],b=ids[p.indices[i+(k+1)%3]],key=a<b?`${a},${b}`:`${b},${a}`;edges.set(key,(edges.get(key)||0)+1);}assert.equal([...edges.values()].filter(v=>v===1).length,0,'Water must be watertight');const m=JSON.parse(fs.readFileSync(out.replace('.glb','.manifest.json')));assert.equal(m.geometryRepair.waterBottom.addedTriangles,0);});

test('pull-cap Neck has a real inner glass wall for refraction', async () => {
 const d=parseGlb(fs.readFileSync(out)).document, decoded=await decodeDracoPrimitives(fs.readFileSync(out));
 const node=d.nodes.find(n=>n.name==='Neck'), primitive=d.meshes[node.mesh].primitives[0];
 const p=decoded.find(q=>q.mi===node.mesh && q.pi===d.meshes[node.mesh].primitives.indexOf(primitive));
 assert.ok(p,'Neck primitive must be present');
 const radiiByY=new Map(), normals=p.attributes.NORMAL;
 for(let i=0;i<p.attributes.POSITION.length;i+=3){const y=Math.round(p.attributes.POSITION[i+1]*1e4)/1e4,r=Math.hypot(p.attributes.POSITION[i],p.attributes.POSITION[i+2]);const list=radiiByY.get(y)||[];list.push(r);radiiByY.set(y,list);}
 assert.ok([...radiiByY.values()].some(list=>new Set(list.map(v=>Math.round(v*1e5))).size>=2),'Neck must contain paired inner/outer radial surfaces');
 let inward=0;for(let i=0;i<normals.length;i+=3){const x=p.attributes.POSITION[i],z=p.attributes.POSITION[i+2],dot=x*normals[i]+z*normals[i+2];if(dot<-.0001)inward++;}
 assert.ok(inward>0,'Neck inner surface must have reversed-facing normals');
 const welded=new Map(),ids=[],edges=new Map(),pos=p.attributes.POSITION;
 for(let i=0;i<pos.length;i+=3){const key=[pos[i],pos[i+1],pos[i+2]].map(v=>Math.round(v/1e-5)).join(',');if(!welded.has(key))welded.set(key,welded.size);ids.push(welded.get(key));}
 for(let i=0;i<p.indices.length;i+=3)for(let j=0;j<3;j++){const a=ids[p.indices[i+j]],b=ids[p.indices[i+(j+1)%3]],key=a<b?`${a},${b}`:`${b},${a}`;edges.set(key,(edges.get(key)||0)+1);}
 assert.equal([...edges.values()].filter(n=>n!==2).length,0,'Every welded Neck edge must have exactly two incident triangles');
 const m=JSON.parse(fs.readFileSync(out.replace('.glb','.manifest.json')));
 assert.equal(m.geometryRepair.neckShell.thicknessMetres,.0013);
 assert.ok(m.geometryRepair.neckShell.addedTriangles>0);
});






