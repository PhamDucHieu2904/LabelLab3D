import * as THREE from 'three';
import { aloeTransmissionClearRadiance, correctAloeTransmissionClear } from './aloe-bottle-materials';

const BASE_KEY = 'glass-300-base-clear-v2';

function transformedYBounds(mesh: THREE.Mesh, meshToMetric: THREE.Matrix4): [number, number] {
  const position = mesh.geometry.getAttribute('position');
  if (!position || position.itemSize < 3 || position.count === 0) throw new Error('Glass 300 Base requires position geometry');
  const point = new THREE.Vector3();
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i).applyMatrix4(meshToMetric);
    min = Math.min(min, point.y); max = Math.max(max, point.y);
  }
  return [min, max];
}

/** Configure the authored 300 ml Base using its measured metric axial chord. */
export function configureGlass300Base(material: THREE.MeshPhysicalMaterial, mesh: THREE.Mesh, meshToMetric: THREE.Matrix4): void {
  const [minY, maxY] = transformedYBounds(mesh, meshToMetric);
  const thickness = Math.max(0.0001, maxY - minY);
  material.color.setRGB(1, 1, 1);
  material.metalness = 0; material.roughness = .042;
  material.transmission = 1; material.ior = 1.52;
  // The authored Base is clear glass. Gray absorption would darken every
  // captured milk ray, turning the entire bottom into a solid-looking disk.
  material.attenuationColor.setRGB(1, 1, 1); material.attenuationDistance = Infinity;
  material.thickness = thickness;
  material.transparent = true; material.opacity = 1; material.depthWrite = true; material.side = THREE.FrontSide;
  const metricToLocal = meshToMetric.clone().invert();
  const metricToWorld = new THREE.Matrix4();
  const uniforms = { aloeClearRadiance: { value: 1 }, glass300BaseWorldThickness: { value: thickness } };
  material.onBeforeRender = (renderer, _scene, _camera, _geometry, object) => {
    uniforms.aloeClearRadiance.value = aloeTransmissionClearRadiance(renderer);
    metricToWorld.copy(object.matrixWorld).multiply(metricToLocal);
    const worldScale = metricToWorld.getMaxScaleOnAxis();
    uniforms.glass300BaseWorldThickness.value = thickness * worldScale;
  };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float aloeClearRadiance;\nuniform float glass300BaseWorldThickness;')
      .replace('#include <transmission_pars_fragment>', correctAloeTransmissionClear(THREE.ShaderChunk.transmission_pars_fragment)
        .replace('return normalize( refractionVector ) * thickness * modelScale;', 'return normalize( refractionVector ) * glass300BaseWorldThickness;'))
      .replace('#include <opaque_fragment>', `
        float capturedCoverage=clamp(material.transmissionAlpha,0.0,1.0);
        float highlight=clamp(max(max(totalSpecular.r,totalSpecular.g),totalSpecular.b),0.0,1.0);
        float fresnel=pow(1.0-saturate(dot(normal,geometryViewDir)),5.0);
        float coverage=capturedCoverage+(1.0-capturedCoverage)*clamp(highlight*.35+fresnel*.15,0.0,1.0);
        gl_FragColor=vec4((totalDiffuse*capturedCoverage+totalSpecular)/max(coverage,.0001),coverage);
      `);
  };
  material.customProgramCacheKey = () => BASE_KEY;
}
