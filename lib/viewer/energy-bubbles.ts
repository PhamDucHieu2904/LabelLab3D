import * as THREE from 'three';
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull.js';
import type { ProductAsset } from '../viewer-config';
import type { LiveMaterialOverrides } from './material-adjustments';

/** Label Lab's PET330 particle contract. Sizes/speeds are relative to liquid height. */
export const ENERGY_BUBBLES = Object.freeze({
  maximum: 300, threshold: .003, wallInset: .0065,
  minimumDiameter: .0022, maximumDiameter: .009, minimumRise: .025, maximumRise: .11,
});
export function energyBubbleCount(amount: number): number {
  const value = Number.isFinite(amount) ? THREE.MathUtils.clamp(amount, 0, 1) : 0;
  return value < ENERGY_BUBBLES.threshold ? 0 : Math.max(1, Math.round(value * 220 + value * value * 80));
}

type Particle = { position: THREE.Vector3; rise: number; diameter: number; ceiling: number };
export type EnergyBubbleEffect = NonNullable<ReturnType<typeof createEnergyDrinkBubbles>>;

/**
 * An instanced sphere volume, kept beside the imported content so water's
 * nonuniform Blender scale cannot stretch bubbles. The source app also draws
 * them after PET and excludes the whole opaque label band from their volume.
 */
export function createEnergyDrinkBubbles(content: THREE.Object3D, asset: ProductAsset) {
  if (!asset.sparkling) return;
  content.updateMatrixWorld(true);
  let water: THREE.Mesh | undefined, label: THREE.Mesh | undefined;
  content.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    const names = (Array.isArray(node.material) ? node.material : [node.material]).map(m => m.name);
    if (names.some(name => asset.materialSlots?.liquid?.includes(name)) && !node.userData.nataLiquidBack) water ??= node;
    if (names.some(name => asset.materialSlots?.label?.includes(name))) label ??= node;
  });
  if (!water) return;
  // At creation content is centered under an identity parent. Bake ONLY the
  // query mesh, leaving source geometry/UVs and the displayed water untouched.
  const queryGeometry = water.geometry.clone().applyMatrix4(water.matrixWorld);
  queryGeometry.computeBoundingBox();
  const bounds = queryGeometry.boundingBox!.clone(), height = bounds.max.y - bounds.min.y;
  if (!Number.isFinite(height) || height <= 0) { queryGeometry.dispose(); return; }
  // The app uses a convex MeshCollider. Cache its hull as half-spaces once;
  // six triangle raycasts per particle per frame would dominate web CPU time.
  const positions = queryGeometry.getAttribute('position');
  const hull = new ConvexHull().setFromPoints(Array.from({ length: positions.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(positions, i)));
  const planes: { normal: THREE.Vector3; constant: number }[] = [];
  for (const face of hull.faces) {
    if (!planes.some(p => p.normal.dot(face.normal) > .999999 && Math.abs(p.constant - face.constant) < height * 1e-6)) {
      planes.push({ normal: face.normal.clone(), constant: face.constant });
    }
  }
  const queryMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const query = new THREE.Mesh(queryGeometry, queryMaterial); query.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(), up = new THREE.Vector3(0, 1, 0), origin = new THREE.Vector3();
  const labelBounds = label ? new THREE.Box3().setFromObject(label) : undefined;
  function ceiling(position: THREE.Vector3, diameter: number): number {
    const margin = diameter * .625 + height * ENERGY_BUBBLES.wallInset;
    if (!bounds.containsPoint(position)) return -Infinity;
    if (labelBounds && position.y >= labelBounds.min.y - margin && position.y <= labelBounds.max.y + margin) return -Infinity;
    for (const plane of planes) if (plane.normal.dot(position) - plane.constant > -margin) return -Infinity;
    let top = labelBounds && position.y < labelBounds.min.y ? labelBounds.min.y - margin : bounds.max.y;
    // Convex collision alone bridges the concave shoulder. Cache a safe rise
    // column from the actual water triangles so bubbles cannot escape there.
    for (const [x, z] of [[0, 0], [margin, 0], [-margin, 0], [0, margin], [0, -margin]]) {
      origin.copy(position); origin.x += x; origin.z += z; ray.set(origin, up);
      const hits = ray.intersectObject(query, false);
      const distances = hits.map(hit => hit.distance).filter((d, i, all) => i === 0 || Math.abs(d - all[i - 1]) > height * 1e-6);
      if (distances.length % 2 !== 1) return -Infinity;
      top = Math.min(top, position.y + distances[0] - margin);
    }
    return top;
  }
  const contains = (position: THREE.Vector3, diameter: number) => ceiling(position, diameter) > position.y;
  let randomState = 0x8a31d5e7;
  const random = () => {
    randomState ^= randomState << 13; randomState ^= randomState >>> 17; randomState ^= randomState << 5;
    return (randomState >>> 0) / 4294967296;
  };
  const particles: Particle[] = [];
  function spawn(): Particle | undefined {
    const size = random() ** 3;
    const diameter = height * THREE.MathUtils.lerp(ENERGY_BUBBLES.minimumDiameter, ENERGY_BUBBLES.maximumDiameter, size);
    const position = new THREE.Vector3();
    for (let attempt = 0; attempt < 72; attempt++) {
      position.set(THREE.MathUtils.lerp(bounds.min.x, bounds.max.x, random()),
        THREE.MathUtils.lerp(bounds.min.y + height * .045, bounds.max.y - height * .018, random()),
        THREE.MathUtils.lerp(bounds.min.z, bounds.max.z, random()));
      const top = ceiling(position, diameter);
      if (top <= position.y) continue;
      return { position, diameter, ceiling: top,
        rise: height * THREE.MathUtils.lerp(ENERGY_BUBBLES.minimumRise, ENERGY_BUBBLES.maximumRise, size) };
    }
    // Never place a failed candidate at a guessed centre (possibly under print).
    return;
  }
  const uniforms = { bubbleTint: { value: new THREE.Color('#ffe877') }, bubbleStrength: { value: 1 } };
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, depthTest: false, premultipliedAlpha: true,
    vertexShader: /* glsl */`
      varying vec3 bubbleNormal; varying vec3 bubbleView;
      void main() {
        vec4 view = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        bubbleNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
        bubbleView = -view.xyz;
        gl_Position = projectionMatrix * view;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 bubbleTint; uniform float bubbleStrength;
      varying vec3 bubbleNormal; varying vec3 bubbleView;
      void main() {
        vec3 n = normalize(bubbleNormal), v = normalize(bubbleView);
        float facing = clamp(dot(n, v), 0.0, 1.0);
        float rim = smoothstep(.40, .76, 1.0 - facing);
        vec3 h = normalize(v + normalize(vec3(-.28, .62, -.73)));
        float glint = pow(max(0.0, dot(n, h)), 34.0);
        float alpha = clamp((rim * .55 + glint * .72) * bubbleStrength, 0.0, 1.0);
        if (alpha < .018) discard;
        gl_FragColor = vec4(mix(bubbleTint, vec3(1.0), glint * .22), alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <premultiplied_alpha_fragment>
      }`,
  });
  const geometry = new THREE.SphereGeometry(.5, 10, 8);
  const mesh = new THREE.InstancedMesh(geometry, material, ENERGY_BUBBLES.maximum);
  mesh.name = 'Energy drink sparkling'; mesh.count = 0; mesh.visible = false;
  mesh.renderOrder = 25; mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const dummy = new THREE.Object3D();
  let count = 0, amount = 0;
  function writeMatrices() {
    particles.forEach((p, i) => {
      dummy.position.copy(p.position); dummy.scale.setScalar(p.diameter); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.count = particles.length; mesh.visible = mesh.count > 0; mesh.instanceMatrix.needsUpdate = true;
  }
  return {
    mesh,
    get animated() { return mesh.visible; },
    set(overrides: LiveMaterialOverrides) {
      const value = overrides.liquid?.sparkling;
      amount = Number.isFinite(value) ? THREE.MathUtils.clamp(value!, 0, 1) : 0;
      count = energyBubbleCount(amount);
      particles.splice(count);
      for (let i = particles.length; i < count; i++) { const p = spawn(); if (p) particles.push(p); }
      const color = new THREE.Color(overrides.liquid?.color ?? '#FFD600');
      const hsl = color.getHSL({ h: 0, s: 0, l: 0 });
      // Match the app's HSV saturation*.76 and value lift of 28%.
      const maximum = Math.max(color.r, color.g, color.b), minimum = Math.min(color.r, color.g, color.b);
      const saturation = maximum > 0 ? (maximum - minimum) / maximum * .76 : 0;
      const valueLift = THREE.MathUtils.lerp(maximum, 1, .28);
      const lightness = valueLift * (1 - saturation * .5);
      const hslSaturation = lightness > 0 && lightness < 1 ? (valueLift - lightness) / Math.min(lightness, 1 - lightness) : 0;
      uniforms.bubbleTint.value.setHSL(hsl.h, hslSaturation, lightness);
      uniforms.bubbleStrength.value = THREE.MathUtils.lerp(.95, 1.35, amount);
      writeMatrices();
    },
    update(deltaSeconds: number) {
      if (!mesh.visible) return;
      const delta = Math.max(0, Math.min(.05, deltaSeconds));
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]; p.position.y += p.rise * delta;
        if (p.position.y >= p.ceiling) {
          const replacement = spawn(); if (replacement) particles[i] = replacement; else particles.splice(i, 1);
        }
      }
      writeMatrices();
    },
    dispose() { mesh.removeFromParent(); geometry.dispose(); material.dispose(); mesh.dispose(); queryGeometry.dispose(); queryMaterial.dispose(); },
    // Read-only positions support containment and spherical-scale regression tests.
    snapshot: () => particles.map(p => ({ position: p.position.clone(), diameter: p.diameter })),
    contains,
  };
}
