import { LIQUID_OPTICAL_DEFAULTS, LIQUID_SPARKLING_DEFAULTS, type LiquidTypeId, type LiquidOptics, type ScenePreferences } from "./preferences";
export type { LiquidOptics } from "./preferences";

export interface LiquidColorPreset { id: string; name: string; color: string }
export interface LiquidType {
  id: LiquidTypeId;
  name: string;
  description: string;
  controls: ("ior" | "roughness" | "scattering")[];
  settings: LiquidOptics;
  presets: LiquidColorPreset[];
}

function colors(entries: [string, string][]): LiquidColorPreset[] {
  return entries.map(([name, color]) => ({ id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), name, color }));
}
function type(
  id: LiquidTypeId, name: string, description: string,
  settings: LiquidOptics, controls: LiquidType["controls"], entries: [string, string][],
): LiquidType {
  return { id, name, description, settings: { ...settings }, controls, presets: colors(entries) };
}

/** Optical looks plus sparkling defaults for models with a calibrated bubble volume. */
export const LIQUID_TYPES: readonly LiquidType[] = [
  type("water", "Still water", "Clean, clear and lightly tinted water.", LIQUID_OPTICAL_DEFAULTS["water"], ["ior"], [
    ["Pure", "#F4FAFF"], ["Glacier", "#C9EEF5"], ["Mineral", "#DBEEE5"], ["Rose", "#F4DCE5"], ["Cucumber", "#DDEDC7"],
  ]),
  type("sparkling-water", "Sparkling water", "Bright, clear sparkling-water color palettes.", LIQUID_OPTICAL_DEFAULTS["sparkling-water"], ["ior", "roughness"], [
    ["Original", "#E7F5FC"], ["Lime", "#E1F2AF"], ["Grapefruit", "#FAC7B9"], ["Peach", "#F8DEC0"], ["Berry", "#EDCEE4"],
  ]),
  type("fruit-juice", "Fruit juice", "Soft color with a natural cloudy finish.", LIQUID_OPTICAL_DEFAULTS["fruit-juice"], ["scattering", "roughness"], [
    ["Apple", "#E8B64F"], ["Grape", "#743C78"], ["Pomegranate", "#B42C49"], ["Guava", "#F08D9E"], ["Watermelon", "#F2525B"],
  ]),
  type("citrus", "Citrus juice", "Fresh citrus with a pulpy optical appearance.", LIQUID_OPTICAL_DEFAULTS["citrus"], ["scattering", "roughness"], [
    ["Orange", "#FFA52F"], ["Lemon", "#F2DE68"], ["Lime", "#B8D65D"], ["Pink grapefruit", "#F49B83"], ["Yuzu", "#EDC941"],
  ]),
  type("tropical", "Tropical juice", "Rich, sun-ripened fruit colors.", LIQUID_OPTICAL_DEFAULTS["tropical"], ["scattering", "roughness"], [
    ["Mango", "#FFC13C"], ["Pineapple", "#F7DD66"], ["Passion fruit", "#F2B22F"], ["Papaya", "#FA9B54"], ["Dragon fruit", "#DC4193"],
  ]),
  type("berry", "Berry juice", "Deep berry tones with a soft, dense body.", LIQUID_OPTICAL_DEFAULTS["berry"], ["scattering"], [
    ["Strawberry", "#ED5B70"], ["Blueberry", "#625282"], ["Raspberry", "#CE3E68"], ["Blackcurrant", "#50324E"], ["Cranberry", "#B52F4E"],
  ]),
  type("basil-seed", "Basil seed drink", "Translucent fruit drink; keeps the model's existing seeds.", LIQUID_OPTICAL_DEFAULTS["basil-seed"], ["ior", "scattering"], [
    ["Strawberry", "#F14E78"], ["Lychee", "#F2E8D5"], ["Mango", "#F6BD46"], ["Kiwi", "#A5D06D"], ["Grape", "#AF7EC5"],
  ]),
  type("chia", "Chia drink", "Translucent fruit drink; keeps the model's existing chia seeds.", LIQUID_OPTICAL_DEFAULTS["chia"], ["ior", "scattering"], [
    ["Lemon", "#EEE0A1"], ["Berry", "#D66B91"], ["Coconut", "#EEE9DC"], ["Peach", "#F2BB96"], ["Green apple", "#B5D482"],
  ]),
  type("aloe", "Aloe vera", "Fresh, translucent aloe drink; retains existing gel pieces.", LIQUID_OPTICAL_DEFAULTS["aloe"], ["ior", "scattering"], [
    ["Original", "#DDEAA7"], ["Mango", "#F6C85F"], ["Lychee", "#F0E9CE"], ["Peach", "#F5C5A6"], ["Pomegranate", "#DB6C82"],
  ]),
  type("nata-de-coco", "Nata de coco", "Fruit drink with the model's existing coconut jelly.", LIQUID_OPTICAL_DEFAULTS["nata-de-coco"], ["ior", "scattering"], [
    ["Watermelon", "#FF4430"], ["Lychee", "#F4E4C4"], ["Mango", "#F4B83F"], ["Strawberry", "#EB647D"], ["Coconut", "#EEEBDD"],
  ]),
  type("tea", "Brewed tea", "Transparent infusions from light green to deep amber.", LIQUID_OPTICAL_DEFAULTS["tea"], ["ior"], [
    ["Green tea", "#B9BE62"], ["Black tea", "#9C602F"], ["Jasmine", "#D5CC8E"], ["Oolong", "#BF8B45"], ["Hibiscus", "#B74461"],
  ]),
  type("iced-tea", "Iced tea", "Lightly hazy fruit-tea blends.", LIQUID_OPTICAL_DEFAULTS["iced-tea"], ["ior", "scattering"], [
    ["Lemon tea", "#C58B3F"], ["Peach tea", "#DBA167"], ["Lychee tea", "#D5B881"], ["Berry tea", "#AC5367"], ["Mint tea", "#AAB36C"],
  ]),
  type("coffee", "Coffee", "Dark brews and soft, opaque coffee blends.", LIQUID_OPTICAL_DEFAULTS["coffee"], ["scattering", "roughness"], [
    ["Espresso", "#503427"], ["Cold brew", "#795038"], ["Latte", "#B88C69"], ["Mocha", "#92654D"], ["Caramel", "#CB9B6E"],
  ]),
  type("milk", "Milk", "Opaque dairy appearance with gentle light scattering.", LIQUID_OPTICAL_DEFAULTS["milk"], ["scattering", "roughness"], [
    ["Whole milk", "#FFF5E4"], ["Strawberry milk", "#F1BCC7"], ["Chocolate milk", "#AC8065"], ["Banana milk", "#F4DE9F"], ["Matcha milk", "#BCC893"],
  ]),
  type("plant-milk", "Plant milk", "Soft, creamy plant-based drink colors.", LIQUID_OPTICAL_DEFAULTS["plant-milk"], ["scattering", "roughness"], [
    ["Oat", "#E9D9BA"], ["Almond", "#EBDDCB"], ["Soy", "#F1E6CD"], ["Coconut", "#F8F3E8"], ["Pistachio", "#CDD0A3"],
  ]),
  type("yogurt", "Yogurt drink", "Dense, diffuse cultured dairy appearance.", LIQUID_OPTICAL_DEFAULTS["yogurt"], ["scattering", "roughness"], [
    ["Natural", "#FFF3DD"], ["Strawberry", "#EFB3BC"], ["Blueberry", "#C4B5D8"], ["Peach", "#F3CBA8"], ["Mango", "#F2D091"],
  ]),
  type("smoothie", "Smoothie", "Thick, cloudy fruit and vegetable blends.", LIQUID_OPTICAL_DEFAULTS["smoothie"], ["scattering", "roughness"], [
    ["Mango banana", "#EEC15A"], ["Berry blend", "#BE6C91"], ["Green blend", "#8DA768"], ["Avocado", "#BED09B"], ["Dragon fruit", "#D97BA8"],
  ]),
  type("soda", "Soda", "Bright, translucent soft-drink colors.", LIQUID_OPTICAL_DEFAULTS["soda"], ["ior", "roughness"], [
    ["Cola", "#6B3929"], ["Orange soda", "#FA9E24"], ["Lemon lime", "#D9E888"], ["Grape soda", "#9E66B9"], ["Cream soda", "#E9C58D"],
  ]),
  type("energy", "Energy drink", "Intense, clear and vibrant performance-drink palettes.", LIQUID_OPTICAL_DEFAULTS["energy"], ["ior"], [
    ["Classic gold", "#DAB63D"], ["Electric blue", "#54BDD5"], ["Red berry", "#E9566C"], ["Citrus", "#DFDF4D"], ["Tropical", "#F5A44D"],
    ["Orange", "#FFD600"],
  ]),
  type("sports", "Sports drink", "Light, lightly cloudy electrolyte-drink looks.", LIQUID_OPTICAL_DEFAULTS["sports"], ["ior", "scattering"], [
    ["Blue ice", "#6ACEE7"], ["Lemon", "#E6DF68"], ["Orange", "#F6AB59"], ["Fruit punch", "#EC7283"], ["Clear", "#DFEDF0"],
  ]),
  type("syrup", "Syrup & concentrate", "Dense, saturated concentrates with stronger refraction.", LIQUID_OPTICAL_DEFAULTS["syrup"], ["ior", "roughness"], [
    ["Honey", "#D99B2E"], ["Maple", "#A66532"], ["Grenadine", "#B62E4E"], ["Mint", "#68A67C"], ["Caramel", "#B87B3A"],
  ]),
  type("oil", "Culinary oil", "Clear golden oils with a smooth, glossy finish.", LIQUID_OPTICAL_DEFAULTS["oil"], ["ior", "roughness"], [
    ["Olive", "#B0A33E"], ["Sunflower", "#E8CB62"], ["Sesame", "#BE8E42"], ["Avocado", "#A8B45B"], ["Coconut oil", "#EEE9D5"],
  ]),
  type("kombucha", "Kombucha", "Amber fermented-tea colors with a gentle haze.", LIQUID_OPTICAL_DEFAULTS["kombucha"], ["ior", "scattering"], [
    ["Original", "#CC9E50"], ["Ginger", "#DBB469"], ["Raspberry", "#C56B78"], ["Hibiscus", "#B5536E"], ["Passion fruit", "#DFB14F"],
  ]),
  type("custom", "Custom liquid", "Start with a neutral look and tune every optical property.", LIQUID_OPTICAL_DEFAULTS["custom"], ["ior", "roughness", "scattering"], [
    ["Neutral", "#E3E9E9"], ["Warm", "#E7BB88"], ["Cool", "#9BCED8"], ["Pink", "#E9A7C0"], ["Green", "#B7D39B"],
  ]),
];

export function getLiquidType(id?: string | null): LiquidType {
  return LIQUID_TYPES.find(item => item.id === id) ?? LIQUID_TYPES[0];
}

export function getLiquidPresetSettings(typeId: string, presetId?: string): LiquidOptics &
  Pick<ScenePreferences, "liquidType" | "liquidColor" | "liquidCustomized" | "liquidSparkling"> {
  const liquid = getLiquidType(typeId);
  const preset = liquid.presets.find(item => item.id === presetId) ?? liquid.presets[0];
  return { ...liquid.settings, liquidType: liquid.id, liquidColor: preset.color, liquidCustomized: true, liquidSparkling: LIQUID_SPARKLING_DEFAULTS[liquid.id] ?? 0 };
}
