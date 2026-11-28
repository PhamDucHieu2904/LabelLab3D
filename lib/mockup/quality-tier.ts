import type { ProductAsset } from '../viewer-config';

export type QualityTier = 'low' | 'medium' | 'high' | 'ultra';
export type QualityPreference = 'auto' | QualityTier;
export type SceneWeight = 'light' | 'medium' | 'heavy';

export const QUALITY_TIERS: readonly QualityTier[] = Object.freeze(['low', 'medium', 'high', 'ultra']);
export const QUALITY_PREFERENCES: readonly QualityPreference[] = Object.freeze(['auto', 'low', 'medium', 'high', 'ultra']);
export const QUALITY_STORAGE_KEY = 'labellab.graphics.quality.v1';
export const WEBGL_SAFE_MODE_KEY = 'labellab.webgl.safeMode.v1';

export interface QualityTierMeta {
  readonly id: QualityPreference;
  readonly label: string;
  readonly shortLabel: string;
  readonly description: string;
}

export const QUALITY_PREFERENCE_OPTIONS: readonly QualityTierMeta[] = Object.freeze([
  {
    id: 'auto',
    label: 'Auto (Recommended)',
    shortLabel: 'Auto',
    description: 'Automatically matches your GPU and scales per model complexity.',
  },
  {
    id: 'low',
    label: 'Low · Battery / Older PC',
    shortLabel: 'Low',
    description: 'Lightweight interactive rendering with crisp still-frame refinement.',
  },
  {
    id: 'medium',
    label: 'Medium · Balanced',
    shortLabel: 'Medium',
    description: 'Sharp 4x MSAA on boxes & cans; smooth adaptive scaling on heavy glass.',
  },
  {
    id: 'high',
    label: 'High · Crisp Studio',
    shortLabel: 'High',
    description: 'Full native sharpness & 4x MSAA on boxes, cans & PET; idle-sharp heavy glass.',
  },
  {
    id: 'ultra',
    label: 'Ultra · Max Fidelity',
    shortLabel: 'Ultra',
    description: 'Full Retina DPR, 4x MSAA, and 8 optical bounces on all models (RTX 2060+ / M-Pro).',
  },
]);

export interface HardwareProbe {
  readonly rendererName: string;
  readonly maxTextureSize: number;
  readonly maxSamples: number;
  readonly hardwareConcurrency: number;
  readonly deviceMemoryGb?: number;
  readonly isMobile: boolean;
  readonly supportsHalfFloat: boolean;
}

export interface RenderQualityBudget {
  readonly tier: QualityTier;
  readonly weight: SceneWeight;
  readonly maxDpr: number;
  readonly interactiveScale: number;
  readonly idleScale: number;
  readonly interactiveMsaa: number;
  readonly idleMsaa: number;
  readonly maxFps: number;
  readonly opticalBounces: number;
  /** Three.js WebGLRenderer.transmissionResolutionScale (0.5 on Low saves 75% fillrate & VRAM). */
  readonly transmissionScale: number;
  /** Resolution scale for the glass rear-paper capture pass (0.5 on Low). */
  readonly paperBackingScale: number;
  /** Bypass heavy BVH neck/ring raytracing GLSL shaders on Low tier and use calibrated native transmission. */
  readonly simplifiedOptics: boolean;
  /** Maximum texture anisotropy (1 on Low, 2 on Medium, 4 on High/Ultra). */
  readonly maxAnisotropy: number;
  /** Milliseconds after interaction stops before painting the crisp idle frame (0 = already max sharpness). */
  readonly idleRefineMs: number;
}

export interface QualityRuntimeReport {
  readonly preference: QualityPreference;
  readonly detectedTier: QualityTier;
  readonly effectiveTier: QualityTier;
  readonly sceneWeight: SceneWeight;
  readonly interactiveMsaa: number;
  readonly idleMsaa: number;
}

/** Heavy multi-pass optical glass/liquid bottles (100k–254k triangles + refraction). */
const HEAVY_ASSET_IDS = new Set([
  'glass-300-milk',
  'glass-290-basil',
  'glass-290-basil-web',
  'basil-strawberry',
  'glass-290-chia',
  'glass-290-milk',
  'glass-290-pullcap-basil',
  'glass-290-pullcap-chia',
  'glass-290-pullcap-milk',
  'glass-485-milk',
  'pet-500-short-label',
  'pet-500-full-label',
  'registry-pet-500-aloe',
  'pet-aloe',
  'pet-320-full-nata',
  'pet-nata-watermelon',
  'pet-1500-short-label',
  'pet-1500-juice',
]);

/**
 * Classify 3D scene workload into 3 clear weight classes:
 * - 'light': Parametric boxes/trays (~200–600 tris), aluminum cans (~4k tris), future apparel.
 * - 'medium': Standard PET/PP bottles and simple glass without heavy inclusions.
 * - 'heavy': Dense glass/liquid optics bottles (up to 254k tris + refraction passes).
 */
export function classifySceneWeight(asset?: ProductAsset | null, isProcedural = false): SceneWeight {
  if (isProcedural) return 'light';
  if (!asset) return 'light';
  if (asset.packaging === 'can' || asset.packaging === 'pouch' || asset.packaging === 'other') return 'light';
  if (HEAVY_ASSET_IDS.has(asset.id)) return 'heavy';
  if (/glass-290|glass-300|glass-485|basil|aloe|nata|pet-1500/i.test(asset.id)) return 'heavy';
  return 'medium';
}

/**
 * Hybrid hardware tier detector combining WebGL renderer string, GPU limits,
 * CPU core count, device memory, and mobile form factor.
 * Works reliably on Chrome/Edge (exact GPU names) AND Safari/Firefox (generic "Apple GPU" fallback).
 */
export function detectHardwareTier(probe: HardwareProbe): QualityTier {
  const name = probe.rendererName || '';

  // 1. Software renderers or severely constrained WebGL environments -> always Low.
  if (
    /swiftshader|llvmpipe|lavapipe|virgl|software|microsoft basic render|warp|subzero/i.test(name) ||
    probe.maxTextureSize < 4096 ||
    !probe.supportsHalfFloat
  ) {
    return 'low';
  }

  // 2. Ultra tier: RTX 2060+, RTX 3060+, RTX 40xx/50xx, RX 6600+/7xxx/9xxx, Arc A580+/B5xx, Apple Pro/Max/Ultra.
  const isUltraGpu =
    /rtx\s*(20[6-9]0|30[6-9]0|40[6-9]0|50[6-9]0|a[2-6]000|ada|titan)/i.test(name) ||
    /quadro\s*rtx/i.test(name) ||
    /radeon\s*(rx\s*(6[6-9]\d0|7[6-9]\d0|90[6-9]0)|pro\s*(w6|w7|vega\s*64))/i.test(name) ||
    /intel.*arc.*(a5\d0|a7\d0|b5\d0)/i.test(name) ||
    /apple\s*m[2-9]\s*(pro|max|ultra)/i.test(name);
  if (isUltraGpu && !probe.isMobile) return 'ultra';

  // Safari on macOS hides Apple Silicon model behind generic "Apple GPU".
  // Desktop Apple Silicon with >= 10 cores & 16k textures reliably handles Ultra; >= 8 cores handles High.
  if (/apple\s*gpu/i.test(name) && !probe.isMobile) {
    if (probe.hardwareConcurrency >= 10 && probe.maxTextureSize >= 16384 && (probe.deviceMemoryGb ?? 16) >= 8) {
      return 'ultra';
    }
    return 'high';
  }

  // 3. High tier: GTX 1650/1660/1060+, RTX 2050/3050/4050, RX 570+/5500+/6400/6500, Arc A3xx, Radeon 780M/890M, Apple M1–M4.
  const isHighGpu =
    /gtx\s*(9[78]0|10[6-8]0|16[56]0)/i.test(name) ||
    /rtx\s*(2050|3050|4050|5050)/i.test(name) ||
    /radeon\s*(rx\s*(5[7-9]0|5[5-7]00|6[45]00)|7[89]0m|8[89]0m)/i.test(name) ||
    /intel.*arc/i.test(name) ||
    /apple\s*m[1-9]\b/i.test(name);
  if (isHighGpu && !probe.isMobile) return 'high';

  // 4. Low tier: legacy/entry integrated & discrete GPUs that can hit Windows D3D11 TDR on heavy BVH shaders,
  // older Intel HD / UHD (except UHD 7xx), legacy Radeon R2-R7/HD/Vega 3, entry GeForce GT/M/MX1xx/Quadro K/NVS,
  // entry mobile chips, or severely constrained office hardware.
  const isIntelLegacyOrBareUhd =
    /intel.*(\bhd\s*graphics|\bgma\b)/i.test(name) ||
    (/intel.*\buhd\s*graphics\b/i.test(name) && !/\buhd\s*graphics\s*7\d\d\b/i.test(name));
  const isLegacyAmd = /radeon.*(\br[2-7]\b|\bhd\s*[2-8]\d{3}\b|\bvega\s*[23]\b)/i.test(name);
  const isLegacyNvidia =
    /geforce\s*(gt\s*[1-7]\d{2}\b|g\s*\d{3}\b|[1-9][0-4]0m\b|210\b|310\b|410\b|mx1[13]0\b)/i.test(name) ||
    /quadro\s*(k[46]20|nvs|fx|[246]00\b)/i.test(name);
  const isLegacyMobileGpu =
    /adreno.*(3\d\d|4\d\d|5\d\d)/i.test(name) ||
    /mali-(4\d\d|t\d\d\d|g3\d|g5[12])/i.test(name) ||
    /powervr/i.test(name);
  if (isIntelLegacyOrBareUhd || isLegacyAmd || isLegacyNvidia || isLegacyMobileGpu) return 'low';
  if (probe.isMobile && ((probe.deviceMemoryGb !== undefined && probe.deviceMemoryGb <= 4) || probe.hardwareConcurrency <= 4)) {
    return 'low';
  }
  // Stripped/hidden renderer string on low-resource hardware -> stay safe in Low tier.
  if (!name.trim() && (probe.maxTextureSize <= 4096 || probe.hardwareConcurrency <= 4)) {
    return 'low';
  }

  // 5. Medium tier: modern iGPUs (Intel Iris Xe/Plus, UHD 730-770, Radeon Vega/660M/680M), GTX 1050/MX250+, modern mobile.
  const isMediumGpu =
    /iris|uhd\s*graphics\s*7\d\d|radeon\(tm\)\s*graphics|vega|6[68]0m|gtx\s*(9[56]0|1050)|mx[2-5]\d{2}|geforce\s*gt\s*1030/i.test(name) ||
    /adreno.*(6\d\d|7\d\d|8\d\d)|mali-(g6|g7|g8)|immortalis|apple\s*gpu/i.test(name);
  if (isMediumGpu) {
    // Low-RAM / low-core office machines sharing an integrated GPU still benefit from Low-tier stability.
    if (!probe.isMobile && probe.hardwareConcurrency <= 4 && probe.deviceMemoryGb !== undefined && probe.deviceMemoryGb <= 4) {
      return 'low';
    }
    return 'medium';
  }

  // 6. Unknown discrete-like desktop GPU vs generic fallback.
  if (!probe.isMobile && /nvidia|geforce|radeon|quadro/i.test(name)) return 'high';
  if (!probe.isMobile && probe.hardwareConcurrency <= 4 && probe.deviceMemoryGb !== undefined && probe.deviceMemoryGb <= 4) {
    return 'low';
  }
  return 'medium';
}

function clampMsaa(requested: number, maxSamples: number): number {
  if (requested <= 0 || maxSamples < 2) return 0;
  return Math.min(requested, maxSamples);
}

/**
 * 4 Tiers × 3 Scene Weights rendering budget matrix.
 * Key principle: Lightweight CAD cartons/trays & cans stay razor-sharp (Full DPR + 4x MSAA)
 * even on Medium laptops, while heavy optical glass bottles scale interactively and refine
 * automatically to crisp 4x MSAA as soon as the user releases the mouse ("Idle Sharpness").
 * Low tier disables heavy BVH raytracing shaders, halves transmission/backing capture buffers,
 * and disables MSAA on bottles so legacy iGPUs & software WebGL stay smooth without TDR crashes.
 */
export function resolveQualityBudget(
  tier: QualityTier,
  weight: SceneWeight,
  maxSamples = 4,
): RenderQualityBudget {
  const msaa4 = clampMsaa(4, maxSamples);
  const msaa2 = clampMsaa(2, maxSamples);

  if (tier === 'ultra') {
    return {
      tier,
      weight,
      maxDpr: 2,
      interactiveScale: 1,
      idleScale: 1,
      interactiveMsaa: msaa4,
      idleMsaa: msaa4,
      maxFps: 60,
      opticalBounces: weight === 'heavy' ? 8 : 6,
      transmissionScale: 1,
      paperBackingScale: 1,
      simplifiedOptics: false,
      maxAnisotropy: 4,
      idleRefineMs: 0,
    };
  }

  if (tier === 'high') {
    if (weight === 'light') {
      return {
        tier, weight, maxDpr: 2,
        interactiveScale: 1, idleScale: 1,
        interactiveMsaa: msaa4, idleMsaa: msaa4,
        maxFps: 60, opticalBounces: 6,
        transmissionScale: 1, paperBackingScale: 1,
        simplifiedOptics: false, maxAnisotropy: 4,
        idleRefineMs: 0,
      };
    }
    if (weight === 'medium') {
      return {
        tier, weight, maxDpr: 1.75,
        interactiveScale: 1, idleScale: 1,
        interactiveMsaa: msaa4, idleMsaa: msaa4,
        maxFps: 60, opticalBounces: 6,
        transmissionScale: 1, paperBackingScale: 1,
        simplifiedOptics: false, maxAnisotropy: 4,
        idleRefineMs: 0,
      };
    }
    // Heavy glass bottles on High (GTX 1650 class): smooth interactive drag, razor-sharp 4x MSAA on release!
    return {
      tier, weight, maxDpr: 1.5,
      interactiveScale: 0.82, idleScale: 1,
      interactiveMsaa: 0, idleMsaa: msaa4,
      maxFps: 60, opticalBounces: 6,
      transmissionScale: 1, paperBackingScale: 1,
      simplifiedOptics: false, maxAnisotropy: 4,
      idleRefineMs: 160,
    };
  }

  if (tier === 'medium') {
    if (weight === 'light') {
      return {
        tier, weight, maxDpr: 1.6,
        interactiveScale: 1, idleScale: 1,
        interactiveMsaa: msaa4, idleMsaa: msaa4,
        maxFps: 60, opticalBounces: 4,
        transmissionScale: 1, paperBackingScale: 1,
        simplifiedOptics: false, maxAnisotropy: 2,
        idleRefineMs: 0,
      };
    }
    if (weight === 'medium') {
      return {
        tier, weight, maxDpr: 1.4,
        interactiveScale: 0.9, idleScale: 1,
        interactiveMsaa: msaa2, idleMsaa: msaa4,
        maxFps: 45, opticalBounces: 4,
        transmissionScale: 0.85, paperBackingScale: 1,
        simplifiedOptics: false, maxAnisotropy: 2,
        idleRefineMs: 160,
      };
    }
    return {
      tier, weight, maxDpr: 1.25,
      interactiveScale: 0.72, idleScale: 1,
      interactiveMsaa: 0, idleMsaa: msaa4,
      maxFps: 30, opticalBounces: 4,
      transmissionScale: 0.75, paperBackingScale: 0.75,
      simplifiedOptics: false, maxAnisotropy: 2,
      idleRefineMs: 190,
    };
  }

  // 'low' tier (legacy iGPU, weak mobile, or software WebGL):
  // Disable heavy BVH shaders (simplifiedOptics), halve transmission & paper-backing buffers,
  // avoid MSAA FBO blits on bottles, and keep boxes/cans crisp when standing still.
  if (weight === 'light') {
    return {
      tier, weight, maxDpr: 1.25,
      interactiveScale: 0.85, idleScale: 1,
      interactiveMsaa: 0, idleMsaa: msaa2,
      maxFps: 30, opticalBounces: 2,
      transmissionScale: 0.5, paperBackingScale: 0.5,
      simplifiedOptics: true, maxAnisotropy: 1,
      idleRefineMs: 200,
    };
  }
  if (weight === 'medium') {
    return {
      tier, weight, maxDpr: 1,
      interactiveScale: 0.72, idleScale: 0.92,
      interactiveMsaa: 0, idleMsaa: 0,
      maxFps: 30, opticalBounces: 2,
      transmissionScale: 0.5, paperBackingScale: 0.5,
      simplifiedOptics: true, maxAnisotropy: 1,
      idleRefineMs: 220,
    };
  }
  return {
    tier, weight, maxDpr: 1,
    interactiveScale: 0.55, idleScale: 0.85,
    interactiveMsaa: 0, idleMsaa: 0,
    maxFps: 24, opticalBounces: 2,
    transmissionScale: 0.5, paperBackingScale: 0.5,
    simplifiedOptics: true, maxAnisotropy: 1,
    idleRefineMs: 260,
  };
}

export function stepTierDown(tier: QualityTier): QualityTier {
  if (tier === 'ultra') return 'high';
  if (tier === 'high') return 'medium';
  return 'low';
}

export function parseQualityPreference(value: unknown): QualityPreference {
  return typeof value === 'string' && (QUALITY_PREFERENCES as readonly string[]).includes(value)
    ? (value as QualityPreference)
    : 'auto';
}

export function loadQualityPreference(storage?: Pick<Storage, 'getItem'>): QualityPreference {
  try {
    const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    return parseQualityPreference(target?.getItem(QUALITY_STORAGE_KEY));
  } catch {
    return 'auto';
  }
}

export function saveQualityPreference(value: QualityPreference, storage?: Pick<Storage, 'setItem'>): boolean {
  try {
    const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!target) return false;
    target.setItem(QUALITY_STORAGE_KEY, parseQualityPreference(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * Session-scoped crash guard set after a WebGL context loss or initialization failure.
 * Keeps subsequent page navigations (e.g. Homepage -> Shared Link) in Safe Low Mode
 * so a heavy shader never triggers repeated GPU driver resets in the same session.
 */
export function loadWebglSafeMode(storage?: Pick<Storage, 'getItem'>): boolean {
  try {
    const target = storage ?? (typeof window !== 'undefined' ? window.sessionStorage : undefined);
    return target?.getItem(WEBGL_SAFE_MODE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markWebglSafeMode(enabled: boolean, storage?: Pick<Storage, 'setItem' | 'removeItem'>): boolean {
  try {
    const target = storage ?? (typeof window !== 'undefined' ? window.sessionStorage : undefined);
    if (!target) return false;
    if (enabled) target.setItem(WEBGL_SAFE_MODE_KEY, '1');
    else target.removeItem(WEBGL_SAFE_MODE_KEY);
    return true;
  } catch {
    return false;
  }
}
