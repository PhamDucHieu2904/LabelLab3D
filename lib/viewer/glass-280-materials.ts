import * as THREE from 'three';
import type { ProductAsset } from '../viewer-config';
import { configureBottleBeautyOnly } from './basil-web-materials';
import { aloeTransmissionClearRadiance, correctAloeTransmissionClear } from './aloe-bottle-materials';

type Role = 'body' | 'cap' | 'liquid' | 'label' | 'inclusions';
// Glass 290 uses the Basil web optical path. Keeping it out of this generic
// context prevents the source Water transmission from sampling the page
// backdrop before the Basil reservoir is configured.
const PROFILES = new Set(['glass-280-v1']);
export const GLASS_280_OPTICS = Object.freeze({ ior: 1.52, wallMetres: .002, neckMetres: .0025, baseMetres: .004 });
export function glass280MaterialRole(asset: ProductAsset, mesh: THREE.Mesh, material: THREE.Material): Role | undefined {
  if (asset.packaging !== 'glass' || !PROFILES.has(material.userData.bottleProfile)) return;
  return Object.entries(asset.materialSlots ?? {}).find(([, names]) => names.includes(material.name) || names.includes(mesh.name))?.[0] as Role | undefined;
}

/** Register on the visible pooled root as well as prepared appearance clones. */
export function prepareGlass280Layers(root: THREE.Object3D, asset: ProductAsset): void {
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (!PROFILES.has(material.userData.bottleProfile)) continue;
      const role = glass280MaterialRole(asset, node, material);
      if (role === 'cap' || role === 'label' || material.name === 'White layer') {
        configureBottleBeautyOnly(node);
        node.renderOrder = 30;
      }
      // This fixed liner is outside the editable Cap slot. Its underside must
      // occlude the glass when the bottle is viewed from below.
      if (material.name === 'White layer') {
        material.side = THREE.DoubleSide;
        material.transparent = false; material.opacity = 1; material.depthWrite = true;
        if (material instanceof THREE.MeshPhysicalMaterial) material.transmission = 0;
      }
    }
  });
}

/** Solid lids and full-alpha print surround a glass shell with metric thickness. */
export function createGlass280MaterialContext(root: THREE.Object3D, asset: ProductAsset) {
  let liquid: THREE.MeshStandardMaterial | undefined;
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (material instanceof THREE.MeshStandardMaterial && glass280MaterialRole(asset, node, material) === 'liquid') liquid = material;
    }
  });
  if (!liquid) return;
  root.updateMatrixWorld(true);
  const rootInverse = root.matrixWorld.clone().invert();
  return {
    defaultColor: liquid.color.clone(),
    ready: undefined as Promise<void> | undefined,
    dispose: undefined as (() => void) | undefined,
    configure(material: THREE.MeshStandardMaterial, mesh: THREE.Mesh, role: string) {
      material.side = THREE.FrontSide;
      if (role === 'label' || role === 'cap') {
        configureBottleBeautyOnly(mesh);
        // Print remains alpha 1, but draws after transmission so the source's
        // nearly coincident glass/label heel cannot refract coffee over the print.
        material.transparent = role === 'label'; material.opacity = 1;
        material.depthWrite = true; material.depthTest = true;
        material.side = THREE.DoubleSide; material.forceSinglePass = true;
        if (role === 'label') {
          material.polygonOffset = true; material.polygonOffsetFactor = -1; material.polygonOffsetUnits = -1;
        }
        if (material instanceof THREE.MeshPhysicalMaterial) material.transmission = 0;
      } else if (role === 'body') {
        material.depthWrite = false; material.transparent = true;
        if (material instanceof THREE.MeshPhysicalMaterial) {
          material.transmission = 1; material.ior = GLASS_280_OPTICS.ior;
          material.attenuationColor.set('#f4faf7'); material.attenuationDistance = .6;
          const base = material.name === 'GlassBase' || mesh.name === 'Base';
          const neck = material.name === 'Neck' || (material.name === 'Glass Refraction' && !base);
          const thickness = base ? GLASS_280_OPTICS.baseMetres : neck ? GLASS_280_OPTICS.neckMetres : GLASS_280_OPTICS.wallMetres;
          material.thickness = thickness;
          // Source objects retain nonuniform Blender scales. Thickness is a
          // metric ray length, rather than a value shrunk by those transforms.
          const meshToMetric = new THREE.Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld);
          const metricToLocal = meshToMetric.clone().invert(), metricToWorld = new THREE.Matrix4();
          const uniforms = { aloeClearRadiance: { value: 1 }, glass280WorldThickness: { value: Number(thickness) } };
          material.onBeforeRender = (renderer, _scene, _camera, _geometry, object) => {
            uniforms.aloeClearRadiance.value = aloeTransmissionClearRadiance(renderer);
            metricToWorld.copy(object.matrixWorld).multiply(metricToLocal);
            uniforms.glass280WorldThickness.value = thickness * metricToWorld.getMaxScaleOnAxis();
          };
          material.onBeforeCompile = shader => {
            Object.assign(shader.uniforms, uniforms);
            shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float aloeClearRadiance;\nuniform float glass280WorldThickness;')
              .replace('#include <transmission_pars_fragment>', correctAloeTransmissionClear(THREE.ShaderChunk.transmission_pars_fragment)
                .replace('return normalize( refractionVector ) * thickness * modelScale;', 'return normalize( refractionVector ) * glass280WorldThickness;'))
              .replace('#include <opaque_fragment>', `
                float capturedCoverage=clamp(material.transmissionAlpha,0.0,1.0);
                float highlight=clamp(max(max(totalSpecular.r,totalSpecular.g),totalSpecular.b),0.0,1.0);
                float fresnel=pow(1.0-saturate(dot(normal,geometryViewDir)),5.0);
                float coverage=capturedCoverage+(1.0-capturedCoverage)*clamp(highlight*.35+fresnel*.15,0.0,1.0);
                gl_FragColor=vec4((totalDiffuse*capturedCoverage+totalSpecular)/max(coverage,.0001),coverage);
              `);
          };
          material.customProgramCacheKey = () => 'glass-280-polished-metric-shell-v2';
        }
      } else if (role === 'liquid') {
        material.transparent = false; material.opacity = 1;
        material.depthWrite = true;
        if (material instanceof THREE.MeshPhysicalMaterial) material.transmission = 0;
      }
    },
  };
}
