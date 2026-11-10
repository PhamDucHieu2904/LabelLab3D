const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {parseGlb}=require('../lib/bottle-compression.cjs');
const {readAccessor,decodeDracoPrimitives}=require('../lib/draco-bottle-compression.cjs');
const root=path.resolve(__dirname,'../..');
test('all pull caps retain evaluated Blender oriented geometry and transform',async()=>{
 const {document:s,binary}=parseGlb(fs.readFileSync(path.join(root,'artifacts/pullcap-cap-evaluated.glb'))),p=s.meshes[0].primitives[0];
 const pos=readAccessor(s,binary,p.attributes.POSITION),idx=readAccessor(s,binary,p.indices),cell=.001,buckets=new Map();
 const center=(a,i,f)=>[0,1,2].map(k=>Math.floor((a[i[f*3]*3+k]+a[i[f*3+1]*3+k]+a[i[f*3+2]*3+k])/3/cell));
 for(let f=0;f<idx.length/3;f++){const key=center(pos,idx,f).join(',');if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(f);}
 for(const kind of ['basil','chia','milk']){
  const file=path.join(root,`public/models/bottles/glass-290-pullcap-${kind}.glb`),bytes=fs.readFileSync(file),{document:d}=parseGlb(bytes),n=d.nodes.find(n=>n.name==='Cap'),q=(await decodeDracoPrimitives(bytes)).find(p=>p.mi===n.mesh),used=new Set();
  assert.equal(q.indices.length,idx.length); for(const k of ['rotation','scale','translation'])assert.deepEqual(n[k],s.nodes[0][k]);
  let maximum=0;for(let f=0;f<q.indices.length/3;f++){
   const c=center(q.attributes.POSITION,q.indices,f);let best;
   for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)for(const sf of buckets.get([c[0]+x,c[1]+y,c[2]+z].join(','))||[]){if(used.has(sf))continue;for(let r=0;r<3;r++){let e=0;for(let k=0;k<3;k++){const a=idx[sf*3+(k+r)%3]*3,b=q.indices[f*3+k]*3;e=Math.max(e,Math.hypot(pos[a]-q.attributes.POSITION[b],pos[a+1]-q.attributes.POSITION[b+1],pos[a+2]-q.attributes.POSITION[b+2]));}if(!best||e<best.e)best={sf,e};}}
   assert.ok(best&&best.e<.0001,`${kind} oriented triangle ${f} differs from evaluated source`);used.add(best.sf);maximum=Math.max(maximum,best.e);
  }
  assert.equal(used.size,idx.length/3);const manifest=JSON.parse(fs.readFileSync(file.replace('.glb','.manifest.json')));assert.equal(manifest.geometryRepair.capEvaluatedTriangles,idx.length/3);assert.equal(manifest.geometryRepair.capSourceBlendSha256.length,64);
 }
});
