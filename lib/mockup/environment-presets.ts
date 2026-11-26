import * as THREE from 'three';

export const ENVIRONMENT_PRESET_IDS = [
  'studio-original',
  'studio-bright',
  'softbox-contrast',
  'daylight-window',
  'nature-garden',
  'cool-minimal',
] as const;

export type EnvironmentPresetId = (typeof ENVIRONMENT_PRESET_IDS)[number];

export const DEFAULT_ENVIRONMENT_PRESET_ID: EnvironmentPresetId = 'studio-original';

export interface StudioEnvironmentPreset {
  readonly id: EnvironmentPresetId;
  readonly source: 'exr' | 'procedural';
  /** Static EXR/HDR path when `source === 'exr'`. */
  readonly exrSrc?: string;
  readonly tone: 'studio' | 'nature';
  /** Calibrated Three.js scene.environmentIntensity for Bottles & Cans. */
  readonly intensity: number;
  /** Calibrated scene.environmentIntensity for Packaging CAD (balanced with softbox shadow key). */
  readonly packagingIntensity: number;
  /** Default environment yaw rotation (radians) around Y for hero 3/4 framing. */
  readonly rotationY: number;
  /** Mini light-dome CSS gradient preview shown in the Scene panel. */
  readonly swatch: string;
}

export const STUDIO_ENVIRONMENT_PRESETS: readonly StudioEnvironmentPreset[] = Object.freeze([
  {
    id: 'studio-original',
    source: 'exr',
    exrSrc: '/environments/studio-softbox.exr',
    tone: 'studio',
    intensity: 0.85,
    packagingIntensity: 0.68,
    rotationY: 0.75,
    swatch:
      'radial-gradient(circle at 32% 30%, #ffffff 0%, #d4dae3 38%, #59606c 76%, #262a33 100%)',
  },
  {
    id: 'studio-bright',
    source: 'procedural',
    tone: 'studio',
    intensity: 0.84,
    packagingIntensity: 0.68,
    rotationY: 0.45,
    swatch:
      'radial-gradient(circle at 36% 24%, #ffffff 0%, #e9edf4 48%, #c7cfdc 78%, #e4e8ef 100%)',
  },
  {
    id: 'softbox-contrast',
    source: 'procedural',
    tone: 'studio',
    intensity: 0.88,
    packagingIntensity: 0.72,
    rotationY: 0.35,
    swatch:
      'linear-gradient(125deg, #252a33 0%, #eef2f8 26%, #3f4756 50%, #ffffff 74%, #616b7c 100%)',
  },
  {
    id: 'daylight-window',
    source: 'procedural',
    tone: 'studio',
    intensity: 0.84,
    packagingIntensity: 0.68,
    rotationY: 0.3,
    swatch:
      'radial-gradient(circle at 26% 28%, #ffffff 0%, #dfeefa 42%, #efe2cf 78%, #d7c3a8 100%)',
  },
  {
    id: 'nature-garden',
    source: 'procedural',
    tone: 'nature',
    intensity: 0.84,
    packagingIntensity: 0.7,
    rotationY: 0.55,
    swatch:
      'linear-gradient(180deg, #98ccf9 0%, #ebf5ff 38%, #a9d098 72%, #b5a98f 100%)',
  },
  {
    id: 'cool-minimal',
    source: 'procedural',
    tone: 'studio',
    intensity: 0.82,
    packagingIntensity: 0.66,
    rotationY: 0.5,
    swatch:
      'radial-gradient(circle at 50% 22%, #ffffff 0%, #cfe8ff 48%, #a3c5e6 80%, #dcebf9 100%)',
  },
]);

const PRESET_MAP: ReadonlyMap<string, StudioEnvironmentPreset> = new Map(
  STUDIO_ENVIRONMENT_PRESETS.map((preset) => [preset.id, preset]),
);

export function normalizeEnvironmentPresetId(value: unknown): EnvironmentPresetId {
  return typeof value === 'string' && PRESET_MAP.has(value)
    ? (value as EnvironmentPresetId)
    : DEFAULT_ENVIRONMENT_PRESET_ID;
}

export function getStudioEnvironmentPreset(id?: string | null): StudioEnvironmentPreset {
  return PRESET_MAP.get(id ?? '') ?? STUDIO_ENVIRONMENT_PRESETS[0];
}

// ---------------------------------------------------------------------------
// Optional Studio Spotlight rig (directional specular accent & top-lid lift)
// Uses decay=0 scaled dynamically to product bounds so brightness stays
// uniform across 180 mL cans, 1.5 L bottles, and 40 cm cartons.
// ---------------------------------------------------------------------------

export interface StudioSpotLightConfig {
  enabled: boolean;
  /** Relative brightness scalar: 0 .. 3.0 (displayed as 0% .. 300%, default 1.4 = 140%). */
  intensity: number;
  /** Horizontal orbit around product in degrees (-180 .. +180). */
  azimuthDeg: number;
  /** Vertical elevation angle in degrees (10 .. 85). */
  elevationDeg: number;
  /** Hex color gel tint (e.g. #ffffff, #ffe2b8, #d6ebff, #ffd0e2). */
  color: string;
  /** Beam edge softness / penumbra (0.1 .. 1.0). */
  softness: number;
}

export const DEFAULT_SPOT_LIGHT: Readonly<StudioSpotLightConfig> = Object.freeze({
  enabled: false,
  intensity: 1.4,
  azimuthDeg: 175,
  elevationDeg: 52,
  color: '#ffffff',
  softness: 0.68,
});

export type SpotLightAnglePresetId = 'top' | 'hero' | 'rim';

export interface SpotLightAnglePreset {
  readonly id: SpotLightAnglePresetId;
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
  readonly softness: number;
}

export const SPOT_LIGHT_ANGLE_PRESETS: readonly SpotLightAnglePreset[] = Object.freeze([
  { id: 'top', azimuthDeg: 175, elevationDeg: 52, softness: 0.68 },
  { id: 'hero', azimuthDeg: -42, elevationDeg: 38, softness: 0.62 },
  { id: 'rim', azimuthDeg: 145, elevationDeg: 28, softness: 0.52 },
]);

export const SPOT_LIGHT_COLOR_SWATCHES = [
  { id: 'white', hex: '#ffffff' },
  { id: 'warm', hex: '#ffe2b8' },
  { id: 'cool', hex: '#d6ebff' },
  { id: 'rose', hex: '#ffd0e2' },
] as const;

export function sanitizeSpotLightConfig(raw: unknown): StudioSpotLightConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_SPOT_LIGHT };
  }
  const proto = Object.getPrototypeOf(raw);
  if (proto !== Object.prototype && proto !== null) {
    return { ...DEFAULT_SPOT_LIGHT };
  }
  const own = (key: keyof StudioSpotLightConfig): unknown => {
    const descriptor = Object.getOwnPropertyDescriptor(raw, key);
    return descriptor && 'value' in descriptor ? descriptor.value : undefined;
  };
  const clamp = (val: unknown, fallback: number, min: number, max: number) =>
    typeof val === 'number' && Number.isFinite(val) ? Math.min(max, Math.max(min, val)) : fallback;
  const rawColor = own('color');
  return {
    enabled: typeof own('enabled') === 'boolean' ? (own('enabled') as boolean) : DEFAULT_SPOT_LIGHT.enabled,
    intensity: clamp(own('intensity'), DEFAULT_SPOT_LIGHT.intensity, 0, 3),
    azimuthDeg: Math.round(clamp(own('azimuthDeg'), DEFAULT_SPOT_LIGHT.azimuthDeg, -180, 180)),
    elevationDeg: Math.round(clamp(own('elevationDeg'), DEFAULT_SPOT_LIGHT.elevationDeg, 10, 85)),
    color: typeof rawColor === 'string' && /^#[0-9a-f]{6}$/i.test(rawColor) ? rawColor : DEFAULT_SPOT_LIGHT.color,
    softness: clamp(own('softness'), DEFAULT_SPOT_LIGHT.softness, 0.1, 1),
  };
}

// ---------------------------------------------------------------------------
// Lightweight procedural linear-HDR (Float16) equirectangular IBL generator
// 384×192 produces silky-smooth PMREM reflections in ~2 ms with 0 KB download.
// ---------------------------------------------------------------------------

const ENV_WIDTH = 384;
const ENV_HEIGHT = 192;

type Dir3 = readonly [number, number, number];
type Rgb = [number, number, number];

const normalize3 = (x: number, y: number, z: number): Dir3 => {
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
};

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

const wrapDeltaAzimuth = (az: number, center: number): number => {
  let d = az - center;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
};

/** Feathered rectangular softbox/window mask in spherical (azimuth, elevation) coordinates. */
const rectPanel = (
  azimuth: number,
  up: number,
  azCenter: number,
  azHalfWidth: number,
  upMin: number,
  upMax: number,
  softAz: number,
  softUp: number,
): number => {
  const dAz = wrapDeltaAzimuth(azimuth, azCenter);
  const wAz = 1 - smoothstep(azHalfWidth, azHalfWidth + softAz, dAz);
  if (wAz <= 0.0005) return 0;
  const wLow = smoothstep(upMin - softUp, upMin + softUp, up);
  const wHigh = 1 - smoothstep(upMax - softUp, upMax + softUp, up);
  return wAz * wLow * wHigh;
};

/** Smooth directional spherical light lobe (sun, sky opening, soft boom fill). */
const sphereLobe = (dir: Dir3, axis: Dir3, sharpness: number): number => {
  const dot = dir[0] * axis[0] + dir[1] * axis[1] + dir[2] * axis[2];
  return Math.exp(sharpness * (dot - 1));
};

const addRgb = (out: Rgb, r: number, g: number, b: number, weight: number) => {
  out[0] += r * weight;
  out[1] += g * weight;
  out[2] += b * weight;
};

interface CanopyCluster {
  readonly dir: Dir3;
  readonly sharpness: number;
  readonly strength: number;
}

const GARDEN_CANOPY: readonly CanopyCluster[] = (() => {
  let seed = 42071;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const clusters: CanopyCluster[] = [];
  for (let i = 0; i < 12; i++) {
    const az = (i / 12) * Math.PI * 2 + (rand() - 0.5) * 0.42;
    const el = -0.05 + rand() * 0.5;
    const h = Math.sqrt(Math.max(0.01, 1 - el * el));
    clusters.push({
      dir: [Math.cos(az) * h, el, Math.sin(az) * h],
      sharpness: 6.0 + rand() * 5.5,
      strength: 0.4 + rand() * 0.55,
    });
  }
  return clusters;
})();

const OVERHEAD_KEY_DIR = normalize3(-0.42, 0.85, 0.32);
const OVERHEAD_RIM_DIR = normalize3(0.55, 0.72, -0.42);
const GARDEN_SUN = normalize3(-0.56, 0.62, 0.55);
const GARDEN_CLOUD = normalize3(0.66, 0.56, -0.5);

function samplePresetRadiance(
  presetId: Exclude<EnvironmentPresetId, 'studio-original'>,
  dir: Dir3,
  azimuth: number,
  up: number,
  out: Rgb,
): void {
  out[0] = 0;
  out[1] = 0;
  out[2] = 0;

  switch (presetId) {
    case 'studio-bright': {
      // Balanced commercial light-tent: sculpted 3D cylinder roll-off + luminous brushed-silver tops!
      const upperDome = smoothstep(0.08, 0.55, up);
      const floorMix = smoothstep(0.05, -0.48, up);

      const baseLum = 0.24 + upperDome * 0.34 + floorMix * 0.08;
      addRgb(out, 0.99, 0.995, 1.0, baseLum);

      const sideFlagL = rectPanel(azimuth, up, -2.05, 0.3, -0.25, 0.26, 0.16, 0.14);
      const sideFlagR = rectPanel(azimuth, up, 0.12, 0.26, -0.25, 0.24, 0.16, 0.14);
      const ceilingRib = rectPanel(azimuth, up, 2.25, 0.38, 0.34, 0.68, 0.22, 0.16);
      const flagFactor = 1 - Math.min(0.52, (sideFlagL + sideFlagR) * 0.48 + ceilingRib * 0.38);
      out[0] *= flagFactor;
      out[1] *= flagFactor;
      out[2] *= flagFactor;

      addRgb(out, 1.0, 0.996, 0.99, 0.85 * sphereLobe(dir, OVERHEAD_KEY_DIR, 4.2));
      addRgb(out, 0.96, 0.985, 1.02, 0.42 * sphereLobe(dir, OVERHEAD_RIM_DIR, 4.5));

      const keyStrip = rectPanel(azimuth, up, -0.88, 0.28, -0.14, 0.62, 0.11, 0.11);
      addRgb(out, 1.0, 0.992, 0.98, 2.65 * keyStrip);

      const fillStrip = rectPanel(azimuth, up, 1.08, 0.28, -0.08, 0.56, 0.12, 0.11);
      addRgb(out, 0.95, 0.98, 1.01, 1.75 * fillStrip);

      const rimStrip = rectPanel(azimuth, up, 2.6, 0.25, 0.06, 0.6, 0.11, 0.11);
      addRgb(out, 0.98, 0.99, 1.0, 1.65 * rimStrip);
      return;
    }

    case 'softbox-contrast': {
      // Dramatic high-contrast beverage commercial studio: sharp dual strip-boxes + sculpted silver top bounce
      const upperDome = smoothstep(0.14, 0.58, up);
      const floorMix = smoothstep(0.04, -0.5, up);
      const baseLum = 0.1 + upperDome * 0.38 + floorMix * 0.14;
      addRgb(out, 0.97, 0.985, 1.0, baseLum);

      addRgb(out, 1.0, 1.0, 1.0, 1.2 * sphereLobe(dir, OVERHEAD_KEY_DIR, 5.5));
      addRgb(out, 0.94, 0.975, 1.02, 0.38 * sphereLobe(dir, OVERHEAD_RIM_DIR, 5.0));

      const stripL = rectPanel(azimuth, up, -0.82, 0.18, -0.22, 0.72, 0.05, 0.07);
      addRgb(out, 1.0, 0.99, 0.975, 4.4 * stripL);

      const stripR = rectPanel(azimuth, up, 0.96, 0.16, -0.18, 0.68, 0.05, 0.07);
      addRgb(out, 0.93, 0.97, 1.02, 3.2 * stripR);

      const stripBack = rectPanel(azimuth, up, -2.42, 0.2, 0.05, 0.62, 0.07, 0.08);
      addRgb(out, 0.98, 0.99, 1.0, 2.2 * stripBack);
      return;
    }

    case 'daylight-window': {
      // Architectural north-facing loft window + warm ivory studio wall & oak tabletop bounce
      const upperDome = smoothstep(0.1, 0.56, up);
      const floorMix = smoothstep(0.05, -0.46, up);

      addRgb(out, 1.03, 0.985, 0.93, 0.25 + upperDome * 0.34);
      addRgb(out, 1.05, 0.95, 0.83, 0.18 * floorMix);

      addRgb(out, 0.99, 0.99, 0.98, 0.8 * sphereLobe(dir, OVERHEAD_KEY_DIR, 3.8));

      const mainWindow = rectPanel(azimuth, up, -0.96, 0.44, -0.08, 0.64, 0.1, 0.09);
      const mullion = 1 - 0.45 * rectPanel(azimuth, up, -0.96, 0.025, -0.08, 0.64, 0.025, 0.05);
      addRgb(out, 0.94, 0.985, 1.04, 2.8 * mainWindow * mullion);

      const bounceWall = rectPanel(azimuth, up, 1.38, 0.48, -0.15, 0.48, 0.24, 0.16);
      addRgb(out, 1.05, 0.96, 0.87, 0.72 * bounceWall);
      return;
    }

    case 'nature-garden': {
      // Outdoor sunlit garden terrace: crisp sky canopy overhead + organic dappled foliage reflections
      const skyMix = smoothstep(-0.14, 0.5, up);
      const zenithMix = smoothstep(0.28, 0.92, up);
      const horizonBand = smoothstep(-0.22, 0.06, up) * (1 - smoothstep(0.18, 0.52, up));

      const skyR = 0.88 - zenithMix * 0.06;
      const skyG = 0.96 - zenithMix * 0.01;
      const skyB = 1.06 + zenithMix * 0.05;
      addRgb(out, skyR, skyG, skyB, skyMix * (0.48 + zenithMix * 0.2));

      addRgb(out, 0.92, 0.95, 0.82, (1 - skyMix) * 0.34);

      let foliage = 0;
      for (const cluster of GARDEN_CANOPY) {
        foliage += sphereLobe(dir, cluster.dir, cluster.sharpness) * cluster.strength;
      }
      const canopyWeight = (1 - Math.exp(-foliage * 0.78)) * (1 - zenithMix * 0.65);
      const occ = 1 - canopyWeight * 0.5;
      out[0] *= occ;
      out[1] *= occ;
      out[2] *= occ;
      addRgb(out, 0.24, 0.42, 0.2, canopyWeight * horizonBand * 0.42);

      addRgb(out, 1.08, 1.0, 0.88, 3.0 * sphereLobe(dir, GARDEN_SUN, 9.5));
      addRgb(out, 0.96, 0.99, 1.04, 0.78 * sphereLobe(dir, GARDEN_CLOUD, 4.2));
      addRgb(out, 0.95, 0.99, 1.04, 0.36 * sphereLobe(dir, OVERHEAD_KEY_DIR, 3.2));
      return;
    }

    case 'cool-minimal': {
      // Nordic frosted glass atrium: crisp cool-white overhead skylight + clean glacier-silver contrast
      const upperDome = smoothstep(0.08, 0.52, up);
      const floorMix = smoothstep(0.05, -0.46, up);

      const baseLum = 0.26 + upperDome * 0.38 + floorMix * 0.08;
      addRgb(out, 0.92, 0.975, 1.05, baseLum);

      const ribL = rectPanel(azimuth, up, -1.95, 0.26, -0.22, 0.24, 0.14, 0.12);
      const ribR = rectPanel(azimuth, up, 0.25, 0.24, -0.22, 0.22, 0.14, 0.12);
      const skylightFrame = rectPanel(azimuth, up, 2.15, 0.36, 0.36, 0.66, 0.22, 0.14);
      const ribFactor = 1 - Math.min(0.48, (ribL + ribR) * 0.44 + skylightFrame * 0.36);
      out[0] *= ribFactor;
      out[1] *= ribFactor;
      out[2] *= ribFactor;

      addRgb(out, 0.94, 0.985, 1.06, 0.95 * sphereLobe(dir, OVERHEAD_KEY_DIR, 3.8));

      const wallL = rectPanel(azimuth, up, -0.9, 0.3, -0.1, 0.62, 0.12, 0.1);
      addRgb(out, 0.95, 0.988, 1.05, 2.5 * wallL);

      const wallR = rectPanel(azimuth, up, 1.12, 0.28, -0.05, 0.6, 0.12, 0.1);
      addRgb(out, 0.84, 0.94, 1.1, 2.2 * wallR);
      return;
    }
  }
}

/**
 * Generate a lightweight 384×192 linear-HDR (HalfFloat) equirectangular environment texture
 * ready for `THREE.PMREMGenerator.fromEquirectangular(...)`.
 * Caller owns the returned texture and should dispose it after building its PMREM target.
 */
export function buildEnvironmentPresetTexture(presetId: EnvironmentPresetId): THREE.DataTexture {
  const normalized = normalizeEnvironmentPresetId(presetId);
  const proceduralId: Exclude<EnvironmentPresetId, 'studio-original'> =
    normalized === 'studio-original' ? 'studio-bright' : normalized;
  const data = new Uint16Array(ENV_WIDTH * ENV_HEIGHT * 4);
  const rgb: Rgb = [0, 0, 0];

  for (let y = 0; y < ENV_HEIGHT; y += 1) {
    // DataTexture.flipY = false: y=0 is south pole (-Y), y=H-1 is north pole (+Y).
    const elevation = ((y + 0.5) / ENV_HEIGHT) * Math.PI;
    const up = -Math.cos(elevation);
    const horizontal = Math.sin(elevation);
    for (let x = 0; x < ENV_WIDTH; x += 1) {
      const azimuth = ((x + 0.5) / ENV_WIDTH) * Math.PI * 2 - Math.PI;
      const dir: Dir3 = [Math.cos(azimuth) * horizontal, up, Math.sin(azimuth) * horizontal];
      samplePresetRadiance(proceduralId, dir, azimuth, up, rgb);
      const idx = (y * ENV_WIDTH + x) * 4;
      data[idx] = THREE.DataUtils.toHalfFloat(Math.max(0, rgb[0]));
      data[idx + 1] = THREE.DataUtils.toHalfFloat(Math.max(0, rgb[1]));
      data[idx + 2] = THREE.DataUtils.toHalfFloat(Math.max(0, rgb[2]));
      data[idx + 3] = THREE.DataUtils.toHalfFloat(1);
    }
  }

  const texture = new THREE.DataTexture(data, ENV_WIDTH, ENV_HEIGHT, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.name = `Studio HDRI (${proceduralId})`;
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
