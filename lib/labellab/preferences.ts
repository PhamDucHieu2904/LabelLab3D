/** Device-local scene preferences. This state grants no commercial entitlement. */
export interface ScenePreferences {
  modelId: string;
  sceneMode: "website" | "studio";
  motion: "showcase" | "off";
  background: string;
  liquidColor: string;
  capColor: string;
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
  motion: "showcase",
  background: "#d53660",
  liquidColor: "#F14E78",
  capColor: "#d8c738",
  labelOffset: 0,
  roughness: 0.28,
  metalness: 0,
  frame: "square",
  resolution: 2048,
  transparent: false,
  grid: true,
  highlight: true,
});
export type PreferencesStorage = Pick<Storage, "getItem" | "setItem">;
const modelIds = ["basil-strawberry", "can-mango", "pet-aloe"];
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
      motion = own("motion");
    const frame = own("frame"),
      resolution = own("resolution");
    const grid = own("grid"),
      highlight = own("highlight");
    return {
      modelId:
        typeof modelId === "string" && modelIds.includes(modelId)
          ? modelId
          : defaults.modelId,
      sceneMode:
        sceneMode === "website" || sceneMode === "studio"
          ? sceneMode
          : defaults.sceneMode,
      motion:
        motion === "showcase" || motion === "off" ? motion : defaults.motion,
      background: color(own("background"), defaults.background),
      liquidColor: color(own("liquidColor"), defaults.liquidColor),
      capColor: color(own("capColor"), defaults.capColor),
      labelOffset: bounded(own("labelOffset"), defaults.labelOffset, -50, 50),
      roughness: bounded(own("roughness"), defaults.roughness, 0, 1),
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
