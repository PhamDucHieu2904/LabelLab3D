const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const THREE=require('three');
const load=require('../lib/load-ts-source.cjs').createSourceLoader();
const api=()=>load(path.resolve(__dirname,'../../lib/viewer/glass-neck-trace-data'));

function triangleAt(data,i){
 const a=data.triangles.image.data,p=i*24;
 return {a:new THREE.Vector3(...a.slice(p,p+3)),b:new THREE.Vector3(...a.slice(p,p+3)).add(new THREE.Vector3(...a.slice(p+4,p+7))),c:new THREE.Vector3(...a.slice(p,p+3)).add(new THREE.Vector3(...a.slice(p+8,p+11))),kind:a[p+7],normal:new THREE.Vector3(...a.slice(p+12,p+15))};
}

test('trace data honors groups, draw range, metric transforms, normals and retained UVs',()=>{
 const root=new THREE.Group();root.position.set(20,30,40);root.scale.setScalar(7);
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,1, 0,0,2,1,0,2,0,1,3, 0,0,4,1,0,4,0,1,5],3));
 geometry.setAttribute('normal',new THREE.Float32BufferAttribute(Array.from({length:9},()=>[0,-Math.SQRT1_2,Math.SQRT1_2]).flat(),3));
 geometry.setAttribute('uv',new THREE.Float32BufferAttribute([.1,.2,.3,.4,.5,.6, .2,.3,.4,.5,.6,.7, 0,0,0,0,0,0],2));
 geometry.setIndex([0,1,2,3,4,5,6,7,8]);geometry.addGroup(0,3,0);geometry.addGroup(3,3,1);geometry.addGroup(6,3,0);geometry.setDrawRange(0,6);
 const glass=new THREE.MeshStandardMaterial(),label=new THREE.MeshStandardMaterial();glass.name='glass';label.name='label';
 const mesh=new THREE.Mesh(geometry,[glass,label]);mesh.scale.set(2,3,4);mesh.position.set(1,2,3);root.add(mesh);
 const data=api().buildGlassNeckTraceData(root,(_m,material)=>material===glass?1:4);
 assert.equal(data.triangleCount,2);assert.equal(data.width,1024);
 const triangles=[triangleAt(data,0),triangleAt(data,1)];assert.deepEqual(triangles.map(t=>t.kind).sort(),[1,4]);
 const glassTriangle=triangles.find(t=>t.kind===1);for(const [actual,expected] of [[glassTriangle.a,[1,2,3]],[glassTriangle.b,[3,2,3]],[glassTriangle.c,[1,5,7]]])assert.ok(actual.distanceTo(new THREE.Vector3(...expected))<1e-6);
 assert.ok(glassTriangle.normal.distanceTo(new THREE.Vector3(0,-.8,.6))<1e-6,'normal must use inverse transpose');
 const index=triangles.findIndex(t=>t.kind===1),uv=data.uvs.image.data.slice(index*8,index*8+6);
 for(let i=0;i<6;i++)assert.ok(Math.abs(uv[i]-[.1,.2,.3,.4,.5,.6][i])<1e-6);
 assert.ok(data.epsilon>0&&data.epsilon<.001);assert.ok(data.bounds.min.distanceTo(new THREE.Vector3(1,2,3))<1e-6);assert.ok(data.bounds.max.distanceTo(new THREE.Vector3(3,5,15))<1e-6);
 const disposed=[];for(const key of ['triangles','nodes','uvs'])data[key].addEventListener('dispose',()=>disposed.push(key));data.dispose();assert.deepEqual(disposed.sort(),['nodes','triangles','uvs']);
});

test('stackless BVH preserves every selected triangle and skips disjoint branches',()=>{
 const root=new THREE.Group();
 for(let i=0;i<40;i++){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([i*3,0,0,i*3+1,0,0,i*3,1,0],3));g.computeVertexNormals();
  const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial());root.add(m);
 }
 const data=api().buildGlassNeckTraceData(root,()=>3),nodes=data.nodes.image.data;
 const ray=new THREE.Ray(new THREE.Vector3(.2,.2,5),new THREE.Vector3(0,0,-1)),box=new THREE.Box3(),point=new THREE.Vector3();
 let cursor=0,visited=0,tested=0;const hits=[];
 while(cursor<nodes[3]){
  visited++;const p=cursor*12;box.min.fromArray(nodes,p);box.max.fromArray(nodes,p+4);
  if(!ray.intersectsBox(box)){cursor=nodes[p+3];continue;}
  for(let i=0;i<nodes[p+9];i++){tested++;const t=triangleAt(data,nodes[p+8]+i);if(ray.intersectTriangle(t.a,t.b,t.c,false,point))hits.push(point.clone());}
  cursor++;
 }
 assert.equal(data.triangleCount,40);assert.equal(hits.length,1);assert.deepEqual(hits[0].toArray(),[.2,.2,0]);assert.ok(tested<=8);assert.ok(visited>1);
 const counts=[];for(let p=0;p<nodes[3]*12;p+=12)for(let i=0;i<nodes[p+9];i++)counts.push(nodes[p+8]+i);
 assert.deepEqual(counts.sort((a,b)=>a-b),Array.from({length:40},(_,i)=>i));data.dispose();
});
