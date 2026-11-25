import * as THREE from 'three';
import type { QualityTier } from './quality-tier';

const GOLDEN_ANGLE_RAD = Math.PI * (3 - Math.sqrt(5));

export type SoftboxAccumulationMode = 'idle' | 'export';

/**
 * Resolve progressive multi-sample studio softbox count per hardware tier.
 * Interactive dragging always uses 1 cached shadow sample (0 ms shadow cost);
 * standing still (idle) and PNG exports progressively accumulate area-light
 * penumbra shadows and Halton subpixel anti-aliasing.
 */
export function resolveSoftboxSampleCount(
  tier: QualityTier,
  mode: SoftboxAccumulationMode,
): number {
  if (mode === 'export') {
    if (tier === 'ultra' || tier === 'high') return 12;
    if (tier === 'medium') return 8;
    return 4;
  }
  if (tier === 'ultra') return 12;
  if (tier === 'high') return 10;
  if (tier === 'medium') return 6;
  return 0;
}

/** Radical inverse in the given integer base for low-discrepancy Halton sequences. */
export function haltonSequence(index: number, base: number): number {
  let result = 0;
  let f = 1 / base;
  let i = Math.max(0, Math.floor(index));
  while (i > 0) {
    result += f * (i % base);
    i = Math.floor(i / base);
    f /= base;
  }
  return result;
}

/**
 * Compute centered subpixel camera jitter in display pixels (`[-amplitude, +amplitude]`)
 * for temporal supersampling (SSAA). Sample 0 is always `[0, 0]` so the first frame
 * aligns identically with the interactive preview.
 */
export function computeHaltonJitterPx(
  sampleIndex: number,
  amplitudePx = 0.36,
): readonly [number, number] {
  if (sampleIndex <= 0 || amplitudePx <= 0) return [0, 0];
  const jx = (haltonSequence(sampleIndex, 2) - 0.5) * 2 * amplitudePx;
  const jy = (haltonSequence(sampleIndex, 3) - 0.5) * 2 * amplitudePx;
  return [jx, jy];
}

const _lightVec = new THREE.Vector3();
const _lightDir = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);
const _fallbackUp = new THREE.Vector3(0, 0, 1);
const _tangentU = new THREE.Vector3();
const _tangentV = new THREE.Vector3();

/**
 * Compute a sample position on a virtual photographic studio softbox disc emitter
 * centered on `basePosition` using a low-discrepancy Vogel golden-angle spiral.
 * Preserves exact light distance to `target` so shadow contact points stay sharp while
 * distant cast shadows feather smoothly like a physical 100 cm studio octabox.
 */
export function computeSoftboxKeyLightPosition(
  basePosition: THREE.Vector3,
  target: THREE.Vector3,
  subjectRadius: number,
  sampleIndex: number,
  totalSamples: number,
  out: THREE.Vector3 = new THREE.Vector3(),
  angularSpreadFactor = 0.72,
): THREE.Vector3 {
  if (sampleIndex <= 0 || totalSamples <= 1) {
    return out.copy(basePosition);
  }
  _lightVec.subVectors(basePosition, target);
  const dist = _lightVec.length();
  if (!(dist > 1e-5)) {
    return out.copy(basePosition);
  }
  _lightDir.copy(_lightVec).divideScalar(dist);

  const refUp = Math.abs(_lightDir.y) > 0.96 ? _fallbackUp : _worldUp;
  _tangentU.crossVectors(refUp, _lightDir).normalize();
  _tangentV.crossVectors(_lightDir, _tangentU).normalize();

  // Vogel golden-angle disc distribution (index 1..N-1 covers the full softbox aperture evenly)
  const effectiveN = Math.max(1, totalSamples - 1);
  const k = Math.max(0, Math.min(effectiveN - 1, sampleIndex - 1));
  const r = Math.sqrt((k + 0.5) / effectiveN);
  const theta = k * GOLDEN_ANGLE_RAD;
  const discRadius = Math.max(0.015, subjectRadius * angularSpreadFactor);

  out
    .copy(basePosition)
    .addScaledVector(_tangentU, Math.cos(theta) * r * discRadius)
    .addScaledVector(_tangentV, Math.sin(theta) * r * discRadius);

  // Project back onto the sphere of radius `dist` around `target` so exposure & light falloff stay constant
  out.sub(target).normalize().multiplyScalar(dist).add(target);
  return out;
}
