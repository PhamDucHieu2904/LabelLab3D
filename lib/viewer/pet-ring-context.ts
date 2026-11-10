import * as THREE from 'three';
import type { ProductAsset } from '../viewer-config';
import { BOTTLE_BACKDROP_GLSL, createBottleBackdropUniforms, updateBottleBackdropUniforms } from './bottle-backdrop';
import { aloeTransmissionClearRadiance } from './aloe-bottle-materials';
import { createPetRingTraceData } from './pet-ring-trace-data';
import { configurePetRingMaterial, isPetRingMaterial, PET_RING_OPTICS } from './pet-ring-material';
import { PET_RING_OPTICS_GLSL } from './pet-ring-optics';

// Pool preparation clones share geometries. Reuse their immutable BVH while
// each appearance keeps its own live material uniforms and transforms.
const traces=new WeakMap<THREE.BufferGeometry,Map<string,{data:ReturnType<typeof createPetRingTraceData>;owners:number}>>();
function acquireTrace(root:THREE.Object3D,asset:ProductAsset){
  root.updateMatrixWorld(true);
  const inverse=root.matrixWorld.clone().invert(),parts:string[]=[];
  let first:THREE.BufferGeometry|undefined;
  root.traverse(node=>{
    if(!(node instanceof THREE.Mesh))return;
    const materials=Array.isArray(node.material)?node.material:[node.material];
    if(node.userData.nataLiquidBack || node.userData.aloeLiquidBack)return;
    if(!materials.some(m=>isPetRingMaterial(asset,m)||(asset.materialSlots?.cap??[]).includes(m.name)||(asset.materialSlots?.liquid??[]).includes(m.name)||/cap/i.test(m.name)))return;
    first??=node.geometry;
    parts.push(node.geometry.uuid,materials.map(m=>m.name).join(','),new THREE.Matrix4().multiplyMatrices(inverse,node.matrixWorld).toArray().map(v=>v.toPrecision(12)).join(','));
  });
  const key=parts.join('|'),map=traces.get(first!)??new Map();traces.set(first!,map);
  let entry=map.get(key);
  if(!entry){entry={data:createPetRingTraceData(root,asset),owners:0};map.set(key,entry);}
  entry.owners++;
  let released=false;
  return {data:entry.data,release(){if(released)return;released=true;if(--entry.owners===0){entry.data.dispose();map.delete(key);}}};
}

/** The rendered mesh remains untouched. Only optical intersections receive an
 * inner sleeve closing the two open loops where the flange joins the neck. */
export function createPetRingMaterialContext(root: THREE.Object3D, asset: ProductAsset) {
  let hasRing=false;
  root.traverse(node=>{if(node instanceof THREE.Mesh&&(Array.isArray(node.material)?node.material:[node.material]).some(m=>isPetRingMaterial(asset,m)))hasRing=true;});
  if(!hasRing)return;
  // Compact optical proxies locate water/cap intersections; their radiance
  // still comes from the real captured liquid and current cap material.
  const lease=acquireTrace(root,asset),data=lease.data;
  const inverse=root.matrixWorld.clone().invert();
  let cap: THREE.MeshStandardMaterial|undefined;
  return {
    dispose:()=>lease.release(),
    registerCap(material:THREE.MeshStandardMaterial){cap=material;},
    configure(material:THREE.MeshPhysicalMaterial,mesh:THREE.Mesh){
      configurePetRingMaterial(material,mesh);
      material.depthWrite=true;
      const meshToTrace=new THREE.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld),traceToMesh=meshToTrace.clone().invert();
      const sceneToTrace=new THREE.Matrix4();
      const uniforms={...createBottleBackdropUniforms(),
        aloeClearRadiance:{value:1},petRingIor:{value:PET_RING_OPTICS.ior},petRingWorldThickness:{value:Number(PET_RING_OPTICS.thicknessMetres)},
        petRingTriangles:{value:data.triangles},petRingNodes:{value:data.nodes},petRingUvs:{value:data.uvs},
        petRingDataWidth:{value:data.width},petRingEpsilon:{value:data.epsilon},petRingRoughness:{value:Number(PET_RING_OPTICS.roughness)},
        petRingMeshToTrace:{value:meshToTrace},petRingNormalToTrace:{value:new THREE.Matrix3().getNormalMatrix(meshToTrace)},
        petRingToScene:{value:new THREE.Matrix4()},petRingSceneToClip:{value:new THREE.Matrix4()},
        petRingBackgroundDistance:{value:.02},petRingCamera:{value:new THREE.Vector3()},petRingView:{value:new THREE.Vector3()},petRingOrthographic:{value:0},
        petRingCapColor:{value:new THREE.Color('#f6f5ed')},petRingCapRoughness:{value:.29},petRingCapMetalness:{value:0},
      };
      const initialWorld=mesh.matrixWorld.clone().invert(),worldChange=new THREE.Matrix4();
      material.onBeforeRender=(renderer,scene,camera,_geometry,object)=>{
        updateBottleBackdropUniforms(uniforms,scene);uniforms.aloeClearRadiance.value=aloeTransmissionClearRadiance(renderer);
        uniforms.petRingRoughness.value=material.roughness;
        uniforms.petRingToScene.value.multiplyMatrices(object.matrixWorld,traceToMesh);
        sceneToTrace.copy(uniforms.petRingToScene.value).invert();
        camera.getWorldPosition(uniforms.petRingCamera.value).applyMatrix4(sceneToTrace);
        camera.getWorldDirection(uniforms.petRingView.value).transformDirection(sceneToTrace);
        uniforms.petRingOrthographic.value=camera instanceof THREE.OrthographicCamera?1:0;
        uniforms.petRingSceneToClip.value.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
        uniforms.petRingBackgroundDistance.value=data.bounds.getSize(new THREE.Vector3()).length()*.7*uniforms.petRingToScene.value.getMaxScaleOnAxis();
        worldChange.copy(object.matrixWorld).multiply(initialWorld);
        uniforms.petRingWorldThickness.value=PET_RING_OPTICS.thicknessMetres*worldChange.getMaxScaleOnAxis();
        if(cap){uniforms.petRingCapColor.value.copy(cap.color);uniforms.petRingCapRoughness.value=cap.roughness;uniforms.petRingCapMetalness.value=cap.metalness;}
      };
      material.onBeforeCompile=shader=>{
        Object.assign(shader.uniforms,uniforms);
        shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
          varying vec4 vBottleBackdropClip;
          uniform mat4 petRingMeshToTrace;uniform mat3 petRingNormalToTrace;
          varying vec3 vPetRingPosition;varying vec3 vPetRingNormal;`)
          .replace('#include <begin_vertex>',`#include <begin_vertex>
          vPetRingPosition=(petRingMeshToTrace*vec4(transformed,1.0)).xyz;
          vPetRingNormal=normalize(petRingNormalToTrace*objectNormal);`)
          .replace('#include <project_vertex>','#include <project_vertex>\nvBottleBackdropClip=gl_Position;');
        const main=shader.fragmentShader.indexOf('void main() {');
        if(main<0)throw new Error('PET optics requires Three physical shader');
        shader.fragmentShader=shader.fragmentShader.slice(0,main)+BOTTLE_BACKDROP_GLSL+PET_RING_OPTICS_GLSL+`
          void main(){
            #include <clipping_planes_fragment>
            #include <logdepthbuf_fragment>
            vec4 result=petRingShade();
            gl_FragColor=vec4(result.rgb/max(result.a,.000001),result.a);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
            #include <premultiplied_alpha_fragment>
          }`;
      };
      material.customProgramCacheKey=()=> 'pet-closed-flange-v2';
    },
  };
}
