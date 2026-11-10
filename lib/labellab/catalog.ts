import type { CatalogData } from "../catalog/contracts";
import type { ProductAppearance, ProductAsset } from "../viewer-config";
import { resolveDisplay3D } from "../catalog/resolve";
import { canAssets } from "../product-assets";
import sourceCatalog from "./source-catalog.json";
import type { MaterialPreferences } from "./preferences";
import { getLiquidType } from "./liquid-presets";
import glass280Manifest from "../../public/models/bottles/glass-280-latte.manifest.json";
import glass280ShortManifest from "../../public/models/bottles/glass-280-short-latte.manifest.json";
import glass290ChiaManifest from "../../public/models/bottles/glass-290-chia.manifest.json";
import glass290MilkManifest from "../../public/models/bottles/glass-290-milk.manifest.json";
import glass290PullcapManifest from "../../public/models/bottles/glass-290-pullcap-basil.manifest.json";
import glass290PullcapChiaManifest from "../../public/models/bottles/glass-290-pullcap-chia.manifest.json";
import glass290PullcapMilkManifest from "../../public/models/bottles/glass-290-pullcap-milk.manifest.json";
import glass300MilkManifest from "../../public/models/bottles/glass-300-milk.manifest.json";
import glass485MilkManifest from "../../public/models/bottles/glass-485-milk.manifest.json";
import pet330Manifest from "../../public/models/bottles/pet-330-energy.manifest.json";
import pet350Manifest from "../../public/models/bottles/pet-350-juice.manifest.json";
import pet320FullManifest from "../../public/models/bottles/pet-320-full-nata.manifest.json";
import pet1000Manifest from "../../public/models/bottles/pet-1000-juice.manifest.json";
import { BATCH_MODELS, BATCH_MATERIAL_DEFAULTS } from './bottle-batch';

/** Published source snapshot. Private draft records are never imported. */
const catalog = sourceCatalog as unknown as CatalogData;

export interface LabModel {
  id: string;
  name: string;
  description: string;
  category: "glass" | "can" | "pet" | "pp";
  volume: string;
  poster: string;
  asset: ProductAsset;
  appearance: ProductAppearance;
  frontYaw: number;
}

/**
 * A packaging family is the item shown in the library. Its ordered variants
 * mirror the Label Lab PC packing-group model: index 0 is the default. A
 * variant may be listed before its web GLB is exported so the library can
 * grow without duplicating the parent packaging card.
 */
export type LabModelVariant = {
  id: string;
  label: string;
  /** PC productTypeOrder; list positions are calculated after sorting. */
  order: number;
} & ({ available: true; modelId: string } | { available: false; modelId?: never });

export interface LabModelFamily {
  id: string;
  name: string;
  description: string;
  category: LabModel["category"];
  volume: string;
  poster: string;
  variants: LabModelVariant[];
}
function fromPublished(
  displayId: string,
  details: Pick<LabModel, "id" | "name" | "description" | "category">,
): LabModel {
  const display = catalog.displays3d.find((item) => item.id === displayId);
  if (!display) throw new Error(`Missing published display: ${displayId}`);
  const product = resolveDisplay3D(catalog, display);
  if (!product) throw new Error(`Invalid published display: ${displayId}`);
  const sourceModel = catalog.models3d.find(
    (item) => item.id === display.modelId,
  )!;
  // Keep Vinut's published web geometry, slots and samplers together.
  // Replacing only the model URL can activate the incompatible High profile.
  const asset = product.asset;
  return {
    ...details,
    volume: `${asset.volumeMl ?? ""} ml`,
    poster: asset.poster ?? "",
    asset,
    appearance: product.appearance,
    frontYaw: sourceModel.mockupFrontYaw ?? 0,
  };
}

const nativeCanPosters: Record<string, string> = {
  "can-180": "/models/cans/posters/can-180.webp",
  "can-250-short": "/models/cans/posters/can-250-short.webp",
  "can-250": "/models/cans/posters/can-250.webp",
  "can-320": "/models/cans/posters/can-320.webp",
  "can-500": "/models/cans/posters/can-500.webp",
};

/**
 * Geometry-only can entries are intentionally separate from Vinut's published
 * flavor displays. They retain the native PBR material authored in the web
 * export and start with an empty label slot so the user can upload artwork.
 */
function fromNativeCan(
  assetId: string,
  details: Pick<LabModel, "id" | "name" | "description">,
): LabModel {
  const asset = canAssets.find((item) => item.id === assetId);
  if (!asset) throw new Error(`Missing optimized can asset: ${assetId}`);
  return {
    ...details,
    category: "can",
    volume: `${asset.volumeMl ?? ""} ml`,
    poster: nativeCanPosters[assetId] ?? "",
    asset: {
      ...asset,
      // The source exports use the same canonical orientation, but spelling it
      // out here makes the model contract stable for future catalog imports.
      orientation: [0, 0, 0],
      poster: nativeCanPosters[assetId],
    },
    appearance: {
      id: `${assetId}:native-blank`,
      requiredSlots: ["label"],
      // These values mirror the manifest's printed-label material. They let
      // the editor preserve native PBR until the user changes a control.
      slots: { label: { metalness: 0.18, roughness: 0.28, clearcoat: 0.35 } },
    },
    frontYaw: 0,
  };
}

const nativeCanModels: LabModel[] = [
  fromNativeCan("can-180", {
    id: "can-180",
    name: "180 ml Can",
    description: "180 ml aluminum can · native web geometry, ready for artwork.",
  }),
  fromNativeCan("can-250-short", {
    id: "can-250-short",
    name: "250 ml Short Can",
    description: "250 ml short aluminum can · native web geometry, ready for artwork.",
  }),
  fromNativeCan("can-250", {
    id: "can-250-slim",
    name: "250 ml Slim Can",
    description: "250 ml slim aluminum can · native web geometry, ready for artwork.",
  }),
  fromNativeCan("can-320", {
    id: "can-320",
    name: "320 ml Can",
    description: "320 ml aluminum can · native web geometry, ready for artwork.",
  }),
  fromNativeCan("can-500", {
    id: "can-500",
    name: "500 ml Can",
    description: "500 ml aluminum can · native web geometry, ready for artwork.",
  }),
];
/** User-supplied PET geometry with metre units, blank print and Juice optics. */
const pet350JuiceModel: LabModel = {
  id: "pet-350-juice",
  name: "350 ml Bottle",
  description: "350 ml PET bottle · Juice · ready for artwork.",
  category: "pet",
  volume: "350 ml",
  poster: `/models/bottles/pet-350-juice-poster.webp?v=${pet350Manifest.sha256.slice(0, 12)}`,
  asset: {
    id: "pet-350-juice",
    src: `${pet350Manifest.src}?v=${pet350Manifest.sha256.slice(0, 12)}`,
    name: "350 ml PET Bottle",
    packaging: "pet",
    volumeMl: 350,
    poster: `/models/bottles/pet-350-juice-poster.webp?v=${pet350Manifest.sha256.slice(0, 12)}`,
    materialSlots: { body: ["PlasticBody"], ring: ["Ring"], cap: ["PlasticCap"], label: ["Label"], liquid: ["Water"] },
    textureSamplers: { label: { wrapS: "repeat", wrapT: "clamp" } },
    orientation: [0, 0, 0],
  },
  appearance: {
    id: "pet-350:juice-blank",
    requiredSlots: ["body", "cap", "label", "liquid"],
    slots: {
      body: { color: "#ffffff", metalness: 0 },
      cap: { color: "#ffffff", metalness: 0, roughness: 0.29 },
      label: { color: "#ffffff", metalness: 0, roughness: 0.28 },
      liquid: { color: "#E8B64F", metalness: 0, roughness: 0.12, transmission: 0.35, thickness: 0.025, ior: 1.35 },
    },
  },
  frontYaw: 0,
};
/** New supplied Draco geometry, using the existing PET/juice optical contract. */
const pet1000JuiceModel: LabModel = {
  ...pet350JuiceModel,
  id: "pet-1000-juice", name: "1 L Bottle", volume: "1 L",
  description: "1 litre PET bottle · Juice · ready for artwork.",
  poster: `/models/bottles/pet-1000-juice-poster.webp?v=${pet1000Manifest.sha256.slice(0, 12)}`,
  asset: {
    ...pet350JuiceModel.asset, id: "pet-1000-juice", name: "1 L PET Bottle", volumeMl: 1000,
    src: `${pet1000Manifest.src}?v=${pet1000Manifest.sha256.slice(0, 12)}`,
    poster: `/models/bottles/pet-1000-juice-poster.webp?v=${pet1000Manifest.sha256.slice(0, 12)}`,
    materialSlots: pet1000Manifest.materialSlots, cameraFraming: 'bounds',
  },
  appearance: { ...pet350JuiceModel.appearance, id: "pet-1000:juice-blank" },
};
const pet320FullNataModel: LabModel = {
  id: "pet-320-full-nata", name: "320 ml Bottle · Full label",
  description: "320 ml PET bottle · full label · Nata de coco · ready for artwork.",
  category: "pet", volume: "320 ml",
  poster: `/models/bottles/pet-320-full-nata-poster.webp?v=${pet320FullManifest.sha256.slice(0, 12)}`,
  asset: {
    id: "pet-320-full-nata", name: "320 ml PET Bottle · Full label", volumeMl: 320, packaging: "pet",
    src: `${pet320FullManifest.src}?v=${pet320FullManifest.sha256.slice(0, 12)}`,
    poster: `/models/bottles/pet-320-full-nata-poster.webp?v=${pet320FullManifest.sha256.slice(0, 12)}`,
    materialSlots: pet320FullManifest.materialSlots,
    textureSamplers: { label: { wrapS: "repeat", wrapT: "clamp" } }, orientation: [0, 0, 0],
  },
  appearance: {
    id: "pet-320-full:nata-blank", requiredSlots: ["body", "cap", "label", "liquid", "inclusions"],
    slots: {
      body: { color: "#ffffff", metalness: 0 },
      cap: { color: "#ffffff", metalness: 0, roughness: .29 },
      label: { color: "#ffffff", metalness: 0, roughness: .28 },
      liquid: { color: "#ff4430", metalness: 0, roughness: .12 },
      inclusions: { color: "#fff9ed", metalness: 0, roughness: .18 },
    },
  }, frontYaw: 0,
};
/** Supplied web geometry; energy optics and gas particles reference Label Lab PET330. */
const pet330EnergyModel: LabModel = {
  id: "pet-330-energy", name: "330 ml Bottle",
  description: "330 ml PET bottle · Energy drink · sparkling · ready for artwork.",
  category: "pet", volume: "330 ml", poster: `/models/bottles/pet-330-energy-poster.webp?v=${pet330Manifest.sha256.slice(0, 12)}`,
  asset: {
    id: "pet-330-energy", src: `${pet330Manifest.src}?v=${pet330Manifest.sha256.slice(0, 12)}`, name: "330 ml PET Bottle",
    packaging: "pet", volumeMl: 330, poster: `/models/bottles/pet-330-energy-poster.webp?v=${pet330Manifest.sha256.slice(0, 12)}`, sparkling: true,
    materialSlots: { body: ["Plastic Body", "ThinRefraction"], ring: ["Ring"], cap: ["Cap"], label: ["Lable"], liquid: ["Water"] },
    textureSamplers: { label: { wrapS: "repeat", wrapT: "clamp" } }, orientation: [0, 0, 0],
  },
  appearance: {
    id: "pet-330:energy-blank", requiredSlots: ["body", "cap", "label", "liquid"],
    slots: {
      body: { color: "#ffffff", metalness: 0 },
      cap: { color: "#ffffff", metalness: 0, roughness: .29 },
      label: { color: "#ffffff", metalness: 0, roughness: .28 },
      liquid: { color: "#FFD600", metalness: 0, roughness: .05, transmission: 1, thickness: .02, ior: 1.35 },
    },
  }, frontYaw: 0,
};
/** User-supplied glass bottle with an opaque white label ready for artwork. */
const glass280LatteModel: LabModel = {
  id: "glass-280-latte", name: "280 ml Bottle · Full label",
  description: "280 ml glass bottle · full label · Milk coffee / Latte · ready for artwork.",
  category: "glass", volume: "280 ml", poster: `/models/bottles/glass-280-latte-poster.webp?v=${glass280Manifest.sha256.slice(0, 12)}`,
  asset: {
    id: "glass-280-latte", src: `${glass280Manifest.src}?v=${glass280Manifest.sha256.slice(0, 12)}`, name: "280 ml Glass Bottle",
    packaging: "glass", volumeMl: 280, poster: `/models/bottles/glass-280-latte-poster.webp?v=${glass280Manifest.sha256.slice(0, 12)}`,
    materialSlots: { body: ["Body", "Glass Refraction"], cap: ["Cap"], label: ["Label"], liquid: ["Water"] },
    textureSamplers: { label: { wrapS: "repeat", wrapT: "clamp" } }, orientation: [0, 0, 0],
  },
  appearance: {
    id: "glass-280:latte-blank", requiredSlots: ["body", "cap", "label", "liquid"],
    slots: {
      body: { color: "#ffffff", metalness: 0, roughness: .042, transmission: 1, thickness: .002, ior: 1.52 },
      cap: { color: "#c0c0c0", metalness: 1, roughness: .28 },
      label: { color: "#ffffff", metalness: 0, roughness: .28 },
      liquid: { color: "#B88C69", metalness: 0, roughness: .12 },
    },
  }, frontYaw: 0,
};
/** Short-label variant of the same 280 ml bottle, retaining its supplied geometry. */
const glass280ShortLatteModel: LabModel = {
  ...glass280LatteModel,
  id: "glass-280-short-latte", name: "280 ml Bottle · Short label",
  description: "280 ml glass bottle · short label · Milk coffee / Latte · ready for artwork.",
  poster: `/models/bottles/glass-280-short-latte-poster.webp?v=${glass280ShortManifest.sha256.slice(0, 12)}`,
  asset: {
    ...glass280LatteModel.asset,
    id: "glass-280-short-latte", src: `${glass280ShortManifest.src}?v=${glass280ShortManifest.sha256.slice(0, 12)}`, name: "280 ml Glass Bottle · Short label",
    poster: `/models/bottles/glass-280-short-latte-poster.webp?v=${glass280ShortManifest.sha256.slice(0, 12)}`,
    materialSlots: { body: ["Body", "Neck", "GlassBase"], cap: ["Cap"], label: ["Label"], liquid: ["Water"] },
  },
  appearance: { ...glass280LatteModel.appearance, id: "glass-280-short:latte-blank" },
};
const glass290ChiaModel: LabModel = {
  id: "glass-290-chia", name: "290 ml Bottle · Chia",
  description: "290 ml glass bottle · Chia drink · ready for artwork.", category: "glass", volume: "290 ml",
  poster: `/models/bottles/glass-290-chia-poster.webp?v=${glass290ChiaManifest.sha256.slice(0, 12)}`,
  asset: { id: "glass-290-chia", src: `${glass290ChiaManifest.src}?v=${glass290ChiaManifest.sha256.slice(0, 12)}`, name: "290 ml Glass Bottle · Chia", packaging: "glass", volumeMl: 290,
    poster: `/models/bottles/glass-290-chia-poster.webp?v=${glass290ChiaManifest.sha256.slice(0, 12)}`, materialSlots: glass290ChiaManifest.materialSlots,
    textureSamplers: { label: { wrapS: "repeat", wrapT: "clamp" } }, orientation: [0, 0, 0], cameraFraming: 'bounds' },
  appearance: { id: "glass-290:chia-blank", requiredSlots: ["body", "cap", "label", "liquid", "inclusions"], slots: {
    body: { color: "#ffffff", metalness: 0, roughness: .042, transmission: 1, thickness: .002, ior: 1.52 },
    cap: { color: "#d8c738", metalness: 1, roughness: .388 }, label: { color: "#ffffff", metalness: 0, roughness: .28 },
    // Chia uses the same opaque captured-water path as Basil; only its native
    // seed mesh and liquid type differ.
    liquid: { color: "#f14e78", metalness: 0, roughness: 1, transmission: 0 }, inclusions: { color: "#302a24", roughness: .74 },
  } }, frontYaw: 0,
};
const glass290MilkModel: LabModel = {
  id: "glass-290-milk", name: "290 ml Bottle · Milk", description: "290 ml glass bottle · Milk · ready for artwork.", category: "glass", volume: "290 ml",
  poster: `/models/bottles/glass-290-milk-poster.webp?v=${glass290MilkManifest.sha256.slice(0, 12)}`,
  asset: { id: "glass-290-milk", src: `${glass290MilkManifest.src}?v=${glass290MilkManifest.sha256.slice(0, 12)}`, name: "290 ml Glass Bottle · Milk", packaging: "glass", volumeMl: 290,
    poster: `/models/bottles/glass-290-milk-poster.webp?v=${glass290MilkManifest.sha256.slice(0, 12)}`, materialSlots: glass290MilkManifest.materialSlots,
    textureSamplers: { label: { wrapS: "repeat", wrapT: "clamp" } }, orientation: [0, 0, 0], cameraFraming: 'bounds' },
  appearance: { id: "glass-290:milk-blank", requiredSlots: ["body", "cap", "label", "liquid"], slots: {
    body: { color: "#ffffff", metalness: 0, roughness: .042, transmission: 1, thickness: .002, ior: 1.52 },
    cap: { color: "#d8c738", metalness: 1, roughness: .388 }, label: { color: "#ffffff", metalness: 0, roughness: .28 },
    liquid: { color: "#fff5e4", metalness: 0, roughness: .28, transmission: 0, thickness: .035, ior: 1.333 },
  } }, frontYaw: 0,
};
const glass300MilkModel: LabModel = {
  ...glass290MilkModel,
  id: "glass-300-milk", name: "300 ml Bottle · Milk", volume: "300 ml",
  description: "300 ml glass bottle · molded bead texture · Milk · ready for artwork.",
  poster: `/models/bottles/glass-300-milk-poster.webp?v=${glass300MilkManifest.sha256.slice(0, 12)}`,
  asset: {
    ...glass290MilkModel.asset, id: "glass-300-milk", name: "300 ml Glass Bottle · Milk", volumeMl: 300,
    src: `${glass300MilkManifest.src}?v=${glass300MilkManifest.sha256.slice(0, 12)}`,
    poster: `/models/bottles/glass-300-milk-poster.webp?v=${glass300MilkManifest.sha256.slice(0, 12)}`,
    materialSlots: glass300MilkManifest.materialSlots,
  },
  appearance: { ...glass290MilkModel.appearance, id: "glass-300:milk-blank" },
};
const glass485MilkModel: LabModel = {
  ...glass300MilkModel,
  id: "glass-485-milk", name: "485 ml Bottle · Milk", volume: "485 ml",
  description: "485 ml glass bottle · Milk · ready for artwork.",
  poster: `/models/bottles/glass-485-milk-poster.webp?v=${glass485MilkManifest.sha256.slice(0, 12)}`,
  asset: {
    ...glass300MilkModel.asset, id: "glass-485-milk", name: "485 ml Glass Bottle · Milk", volumeMl: 485,
    src: `${glass485MilkManifest.src}?v=${glass485MilkManifest.sha256.slice(0, 12)}`,
    poster: `/models/bottles/glass-485-milk-poster.webp?v=${glass485MilkManifest.sha256.slice(0, 12)}`,
    materialSlots: glass485MilkManifest.materialSlots,
  },
  appearance: { ...glass300MilkModel.appearance, id: "glass-485:milk-blank" },
};
const glass290PullcapBasilModel: LabModel = {
  id: "glass-290-pullcap-basil", name: "290 ml Bottle · Pull cap",
  description: "290 ml glass bottle · pull cap · Basil seed drink · ready for artwork.",
  category: "glass", volume: "290 ml",
  poster: `/models/bottles/glass-290-pullcap-basil-poster.webp?v=${glass290PullcapManifest.sha256.slice(0, 12)}`,
  asset: {
    id: "glass-290-pullcap-basil", name: "290 ml Glass Bottle · Pull cap", packaging: "glass", volumeMl: 290,
    src: `${glass290PullcapManifest.src}?v=${glass290PullcapManifest.sha256.slice(0, 12)}`,
    poster: `/models/bottles/glass-290-pullcap-basil-poster.webp?v=${glass290PullcapManifest.sha256.slice(0, 12)}`,
    materialSlots: glass290PullcapManifest.materialSlots,
    textureSamplers: { label: { wrapS: "repeat", wrapT: "clamp" } }, orientation: [0, 0, 0], cameraFraming: "bounds",
  },
  appearance: { id: "glass-290-pullcap:basil-blank", requiredSlots: ["body", "cap", "label", "liquid", "inclusions"], slots: {
    body: { color: "#ffffff", metalness: 0, roughness: .042, transmission: 1, thickness: .002, ior: 1.52 },
    cap: { color: "#c0c0c0", metalness: 1, roughness: .5527864098548889 },
    label: { color: "#ffffff", metalness: 0, roughness: .28 },
    liquid: { color: "#f14e78", metalness: 0, roughness: 1, transmission: 0 },
    inclusions: { color: "#302a24", roughness: .74 },
  } }, frontYaw: 0,
};
const glass290PullcapVariants: LabModel[] = [
  { kind: 'chia', manifest: glass290PullcapChiaManifest, label: 'Chia', color: '#f14e78' },
  { kind: 'milk', manifest: glass290PullcapMilkManifest, label: 'Milk', color: '#fff5e4' },
].map(({ kind, manifest, label, color }) => ({
  ...glass290PullcapBasilModel,
  id: `glass-290-pullcap-${kind}`, name: `290 ml Bottle · Pull cap · ${label}`,
  description: `290 ml glass bottle · pull cap · ${label} · ready for artwork.`,
  poster: `/models/bottles/glass-290-pullcap-${kind}-poster.webp?v=${manifest.sha256.slice(0, 12)}`,
  asset: {
    ...glass290PullcapBasilModel.asset, id: manifest.id, name: `290 ml Glass Bottle · Pull cap · ${label}`,
    src: `${manifest.src}?v=${manifest.sha256.slice(0, 12)}`,
    poster: `/models/bottles/glass-290-pullcap-${kind}-poster.webp?v=${manifest.sha256.slice(0, 12)}`,
    materialSlots: manifest.materialSlots,
  },
  appearance: { id: `glass-290-pullcap:${kind}-blank`, requiredSlots: ['body', 'cap', 'label', 'liquid', ...(kind === 'chia' ? ['inclusions'] : [])], slots: {
    body: { ...glass290PullcapBasilModel.appearance.slots!.body },
    cap: { ...glass290PullcapBasilModel.appearance.slots!.cap },
    label: { ...glass290PullcapBasilModel.appearance.slots!.label },
    liquid: kind === 'milk' ? { ...glass290MilkModel.appearance.slots!.liquid } : { ...glass290ChiaModel.appearance.slots!.liquid, color },
    ...(kind === 'chia' ? { inclusions: { color: '#302a24', roughness: .74 } } : {}),
  } },
}));
/** Real label textures and liquid colors resolved from the published source release. */
export const LAB_MODELS: LabModel[] = [
  fromPublished("basil-glass290-strawberry-3d", {
    id: "basil-strawberry",
    name: "Basil Strawberry",
    description:
      "290 ml glass bottle with basil seeds, a strawberry label and web-optimized materials.",
    category: "glass",
  }),
  fromPublished("juice30-can330-mango-3d", {
    id: "can-mango",
    name: "Mango Juice",
    description: "330 ml aluminum can with mango artwork and a UV-mapped wrap.",
    category: "can",
  }),
  fromPublished("aloe-pet500-mango-3d", {
    id: "pet-aloe",
    name: "Aloe Mango",
    description: "500 ml PET bottle with a short label and aloe vera liquid.",
    category: "pet",
  }),
  ...nativeCanModels,
  fromPublished("cojo-pet320-watermelon-3d", {
    id: "pet-nata-watermelon",
    name: "Nata Watermelon",
    description:
      "320 ml PET bottle with nata de coco, Cojo Cojo watermelon artwork and web-optimized materials.",
    category: "pet",
  }),
  pet350JuiceModel,
  pet330EnergyModel,
  pet320FullNataModel,
  pet1000JuiceModel,
  ...BATCH_MODELS,
  glass280LatteModel,
  glass280ShortLatteModel,
  glass290ChiaModel,
  glass290MilkModel,
  glass290PullcapBasilModel,
  ...glass290PullcapVariants,
  glass300MilkModel,
  glass485MilkModel,
];

/** Keep the home showcase focused on the three published sample scenes. */
export const FEATURED_MODELS = LAB_MODELS.slice(0, 3);

/**
 * Public web families. Chia and Milk are retained as ordered placeholders
 * because the PC project has them, and share one 290 ml packaging card.
 */
export const LAB_MODEL_FAMILIES: LabModelFamily[] = [
  {
    id: "glass-300-milk", name: "300 ml Bottle", description: "300 ml glass bottle · molded bead texture · Milk",
    category: "glass", volume: "300 ml", poster: glass300MilkModel.poster,
    variants: [{ id: "milk", label: "Milk", order: 0, modelId: glass300MilkModel.id, available: true }],
  },
  {
    id: "glass-485-milk", name: "485 ml Bottle", description: "485 ml glass bottle · Milk",
    category: "glass", volume: "485 ml", poster: glass485MilkModel.poster,
    variants: [{ id: "milk", label: "Milk", order: 0, modelId: glass485MilkModel.id, available: true }],
  },
  {
    id: "can-180-standard",
    name: "180 ml Can",
    description: "180 ml aluminum can",
    category: "can",
    volume: "180 ml",
    poster: nativeCanPosters["can-180"],
    variants: [
      { id: "standard", label: "Standard", order: 0, modelId: "can-180", available: true },
    ],
  },
  {
    id: "can-250-short",
    name: "250 ml Short Can",
    description: "250 ml short aluminum can",
    category: "can",
    volume: "250 ml",
    poster: nativeCanPosters["can-250-short"],
    variants: [
      { id: "short", label: "Short", order: 0, modelId: "can-250-short", available: true },
    ],
  },
  {
    id: "can-250-slim",
    name: "250 ml Slim Can",
    description: "250 ml slim aluminum can",
    category: "can",
    volume: "250 ml",
    poster: nativeCanPosters["can-250"],
    variants: [
      { id: "slim", label: "Slim", order: 0, modelId: "can-250-slim", available: true },
    ],
  },
  {
    id: "can-320-standard",
    name: "320 ml Can",
    description: "320 ml aluminum can",
    category: "can",
    volume: "320 ml",
    poster: nativeCanPosters["can-320"],
    variants: [
      { id: "standard", label: "Standard", order: 0, modelId: "can-320", available: true },
    ],
  },
  {
    id: "can-500-standard",
    name: "500 ml Can",
    description: "500 ml aluminum can",
    category: "can",
    volume: "500 ml",
    poster: nativeCanPosters["can-500"],
    variants: [
      { id: "standard", label: "Standard", order: 0, modelId: "can-500", available: true },
    ],
  },
  {
    id: "glass-290-rotate-cap",
    name: "290 ml Bottle",
    description: "290 ml glass bottle · screw cap",
    category: "glass",
    volume: "290 ml",
    poster: LAB_MODELS[0].poster,
    variants: [
      { id: "basil", label: "Basil", order: 0, modelId: "basil-strawberry", available: true },
      { id: "chia", label: "Chia", order: 1, modelId: glass290ChiaModel.id, available: true },
      { id: "milk", label: "Milk", order: 3, modelId: glass290MilkModel.id, available: true },
    ],
  },
  {
    id: "glass-290-pull-cap", name: "290 ml Bottle · Pull cap",
    description: "290 ml glass bottle · pull cap · Basil seed drink",
    category: "glass", volume: "290 ml", poster: glass290PullcapBasilModel.poster,
    variants: [
      { id: "basil", label: "Basil", order: 0, modelId: glass290PullcapBasilModel.id, available: true },
      ...glass290PullcapVariants.map((model, index) => ({ id: index === 0 ? 'chia' : 'milk', label: index === 0 ? 'Chia' : 'Milk', order: index + 1, modelId: model.id, available: true as const })),
    ],
  },
  {
    id: "can-330-standard",
    name: "330 ml Can",
    description: "330 ml aluminum can",
    category: "can",
    volume: "330 ml",
    poster: LAB_MODELS[1].poster,
    variants: [
      { id: "mango", label: "Mango", order: 0, modelId: "can-mango", available: true },
    ],
  },
  {
    id: "pet-320-nata",
    name: "320 ml Bottle",
    description: "320 ml PET bottle · nata de coco",
    category: "pet",
    volume: "320 ml",
    poster: LAB_MODELS.find(model=>model.id==='pet-nata-watermelon')!.poster,
    variants: [
      { id: "nata", label: "Nata de coco", order: 0, modelId: "pet-nata-watermelon", available: true },
      { id: "full-label", label: "Full label", order: 1, modelId: pet320FullNataModel.id, available: true },
    ],
  },
  {
    id: "pet-500-short-label",
    name: "500 ml Bottle",
    description: "500 ml PET bottle · short label",
    category: "pet",
    volume: "500 ml",
    poster: LAB_MODELS[2].poster,
    variants: [
      { id: "aloe", label: "Aloe Mango", order: 0, modelId: "pet-aloe", available: true },
    ],
  },
  {
    id: "pet-350-juice",
    name: "350 ml Bottle",
    description: "350 ml PET bottle · Juice",
    category: "pet",
    volume: "350 ml",
    poster: pet350JuiceModel.poster,
    variants: [{ id: "juice", label: "Juice", order: 0, modelId: pet350JuiceModel.id, available: true }],
  },
  {
    id: "pet-330-energy", name: "330 ml Bottle", description: "330 ml PET bottle · Energy drink · sparkling",
    category: "pet", volume: "330 ml", poster: pet330EnergyModel.poster,
    variants: [{ id: "energy", label: "Energy drink", order: 0, modelId: pet330EnergyModel.id, available: true }],
  },
  {
    id: "pet-1000-juice", name: "1 L Bottle", description: "1000 ml · 1 litre PET bottle · Juice",
    category: "pet", volume: "1 L", poster: pet1000JuiceModel.poster,
    variants: [
      { id: "juice", label: "Full label", order: 0, modelId: pet1000JuiceModel.id, available: true },
      { id: "short-label", label: "Short label", order: 1, modelId: "pet-1000-short-juice", available: true },
    ],
  },
  {
    id: "pp-500", name: "500 ml PP Bottle", description: "500 ml PP bottle · two supplied variants",
    category: "pp", volume: "500 ml", poster: BATCH_MODELS.find(model=>model.id==='pp-500')!.poster,
    variants: [
      { id: "standard", label: "Standard", order: 0, modelId: "pp-500", available: true },
      { id: "variant-2", label: "Variant 2", order: 1, modelId: "pp-500-2", available: true },
    ],
  },
  {
    id: "pp-1000", name: "1 L PP Bottle", description: "1 L PP bottle · two supplied variants",
    category: "pp", volume: "1 L", poster: BATCH_MODELS.find(model=>model.id==='pp-1000')!.poster,
    variants: [
      { id: "standard", label: "Standard", order: 0, modelId: "pp-1000", available: true },
      { id: "variant-2", label: "Variant 2", order: 1, modelId: "pp-1000-2", available: true },
    ],
  },
  ...BATCH_MODELS.filter(model=>model.id!=='pet-1000-short-juice' && model.id!=='pp-500' && model.id!=='pp-500-2' && model.id!=='pp-1000' && model.id!=='pp-1000-2').map((model):LabModelFamily=>({
    id:model.id, name:model.name, description:model.description, category:model.category,
    volume:model.volume, poster:model.poster,
    variants:[{id:'standard',label:model.category==='pp'?'Standard':'Juice',order:0,modelId:model.id,available:true}],
  })),
  {
    id: "glass-280-latte", name: "280 ml Bottle", description: "280 ml glass bottle · Milk coffee / Latte",
    category: "glass", volume: "280 ml", poster: glass280LatteModel.poster,
    variants: [
      { id: "full-label", label: "Full label", order: 0, modelId: glass280LatteModel.id, available: true },
      { id: "short-label", label: "Short label", order: 1, modelId: glass280ShortLatteModel.id, available: true },
    ],
  },
];

export function getLabModelFamily(id?: string | null): LabModelFamily | undefined {
  if (!id) return undefined;
  return LAB_MODEL_FAMILIES.find((family) =>
    family.variants.some((variant) => variant.modelId === id),
  );
}

export function getLabModelFamilyById(id?: string | null): LabModelFamily | undefined {
  return LAB_MODEL_FAMILIES.find((family) => family.id === id);
}

export function getDefaultFamilyVariant(family: LabModelFamily): LabModelVariant | undefined {
  return getOrderedFamilyVariants(family)[0];
}

export function getOrderedFamilyVariants(family: LabModelFamily): LabModelVariant[] {
  return [...family.variants].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "en"));
}

/** Search children too, while returning each packaging family only once. */
export function filterLabModelFamilies(query = "", category = "all"): LabModelFamily[] {
  const search = query.trim().toLowerCase();
  return LAB_MODEL_FAMILIES.filter((family) => {
    if (category !== "all" && family.category !== category) return false;
    const variants = family.variants.map((variant) => {
      const model = LAB_MODELS.find((item) => item.id === variant.modelId);
      return `${variant.label} ${model?.name ?? ""} ${model?.description ?? ""}`;
    }).join(" ");
    return `${family.name} ${family.description} ${family.volume} ${variants}`.toLowerCase().includes(search);
  });
}

export const labModels = LAB_MODELS;
export const DEFAULT_MODEL_ID = "basil-strawberry";
export const DEFAULT_MODEL = LAB_MODELS[0];
export function getLabModel(id?: string | null): LabModel {
  return LAB_MODELS.find((model) => model.id === id) ?? DEFAULT_MODEL;
}
/** Editable control defaults; native cap materials are retained until the user changes them. */
export function getModelMaterialDefaults(id?: string | null): MaterialPreferences {
  const model = getLabModel(id);
  const coffeeGlass = model.id === "glass-280-latte" || model.id === "glass-280-short-latte";
  const glass290Chia = model.id === "glass-290-chia" || model.id === "glass-290-pullcap-chia";
  const glass290Milk = model.id === "glass-290-milk" || model.id === "glass-290-pullcap-milk" || model.id === "glass-300-milk" || model.id === "glass-485-milk";
  const liquidType = glass290Chia ? "chia" : glass290Milk ? "milk" : model.id === "basil-strawberry" || model.id === "glass-290-pullcap-basil" ? "basil-seed"
    : model.id === "pet-aloe" ? "aloe"
    : model.id === "pet-nata-watermelon" || model.id === "pet-320-full-nata" ? "nata-de-coco"
    : model.id === "pet-330-energy" ? "energy"
    : coffeeGlass ? "coffee" : "fruit-juice";
  return {
    ...getLiquidType(liquidType).settings,
    liquidType,
    liquidCustomized: model.id === "pet-350-juice" || model.id === "pet-1000-juice" || model.id === "pet-330-energy" || coffeeGlass,
    liquidSparkling: model.asset.sparkling ? .516 : 0,
    liquidColor: model.appearance.slots?.liquid?.color ?? "#ffffff",
    capColor:
      model.appearance.slots?.cap?.color ??
      (model.category === "glass"
        ? "#d8c738"
        : model.category === "can"
          ? "#c0c0c0"
          : "#ffffff"),
    capMetalness: model.appearance.slots?.cap?.metalness ?? (model.category === "pet" ? 0 : 1),
    capRoughness: model.appearance.slots?.cap?.roughness ?? (model.category === "glass" ? 0.388 : model.category === "pet" ? 0.29 : 0.22),
    bodyMetalness: model.appearance.slots?.body?.metalness ?? (model.category === "can" ? 1 : 0),
    bodyRoughness: model.appearance.slots?.body?.roughness ?? (model.category === "glass" ? 0.042 : model.category === "pet" ? 0.075 : 0.22),
    labelOffset: (model.appearance.slots?.label?.textureOffsetX ?? 0) * 100,
    roughness: model.appearance.slots?.label?.roughness ?? 0.15,
    metalness: model.appearance.slots?.label?.metalness ?? 0,
    ...BATCH_MATERIAL_DEFAULTS[model.id],
  };
}
export { catalog as publishedCatalog };
