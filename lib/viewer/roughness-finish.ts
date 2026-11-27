import * as THREE from 'three';

export interface AuthoredPhysicalFinish {
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  specularIntensity: number;
  anisotropy: number;
}

export interface CoupledPhysicalFinish {
  clearcoat: number;
  clearcoatRoughness: number;
  specularIntensity: number;
  anisotropy: number;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/**
 * Couple physical clearcoat, specular intensity, and anisotropy to the user's
 * roughness slider so high-roughness / matte settings (65%–100%) actually
 * eliminate top-coat lacquer reflections instead of staying glossy under a
 * frozen clearcoat layer.
 */
export function computeRoughnessCoupledPhysicalFinish(
  roughness: number,
  base: AuthoredPhysicalFinish,
): CoupledPhysicalFinish {
  const r = clamp01(Number.isFinite(roughness) ? roughness : base.roughness);
  const baseR = clamp01(Number.isFinite(base.roughness) ? base.roughness : 0.15);
  const baseClearcoat = clamp01(Number.isFinite(base.clearcoat) ? base.clearcoat : 0);
  const baseClearcoatRoughness = clamp01(
    Number.isFinite(base.clearcoatRoughness) ? base.clearcoatRoughness : baseR,
  );
  const baseSpecular = clamp01(
    Number.isFinite(base.specularIntensity) ? base.specularIntensity : 1,
  );
  const baseAnisotropy = clamp01(Number.isFinite(base.anisotropy) ? base.anisotropy : 0);

  let clearcoat = baseClearcoat;
  let clearcoatRoughness = baseClearcoatRoughness;
  if (baseClearcoat > 0) {
    if (r <= baseR) {
      clearcoat = baseClearcoat;
      clearcoatRoughness =
        baseR > 1e-4 ? baseClearcoatRoughness * (r / baseR) : Math.min(baseClearcoatRoughness, r);
    } else {
      const fadeEnd = Math.max(baseR + 0.2, 0.65);
      const t = clamp01((r - baseR) / (fadeEnd - baseR));
      const remain = 1 - t;
      clearcoat = baseClearcoat * remain * remain;
      clearcoatRoughness = baseClearcoatRoughness + (1 - baseClearcoatRoughness) * t;
    }
  }

  // Smoothly soften residual dielectric grazing Fresnel in the deep matte band
  // (0.65..1.0) so dark/black 100% rough labels look genuinely velvety matte
  // while preserving gentle 3D cylinder wrap shading (never a flat silhouette).
  const matteT = clamp01((r - 0.65) / 0.35);
  const specularIntensity = baseSpecular * (1 - 0.65 * matteT * matteT);

  let anisotropy = baseAnisotropy;
  if (baseAnisotropy > 0 && r > baseR) {
    const t = clamp01((r - baseR) / Math.max(0.05, 1 - baseR));
    anisotropy = baseAnisotropy * (1 - t);
  }

  return { clearcoat, clearcoatRoughness, specularIntensity, anisotropy };
}

export function readAuthoredPhysicalFinish(
  material: THREE.MeshStandardMaterial,
): AuthoredPhysicalFinish {
  if (material instanceof THREE.MeshPhysicalMaterial) {
    return {
      roughness: material.roughness,
      clearcoat: material.clearcoat,
      clearcoatRoughness: material.clearcoatRoughness,
      specularIntensity: material.specularIntensity,
      anisotropy: material.anisotropy,
    };
  }
  return {
    roughness: material.roughness,
    clearcoat: 0,
    clearcoatRoughness: material.roughness,
    specularIntensity: 1,
    anisotropy: 0,
  };
}

export function applyRoughnessCoupledPhysicalFinish(
  material: THREE.MeshStandardMaterial,
  roughness: number,
  base: AuthoredPhysicalFinish,
): void {
  if (!(material instanceof THREE.MeshPhysicalMaterial)) return;
  const prevHasClearcoat = material.clearcoat > 0;
  const prevHasAnisotropy = material.anisotropy > 0;
  const next = computeRoughnessCoupledPhysicalFinish(roughness, base);
  material.clearcoat = next.clearcoat;
  material.clearcoatRoughness = next.clearcoatRoughness;
  material.specularIntensity = next.specularIntensity;
  material.anisotropy = next.anisotropy;
  if (
    (material.clearcoat > 0) !== prevHasClearcoat ||
    (material.anisotropy > 0) !== prevHasAnisotropy
  ) {
    material.needsUpdate = true;
  }
}
