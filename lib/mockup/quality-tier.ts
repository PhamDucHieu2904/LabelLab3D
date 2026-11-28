import type { ProductAsset } from '../viewer-config';

export type QualityTier = 'low' | 'medium' | 'high' | 'ultra';
export type QualityPreference = 'auto' | QualityTier;
export type SceneWeight = 'light' | 'medium' | 'heavy';

export const QUALITY_TIERS: readonly QualityTier[] = Object.freeze(['low', 'medium', 'high', 'ultra']);
export const QUALITY_PREFERENCES: readonly QualityPreference[] = Object.freeze(['auto', 'low', 'medium', 'high', 'ultra']);
export const QUALITY_STORAGE_KEY = 'labellab.graphics.quality.v1';

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
    /swiftshader|llvmpipe|software|microsoft basic render|warp|subzero/i.test(name) ||
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

  // 4. Low tier: older integrated GPUs (Intel HD 2000-630, UHD 600-630), entry mobile chips, low RAM/CPU.
  const isLegacyLowGpu =
    /intel.*(hd\s*graphics|uhd\s*graphics\s*6\d\d|gma)/i.test(name) ||
    /adreno.*(3\d\d|4\d\d|5\d\d)/i.test(name) ||
    /mali-(4\d\d|t\d\d\d|g3\d|g5[12])/i.test(name) ||
    /powervr/i.test(name);
  if (isLegacyLowGpu) return 'low';
  if (probe.isMobile && ((probe.deviceMemoryGb !== undefined && probe.deviceMemoryGb <= 4) || probe.hardwareConcurrency <= 4)) {
    return 'low';
  }

  // 5. Medium tier: modern iGPUs (Intel Iris Xe/Plus, UHD 730-770, Radeon Vega/660M/680M), GTX 1050/MX, modern mobile.
  const isMediumGpu =
    /iris|uhd\s*graphics\s*7\d\d|radeon\(tm\)\s*graphics|vega|6[68]0m|gtx\s*(9[56]0|1050)|mx\d{3}|geforce\s*gt/i.test(name) ||
    /adreno.*(6\d\d|7\d\d|8\d\d)|mali-(g6|g7|g8)|immortalis|apple\s*gpu/i.test(name);
  if (isMediumGpu) return 'medium';

  // 6. Unknown discrete-like desktop GPU vs generic fallback.
  if (!probe.isMobile && /nvidia|geforce|radeon|quadro/i.test(name)) return 'high';
  return probe.isMobile ? 'medium' : 'medium';
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
      idleRefineMs: 0,
    };
  }

  if (tier === 'high') {
    if (weight === 'light') {
      return {
        tier, weight, maxDpr: 2,
        interactiveScale: 1, idleScale: 1,
        interactiveMsaa: msaa4, idleMsaa: msaa4,
        maxFps: 60, opticalBounces: 6, idleRefineMs: 0,
      };
    }
    if (weight === 'medium') {
      return {
        tier, weight, maxDpr: 1.75,
        interactiveScale: 1, idleScale: 1,
        interactiveMsaa: msaa4, idleMsaa: msaa4,
        maxFps: 60, opticalBounces: 6, idleRefineMs: 0,
      };
    }
    // Heavy glass bottles on High (GTX 1650 class): smooth interactive drag, razor-sharp 4x MSAA on release!
    return {
      tier, weight, maxDpr: 1.5,
      interactiveScale: 0.82, idleScale: 1,
      interactiveMsaa: 0, idleMsaa: msaa4,
      maxFps: 60, opticalBounces: 6, idleRefineMs: 160,
    };
  }

  if (tier === 'medium') {
    if (weight === 'light') {
      return {
        tier, weight, maxDpr: 1.6,
        interactiveScale: 1, idleScale: 1,
        interactiveMsaa: msaa4, idleMsaa: msaa4,
        maxFps: 60, opticalBounces: 4, idleRefineMs: 0,
      };
    }
    if (weight === 'medium') {
      return {
        tier, weight, maxDpr: 1.4,
        interactiveScale: 0.9, idleScale: 1,
        interactiveMsaa: msaa2, idleMsaa: msaa4,
        maxFps: 45, opticalBounces: 4, idleRefineMs: 160,
      };
    }
    return {
      tier, weight, maxDpr: 1.25,
      interactiveScale: 0.72, idleScale: 1,
      interactiveMsaa: 0, idleMsaa: msaa4,
      maxFps: 30, opticalBounces: 4, idleRefineMs: 190,
    };
  }

  // 'low' tier (legacy iGPU, weak mobile, or software WebGL): preserve lightweight interactive budget,
  // but still sharpen boxes/cans cleanly when standing still!
  if (weight === 'light') {
    return {
      tier, weight, maxDpr: 1.25,
      interactiveScale: 0.85, idleScale: 1,
      interactiveMsaa: 0, idleMsaa: msaa2,
      maxFps: 30, opticalBounces: 3, idleRefineMs: 200,
    };
  }
  if (weight === 'medium') {
    return {
      tier, weight, maxDpr: 1,
      interactiveScale: 0.75, idleScale: 1,
      interactiveMsaa: 0, idleMsaa: msaa2,
      maxFps: 30, opticalBounces: 3, idleRefineMs: 220,
    };
  }
  return {
    tier, weight, maxDpr: 1,
    interactiveScale: 0.58, idleScale: 0.9,
    interactiveMsaa: 0, idleMsaa: msaa2,
    maxFps: 24, opticalBounces: 3, idleRefineMs: 260,
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
