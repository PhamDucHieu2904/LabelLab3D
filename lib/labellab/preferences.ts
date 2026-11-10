import { BATCH_MATERIAL_DEFAULTS } from './bottle-batch';
/** Device-local scene preferences. This state grants no commercial entitlement. */
export interface ScenePreferences {
  modelId: string;
  sceneMode: "website" | "studio";
  style: "pink" | "white";
  motion: "showcase" | "off";
  background: string;
  liquidColor: string;
  capColor: string;
  capMetalness: number;
  capRoughness: number;
  bodyMetalness: number;
  bodyRoughness: number;
  liquidType: string;
  /** False retains the model's authored optical material, including inclusions. */
  liquidCustomized: boolean;
  liquidClarity: number;
  liquidDensity: number;
  liquidTurbidity: number;
  liquidBrightness: number;
  liquidScattering: number;
  liquidRoughness: number;
  liquidIor: number;
  liquidSparkling: number;
  labelOffset: number;
  roughness: number;
  metalness: number;
  frame: "square" | "portrait" | "landscape" | "story";
  resolution: 1024 | 2048 | 4096 | 8129;
  transparent: boolean;
  grid: boolean;
  highlight: boolean;
}

export const PREFERENCES_KEY = "labellab.scene.preferences.v1";
export const DEFAULT_PREFERENCES: Readonly<ScenePreferences> = Object.freeze({
  modelId: "basil-strawberry",
  sceneMode: "website",
  style: "pink",
  motion: "showcase",
  background: "#d53660",
  liquidColor: "#F14E78",
  capColor: "#d8c738",
  capMetalness: 1,
  capRoughness: 0.388,
  bodyMetalness: 0,
  bodyRoughness: 0.042,
  liquidType: "basil-seed",
  liquidCustomized: false,
  liquidClarity: 0.85,
  liquidDensity: 0.3,
  liquidTurbidity: 0.12,
  liquidBrightness: 1,
  liquidScattering: 0.15,
  liquidRoughness: 0.08,
  liquidIor: 1.333,
  liquidSparkling: 0,
  labelOffset: 0,
  roughness: 0.28,
  metalness: 0,
  frame: "square",
  resolution: 2048,
  transparent: false,
  grid: true,
  highlight: true,
});
export const LIQUID_TYPE_IDS = [
  "water", "sparkling-water", "fruit-juice", "citrus", "tropical", "berry",
  "basil-seed", "chia", "aloe", "nata-de-coco", "tea", "iced-tea", "coffee",
  "milk", "plant-milk", "yogurt", "smoothie", "soda", "energy", "sports",
  "syrup", "oil", "kombucha", "custom",
] as const;
export type LiquidTypeId = (typeof LIQUID_TYPE_IDS)[number];
export const LIQUID_SPARKLING_DEFAULTS: Readonly<Partial<Record<LiquidTypeId, number>>> = {
  energy: .516, "sparkling-water": .35, soda: .45, kombucha: .2,
};
export type LiquidOptics = Pick<ScenePreferences,
  "liquidClarity" | "liquidDensity" | "liquidTurbidity" | "liquidBrightness" |
  "liquidScattering" | "liquidRoughness" | "liquidIor">;
const clearOptics: LiquidOptics = {
  liquidClarity: 0.95, liquidDensity: 0.1, liquidTurbidity: 0.02,
  liquidBrightness: 1, liquidScattering: 0.05, liquidRoughness: 0.05, liquidIor: 1.333,
};
const juiceOptics: LiquidOptics = {
  ...clearOptics, liquidClarity: 0.45, liquidDensity: 0.45, liquidTurbidity: 0.4,
  liquidScattering: 0.38, liquidRoughness: 0.12, liquidIor: 1.35,
};
const creamyOptics: LiquidOptics = {
  ...juiceOptics, liquidClarity: 0.03, liquidDensity: 0.8, liquidTurbidity: 0.9,
  liquidScattering: 0.8, liquidRoughness: 0.24, liquidIor: 1.36,
};
const teaOptics: LiquidOptics = {
  ...clearOptics, liquidClarity: 0.8, liquidDensity: 0.22, liquidTurbidity: 0.08,
  liquidScattering: 0.1, liquidIor: 1.34,
};
const basilSeedOptics: LiquidOptics = {
  ...clearOptics, liquidClarity: 0.85, liquidDensity: 0.3, liquidTurbidity: 0.12,
  liquidScattering: 0.15, liquidRoughness: 0.08,
};
/** Shared by migration and the preset library so missing controls use the chosen drink's look. */
export const LIQUID_OPTICAL_DEFAULTS: Readonly<Record<LiquidTypeId, Readonly<LiquidOptics>>> = Object.freeze({
  water: clearOptics,
  "sparkling-water": { ...clearOptics, liquidBrightness: 1.08 },
  "fruit-juice": juiceOptics,
  citrus: { ...juiceOptics, liquidTurbidity: 0.55 },
  tropical: { ...juiceOptics, liquidDensity: 0.6, liquidTurbidity: 0.6 },
  berry: { ...juiceOptics, liquidDensity: 0.6 },
  "basil-seed": basilSeedOptics,
  // Chia follows the calibrated Basil seed volume; its native seed mesh is
  // the only model-level distinction.
  chia: basilSeedOptics,
  aloe: { ...juiceOptics, liquidClarity: 0.7, liquidDensity: 0.28, liquidTurbidity: 0.18, liquidScattering: 0.2, liquidRoughness: 0.1 },
  "nata-de-coco": { ...juiceOptics, liquidClarity: 0.78, liquidDensity: 0.25, liquidTurbidity: 0.14, liquidScattering: 0.18 },
  tea: teaOptics,
  "iced-tea": { ...teaOptics, liquidClarity: 0.7, liquidTurbidity: 0.15 },
  coffee: { ...juiceOptics, liquidClarity: 0.18, liquidDensity: 0.65, liquidTurbidity: 0.55, liquidScattering: 0.3 },
  milk: creamyOptics,
  "plant-milk": { ...creamyOptics, liquidDensity: 0.68, liquidTurbidity: 0.8 },
  yogurt: { ...creamyOptics, liquidDensity: 0.95, liquidRoughness: 0.32 },
  smoothie: { ...creamyOptics, liquidDensity: 1, liquidTurbidity: 0.95, liquidRoughness: 0.35 },
  soda: { ...clearOptics, liquidClarity: 0.82, liquidDensity: 0.22, liquidIor: 1.35 },
  energy: { ...clearOptics, liquidClarity: 0.88, liquidDensity: 0.2, liquidBrightness: 1.08, liquidIor: 1.35 },
  sports: { ...clearOptics, liquidClarity: 0.72, liquidTurbidity: 0.18, liquidDensity: 0.18 },
  syrup: { ...juiceOptics, liquidClarity: 0.55, liquidDensity: 0.95, liquidTurbidity: 0.25, liquidIor: 1.47, liquidRoughness: 0.06 },
  oil: { ...clearOptics, liquidClarity: 0.92, liquidDensity: 0.6, liquidIor: 1.47, liquidRoughness: 0.03 },
  kombucha: { ...teaOptics, liquidClarity: 0.68, liquidTurbidity: 0.2, liquidScattering: 0.18 },
  custom: { ...juiceOptics, liquidClarity: 0.65, liquidTurbidity: 0.2 },
});

/** Material-only snapshots retain each model's edits without copying scene/export choices. */
export const MATERIAL_PREFERENCE_KEYS = [
  "liquidColor", "capColor", "capMetalness", "capRoughness", "bodyMetalness", "bodyRoughness",
  "liquidType", "liquidCustomized", "liquidClarity", "liquidDensity", "liquidTurbidity",
  "liquidBrightness", "liquidScattering", "liquidRoughness", "liquidIor", "liquidSparkling",
  "labelOffset", "roughness", "metalness",
] as const satisfies readonly (keyof ScenePreferences)[];
export type MaterialPreferences = Pick<ScenePreferences, (typeof MATERIAL_PREFERENCE_KEYS)[number]>;
export function pickMaterialPreferences(settings: ScenePreferences): MaterialPreferences {
  return Object.fromEntries(MATERIAL_PREFERENCE_KEYS.map(key => [key, settings[key]])) as MaterialPreferences;
}
export type PreferencesStorage = Pick<Storage, "getItem" | "setItem">;
const modelIds = [
  ...Object.keys(BATCH_MATERIAL_DEFAULTS),
  "basil-strawberry",
  "can-mango",
  "pet-aloe",
  "pet-nata-watermelon",
  "pet-320-full-nata",
  "pet-1000-juice",
  "pet-350-juice",
  "pet-330-energy",
  "glass-280-latte",
  "glass-280-short-latte",
  "glass-290-chia",
  "glass-290-milk",
  "glass-300-milk",
  "glass-485-milk",
  "glass-290-pullcap-basil",
  "glass-290-pullcap-chia",
  "glass-290-pullcap-milk",
  "can-180",
  "can-250-short",
  "can-250-slim",
  "can-320",
  "can-500",
];
const color = (value: unknown, fallback: string) =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
const bounded = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;

/** Copy only known scalar fields; never coerce strings, trust prototypes, or retain extras. */
export function parsePreferences(value: unknown): ScenePreferences {
  const defaults = { ...DEFAULT_PREFERENCES };
  try {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return defaults;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return defaults;
    const own = (key: keyof ScenePreferences): unknown => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor && "value" in descriptor ? descriptor.value : undefined;
    };
    const modelId = own("modelId"),
      sceneMode = own("sceneMode"),
      style = own("style"),
      motion = own("motion");
    const frame = own("frame"),
      resolution = own("resolution");
    const grid = own("grid"),
      highlight = own("highlight");
    const selectedModelId = typeof modelId === "string" && modelIds.includes(modelId) ? modelId : defaults.modelId;
    const batch = BATCH_MATERIAL_DEFAULTS[selectedModelId];
    const pet = selectedModelId.startsWith("pet-");
    const can = selectedModelId.startsWith("can-");
    const coffeeGlass = selectedModelId === "glass-280-latte" || selectedModelId === "glass-280-short-latte";
    const glass290Chia = selectedModelId === "glass-290-chia" || selectedModelId === "glass-290-pullcap-chia";
    const glass290Milk = selectedModelId === "glass-290-milk" || selectedModelId === "glass-290-pullcap-milk" || selectedModelId === "glass-300-milk" || selectedModelId === "glass-485-milk";
    const pullcapBasil = selectedModelId === "glass-290-pullcap-basil";
    const pullcap = selectedModelId.startsWith("glass-290-pullcap-");
    const glass290 = (glass290Chia || glass290Milk) && !pullcap;
    const juicePet = selectedModelId === "pet-350-juice" || selectedModelId === "pet-1000-juice";
    const newNata = selectedModelId === "pet-320-full-nata";
    const nativeCapMetalness = batch?.capMetalness ?? (pet ? 0 : 1);
    const nativeCapRoughness = batch?.capRoughness ?? (pullcap ? .5527864098548889 : coffeeGlass ? .28 : pet ? 0.29 : can ? 0.22 : defaults.capRoughness);
    const nativeBodyMetalness = can ? 1 : 0;
    const nativeBodyRoughness = batch?.bodyRoughness ?? (pet ? 0.075 : can ? 0.22 : defaults.bodyRoughness);
    const nativeLiquidType = batch?.liquidType ?? (selectedModelId === "pet-aloe" ? "aloe"
      : selectedModelId === "pet-nata-watermelon" || newNata ? "nata-de-coco"
      : selectedModelId === "pet-330-energy" ? "energy"
      : glass290Chia ? "chia"
      : glass290Milk ? "milk"
      : coffeeGlass ? "coffee"
      : can || juicePet ? "fruit-juice" : defaults.liquidType);
    const selectedLiquidType = typeof own("liquidType") === "string" && LIQUID_TYPE_IDS.includes(own("liquidType") as LiquidTypeId)
      ? own("liquidType") as LiquidTypeId : nativeLiquidType as LiquidTypeId;
    const liquidDefaults = LIQUID_OPTICAL_DEFAULTS[selectedLiquidType];
    return {
      modelId: selectedModelId,
      sceneMode:
        sceneMode === "website" || sceneMode === "studio"
          ? sceneMode
          : defaults.sceneMode,
      style: style === "pink" || style === "white" ? style : defaults.style,
      motion:
        motion === "showcase" || motion === "off" ? motion : defaults.motion,
      background: color(own("background"), defaults.background),
      liquidColor: color(own("liquidColor"), batch?.liquidColor ?? (glass290Chia || pullcapBasil ? "#f14e78" : glass290Milk ? "#fff5e4" : coffeeGlass ? "#B88C69" : selectedModelId === "pet-330-energy" ? "#FFD600" : juicePet ? "#E8B64F" : newNata ? "#ff4430" : defaults.liquidColor)),
      capColor: color(own("capColor"), batch?.capColor ?? (glass290 ? "#d8c738" : coffeeGlass || pullcap ? "#c0c0c0" : juicePet || newNata || selectedModelId === "pet-330-energy" ? "#ffffff" : defaults.capColor)),
      capMetalness: bounded(own("capMetalness"), glass290 ? 1 : nativeCapMetalness, 0, 1),
      capRoughness: bounded(own("capRoughness"), glass290 ? .388 : nativeCapRoughness, 0, 1),
      bodyMetalness: bounded(own("bodyMetalness"), nativeBodyMetalness, 0, 1),
      bodyRoughness: bounded(own("bodyRoughness"), glass290 ? .042 : nativeBodyRoughness, 0, 1),
      liquidType: selectedLiquidType,
      liquidCustomized: typeof own("liquidCustomized") === "boolean" ? own("liquidCustomized") as boolean : batch?.liquidCustomized ?? (juicePet || selectedModelId === "pet-330-energy" || coffeeGlass),
      liquidSparkling: bounded(own("liquidSparkling"), selectedModelId === "pet-330-energy" ? LIQUID_SPARKLING_DEFAULTS[selectedLiquidType] ?? 0 : 0, 0, 1),
      liquidClarity: bounded(own("liquidClarity"), liquidDefaults.liquidClarity, 0, 1),
      liquidDensity: bounded(own("liquidDensity"), liquidDefaults.liquidDensity, 0, 1),
      liquidTurbidity: bounded(own("liquidTurbidity"), liquidDefaults.liquidTurbidity, 0, 1),
      liquidBrightness: bounded(own("liquidBrightness"), liquidDefaults.liquidBrightness, 0, 2),
      liquidScattering: bounded(own("liquidScattering"), liquidDefaults.liquidScattering, 0, 1),
      liquidRoughness: bounded(own("liquidRoughness"), liquidDefaults.liquidRoughness, 0, 1),
      liquidIor: bounded(own("liquidIor"), liquidDefaults.liquidIor, 1, 1.6),
      labelOffset: bounded(own("labelOffset"), defaults.labelOffset, -100, 100),
      roughness: bounded(own("roughness"), batch?.roughness ?? defaults.roughness, 0, 1),
      metalness: bounded(own("metalness"), defaults.metalness, 0, 1),
      frame:
        frame === "square" || frame === "portrait" || frame === "landscape" || frame === "story"
          ? frame
          : defaults.frame,
      resolution:
        resolution === 1024 || resolution === 2048 || resolution === 4096 || resolution === 8129
          ? resolution
          : defaults.resolution,
      transparent: typeof own("transparent") === "boolean" ? own("transparent") as boolean : defaults.transparent,
      grid: typeof grid === "boolean" ? grid : defaults.grid,
      highlight:
        typeof highlight === "boolean" ? highlight : defaults.highlight,
    };
  } catch {
    return defaults;
  }
}

function browserStorage(): PreferencesStorage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function loadPreferences(
  storage?: PreferencesStorage,
): ScenePreferences {
  try {
    const raw = (storage ?? browserStorage())?.getItem(PREFERENCES_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const saved: unknown = JSON.parse(raw);
    if (!saved || typeof saved !== "object" || Array.isArray(saved))
      return { ...DEFAULT_PREFERENCES };
    const envelope = saved as Record<string, unknown>;
    return envelope.version === 1
      ? parsePreferences(envelope.preferences)
      : { ...DEFAULT_PREFERENCES };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

/** Returns false if unavailable or blocked; storage failure must not interrupt editing. */
export function savePreferences(
  value: unknown,
  storage?: PreferencesStorage,
): boolean {
  try {
    const target = storage ?? browserStorage();
    if (!target) return false;
    target.setItem(
      PREFERENCES_KEY,
      JSON.stringify({ version: 1, preferences: parsePreferences(value) }),
    );
    return true;
  } catch {
    return false;
  }
}
