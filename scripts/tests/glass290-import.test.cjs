const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {parseGlb,hash}=require('../lib/bottle-compression.cjs');
const {decodeDracoPrimitives}=require('../lib/draco-bottle-compression.cjs');
for(const [kind,triangles] of [['chia',118045],['milk',62725]])test(`Glass290 ${kind}: canonical Basil shell and preserved variant parts`,async()=>{
 const file=path.resolve(__dirname,`../../public/models/bottles/glass-290-${kind}.glb`);
 assert.ok(fs.existsSync(file),'New glass asset must exist');
 const bytes=fs.readFileSync(file),m=JSON.parse(fs.readFileSync(file.replace('.glb','.manifest.json'))),{document:d}=parseGlb(bytes);
 assert.equal(hash(bytes),m.sha256);assert.equal(bytes.length,m.bytes);assert.ok(bytes.length<=512000);
 assert.equal(m.compression.triangles,triangles);assert.equal(m.compression.simplification,false);
 assert.ok(m.compression.maxPositionErrorMeters<=.00001);assert.ok(m.compression.maxNormalAngleDegrees<=.1);assert.ok(m.compression.maxUvErrorAt4096px<=.5);
 assert.deepEqual(d.nodes.at(-1).scale,[.1,.1,.1]);
 assert.deepEqual(m.materialSlots.body,['Body','Neck']);
 assert.equal(!!d.nodes.find(n=>n.name==='Base'&&n.mesh!==undefined),false,'malformed Base mesh must be removed');
 for(const name of ['GoldenCap','PaperLabel']){const mat=d.materials.find(m=>m.name===name);assert.equal(mat.alphaMode,'OPAQUE');assert.equal(mat.doubleSided,true);}
 assert.equal(!!d.nodes.find(n=>n.name==='Seeds'),kind==='chia');
 assert.equal(!!m.materialSlots.inclusions,kind==='chia');
 const decoded=await decodeDracoPrimitives(bytes);assert.equal(decoded.reduce((n,p)=>n+p.indices.length/3,0),triangles);
 if(kind==='chia') {const node=d.nodes.find(n=>n.name==='Seeds');assert.deepEqual(decoded.filter(q=>q.mi===node.mesh).map(q=>hash(Buffer.from(q.attributes.POSITION.buffer))),['cc7e4b75450d294409e83134f5be3532b24fe68bfe5b46e65d653ff6f9d613df','1f7a5052545ae8c9af079787181d3c29f4ee9e37129c715a7ff151a66979fb27','60bfd5d1059082a4d53be0dcbb0eb83a84e6cedb9525958a2b5980317693b5a2'],'original source seed positions must remain unchanged');}
 const basilBytes=fs.readFileSync(path.resolve(__dirname,'../../public/models/bottles/glass-290-basil-web.glb'));
 const basil=await decodeDracoPrimitives(basilBytes);
 for(const [name,mi] of [['Body',0],['Neck',1],['Water',4]]) {
   const node=d.nodes.find(n=>n.name===name), actual=decoded.find(q=>q.mi===node.mesh), expected=basil.find(q=>q.mi===mi);
   assert.deepEqual(node.scale,[1,1,1]); assert.equal(node.translation,undefined);
   assert.equal(actual.indices.length,expected.indices.length);
   const points=[];for(let i=0;i<actual.attributes.POSITION.length;i+=3)points.push([actual.attributes.POSITION[i]*.1,actual.attributes.POSITION[i+1]*.1-.09023135900497437,actual.attributes.POSITION[i+2]*.1]);
   const grid=new Map(),cell=1e-5;for(const p of points){const k=p.map(v=>Math.floor(v/cell)).join(',');if(!grid.has(k))grid.set(k,[]);grid.get(k).push(p);}
   const ep=expected.attributes.POSITION;for(let i=0;i<ep.length;i+=3){const p=Array.from(ep.slice(i,i+3)),c=p.map(v=>Math.floor(v/cell));let found=false;for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)for(const q of grid.get([c[0]+x,c[1]+y,c[2]+z].join(','))??[])if(Math.hypot(...p.map((v,j)=>v-q[j]))<1e-6)found=true;assert.ok(found,`${name} must retain canonical Basil position ${i/3}`);}
   if(name==='Water') {const pos=actual.attributes.POSITION,edges=new Map(),key=j=>Array.from(pos.slice(j*3,j*3+3)).map(v=>Math.round(v*1e5)).join(',');for(let i=0;i<actual.indices.length;i+=3)for(let j=0;j<3;j++){const k=[key(actual.indices[i+j]),key(actual.indices[i+(j+1)%3])].sort().join('|');edges.set(k,(edges.get(k)||0)+1);}assert.equal([...edges.values()].filter(v=>v===1).length,0,'Water must have a closed bottom');}
 }
 for(const [i,p] of decoded.entries())for(const [s,a] of Object.entries(p.attributes))assert.equal(hash(Buffer.from(a.buffer)),m.compression.decodedAttributeHashes[i][s]);
});

test('Glass290 Chia and Milk each have a unique poster rather than borrowed Basil artwork',()=>{
 const dir=path.resolve(__dirname,'../../public/models/bottles');
 const hashes=['basil','chia','milk'].map(kind=>hash(fs.readFileSync(path.join(dir,`glass-290-${kind}-poster.webp`))));
 assert.equal(new Set(hashes).size,3,'each variant needs its own real render');
});
