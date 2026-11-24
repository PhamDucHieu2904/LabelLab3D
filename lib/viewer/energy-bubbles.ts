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

/** 2D XZ spatial grid over water triangles for O(1) vertical (+Y) raycast queries. */
function buildVerticalRayGrid(geometry: THREE.BufferGeometry, bounds: THREE.Box3, gridSize = 24) {
  const pos = geometry.getAttribute('position');
  const index = geometry.index;
  const totalIndices = index ? index.count : pos.count;
  const maxTris = Math.floor(totalIndices / 3);
  const tris = new Float32Array(maxTris * 9);
  const minX = bounds.min.x, minZ = bounds.min.z;
  const spanX = Math.max(1e-9, bounds.max.x - minX);
  const spanZ = Math.max(1e-9, bounds.max.z - minZ);
  const invX = gridSize / spanX, invZ = gridSize / spanZ;
  const cells: number[][] = Array.from({ length: gridSize * gridSize }, () => []);

  let count = 0;
  for (let offset = 0; offset + 2 < totalIndices; offset += 3) {
    const i0 = index ? index.getX(offset) : offset;
    const i1 = index ? index.getX(offset + 1) : offset + 1;
    const i2 = index ? index.getX(offset + 2) : offset + 2;
    const ax = pos.getX(i0), ay = pos.getY(i0), az = pos.getZ(i0);
    const bx = pos.getX(i1), by = pos.getY(i1), bz = pos.getZ(i1);
    const cx = pos.getX(i2), cy = pos.getY(i2), cz = pos.getZ(i2);
    // Vertical (+Y) ray cannot intersect triangles degenerate in XZ.
    const area2 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
    if (Math.abs(area2) < 1e-18) continue;
    const id = count++;
    const o = id * 9;
    tris[o] = ax; tris[o + 1] = ay; tris[o + 2] = az;
    tris[o + 3] = bx; tris[o + 4] = by; tris[o + 5] = bz;
    tris[o + 6] = cx; tris[o + 7] = cy; tris[o + 8] = cz;
    const x0 = Math.max(0, Math.min(gridSize - 1, Math.floor((Math.min(ax, bx, cx) - minX) * invX)));
    const x1 = Math.max(0, Math.min(gridSize - 1, Math.floor((Math.max(ax, bx, cx) - minX) * invX)));
    const z0 = Math.max(0, Math.min(gridSize - 1, Math.floor((Math.min(az, bz, cz) - minZ) * invZ)));
    const z1 = Math.max(0, Math.min(gridSize - 1, Math.floor((Math.max(az, bz, cz) - minZ) * invZ)));
    for (let gz = z0; gz <= z1; gz++) {
      const row = gz * gridSize;
      for (let gx = x0; gx <= x1; gx++) cells[row + gx].push(id);
    }
  }
  const hitBuf: number[] = [];
  return function raycastUp(ox: number, oy: number, oz: number, dedupEps: number): number {
    const gx = Math.floor((ox - minX) * invX);
    const gz = Math.floor((oz - minZ) * invZ);
    if (gx < 0 || gx >= gridSize || gz < 0 || gz >= gridSize) return -Infinity;
    const bucket = cells[gz * gridSize + gx];
    if (!bucket.length) return -Infinity;
    hitBuf.length = 0;
    for (let i = 0; i < bucket.length; i++) {
      const o = bucket[i] * 9;
      const ax = tris[o], ay = tris[o + 1], az = tris[o + 2];
      const bx = tris[o + 3], by = tris[o + 4], bz = tris[o + 5];
      const cx = tris[o + 6], cy = tris[o + 7], cz = tris[o + 8];
      const v0x = cx - ax, v0z = cz - az;
      const v1x = bx - ax, v1z = bz - az;
      const det = v1x * v0z - v1z * v0x;
      if (Math.abs(det) < 1e-18) continue;
      const v2x = ox - ax, v2z = oz - az;
      const invDet = 1 / det;
      const u = (v2x * v0z - v2z * v0x) * invDet;
      if (u < -1e-7 || u > 1 + 1e-7) continue;
      const v = (v1x * v2z - v1z * v2x) * invDet;
      if (v < -1e-7 || u + v > 1 + 1e-7) continue;
      const hitY = ay + u * (by - ay) + v * (cy - ay);
      const dist = hitY - oy;
      if (dist >= 0) hitBuf.push(dist);
    }
    if (!hitBuf.length) return -Infinity;
    hitBuf.sort((a, b) => a - b);
    let unique = 1;
    let prev = hitBuf[0];
    for (let i = 1; i < hitBuf.length; i++) {
      if (Math.abs(hitBuf[i] - prev) > dedupEps) {
        unique++;
        prev = hitBuf[i];
      }
    }
    return unique % 2 === 1 ? hitBuf[0] : -Infinity;
  };
}

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
  // Deduplicate vertices before ConvexHull to keep hull construction fast.
  const positions = queryGeometry.getAttribute('position');
  const uniquePoints: THREE.Vector3[] = [];
  const seenVert = new Set<string>();
  const quant = 1 / Math.max(1e-7, height * 1e-4);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const key = `${Math.round(x * quant)},${Math.round(y * quant)},${Math.round(z * quant)}`;
    if (!seenVert.has(key)) {
      seenVert.add(key);
      uniquePoints.push(new THREE.Vector3(x, y, z));
    }
  }
  const hull = new ConvexHull().setFromPoints(uniquePoints);
  const planes: { normal: THREE.Vector3; constant: number }[] = [];
  for (const face of hull.faces) {
    if (!planes.some(p => p.normal.dot(face.normal) > .999999 && Math.abs(p.constant - face.constant) < height * 1e-6)) {
      planes.push({ normal: face.normal.clone(), constant: face.constant });
    }
  }
  const raycastUp = buildVerticalRayGrid(queryGeometry, bounds);
  queryGeometry.dispose();
  const labelBounds = label ? new THREE.Box3().setFromObject(label) : undefined;
  const dedupEps = height * 1e-6;
  function ceiling(position: THREE.Vector3, diameter: number): number {
    const margin = diameter * .625 + height * ENERGY_BUBBLES.wallInset;
    if (!bounds.containsPoint(position)) return -Infinity;
    if (labelBounds && position.y >= labelBounds.min.y - margin && position.y <= labelBounds.max.y + margin) return -Infinity;
    for (const plane of planes) if (plane.normal.dot(position) - plane.constant > -margin) return -Infinity;
    let top = labelBounds && position.y < labelBounds.min.y ? labelBounds.min.y - margin : bounds.max.y;
    // Convex collision alone bridges the concave shoulder. Cache a safe rise
    // column from the actual water triangles so bubbles cannot escape there.
    const d0 = raycastUp(position.x, position.y, position.z, dedupEps);
    if (!Number.isFinite(d0)) return -Infinity;
    top = Math.min(top, position.y + d0 - margin);
    const d1 = raycastUp(position.x + margin, position.y, position.z, dedupEps);
    if (!Number.isFinite(d1)) return -Infinity;
    top = Math.min(top, position.y + d1 - margin);
    const d2 = raycastUp(position.x - margin, position.y, position.z, dedupEps);
    if (!Number.isFinite(d2)) return -Infinity;
    top = Math.min(top, position.y + d2 - margin);
    const d3 = raycastUp(position.x, position.y, position.z + margin, dedupEps);
    if (!Number.isFinite(d3)) return -Infinity;
    top = Math.min(top, position.y + d3 - margin);
    const d4 = raycastUp(position.x, position.y, position.z - margin, dedupEps);
    if (!Number.isFinite(d4)) return -Infinity;
    top = Math.min(top, position.y + d4 - margin);
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
    dispose() { mesh.removeFromParent(); geometry.dispose(); material.dispose(); mesh.dispose(); },
    // Read-only positions support containment and spherical-scale regression tests.
    snapshot: () => particles.map(p => ({ position: p.position.clone(), diameter: p.diameter })),
    contains,
  };
}
