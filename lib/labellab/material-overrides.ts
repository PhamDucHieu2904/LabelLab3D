import type { ScenePreferences } from './preferences';
import type { LabModel } from './catalog';
import type { LiveMaterialOverrides } from '../viewer/material-adjustments';

type FinishDefaults = Pick<ScenePreferences, 'capColor' | 'capMetalness' | 'capRoughness' | 'bodyMetalness' | 'bodyRoughness'>;

/** Build only supported semantic edits; untouched finishes retain per-mesh PBR. */
export function createMaterialOverrides(settings: ScenePreferences, model: LabModel, defaults: FinishDefaults): LiveMaterialOverrides {
  const slots = model.asset.materialSlots ?? {};
  const overrides: LiveMaterialOverrides = {};
  if (slots.liquid?.length) {
    overrides.liquid = {
      color: settings.liquidColor,
      ...(model.asset.sparkling ? { sparkling: settings.liquidSparkling } : {}),
      ...(settings.liquidCustomized ? { liquidOptics: {
        clarity: settings.liquidClarity,
        density: settings.liquidDensity,
        turbidity: settings.liquidTurbidity,
        brightness: settings.liquidBrightness,
        scattering: settings.liquidScattering,
        roughness: settings.liquidRoughness,
        ior: settings.liquidIor,
      } } : {}),
    };
  }
  const capSlot = slots.cap?.length ? 'cap' : slots.tab?.length ? 'tab' : undefined;
  if (capSlot) {
    overrides[capSlot] = {
      ...(settings.capColor.toLowerCase() !== defaults.capColor.toLowerCase() ? { color: settings.capColor } : {}),
      ...(settings.capMetalness !== defaults.capMetalness ? { metalness: settings.capMetalness } : {}),
      ...(settings.capRoughness !== defaults.capRoughness ? { roughness: settings.capRoughness } : {}),
    };
  }
  if (slots.body?.length) {
    overrides.body = {
      ...(settings.bodyMetalness !== defaults.bodyMetalness ? { metalness: settings.bodyMetalness } : {}),
      ...(settings.bodyRoughness !== defaults.bodyRoughness ? { roughness: settings.bodyRoughness } : {}),
    };
  }
  if (slots.label?.length) overrides.label = {
    textureOffsetX: settings.labelOffset / 100,
    roughness: settings.roughness,
    metalness: settings.metalness,
  };
  return overrides;
}
