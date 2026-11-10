import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/examples/jsm/loaders/DRACOLoader.js';
import {EXRLoader} from 'three/examples/jsm/loaders/EXRLoader.js';
import {createAppearanceHandle} from '/lib/viewer/appearance';
import {createPooledAppearanceHandle} from '/lib/viewer/pooled-appearance';
import {renderBottleScene} from '/lib/viewer/bottle-materials';
import {measureProductBounds} from '/lib/viewer/framing.ts';
import {DEFAULT_VIEWER_PRESENTATION} from '/lib/viewer-config';
const configs={
  'pp-2000':{manifest:'/models/bottles/pp-2000.manifest.json',name:'PP 2L',id:'audit-pp-2000'},
  'pp-1000-2':{manifest:'/models/bottles/pp-1000-2.manifest.json',name:'PP 1L v2',id:'audit-pp-1000-2'}
};
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,alpha:true});renderer.setSize(600,500);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NeutralToneMapping;renderer.toneMappingExposure=1;document.body.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#e8e8e8');const exr=await new EXRLoader().loadAsync('/environments/studio-softbox.exr');const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromEquirectangular(exr).texture;scene.environmentIntensity=.85;scene.environmentRotation.set(0,.75,0);for(const s of DEFAULT_VIEWER_PRESENTATION.lights){const l=s.type==='hemisphere'?new THREE.HemisphereLight(s.color,s.groundColor,s.intensity):new THREE.DirectionalLight(s.color,s.intensity);l.position.set(...s.position);scene.add(l)}
const draco=new DRACOLoader().setDecoderPath('/decoders/draco/').setWorkerLimit(1);const loader=new GLTFLoader().setDRACOLoader(draco);const camera=new THREE.PerspectiveCamera(28,1.2,.001,30);let root,handle,asset,current;
const appearance={requiredSlots:['body','cap','label'],slots:{body:{color:'#ffffff',metalness:0,roughness:.3},cap:{color:'#ffffff',metalness:0,roughness:.29},label:{color:'#ffffff',metalness:0,roughness:.28}}};
const serialize=()=>{const a=[];root?.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])a.push({mesh:o.name,material:m.name,color:m.color?.getHexString(),roughness:m.roughness,transparent:m.transparent,transmission:m.transmission,visible:o.visible})});return a};
async function reset(id,pooled=false){if(root){scene.remove(root);handle?.dispose()}current=configs[id];asset={...await (await fetch(current.manifest)).json(),name:current.name,packaging:'pp'};const gltf=await loader.loadAsync(asset.src);root=new THREE.Group();const content=new THREE.Group();content.add(gltf.scene);root.add(content);content.updateMatrixWorld(true);const b=measureProductBounds(content),size=b.getSize(new THREE.Vector3());content.position.sub(b.getCenter(new THREE.Vector3()));root.scale.setScalar(1/Math.max(size.x,size.y,size.z));scene.add(root);handle=pooled?createPooledAppearanceHandle(content,asset,{}):createAppearanceHandle(content,asset,{});await handle.apply({...appearance,id:current.id});root.updateMatrixWorld(true);camera.position.set(1.12,-1.18,2.18);camera.lookAt(0,-.18,0);return {bounds:[b.min.toArray(),b.max.toArray()],size:size.toArray(),materials:serialize()};}
window.debug={async experiment(o={}){const prep=await reset(o.id||'pp-2000',o.pooled);if(o.above){camera.position.set(.5,1.4,2.4);camera.lookAt(0,.1,0)}for(let i=0;i<3;i++)renderBottleScene(renderer,scene,camera);const png=renderer.domElement.toDataURL('image/png');const poster=document.createElement('canvas');poster.width=600;poster.height=500;poster.getContext('2d').drawImage(renderer.domElement,0,0,600,500);return {...prep,glError:renderer.getContext().getError(),png,webp:poster.toDataURL('image/webp',.9),materials:serialize()}}};
await reset('pp-2000');for(let i=0;i<3;i++)renderBottleScene(renderer,scene,camera);window.ready=true;
