const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const THREE = require('three');
const draco = require('draco3dgltf');
const { parseGlb, writeGlb, hash } = require('./bottle-compression.cjs');

const extension = 'KHR_draco_mesh_compression';
const components = { SCALAR:1, VEC2:2, VEC3:3, VEC4:4 };
const types = { 5126:Float32Array, 5123:Uint16Array, 5125:Uint32Array };
let encoderPromise, decoderPromise;
function encoderModule() { return encoderPromise ??= draco.createEncoderModule({}); }
function decoderModule() {
  // Decode with the exact WASM/wrapper shipped to the browser, not the npm decoder.
  if (!decoderPromise) {
    const filename=path.resolve(__dirname,'../../public/decoders/draco/draco_wasm_wrapper.js');
    const loaded=new Module(filename,module); loaded.filename=filename; loaded.paths=module.paths;
    loaded._compile(fs.readFileSync(filename,'utf8'),filename);
    decoderPromise=loaded.exports({wasmBinary:fs.readFileSync(path.join(path.dirname(filename),'draco_decoder.wasm'))});
  }
  return decoderPromise;
}
function readAccessor(document,binary,index) {
  const a=document.accessors[index], v=document.bufferViews[a.bufferView], Type=types[a.componentType], size=components[a.type];
  assert.ok(Type && size && !a.sparse && !a.normalized,'Unsupported bottle accessor');
  const stride=v.byteStride ?? size*Type.BYTES_PER_ELEMENT;
  const data=new DataView(binary.buffer,binary.byteOffset,binary.byteLength), result=new Type(a.count*size);
  const getter={5126:'getFloat32',5123:'getUint16',5125:'getUint32'}[a.componentType];
  for(let i=0;i<a.count;i++) for(let c=0;c<size;c++) result[i*size+c]=data[getter]((v.byteOffset??0)+(a.byteOffset??0)+i*stride+c*Type.BYTES_PER_ELEMENT,true);
  return result;
}
function rawPrimitives(bytes) {
  const {document:d,binary}=parseGlb(bytes), result=[];
  for(const [mi,m] of d.meshes.entries()) for(const [pi,p] of m.primitives.entries()) result.push({mi,pi,
    indices:readAccessor(d,binary,p.indices),attributes:Object.fromEntries(Object.entries(p.attributes).map(([s,ai])=>[s,readAccessor(d,binary,ai)]))});
  return result;
}
async function decodeDracoPrimitives(bytes) {
  const {document:d,binary}=parseGlb(bytes), mod=await decoderModule(), result=[];
  for(const [mi,m] of d.meshes.entries()) for(const [pi,p] of m.primitives.entries()) {
    const ext=p.extensions?.[extension]; assert.ok(ext,'Missing Draco primitive');
    const v=d.bufferViews[ext.bufferView], encoded=binary.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength);
    const decoder=new mod.Decoder(), buffer=new mod.DecoderBuffer(), mesh=new mod.Mesh();
    try {
      buffer.Init(new Int8Array(encoded),encoded.length);
      const status=decoder.DecodeBufferToMesh(buffer,mesh);
      try { assert.ok(status.ok() && mesh.ptr,status.error_msg()); } finally { mod.destroy(status); }
      const indices=new Uint32Array(mesh.num_faces()*3), face=new mod.DracoInt32Array();
      try { for(let i=0;i<mesh.num_faces();i++) {decoder.GetFaceFromMesh(mesh,i,face);for(let c=0;c<3;c++) indices[i*3+c]=face.GetValue(c);} } finally {mod.destroy(face);}
      const attributes={};
      for(const [s,uid] of Object.entries(ext.attributes)) {
        const attribute=decoder.GetAttributeByUniqueId(mesh,uid), values=new mod.DracoFloat32Array();
        try {
          assert.ok(decoder.GetAttributeFloatForAllPoints(mesh,attribute,values));
          const array=new Float32Array(values.size()); for(let i=0;i<array.length;i++) array[i]=values.GetValue(i);
          attributes[s]=array;
        } finally {mod.destroy(values);}
      }
      result.push({mi,pi,indices,attributes});
    } finally {mod.destroy(mesh);mod.destroy(buffer);mod.destroy(decoder);}
  }
  return result;
}
function sceneDigest(d) {
  const omit=(value,keys)=>Object.fromEntries(Object.entries(value).filter(([key])=>!keys.includes(key)));
  return hash(JSON.stringify({asset:d.asset,scene:d.scene,scenes:d.scenes,nodes:d.nodes,materials:d.materials,
    textures:d.textures,samplers:d.samplers,images:d.images?.map(image=>omit(image,['bufferView'])),
    meshes:d.meshes.map(m=>({...m,primitives:m.primitives.map(p=>({...omit(p,['attributes','indices','extensions']),semantics:Object.keys(p.attributes)}))}))}));
}
function meshMatrices(d) {
  const map=new Map();
  function visit(i,parent) {
    const n=d.nodes[i], matrix=new THREE.Matrix4();
    if(n.matrix) matrix.fromArray(n.matrix);
    else matrix.compose(new THREE.Vector3().fromArray(n.translation??[0,0,0]),new THREE.Quaternion().fromArray(n.rotation??[0,0,0,1]),new THREE.Vector3().fromArray(n.scale??[1,1,1]));
    matrix.premultiply(parent);
    if(n.mesh!==undefined) map.set(n.mesh,[...(map.get(n.mesh)??[]),matrix]);
    for(const c of n.children??[]) visit(c,matrix);
  }
  for(const i of d.scenes[d.scene??0].nodes) visit(i,new THREE.Matrix4());
  return map;
}
async function compareDraco(input,output) {
  const {document:d}=parseGlb(input), packed=parseGlb(output).document;
  assert.equal(sceneDigest(d),sceneDigest(packed),'Draco scene metadata changed');
  const source=rawPrimitives(input), decoded=await decodeDracoPrimitives(output), matrices=meshMatrices(d);
  let maxPositionErrorMeters=0,maxNormalAngleDegrees=0,maxUvError=0,triangles=0;
  const a=new THREE.Vector3(),b=new THREE.Vector3();
  for(const [i,p] of source.entries()) {
    const q=decoded[i]; assert.equal(p.indices.length,q.indices.length,'Draco triangle count changed');
    assert.deepEqual(Object.keys(p.attributes),Object.keys(q.attributes),'Draco semantics changed');
    triangles+=p.indices.length/3;
    for(const matrix of matrices.get(p.mi)??[new THREE.Matrix4()]) {
      const normalMatrix=new THREE.Matrix3().getNormalMatrix(matrix);
      const transform=part=>{
        const positions=new Float64Array(part.attributes.POSITION.length), normals=part.attributes.NORMAL?new Float64Array(part.attributes.NORMAL.length):null;
        for(let v=0;v<positions.length;v+=3) {
          a.fromArray(part.attributes.POSITION,v).applyMatrix4(matrix).toArray(positions,v);
          if(normals) a.fromArray(part.attributes.NORMAL,v).applyMatrix3(normalMatrix).normalize().toArray(normals,v);
        }
        return {positions,normals};
      };
      const sp=transform(p),dp=transform(q),cell=.00002,buckets=new Map(),used=new Uint8Array(p.indices.length/3);
      const centroid=(part,positions,face)=>{
        const center=[0,0,0];for(let c=0;c<3;c++)for(let k=0;k<3;k++)center[k]+=positions[part.indices[face*3+c]*3+k]/3;
        return center.map(value=>Math.floor(value/cell));
      };
      for(let f=0;f<used.length;f++){const key=centroid(p,sp.positions,f).join(',');const list=buckets.get(key)??[];list.push(f);buckets.set(key,list);}
      // Edgebreaker reorders vertices/faces. Match a multiset of oriented
      // triangle corners in world metres, including normals and UV seams.
      for(let f=0;f<q.indices.length/3;f++) {
        const center=centroid(q,dp.positions,f);let match;
        search:for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++) {
          const candidates=buckets.get([center[0]+dx,center[1]+dy,center[2]+dz].join(','));
          for(const sf of candidates??[]) {
            if(used[sf])continue;
            for(let rotation=0;rotation<3;rotation++) {
              let pe=0,ne=0,uv=0;
              for(let c=0;c<3;c++) {
                const x=p.indices[sf*3+(c+rotation)%3],y=q.indices[f*3+c];
                a.fromArray(sp.positions,x*3);b.fromArray(dp.positions,y*3);pe=Math.max(pe,a.distanceTo(b));
                if(sp.normals){a.fromArray(sp.normals,x*3);b.fromArray(dp.normals,y*3);ne=Math.max(ne,a.angleTo(b)*180/Math.PI);}
                for(const semantic of Object.keys(p.attributes).filter(name=>/^TEXCOORD_\d+$/.test(name))) {
                  for(let k=0;k<2;k++)uv=Math.max(uv,Math.abs(p.attributes[semantic][x*2+k]-q.attributes[semantic][y*2+k]));
                }
              }
              if(pe<=.00001&&ne<=.1&&uv*4096<=.5){match={sf,pe,ne,uv};break search;}
            }
          }
        }
        assert.ok(match,`Draco triangle position, normal, UV or winding changed at primitive ${i}, face ${f}`);
        used[match.sf]=1;maxPositionErrorMeters=Math.max(maxPositionErrorMeters,match.pe);maxNormalAngleDegrees=Math.max(maxNormalAngleDegrees,match.ne);maxUvError=Math.max(maxUvError,match.uv);
      }
    }
  }
  assert.ok(maxPositionErrorMeters<=.00001,`Draco triangle position/winding error ${maxPositionErrorMeters} m`);
  assert.ok(maxNormalAngleDegrees<=.1,`Draco normal error ${maxNormalAngleDegrees} degrees`);
  assert.ok(maxUvError*4096<=.5,`Draco UV error ${maxUvError*4096} px`);
  return {triangles,topologyPreserved:true,maxPositionErrorMeters,maxNormalAngleDegrees,maxUvError,maxUvErrorAt4096px:maxUvError*4096,
    sceneSha256:sceneDigest(d),decodedPositionHashes:decoded.map(p=>hash(Buffer.from(p.attributes.POSITION.buffer))),
    decodedAttributeHashes:decoded.map(p=>Object.fromEntries(Object.entries(p.attributes).map(([semantic,array])=>[semantic,hash(Buffer.from(array.buffer))])))};
}
async function compressDraco(input,{positionBits=18,normalBits=14,uvBits=16,method='edgebreaker'}={}) {
  const {document:source,binary}=parseGlb(input), d=structuredClone(source), mod=await encoderModule();
  assert.ok(!source.extensionsUsed?.includes(extension),'Refusing repeated Draco compression');
  const chunks=[],views=[],encodedAccessors=new Set(); let offset=0;
  const addView=bytes=>{const index=views.length; views.push({buffer:0,byteOffset:offset,byteLength:bytes.length});const padded=Buffer.alloc(Math.ceil(bytes.length/4)*4);bytes.copy(padded);chunks.push(padded);offset+=padded.length;return index;};
  for(const p of rawPrimitives(input)) {
    const primitive=d.meshes[p.mi].primitives[p.pi], mesh=new mod.Mesh(), builder=new mod.MeshBuilder(), encoder=new mod.Encoder(), output=new mod.DracoInt8Array();
    try {
      assert.equal(primitive.mode??4,4); assert.ok(!primitive.targets,'Morph targets are not supported by this importer');
      builder.AddFacesToMesh(mesh,p.indices.length/3,new Uint32Array(p.indices));
      const ids={};
      for(const [semantic,values] of Object.entries(p.attributes)) {
        const kind=/^TEXCOORD_\d+$/.test(semantic)?mod.TEX_COORD:{POSITION:mod.POSITION,NORMAL:mod.NORMAL}[semantic];
        assert.notEqual(kind,undefined,`Unsupported Draco semantic ${semantic}`);
        const a=d.accessors[primitive.attributes[semantic]], n=components[a.type];
        assert.equal(a.componentType,5126);
        ids[semantic]=builder.AddFloatAttributeToMesh(mesh,kind,a.count,n,values);
        encodedAccessors.add(primitive.attributes[semantic]);
      }
      encoder.SetSpeedOptions(0,0);
      encoder.SetEncodingMethod(method === 'sequential' ? mod.MESH_SEQUENTIAL_ENCODING : mod.MESH_EDGEBREAKER_ENCODING);
      encoder.SetAttributeQuantization(mod.POSITION,positionBits); encoder.SetAttributeQuantization(mod.NORMAL,normalBits); encoder.SetAttributeQuantization(mod.TEX_COORD,uvBits);
      const length=encoder.EncodeMeshToDracoBuffer(mesh,output); assert.ok(length>0,'Draco encode failed');
      const bytes=Buffer.alloc(length); for(let i=0;i<length;i++) bytes[i]=output.GetValue(i);
      primitive.extensions={...primitive.extensions,[extension]:{bufferView:addView(bytes),attributes:ids}};
      encodedAccessors.add(primitive.indices);
    } finally {mod.destroy(output);mod.destroy(encoder);mod.destroy(builder);mod.destroy(mesh);}
  }
  const copyView=new Map();
  const retainView=i=>{if(!copyView.has(i)){const v=source.bufferViews[i];assert.equal(v.buffer,0);const j=addView(binary.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength));views[j]={...v,...views[j]};copyView.set(i,j);}return copyView.get(i);};
  for(const [i,a] of d.accessors.entries()) {
    if(encodedAccessors.has(i)) {delete a.bufferView;delete a.byteOffset;}
    else if(a.bufferView!==undefined) a.bufferView=retainView(a.bufferView);
  }
  for(const image of d.images??[]) if(image.bufferView!==undefined) image.bufferView=retainView(image.bufferView);
  d.bufferViews=views;d.buffers=[{byteLength:offset}];
  d.extensionsUsed=[...new Set([...(d.extensionsUsed??[]),extension])];d.extensionsRequired=[...new Set([...(d.extensionsRequired??[]),extension])];
  const provisional=writeGlb(d,Buffer.concat(chunks)), decoded=await decodeDracoPrimitives(provisional);
  for(const q of decoded) {
    const primitive=d.meshes[q.mi].primitives[q.pi];
    d.accessors[primitive.indices].count=q.indices.length;
    for(const [s,values] of Object.entries(q.attributes)) {
      const a=d.accessors[primitive.attributes[s]], n=components[a.type];a.count=values.length/n;
      if(a.min||a.max) {
        const min=Array(n).fill(Infinity),max=Array(n).fill(-Infinity);
        for(let i=0;i<values.length;i++){min[i%n]=Math.min(min[i%n],values[i]);max[i%n]=Math.max(max[i%n],values[i]);}
        if(a.min)a.min=min;if(a.max)a.max=max;
      }
    }
  }
  const bytes=writeGlb(d,Buffer.concat(chunks)), proof=await compareDraco(input,bytes);
  return {bytes,compression:{extension,encoder:'draco3dgltf 1.5.7',method,precisionBits:{POSITION:positionBits,NORMAL:normalBits,TEXCOORD_0:uvBits},lossless:false,simplification:false,uncompressedBytes:input.length,savedPercent:Number(((1-bytes.length/input.length)*100).toFixed(2)),...proof}};
}
module.exports={compressDraco,compareDraco,decodeDracoPrimitives,readAccessor};
