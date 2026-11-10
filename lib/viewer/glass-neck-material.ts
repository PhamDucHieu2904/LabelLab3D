import * as THREE from 'three';
import { BOTTLE_BACKDROP_GLSL, createBottleBackdropUniforms, updateBottleBackdropUniforms } from './bottle-backdrop';
import { buildGlassNeckTraceData } from './glass-neck-trace-data';
import { GLASS_NECK_OPTICS_GLSL } from './glass-neck-optics';
import type { LiveLiquidOptics } from './material-adjustments';
import { liquidOpticsValues, normalizeLiquidOptics } from './liquid-adjustments';

/** A separate whole-shell draw is necessary: native MeshPhysical transmission
 * does not follow the inner wall, cap or label through a hollow glass cavity. */
export function createGlassNeckMaterialContext(root: THREE.Object3D,
  select: (mesh: THREE.Mesh, material: THREE.Material) => 1 | 3 | 4 | 5 | undefined) {
  const data = buildGlassNeckTraceData(root, select);
  const rootInverse = root.matrixWorld.clone().invert();
  let cap: THREE.MeshStandardMaterial | undefined, label: THREE.MeshStandardMaterial | undefined, liquidColor: THREE.Color | undefined;
  let liquidMaterial: THREE.MeshStandardMaterial | undefined;
  let defaults: LiveLiquidOptics = { clarity: .7, density: .3, turbidity: .2, brightness: 1, scattering: .2, roughness: .14, ior: 1.333 };
  const opaque = {
    glassNeckCapColor: { value: new THREE.Color('#c0c0c0') },
    glassNeckCapRoughness: { value: .55 }, glassNeckCapMetalness: { value: 1 },
    glassNeckLabelColor: { value: new THREE.Color('white') }, glassNeckLabelMap: { value: null as THREE.Texture | null },
    glassNeckHasLabelMap: { value: 0 }, glassNeckLabelUvMatrix: { value: new THREE.Matrix3() },
    glassNeckLiquidColor: { value: new THREE.Color('#be2838') },
    glassNeckLiquidClarity: { value: defaults.clarity }, glassNeckLiquidDensity: { value: defaults.density },
    glassNeckLiquidTurbidity: { value: defaults.turbidity }, glassNeckLiquidBrightness: { value: defaults.brightness },
    glassNeckLiquidScattering: { value: defaults.scattering }, glassNeckLiquidRoughness: { value: defaults.roughness },
    glassNeckLiquidIor: { value: defaults.ior },
    glassNeckLiquidSurfaceCapture: { value: 0 },
  };
  const updateLiquid = (value: LiveLiquidOptics | undefined, color?: string) => {
    const next = value ? normalizeLiquidOptics(value) : defaults;
    for (const key of ['clarity', 'density', 'turbidity', 'brightness', 'scattering', 'roughness', 'ior'] as const) {
      const name = `glassNeckLiquid${key[0].toUpperCase()}${key.slice(1)}` as keyof typeof opaque;
      (opaque[name] as THREE.IUniform<number>).value = next[key];
    }
    if (color) opaque.glassNeckLiquidColor.value.set(color);
  };
  return {
    dispose: () => data.dispose(),
    registerOpaque(material: THREE.MeshStandardMaterial, kind: 3 | 4) { if (kind === 3) cap = material; else label = material; },
    registerLiquid(color: THREE.Color, value?: LiveLiquidOptics, material?: THREE.MeshStandardMaterial, surfaceCapture = 0) {
      liquidColor = color; liquidMaterial = material;
      opaque.glassNeckLiquidSurfaceCapture.value = THREE.MathUtils.clamp(Number.isFinite(surfaceCapture) ? surfaceCapture : 0, 0, 1);
      if (value) defaults = normalizeLiquidOptics(value);
      updateLiquid(undefined);
    },
    updateLiquid,
    configure(material: THREE.MeshPhysicalMaterial, mesh: THREE.Mesh) {
      const meshToTrace = new THREE.Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld);
      const traceToMesh = meshToTrace.clone().invert();
      const uniforms = {
        ...createBottleBackdropUniforms(), ...opaque,
        glassNeckTriangles: { value: data.triangles }, glassNeckNodes: { value: data.nodes }, glassNeckUvs: { value: data.uvs },
        glassNeckDataWidth: { value: data.width }, glassNeckEpsilon: { value: data.epsilon },
        glassNeckRoughness: { value: .042 },
        glassNeckMeshToTrace: { value: meshToTrace },
        glassNeckNormalToTrace: { value: new THREE.Matrix3().getNormalMatrix(meshToTrace) },
        glassNeckToScene: { value: new THREE.Matrix4() }, glassNeckSceneToClip: { value: new THREE.Matrix4() },
        glassNeckBackgroundDistance: { value: .25 }, glassNeckCamera: { value: new THREE.Vector3() },
        glassNeckView: { value: new THREE.Vector3() }, glassNeckOrthographic: { value: 0 },
      };
      // Opt into Three's transmission pass solely to bind its opaque reservoir
      // sampler; glassNeckShade still owns the complete hollow-shell path.
      material.transmission = 1; material.transparent = true; material.opacity = 1;
      // The nearest entry owns the entire hollow path. Keep its depth so the
      // far inner FrontSide cannot blend a second copy over the same pixel.
      material.side = THREE.FrontSide; material.depthWrite = true;
      material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
          varying vec4 vBottleBackdropClip;
          uniform mat4 glassNeckMeshToTrace;
          uniform mat3 glassNeckNormalToTrace;
          varying vec3 vGlassNeckPosition;
          varying vec3 vGlassNeckNormal;`)
          .replace('#include <begin_vertex>', `#include <begin_vertex>
          vGlassNeckPosition=(glassNeckMeshToTrace*vec4(transformed,1.0)).xyz;
          vGlassNeckNormal=normalize(glassNeckNormalToTrace*objectNormal);`)
          .replace('#include <project_vertex>', '#include <project_vertex>\n          vBottleBackdropClip=gl_Position;');
        const main = shader.fragmentShader.indexOf('void main() {');
        if (main < 0) throw new Error('Neck optics requires the Three physical shader');
        shader.fragmentShader = shader.fragmentShader.slice(0, main) + BOTTLE_BACKDROP_GLSL + GLASS_NECK_OPTICS_GLSL + `
          void main() {
            #include <clipping_planes_fragment>
            #include <logdepthbuf_fragment>
            vec4 result=glassNeckShade();
            gl_FragColor=vec4(result.rgb/max(result.a,.000001),result.a);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
            #include <premultiplied_alpha_fragment>
          }`;
      };
      const sceneToTrace = new THREE.Matrix4();
      material.onBeforeRender = (_renderer, scene, camera, _geometry, object) => {
        updateBottleBackdropUniforms(uniforms, scene);
        uniforms.glassNeckToScene.value.multiplyMatrices(object.matrixWorld, traceToMesh);
        sceneToTrace.copy(uniforms.glassNeckToScene.value).invert();
        camera.getWorldPosition(uniforms.glassNeckCamera.value).applyMatrix4(sceneToTrace);
        camera.getWorldDirection(uniforms.glassNeckView.value).transformDirection(sceneToTrace);
        uniforms.glassNeckOrthographic.value = camera instanceof THREE.OrthographicCamera ? 1 : 0;
        uniforms.glassNeckSceneToClip.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        uniforms.glassNeckBackgroundDistance.value = .25 * uniforms.glassNeckToScene.value.getMaxScaleOnAxis();
        // Glass290WebRenderer uses .85 smoothness for Neck vs .958 body.
        // Retain that relative finish while honoring the shared body slider.
        uniforms.glassNeckRoughness.value = THREE.MathUtils.clamp(.15 + material.roughness - .042, 0, 1);
        if (cap) {
          opaque.glassNeckCapColor.value.copy(cap.color); opaque.glassNeckCapRoughness.value = cap.roughness;
          opaque.glassNeckCapMetalness.value = cap.metalness;
        }
        if (label) {
          opaque.glassNeckLabelColor.value.copy(label.color); opaque.glassNeckLabelMap.value = label.map;
          opaque.glassNeckHasLabelMap.value = label.map ? 1 : 0;
          if (label.map) opaque.glassNeckLabelUvMatrix.value.copy(label.map.matrix);
        }
        if (liquidColor) opaque.glassNeckLiquidColor.value.copy(liquidColor);
        if (liquidMaterial) {
          const live = liquidOpticsValues.get(liquidMaterial);
          updateLiquid(live?.value, live?.color);
        }
      };
      material.customProgramCacheKey = () => 'pullcap-hollow-glass-neck-v1';
    },
  };
}
