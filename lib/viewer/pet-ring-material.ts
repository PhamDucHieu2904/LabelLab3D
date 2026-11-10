import * as THREE from 'three';
import type { ProductAsset } from '../viewer-config';
import { aloeTransmissionClearRadiance, correctAloeTransmissionClear } from './aloe-bottle-materials';
import { addBottleBackdropProjection, createBottleBackdropUniforms, updateBottleBackdropUniforms } from './bottle-backdrop';

/** A molded PET neck finish is solid polymer, unlike the thin bottle wall. */
export const PET_RING_OPTICS = Object.freeze({
  roughness: .055,
  ior: 1.57,
  transmission: 1,
  thicknessMetres: .0024,
  extinctionPerMetre: 0,
  minimumViewCosine: .2,
});

export function isPetRingMaterial(asset: ProductAsset, material: THREE.Material): boolean {
  return asset.packaging === 'pet' && (material.name === 'Ring' || material.name === 'pet-ring'
    || material.userData.nataRing === true || material.userData.aloeRing === true
    || material.userData.juiceRing === true || material.userData.energyRing === true);
}

/** The physical ray length is measured in metres, not in an object's retained
 * Blender scale. Each pooled material reads the actual visible draw transform. */
export function configurePetRingMaterial(material: THREE.MeshPhysicalMaterial, mesh: THREE.Mesh): void {
  material.color.set('#ffffff');
  // Old ring basemaps encode white/alpha haze. The molded part now gets its
  // clarity from volume transmission; those masks would make it opaque again.
  material.map = null; material.alphaMap = null;
  material.metalness = 0; material.roughness = PET_RING_OPTICS.roughness;
  material.transmission = PET_RING_OPTICS.transmission;
  material.ior = PET_RING_OPTICS.ior; material.thickness = PET_RING_OPTICS.thicknessMetres;
  material.attenuationColor.set('#ffffff'); material.attenuationDistance = Infinity;
  material.clearcoat = 0; material.opacity = 1; material.transparent = true;
  material.depthWrite = false; material.depthTest = true;
  material.side = THREE.FrontSide;
  const metricToLocal = mesh.matrixWorld.clone().invert(), metricToWorld = new THREE.Matrix4();
  const uniforms = {
    ...createBottleBackdropUniforms(),
    aloeClearRadiance: { value: 1 },
    petRingWorldThickness: { value: Number(PET_RING_OPTICS.thicknessMetres) },
    petRingExtinction: { value: Number(PET_RING_OPTICS.extinctionPerMetre) },
  };
  material.onBeforeRender = (renderer, scene, _camera, _geometry, object) => {
    updateBottleBackdropUniforms(uniforms, scene);
    uniforms.aloeClearRadiance.value = aloeTransmissionClearRadiance(renderer);
    metricToWorld.copy(object.matrixWorld).multiply(metricToLocal);
    uniforms.petRingWorldThickness.value = PET_RING_OPTICS.thicknessMetres * metricToWorld.getMaxScaleOnAxis();
  };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    addBottleBackdropProjection(shader);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      uniform float aloeClearRadiance;
      uniform float petRingWorldThickness;
      uniform float petRingExtinction;
    `).replace('#include <transmission_pars_fragment>',
      correctAloeTransmissionClear(THREE.ShaderChunk.transmission_pars_fragment).replace(
        'return normalize( refractionVector ) * thickness * modelScale;',
        'return normalize( refractionVector ) * petRingWorldThickness;').replace(
        'transmittedLight.a = aloeCapturedCoverage;', /* glsl */`
          transmittedLight.a = aloeCapturedCoverage;
          // Studio draws its matte separately from the product capture. Fill
          // uncovered rays at the refracted exit, before native Fresnel/PBR.
          // Without a matte the original RGBA path serves transparent PNGs.
          if (bottleBackdropEnabled > .5) {
            transmittedLight.rgb = mix(bottleBackdropAt(refractionCoords), transmittedLight.rgb, aloeCapturedCoverage);
            transmittedLight.a = 1.0;
          }
        `))
      .replace('#include <opaque_fragment>', /* glsl */`
        float ringCaptured = clamp((material.transmissionAlpha - (1.0 - transmission)) / max(transmission, .0001), 0.0, 1.0);
        float ringCosine = clamp(abs(dot(normal, geometryViewDir)), ${PET_RING_OPTICS.minimumViewCosine.toFixed(2)}, 1.0);
        float ringTransmittance = exp(-petRingExtinction * petRingWorldThickness / ringCosine);
        float ringFresnel = pow(1.0 - saturate(dot(normal, geometryViewDir)), 5.0);
        float ringHighlight = clamp(max(max(totalSpecular.r, totalSpecular.g), totalSpecular.b), 0.0, 1.0);
        // Clear PET has no diffuse white pigment. Keep transmitted radiance
        // and localized reflections separate, including transparent exports.
        vec3 ringDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
        vec3 ringTransmitted = totalDiffuse - ringDiffuse * (1.0 - transmission);
        float ringReflectionCoverage = clamp(ringFresnel * .25 + ringHighlight * .5, 0.0, 1.0);
        float ringSurfaceCoverage = ringReflectionCoverage;
        float ringCoverage = ringCaptured + (1.0 - ringCaptured) * ringSurfaceCoverage;
        vec3 ringLight = ringTransmitted * ringCaptured * ringTransmittance
          + totalSpecular;
        gl_FragColor = vec4(ringLight / max(ringCoverage, .0001), ringCoverage);
      `);
  };
  material.customProgramCacheKey = () => 'pet-clear-ring-fallback-v4';
}
