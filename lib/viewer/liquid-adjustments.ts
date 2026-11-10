import * as THREE from 'three';
import type { LiveLiquidOptics } from './material-adjustments';
import { addBottleBackdropProjection, createBottleBackdropUniforms, updateBottleBackdropUniforms } from './bottle-backdrop';

const unit = (value: number, fallback: number, max = 1, min = 0) =>
  Number.isFinite(value) ? THREE.MathUtils.clamp(value, min, max) : fallback;

export function normalizeLiquidOptics(value: LiveLiquidOptics): LiveLiquidOptics {
  return {
    clarity: unit(value.clarity, .7), density: unit(value.density, .3),
    turbidity: unit(value.turbidity, .2), brightness: unit(value.brightness, 1, 2),
    scattering: unit(value.scattering, .2), roughness: unit(value.roughness, .14),
    ior: unit(value.ior, 1.333, 1.6, 1),
  };
}

/** Weak ownership keeps warmed/retired appearance entries collectable. */
export const liquidOpticsUpdates = new WeakMap<THREE.MeshStandardMaterial,
  (value: LiveLiquidOptics | undefined, color: string) => void>();

/** Current live values are shared with the hollow-glass tracer. */
export const liquidOpticsValues = new WeakMap<THREE.MeshStandardMaterial,
  { value?: LiveLiquidOptics; color: string }>();

/**
 * Extend the calibrated volume shader rather than replacing its PBR/gel hooks.
 * Only explicit user edits enable this pass. Values describe the appearance of
 * a still beverage, not fluid dynamics. Both preview and tiled PNG use it.
 */
export function configureLiveLiquidOptics(material: THREE.MeshStandardMaterial, role: string) {
  if (role !== 'liquid' && role !== 'liquid-back') return;
  const physical = material instanceof THREE.MeshPhysicalMaterial ? material : undefined;
  const base = { roughness: material.roughness, ior: physical?.ior ?? 1.333 };
  const backdrop = createBottleBackdropUniforms();
  const uniforms = {
    labLiquidEnabled: { value: 0 }, labLiquidOptics: { value: new THREE.Vector4(.7, .3, .2, 1) },
    labLiquidSurface: { value: new THREE.Vector3(.2, .14, 1.333) },
    labLiquidPigment: { value: new THREE.Color('white') },
  };
  const beforeCompile = material.onBeforeCompile;
  const beforeRender = material.onBeforeRender;
  const programKey = material.customProgramCacheKey;
  // Read the previous discriminator now; Three's default implementation reads
  // this.onBeforeCompile and must not accidentally capture the new wrapper.
  const originalKey = programKey.call(material);
  material.onBeforeCompile = function(shader, renderer) {
    beforeCompile.call(this, shader, renderer);
    if (!shader.fragmentShader.includes('vec3 bottleBackdropAt(')) {
      addBottleBackdropProjection(shader);
      Object.assign(shader.uniforms, backdrop);
    }
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      uniform float labLiquidEnabled;
      uniform vec4 labLiquidOptics; // clarity, density, turbidity, brightness
      uniform vec3 labLiquidSurface; // scattering, roughness, IOR
      uniform vec3 labLiquidPigment;
    `).replace('#include <tonemapping_fragment>', /* glsl */`
      if (labLiquidEnabled > .5) {
        float labClarity = labLiquidOptics.x;
        float labDensity = labLiquidOptics.y;
        float labTurbidity = labLiquidOptics.z;
        float labScatter = labLiquidSurface.x;
        float labTransmission = labClarity * (1.0 - .92 * labDensity) * (1.0 - .96 * labTurbidity);
        // IOR bends the real scene sample; roughness broadens its footprint.
        vec2 labUv = bottleBackdropUv() + normal.xy * (labLiquidSurface.z - 1.0) * .028;
        vec2 labBlur = vec2(.018 * labLiquidSurface.y);
        vec3 labRear = bottleBackdropAt(labUv) * .4
          + bottleBackdropAt(labUv + vec2(labBlur.x, 0.0)) * .15
          + bottleBackdropAt(labUv - vec2(labBlur.x, 0.0)) * .15
          + bottleBackdropAt(labUv + vec2(0.0, labBlur.y)) * .15
          + bottleBackdropAt(labUv - vec2(0.0, labBlur.y)) * .15;
        vec3 labAbsorption = pow(max(labLiquidPigment, vec3(.003)), vec3(.12 + 1.65 * labDensity));
        vec3 labHaze = mix(labLiquidPigment, sqrt(max(labLiquidPigment, vec3(0.0))), labScatter * .55);
        // Keep authored highlights/seed silhouettes, progressively veiling
        // their contrast as suspended solids increase.
        vec3 labVolume = mix(gl_FragColor.rgb, labHaze, clamp(.28 + labTurbidity * .62 + labScatter * .1, 0.0, .96));
        vec3 labClear = labRear * labAbsorption;
        gl_FragColor.rgb = mix(labVolume, labClear, labTransmission) * labLiquidOptics.w;
        // Reservoir back layers remain opaque; transmitting front surfaces
        // retain their native alpha contract and premultiplication stage.
      }
      #include <tonemapping_fragment>
    `);
  };
  material.onBeforeRender = function(renderer, scene, camera, geometry, object, group) {
    beforeRender.call(this, renderer, scene, camera, geometry, object, group);
    updateBottleBackdropUniforms(backdrop, scene);
  };
  material.customProgramCacheKey = () => `${originalKey}:lab-live-liquid-v1`;
  liquidOpticsUpdates.set(material, (value, color) => {
    liquidOpticsValues.set(material, { value: value ? normalizeLiquidOptics(value) : undefined, color });
    uniforms.labLiquidEnabled.value = value ? 1 : 0;
    uniforms.labLiquidPigment.value.set(color);
    if (!value) {
      material.roughness = base.roughness;
      if (physical) physical.ior = base.ior;
      return;
    }
    const next = normalizeLiquidOptics(value);
    uniforms.labLiquidOptics.value.set(next.clarity, next.density, next.turbidity, next.brightness);
    uniforms.labLiquidSurface.value.set(next.scattering, next.roughness, next.ior);
    // Back scattering surfaces have no specular finish; leave their calibrated
    // PBR intact while the volume pass applies blur/refraction to the reservoir.
    if (role === 'liquid') material.roughness = next.roughness;
    if (physical) physical.ior = next.ior;
  });
}
