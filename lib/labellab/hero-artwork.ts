import type { EnvironmentPresetId, StudioSpotLightConfig } from "@/lib/mockup/environment-presets";
import { createLocalArtwork } from "@/lib/labellab/local-artwork";

export type HeroLightMoodId = "studio" | "dramatic" | "daylight";

export interface HeroShowcaseScene {
  readonly id: string;
  readonly kind: "beverage" | "packaging";
  readonly modelId: string;
  readonly templateId?: string;
  readonly poster?: string;
  readonly demoLabelUrl?: string;
  readonly shortVi: string;
  readonly shortEn: string;
  readonly badgeVi: string;
  readonly badgeEn: string;
  readonly specVi: string;
  readonly specEn: string;
  readonly studioHref: string;
  readonly accent: string;
  readonly stageGradient: string;
  readonly haloGradient: string;
  readonly refractionStops: readonly [string, string, string];
  readonly defaultEnvironment: EnvironmentPresetId;
  readonly spotLight: StudioSpotLightConfig;
  readonly displayScale: number;
  readonly labelOffset?: number;
}

export const HERO_SHOWCASE_SCENES: readonly HeroShowcaseScene[] = Object.freeze([
  {
    id: "basil-strawberry",
    kind: "beverage",
    modelId: "basil-strawberry",
    poster: "/models/bottles/glass-290-basil-poster.webp?v=thumb-v2",
    demoLabelUrl: "/home/demo-labels/glass-290-basil-strawberry.webp?v=1",
    shortVi: "Thủy tinh",
    shortEn: "Glass",
    badgeVi: "Glass 290 mL",
    badgeEn: "Glass 290 mL",
    specVi: "Khúc xạ thực · Hạt é 3D",
    specEn: "Real Refraction · 3D Seeds",
    studioHref: "/studio?model=basil-strawberry#workspace",
    accent: "#ff6b9d",
    stageGradient:
      "radial-gradient(ellipse 78% 66% at 50% 45%, #7c1c46 0%, #420c26 52%, #1d0613 100%)",
    haloGradient:
      "radial-gradient(circle, rgba(255, 221, 234, 0.72) 0%, rgba(255, 118, 169, 0.34) 44%, transparent 74%)",
    refractionStops: ["#ffe7f0", "#c84678", "#35091e"],
    defaultEnvironment: "studio-original",
    spotLight: {
      enabled: true,
      intensity: 1.35,
      azimuthDeg: -38,
      elevationDeg: 44,
      color: "#ffe4ee",
      softness: 0.65,
    },
    displayScale: 1.12,
  },
  {
    id: "can-mango",
    kind: "beverage",
    modelId: "can-mango",
    poster: "/models/cans/posters/can-330.webp?v=thumb-v2",
    demoLabelUrl: "/home/demo-labels/can-330-sparkling.webp?v=1",
    shortVi: "Lon 330",
    shortEn: "Can 330",
    badgeVi: "Can 330 mL",
    badgeEn: "Can 330 mL",
    specVi: "Kim loại PBR · In màng",
    specEn: "PBR Aluminum · Sleeve Print",
    studioHref: "/studio?model=can-mango#workspace",
    accent: "#ff4f93",
    stageGradient:
      "radial-gradient(ellipse 78% 66% at 50% 45%, #741645 0%, #3d0a24 52%, #1a0511 100%)",
    haloGradient:
      "radial-gradient(circle, rgba(255, 220, 236, 0.68) 0%, rgba(255, 84, 152, 0.32) 44%, transparent 74%)",
    refractionStops: ["#ffe5f1", "#d92d72", "#280718"],
    defaultEnvironment: "softbox-contrast",
    spotLight: {
      enabled: true,
      intensity: 1.45,
      azimuthDeg: -42,
      elevationDeg: 38,
      color: "#ffe4ef",
      softness: 0.58,
    },
    displayScale: 1.14,
  },
  {
    id: "pet-aloe",
    kind: "beverage",
    modelId: "pet-aloe",
    poster: "/models/bottles/pet-500-aloe-poster.webp?v=thumb-v2",
    demoLabelUrl: "/home/demo-labels/pet-500-aloe.webp?v=1",
    shortVi: "PET 500",
    shortEn: "PET 500",
    badgeVi: "PET 500 mL",
    badgeEn: "PET 500 mL",
    specVi: "Nhựa PET trong · Thạch nha đam",
    specEn: "Clear PET · Aloe Pulp",
    studioHref: "/studio?model=pet-aloe#workspace",
    accent: "#5ce0a8",
    stageGradient:
      "radial-gradient(ellipse 78% 66% at 50% 45%, #165944 0%, #0b3327 52%, #051812 100%)",
    haloGradient:
      "radial-gradient(circle, rgba(210, 255, 236, 0.65) 0%, rgba(72, 214, 156, 0.3) 44%, transparent 74%)",
    refractionStops: ["#e8fff4", "#2f9e75", "#071f17"],
    defaultEnvironment: "daylight-window",
    spotLight: {
      enabled: true,
      intensity: 1.3,
      azimuthDeg: -36,
      elevationDeg: 46,
      color: "#fff4d8",
      softness: 0.66,
    },
    displayScale: 1.12,
    labelOffset: 2,
  },
  {
    id: "rigid-lid-base",
    kind: "packaging",
    modelId: "basil-strawberry",
    templateId: "rigid-lid-base",
    shortVi: "Hộp 3D",
    shortEn: "Box 3D",
    badgeVi: "Rigid Box 3D",
    badgeEn: "Rigid Box 3D",
    specVi: "Ép kim vàng · Dieline 1:1 mm",
    specEn: "Gold Foil · 1:1 mm Dieline",
    studioHref: "/studio?domain=packaging&template=rigid-lid-base#workspace",
    accent: "#f3c978",
    stageGradient:
      "radial-gradient(ellipse 78% 66% at 50% 45%, #46264d 0%, #24132a 52%, #110915 100%)",
    haloGradient:
      "radial-gradient(circle, rgba(255, 232, 192, 0.52) 0%, rgba(212, 162, 92, 0.24) 44%, transparent 74%)",
    refractionStops: ["#f9e7cc", "#57325e", "#160c1a"],
    defaultEnvironment: "softbox-contrast",
    spotLight: {
      enabled: true,
      intensity: 1.55,
      azimuthDeg: -42,
      elevationDeg: 46,
      color: "#ffecd0",
      softness: 0.56,
    },
    displayScale: 0.96,
  },
]);

export function resolveHeroEnvironment(
  scene: HeroShowcaseScene,
  lightMood: HeroLightMoodId,
): { environment: EnvironmentPresetId; spotLight: StudioSpotLightConfig } {
  if (lightMood === "dramatic") {
    return {
      environment: "softbox-contrast",
      spotLight: {
        ...scene.spotLight,
        enabled: true,
        intensity: Math.min(2.1, scene.spotLight.intensity + 0.4),
        azimuthDeg: 142,
        elevationDeg: 32,
        softness: 0.45,
      },
    };
  }
  if (lightMood === "daylight") {
    return {
      environment: "daylight-window",
      spotLight: {
        ...scene.spotLight,
        enabled: true,
        intensity: 1.1,
        azimuthDeg: -26,
        elevationDeg: 58,
        color: "#ffffff",
        softness: 0.78,
      },
    };
  }
  return {
    environment: scene.defaultEnvironment,
    spotLight: scene.spotLight,
  };
}

// ---------------------------------------------------------------------------
// Static WebP demo label loader (cached & registered via createLocalArtwork)
// ---------------------------------------------------------------------------

const labelArtworkCache = new Map<string, string>();
const labelArtworkPending = new Map<string, Promise<string | undefined>>();

export function getCachedHeroLabelArtworkUrl(sceneId: string): string | undefined {
  return labelArtworkCache.get(sceneId);
}

/**
 * Fetch (and cache) the optimized WebP demo label for a hero beverage scene,
 * registering its Blob URL via `createLocalArtwork` so viewer-config's strict
 * `isLocalArtwork` security gate accepts it cleanly.
 */
export async function loadHeroLabelArtworkUrl(sceneId: string): Promise<string | undefined> {
  if (typeof window === "undefined") return undefined;
  const cached = labelArtworkCache.get(sceneId);
  if (cached) return cached;

  const inflight = labelArtworkPending.get(sceneId);
  if (inflight) return inflight;

  const scene = HERO_SHOWCASE_SCENES.find((item) => item.id === sceneId);
  if (!scene?.demoLabelUrl) return undefined;

  const task = fetch(scene.demoLabelUrl)
    .then(async (response) => {
      if (!response.ok) return undefined;
      const blob = await response.blob();
      const blobUrl = createLocalArtwork(blob);
      labelArtworkCache.set(sceneId, blobUrl);
      return blobUrl;
    })
    .catch(() => undefined)
    .finally(() => {
      labelArtworkPending.delete(sceneId);
    });

  labelArtworkPending.set(sceneId, task);
  return task;
}
