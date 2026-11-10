import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { createPooledAppearanceHandle } from '/lib/viewer/pooled-appearance';
import { renderBottleScene } from '/lib/viewer/bottle-materials';
import { DEFAULT_VIEWER_PRESENTATION } from '/lib/viewer-config';
import { setBottleBackdrop } from '/lib/viewer/bottle-backdrop';

const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,alpha:true,premultipliedAlpha:false});
renderer.setSize(1000,800);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NeutralToneMapping;
document.body.append(renderer.domElement);
const scene=new THREE.Scene();
const pmrem=new THREE.PMREMGenerator(renderer),exr=await new EXRLoader().loadAsync('/environments/studio-softbox.exr');
const env=pmrem.fromEquirectangular(exr);scene.environment=env.texture;scene.environmentIntensity=.85;scene.environmentRotation.set(0,.75,0);
for(const s of DEFAULT_VIEWER_PRESENTATION.lights){const l=s.type==='hemisphere'?new THREE.HemisphereLight(s.color,s.groundColor,s.intensity):new THREE.DirectionalLight(s.color,s.intensity);l.position.set(...s.position);scene.add(l);}
const defaultEnv=env.texture;
const room=new THREE.Scene();room.background=new THREE.Color('#101214');
for(const [x,y,z,w,h,intensity] of [[-.12,.12,.06,.08,.25,7],[.1,.04,.08,.03,.2,4],[0,.08,-.1,.2,.04,5],[0,0,.1,.2,.13,2]]){const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color().setScalar(intensity),side:THREE.DoubleSide}));m.position.set(x,y,z);m.lookAt(0,0,0);room.add(m);}
const photoEnv=pmrem.fromScene(room,0,.001,10);
const camera=new THREE.PerspectiveCamera(28,1.25,.0005,10);
const draco=new DRACOLoader().setDecoderPath('/decoders/draco/').setWorkerLimit(1);
const loader=new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);
const patternCanvas=document.createElement('canvas');patternCanvas.width=1000;patternCanvas.height=800;
const patternContext=patternCanvas.getContext('2d');patternContext.fillStyle='#f292ad';patternContext.fillRect(0,0,1000,800);
patternContext.fillStyle='#5d142b';for(let y=0;y<800;y+=20)patternContext.fillRect(0,y,1000,6);for(let x=0;x<1000;x+=50)patternContext.fillRect(x,0,6,800);
const pattern=new THREE.CanvasTexture(patternCanvas);pattern.colorSpace=THREE.SRGBColorSpace;
const configs={
 'pet-nata-watermelon':{file:'pet-320-nata',slots:{body:['pet-shell','pet-ring'],cap:['pet-cap'],label:['printed-label'],liquid:['nata-liquid'],inclusions:['nata-jelly']},color:'#ff4430'},
 'pet-aloe':{file:'pet-500-short-label',slots:{body:['Body Bottle - Rough_NormalMap','Body Bottle - z Glossy','Ring'],cap:['PlasticCap'],label:['Label'],liquid:['Aloe Vera Water'],inclusions:['Aloe Pulp - Clear']},color:'#e8b64f'},
};
let root,pool,asset;
function ringData(){const result=[];root.traverse(mesh=>{if(!mesh.isMesh)return;for(const [index,m]of (Array.isArray(mesh.material)?mesh.material:[mesh.material]).entries())if(m.name==='Ring'||m.name==='pet-ring')result.push({mesh,m,index});});return result;}
function boundsOfParts(parts){const bounds=new THREE.Box3(),point=new THREE.Vector3();root.updateMatrixWorld(true);for(const {mesh,index} of parts){const position=mesh.geometry.attributes.position,indices=mesh.geometry.index;const groups=mesh.geometry.groups.length?mesh.geometry.groups.filter(g=>g.materialIndex===index):[{start:0,count:indices?.count??position.count}];for(const group of groups)for(let i=group.start;i<group.start+group.count;i++){point.fromBufferAttribute(position,indices?indices.getX(i):i).applyMatrix4(mesh.matrixWorld);bounds.expandByPoint(point);}}return bounds;}
async function reset(id){if(root){scene.remove(root);pool.dispose();}const c=configs[id];const manifest=c?null:await(await fetch(`/models/bottles/${id}.manifest.json`)).json();
 const sourceSlots=c?.slots??manifest?.materialSlots??{};
 const glbPath=`/models/bottles/${c?.file??id}.glb`;
 const gltf=await loader.loadAsync(glbPath);root=gltf.scene;scene.add(root);root.updateMatrixWorld(true);
 // A few older PET manifests predate semantic slots. Infer only the harness
 // bindings from their authored material names; runtime production mappings
 // remain explicit in the catalog/manifests.
 const authoredNames=[];root.traverse(mesh=>{if(mesh.isMesh)for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])authoredNames.push(m.name);});
 const names=[...new Set(authoredNames)];
 const inferred={
  body:names.filter(n=>/body|shell|refraction/i.test(n)&&!/water|liquid/i.test(n)),
  ring:names.filter(n=>/^ring$|pet-ring/i.test(n)),
  cap:names.filter(n=>/cap/i.test(n)),
  label:names.filter(n=>/label|lable|printed-label/i.test(n)),
  liquid:names.filter(n=>/water|liquid/i.test(n)),
  inclusions:names.filter(n=>/jelly|pulp|coco|seed/i.test(n)),
 };
 const slots={...inferred,...sourceSlots};
 for(const key of Object.keys(slots)) slots[key]=[...new Set(slots[key]??[])];
 if(!slots.label.length) slots.label=names.filter(n=>/label/i.test(n));
 asset={id,packaging:'pet',name:id,src:glbPath,materialSlots:slots};
 root.traverse(mesh=>{if(mesh.isMesh)for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])if(asset.materialSlots.label.includes(m.name)){m.map=null;m.color.set('#ffffff');}});
 pool=createPooledAppearanceHandle(root,asset,{editable:true});await pool.apply({slots:{body:{color:'#ffffff',metalness:0,roughness:.075},cap:{color:'#ffffff'},label:{color:'#ffffff'},liquid:{color:c?.color??'#e8b64f'}}});root.updateMatrixWorld(true);
 const parts=ringData();if(!parts.length)throw new Error(`No ring: ${id}`);return boundsOfParts(parts);
}
window.debug={async experiment(o){const bounds=await reset(o.id);const target=bounds.getCenter(new THREE.Vector3());const radius=Math.max(bounds.max.x-bounds.min.x,bounds.max.z-bounds.min.z)/2;
 scene.environment=o.photo?photoEnv.texture:defaultEnv;scene.environmentRotation.set(0,o.photo?0:.75,0);
 scene.background=o.transparent?null:new THREE.Color(o.pink?'#bd335d':'#e4e4e4');
 if(o.matte){scene.background=null;setBottleBackdrop(scene,pattern);}else setBottleBackdrop(scene,null);
 if(o.photo)scene.background=new THREE.Color('#242628');
 camera.up.set(Math.sin(o.roll??0),Math.cos(o.roll??0),0);
 const ratio=o.above?.9:o.under?-.55:.22;if(o.context)target.y+=radius*.5;camera.position.copy(target).add(new THREE.Vector3(radius*.5,radius*ratio,radius*3.4).multiplyScalar(o.context?1.9:1));camera.lookAt(target);
 if(o.capColor)pool.setLiveOverrides({cap:{color:o.capColor}});
 if(o.liquidColor)pool.setLiveOverrides({liquid:{color:o.liquidColor}});
 if(o.edits)pool.setLiveOverrides({body:{metalness:1,roughness:.85},liquid:{color:'#ff0000'},cap:{color:'#1844ff'}});
 if(o.hideCap)root.traverse(m=>{if(m.isMesh&&(Array.isArray(m.material)?m.material:[m.material]).some(mat=>asset.materialSlots.cap.includes(mat.name)))m.visible=false;});
 if(o.ringOnly)root.traverse(mesh=>{if(mesh.isMesh)for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])material.visible=material.name==='Ring'||material.name==='pet-ring';});
 if(o.disableRefraction)for(const {m}of ringData()){const original=m.onBeforeCompile;m.onBeforeCompile=shader=>{original(shader);shader.fragmentShader=shader.fragmentShader.replace('direction=normalize(direction/petRingIor+(cosine/petRingIor-cosT)*n);','direction=direction;').replaceAll('direction=normalize((medium/target)*direction+((medium/target)*cosine-cosT)*n);','direction=direction;');};m.customProgramCacheKey=()=> 'pet-ring-zero-ray-test';m.needsUpdate=true;}
 for(let i=0;i<3;i++)renderBottleScene(renderer,scene,camera);
 const materials=ringData().map(({m})=>({name:m.name,type:m.type,color:m.color.getHexString(),roughness:m.roughness,metalness:m.metalness,thickness:m.thickness,transmission:m.transmission,ior:m.ior,program:m.customProgramCacheKey()}));
 const pixels=new Uint8Array(1000*800*4);renderer.getContext().readPixels(0,0,1000,800,renderer.getContext().RGBA,renderer.getContext().UNSIGNED_BYTE,pixels);let clear=0,partial=0,opaque=0;for(let i=3;i<pixels.length;i+=4){if(pixels[i]===0)clear++;else if(pixels[i]<255)partial++;else opaque++;}
 let png=renderer.domElement.toDataURL('image/png');if(o.matte){const composed=document.createElement('canvas');composed.width=1000;composed.height=800;const context=composed.getContext('2d');context.drawImage(patternCanvas,0,0);context.drawImage(renderer.domElement,0,0);png=composed.toDataURL('image/png');}
 return{png,glError:renderer.getContext().getError(),materials,bounds:[bounds.min.toArray(),bounds.max.toArray()],alpha:{clear,partial,opaque}};
}};window.ready=true;
