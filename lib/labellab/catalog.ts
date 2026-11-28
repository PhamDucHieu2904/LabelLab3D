import type { CatalogData } from "../catalog/contracts";
import type { ProductAppearance, ProductAsset } from "../viewer-config";
import { resolveDisplay3D } from "../catalog/resolve";
import { canAssets } from "../product-assets";
import sourceCatalog from "./source-catalog-runtime.json";
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
import pet500FullManifest from "../../public/models/bottles/pet-500-full-label.manifest.json";
import pet1000Manifest from "../../public/models/bottles/pet-1000-juice.manifest.json";
import pet1500ShortManifest from "../../public/models/bottles/pet-1500-short-label.manifest.json";
import pet1500FullManifest from "../../public/models/bottles/pet-1500-juice.manifest.json";
import { BATCH_MODELS, BATCH_MATERIAL_DEFAULTS } from './bottle-batch';

/** Published source snapshot. Private draft records are never imported. */
const catalog = sourceCatalog as unknown as CatalogData;

const POSTER_VER = "thumb-v2";
const withPosterVer = (url: string) =>
  url ? `${url.split("?")[0]}?v=${POSTER_VER}` : "";

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

const nativeCanPosters: Record<string, string> = {
  "can-180": withPosterVer("/models/cans/posters/can-180.webp"),
  "can-250-short": withPosterVer("/models/cans/posters/can-250-short.webp"),
  "can-250": withPosterVer("/models/cans/posters/can-250.webp"),
  "can-320": withPosterVer("/models/cans/posters/can-320.webp"),
  "can-330": withPosterVer("/models/cans/posters/can-330.webp"),
  "can-500": withPosterVer("/models/cans/posters/can-500.webp"),
};

/**
 * Resolve a published web model while starting its label surface completely blank
 * (unprinted white/aluminum wrap) so users can apply custom artwork immediately.
 */
function fromPublished(
  displayId: string,
  details: Pick<LabModel, "id" | "name" | "description" | "category">,
  options?: { capColor?: string; poster?: string },
): LabModel {
  const display = catalog.displays3d.find((item) => item.id === displayId);
  if (!display) throw new Error(`Missing published display: ${displayId}`);
  const product = resolveDisplay3D(catalog, display);
  if (!product) throw new Error(`Invalid published display: ${displayId}`);
  const sourceModel = catalog.models3d.find(
    (item) => item.id === display.modelId,
  )!;
  const poster = options?.poster ?? withPosterVer(product.asset.poster ?? "");
  // Keep each model's published web geometry, slots and samplers together.
  // Replacing only the model URL can activate the incompatible High profile.
  const asset: ProductAsset = {
    ...product.asset,
    name: details.name,
    poster: poster || undefined,
  };
  const rawLabel = product.appearance.slots?.label;
  const { baseColorMap: _omitLabelArt, ...labelRest } = rawLabel ?? {};
  void _omitLabelArt;
  const blankLabel =
    details.category === "can"
      ? { metalness: 0, roughness: 0.15, clearcoat: 0.35 }
      : { ...labelRest, color: "#ffffff" };

  return {
    ...details,
    volume: `${asset.volumeMl ?? ""} mL`,
    poster,
    asset,
    appearance: {
      ...product.appearance,
      id: `${product.appearance.id}:blank`,
      slots: {
        ...product.appearance.slots,
        label: blankLabel,
        ...(options?.capColor && asset.materialSlots?.cap?.length
          ? { cap: { ...product.appearance.slots?.cap, color: options.capColor } }
          : {}),
      },
    },
    frontYaw: sourceModel.mockupFrontYaw ?? 0,
  };
}

/**
 * Geometry-only can entries retain the native PBR material authored in the web
 * export and start with a blank label slot ready for custom artwork.
 */
function fromNativeCan(
  assetId: string,
  details: Pick<LabModel, "id" | "name" | "description">,
): LabModel {
  const asset = canAssets.find((item) => item.id === assetId);
  if (!asset) throw new Error(`Missing optimized can asset: ${assetId}`);
  const poster = nativeCanPosters[assetId] ?? "";
  return {
    ...details,
    category: "can",
    volume: `${asset.volumeMl ?? ""} mL`,
    poster,
    asset: {
      ...asset,
      name: details.name,
      // The source exports use the same canonical orientation, but spelling it
      // out here makes the model contract stable for future catalog imports.
      orientation: [0, 0, 0],
      poster,
    },
    appearance: {
      id: `${assetId}:native-blank`,
      requiredSlots: ["label"],
      // Default can label finish: non-metallic (0%) with glossy 15% roughness.
      slots: { label: { metalness: 0, roughness: 0.15, clearcoat: 0.35 } },
    },
    frontYaw: 0,
  };
}

const nativeCanModels: LabModel[] = [
  fromNativeCan("can-180", {
    id: "can-180",
    name: "Can - 180 mL",
    description: "180 mL aluminum can · blank wrap, ready for artwork.",
  }),
  fromNativeCan("can-250-short", {
    id: "can-250-short",
    name: "Can - 250 mL Short",
    description: "250 mL short aluminum can · blank wrap, ready for artwork.",
  }),
  fromNativeCan("can-250", {
    id: "can-250-slim",
    name: "Can - 250 mL Slim",
    description: "250 mL slim aluminum can · blank wrap, ready for artwork.",
  }),
  fromNativeCan("can-320", {
    id: "can-320",
    name: "Can - 320 mL",
    description: "320 mL aluminum can · blank wrap, ready for artwork.",
  }),
  fromNativeCan("can-500", {
    id: "can-500",
    name: "Can - 500 mL",
    description: "500 mL aluminum can · blank wrap, ready for artwork.",
  }),
];

/** User-supplied PET geometry with metre units, blank print and Juice optics. */
const pet350JuiceModel: LabModel = {
  id: "pet-350-juice",
  name: "PET - 350 mL",
  description: "350 mL PET bottle · Juice · ready for artwork.",
  category: "pet",
  volume: "350 mL",
  poster: withPosterVer("/models/bottles/pet-350-juice-poster.webp"),
  asset: {
    id: "pet-350-juice",
    src: `${pet350Manifest.src}?v=${pet350Manifest.sha256.slice(0, 12)}`,
    name: "PET - 350 mL",
    packaging: "pet",
    volumeMl: 350,
    poster: withPosterVer("/models/bottles/pet-350-juice-poster.webp"),
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
  id: "pet-1000-juice",
  name: "PET - 1 L 1",
  volume: "1 L",
  description: "1 L (1000 mL) PET bottle · Juice · ready for artwork.",
  poster: withPosterVer("/models/bottles/pet-1000-juice-poster.webp"),
  asset: {
    ...pet350JuiceModel.asset,
    id: "pet-1000-juice",
    name: "PET - 1 L 1",
    volumeMl: 1000,
    src: `${pet1000Manifest.src}?v=${pet1000Manifest.sha256.slice(0, 12)}`,
    poster: withPosterVer("/models/bottles/pet-1000-juice-poster.webp"),
    materialSlots: pet1000Manifest.materialSlots,
    cameraFraming: "bounds",
  },
  appearance: { ...pet350JuiceModel.appearance, id: "pet-1000:juice-blank" },
};

const pet320FullNataModel: LabModel = {
  id: "pet-320-full-nata",
  name: "PET - 320 mL 2",
  description: "320 mL PET bottle · full label · Nata de coco · ready for artwork.",
  category: "pet",
  volume: "320 mL",
  poster: withPosterVer("/models/bottles/pet-320-full-nata-poster.webp"),
  asset: {
    id: "pet-320-full-nata",
    name: "PET - 320 mL 2",
    volumeMl: 320,
    packaging: "pet",
    src: `${pet320FullManifest.src}?v=${pet320FullManifest.sha256.slice(0, 12)}`,
    poster: withPosterVer("/models/bottles/pet-320-full-nata-poster.webp"),
    materialSlots: pet320FullManifest.materialSlots,
    textureSamplers: { label: { wrapS: "repeat", wrapT: "clamp" } },
    orientation: [0, 0, 0],
  },
  appearance: {
    id: "pet-320-full:nata-blank",
    requiredSlots: ["body", "cap", "label", "liquid", "inclusions"],
    slots: {
      body: { color: "#ffffff", metalness: 0 },
      cap: { color: "#ffffff", metalness: 0, roughness: 0.29 },
      label: { color: "#ffffff", metalness: 0, roughness: 0.28 },
      liquid: { color: "#ff4430", metalness: 0, roughness: 0.12 },
      inclusions: { color: "#fff9ed", metalness: 0, roughness: 0.18 },
    },
  },
  frontYaw: 0,
};

/** Supplied web geometry; energy optics and gas particles reference Label Lab PET330. */
const pet330EnergyModel: LabModel = {
  id: "pet-330-energy",
  name: "PET - 330 mL",
  description: "330 mL PET bottle · Energy drink · sparkling · ready for artwork.",
  category: "pet",
  volume: "330 mL",
  poster: withPosterVer("/models/bottles/pet-330-energy-poster.webp"),
  asset: {
    id: "pet-330-energy",
    src: `${pet330Manifest.src}?v=${pet330Manifest.sha256.slice(0, 12)}`,
    name: "PET - 330 mL",
    packaging: "pet",
    volumeMl: 330,
    poster: withPosterVer("/models/bottles/pet-330-energy-poster.webp"),
    sparkling: true,
    materialSlots: { body: ["Plastic Body", "ThinRefraction"], ring: ["Ring"], cap: ["Cap"], label: ["Lable"], liquid: ["Water"] },
    textureSamplers: { label: { wrapS: "repeat", wrapT: "clamp" } },
    orientation: [0, 0, 0],
  },
  appearance: {
    id: "pet-330:energy-blank",
    requiredSlots: ["body", "cap", "label", "liquid"],
    slots: {
      body: { color: "#ffffff", metalness: 0 },
      cap: { color: "#ffffff", metalness: 0, roughness: 0.29 },
      label: { color: "#ffffff", metalness: 0, roughness: 0.28 },
      liquid: { color: "#FFD600", metalness: 0, roughness: 0.05, transmission: 1, thickness: 0.02, ior: 1.35 },
    },
  },
  frontYaw: 0,
};

/** User-supplied glass bottle with an opaque white label ready for artwork. */
const glass280LatteModel: LabModel = {
  id: "glass-280-latte",
  name: "Glass - 280 mL · Full label",
  description: "280 mL glass bottle · full label · Milk coffee / Latte · ready for artwork.",
  category: "glass",
  volume: "280 mL",
  poster: withPosterVer("/models/bottles/glass-280-latte-poster.webp"),
  asset: {
    id: "glass-280-latte",
    src: `${glass280Manifest.src}?v=${glass280Manifest.sha256.slice(0, 12)}`,
    name: "Glass - 280 mL",
    packaging: "glass",
    volumeMl: 280,
    poster: withPosterVer("/models/bottles/glass-280-latte-poster.webp"),
    materialSlots: { body: ["Body", "Glass Refraction"], cap: ["Cap"], label: ["Label"], liquid: ["Water"] },
    textureSamplers: { label: { wrapS: "repeat", wrapT: "clamp" } },
    orientation: [0, 0, 0],
  },
  appearance: {
    id: "glass-280:latte-blank",
    requiredSlots: ["body", "cap", "label", "liquid"],
    slots: {
      body: { color: "#ffffff", metalness: 0, roughness: 0.042, transmission: 1, thickness: 0.002, ior: 1.52 },
      cap: { color: "#c0c0c0", metalness: 1, roughness: 0.28 },
      label: { color: "#ffffff", metalness: 0, roughness: 0.28 },
      liquid: { color: "#B88C69", metalness: 0, roughness: 0.12 },
    },
  },
  frontYaw: 0,
};

/** Short-label variant of the same 280 mL bottle, retaining its supplied geometry. */
const glass280ShortLatteModel: LabModel = {
  ...glass280LatteModel,
  id: "glass-280-short-latte",
  name: "Glass - 280 mL · Short label",
  description: "280 mL glass bottle · short label · Milk coffee / Latte · ready for artwork.",
  poster: withPosterVer("/models/bottles/glass-280-short-latte-poster.webp"),
  asset: {
    ...glass280LatteModel.asset,
    id: "glass-280-short-latte",
    src: `${glass280ShortManifest.src}?v=${glass280ShortManifest.sha256.slice(0, 12)}`,
    name: "Glass - 280 mL · Short label",
    poster: withPosterVer("/models/bottles/glass-280-short-latte-poster.webp"),
    materialSlots: { body: ["Body", "Neck", "GlassBase"], cap: ["Cap"], label: ["Label"], liquid: ["Water"] },
  },
  appearance: {
    ...glass280LatteModel.appearance,
    id: "glass-280-short:latte-blank",
    slots: { ...glass280LatteModel.appearance.slots, cap: { ...glass280LatteModel.appearance.slots?.cap, color: "#000000" } },
  },
};

const glass290ChiaModel: LabModel = {
  id: "glass-290-chia",
  name: "Glass - 290 mL · Chia",
  description: "290 mL glass bottle · Chia drink · ready for artwork.",
  category: "glass",
  volume: "290 mL",
  poster: withPosterVer("/models/bottles/glass-290-chia-poster.webp"),
  asset: {
    id: "glass-290-chia",
    src: `${glass290ChiaManifest.src}?v=${glass290ChiaManifest.sha256.slice(0, 12)}`,
    name: "Glass - 290 mL · Chia",
    packaging: "glass",
    volumeMl: 290,
    poster: withPosterVer("/models/bottles/glass-290-chia-poster.webp"),
    materialSlots: glass290ChiaManifest.materialSlots,
    textureSamplers: { label: { wrapS: "repeat", wrapT: "clamp" } },
    orientation: [0, 0, 0],
    cameraFraming: "bounds",
  },
  appearance: {
    id: "glass-290:chia-blank",
    requiredSlots: ["body", "cap", "label", "liquid", "inclusions"],
    slots: {
      body: { color: "#ffffff", metalness: 0, roughness: 0.042, transmission: 1, thickness: 0.002, ior: 1.52 },
      cap: { color: "#c0c0c0", metalness: 1, roughness: 0.388 },
      label: { color: "#ffffff", metalness: 0, roughness: 0.28 },
      // Chia uses the same opaque captured-water path as Basil; only its native
      // seed mesh and liquid type differ.
      liquid: { color: "#f14e78", metalness: 0, roughness: 1, transmission: 0 },
      inclusions: { color: "#302a24", roughness: 0.74 },
    },
  },
  frontYaw: 0,
};

const glass290MilkModel: LabModel = {
  id: "glass-290-milk",
  name: "Glass - 290 mL · Milk",
  description: "290 mL glass bottle · Milk · ready for artwork.",
  category: "glass",
  volume: "290 mL",
  poster: withPosterVer("/models/bottles/glass-290-milk-poster.webp"),
  asset: {
    id: "glass-290-milk",
    src: `${glass290MilkManifest.src}?v=${glass290MilkManifest.sha256.slice(0, 12)}`,
    name: "Glass - 290 mL · Milk",
    packaging: "glass",
    volumeMl: 290,
    poster: withPosterVer("/models/bottles/glass-290-milk-poster.webp"),
    materialSlots: glass290MilkManifest.materialSlots,
    textureSamplers: { label: { wrapS: "repeat", wrapT: "clamp" } },
    orientation: [0, 0, 0],
    cameraFraming: "bounds",
  },
  appearance: {
    id: "glass-290:milk-blank",
    requiredSlots: ["body", "cap", "label", "liquid"],
    slots: {
      body: { color: "#ffffff", metalness: 0, roughness: 0.042, transmission: 1, thickness: 0.002, ior: 1.52 },
      cap: { color: "#c0c0c0", metalness: 1, roughness: 0.388 },
      label: { color: "#ffffff", metalness: 0, roughness: 0.28 },
      liquid: { color: "#fff5e4", metalness: 0, roughness: 0.28, transmission: 0, thickness: 0.035, ior: 1.333 },
    },
  },
  frontYaw: 0,
};

const glass300MilkModel: LabModel = {
  ...glass290MilkModel,
  id: "glass-300-milk",
  name: "Glass - 300 mL",
  volume: "300 mL",
  description: "300 mL glass bottle · molded bead texture · Milk · ready for artwork.",
  poster: withPosterVer("/models/bottles/glass-300-milk-poster.webp"),
  asset: {
    ...glass290MilkModel.asset,
    id: "glass-300-milk",
    name: "Glass - 300 mL",
    volumeMl: 300,
    src: `${glass300MilkManifest.src}?v=${glass300MilkManifest.sha256.slice(0, 12)}`,
    poster: withPosterVer("/models/bottles/glass-300-milk-poster.webp"),
    materialSlots: glass300MilkManifest.materialSlots,
  },
  appearance: { ...glass290MilkModel.appearance, id: "glass-300:milk-blank" },
};

const glass485MilkModel: LabModel = {
  ...glass300MilkModel,
  id: "glass-485-milk",
  name: "Glass - 485 mL",
  volume: "485 mL",
  description: "485 mL glass bottle · Milk · ready for artwork.",
  poster: withPosterVer("/models/bottles/glass-485-milk-poster.webp"),
  asset: {
    ...glass300MilkModel.asset,
    id: "glass-485-milk",
    name: "Glass - 485 mL",
    volumeMl: 485,
    src: `${glass485MilkManifest.src}?v=${glass485MilkManifest.sha256.slice(0, 12)}`,
    poster: withPosterVer("/models/bottles/glass-485-milk-poster.webp"),
    materialSlots: glass485MilkManifest.materialSlots,
  },
  appearance: { ...glass300MilkModel.appearance, id: "glass-485:milk-blank" },
};

const glass290PullcapBasilModel: LabModel = {
  id: "glass-290-pullcap-basil",
  name: "Glass - 290 mL 2 · Basil",
  description: "290 mL glass bottle · pull cap · Basil seed drink · ready for artwork.",
  category: "glass",
  volume: "290 mL",
  poster: withPosterVer("/models/bottles/glass-290-pullcap-basil-poster.webp"),
  asset: {
    id: "glass-290-pullcap-basil",
    name: "Glass - 290 mL 2 · Basil",
    packaging: "glass",
    volumeMl: 290,
    src: `${glass290PullcapManifest.src}?v=${glass290PullcapManifest.sha256.slice(0, 12)}`,
    poster: withPosterVer("/models/bottles/glass-290-pullcap-basil-poster.webp"),
    materialSlots: glass290PullcapManifest.materialSlots,
    textureSamplers: { label: { wrapS: "repeat", wrapT: "clamp" } },
    orientation: [0, 0, 0],
    cameraFraming: "bounds",
  },
  appearance: {
    id: "glass-290-pullcap:basil-blank",
    requiredSlots: ["body", "cap", "label", "liquid", "inclusions"],
    slots: {
      body: { color: "#ffffff", metalness: 0, roughness: 0.042, transmission: 1, thickness: 0.002, ior: 1.52 },
      cap: { color: "#c0c0c0", metalness: 1, roughness: 0.5527864098548889 },
      label: { color: "#ffffff", metalness: 0, roughness: 0.28 },
      liquid: { color: "#f14e78", metalness: 0, roughness: 1, transmission: 0 },
      inclusions: { color: "#302a24", roughness: 0.74 },
    },
  },
  frontYaw: 0,
};

const glass290PullcapVariants: LabModel[] = [
  { kind: "chia", manifest: glass290PullcapChiaManifest, label: "Chia", color: "#f14e78" },
  { kind: "milk", manifest: glass290PullcapMilkManifest, label: "Milk", color: "#fff5e4" },
].map(({ kind, manifest, label, color }) => ({
  ...glass290PullcapBasilModel,
  id: `glass-290-pullcap-${kind}`,
  name: `Glass - 290 mL 2 · ${label}`,
  description: `290 mL glass bottle · pull cap · ${label} · ready for artwork.`,
  poster: withPosterVer(`/models/bottles/glass-290-pullcap-${kind}-poster.webp`),
  asset: {
    ...glass290PullcapBasilModel.asset,
    id: manifest.id,
    name: `Glass - 290 mL 2 · ${label}`,
    src: `${manifest.src}?v=${manifest.sha256.slice(0, 12)}`,
    poster: withPosterVer(`/models/bottles/glass-290-pullcap-${kind}-poster.webp`),
    materialSlots: manifest.materialSlots,
  },
  appearance: {
    id: `glass-290-pullcap:${kind}-blank`,
    requiredSlots: ["body", "cap", "label", "liquid", ...(kind === "chia" ? ["inclusions"] : [])],
    slots: {
      body: { ...glass290PullcapBasilModel.appearance.slots!.body },
      cap: { ...glass290PullcapBasilModel.appearance.slots!.cap },
      label: { ...glass290PullcapBasilModel.appearance.slots!.label },
      liquid: kind === "milk" ? { ...glass290MilkModel.appearance.slots!.liquid } : { ...glass290ChiaModel.appearance.slots!.liquid, color },
      ...(kind === "chia" ? { inclusions: { color: "#302a24", roughness: 0.74 } } : {}),
    },
  },
}));

const basilGlass290Model = fromPublished(
  "basil-glass290-strawberry-3d",
  {
    id: "basil-strawberry",
    name: "Glass - 290 mL · Basil",
    description: "290 mL glass bottle · screw cap · Basil seed strawberry drink · blank label, ready for artwork.",
    category: "glass",
  },
  { capColor: "#c0c0c0" },
);

const can330Model = fromPublished(
  "juice30-can330-mango-3d",
  {
    id: "can-mango",
    name: "Can - 330 mL",
    description: "330 mL aluminum can · blank wrap, ready for artwork.",
    category: "can",
  },
  { poster: nativeCanPosters["can-330"] },
);

const pet500AloeModel = fromPublished("aloe-pet500-mango-3d", {
  id: "pet-aloe",
  name: "PET - 500 mL",
  description: "500 mL PET bottle · short label · Aloe vera · blank label, ready for artwork.",
  category: "pet",
});

const pet500FullAloeModel: LabModel = {
  id: "pet-500-full-label",
  name: "PET - 500 mL · Full label",
  description: "500 mL PET bottle · full label · Aloe vera · blank label, ready for artwork.",
  category: "pet",
  volume: "500 mL",
  poster: withPosterVer("/models/bottles/pet-500-full-label-poster.webp"),
  asset: {
    id: "pet-500-full-label",
    name: "PET - 500 mL · Full label",
    volumeMl: 500,
    packaging: "pet",
    src: `${pet500FullManifest.src}?v=${pet500FullManifest.sha256.slice(0, 12)}`,
    poster: withPosterVer("/models/bottles/pet-500-full-label-poster.webp"),
    materialSlots: pet500FullManifest.materialSlots,
    textureSamplers: { label: { wrapS: "repeat", wrapT: "clamp" } },
    orientation: [0, 0, 0],
  },
  appearance: {
    id: "pet-500-full:aloe-blank",
    requiredSlots: ["body", "cap", "label", "liquid", "inclusions"],
    slots: {
      body: { color: "#ffffff", metalness: 0 },
      cap: { color: "#ffffff", metalness: 0, roughness: 0.29 },
      label: { color: "#ffffff", metalness: 0, roughness: 0.15, clearcoat: 0.2 },
      liquid: { color: "#ffb52e" },
      inclusions: { color: "#ffffff", metalness: 0, roughness: 0.18 },
    },
  },
  frontYaw: 0,
};

const pet1500ShortAloeModel: LabModel = {
  id: "pet-1500-short-label",
  name: "PET - 1.5 L · Aloe",
  description: "1500 mL · 1.5 litre PET bottle · short label · Aloe vera · blank label, ready for artwork.",
  category: "pet",
  volume: "1.5 L",
  poster: withPosterVer("/models/bottles/pet-1500-short-label-poster.webp"),
  asset: {
    id: "pet-1500-short-label",
    name: "PET - 1.5 L · Aloe",
    volumeMl: 1500,
    packaging: "pet",
    src: `${pet1500ShortManifest.src}?v=${pet1500ShortManifest.sha256.slice(0, 12)}`,
    poster: withPosterVer("/models/bottles/pet-1500-short-label-poster.webp"),
    materialSlots: pet1500ShortManifest.materialSlots,
    textureSamplers: { label: { wrapS: "repeat", wrapT: "clamp" } },
    orientation: [0, 0, 0],
    cameraFraming: "bounds",
  },
  appearance: {
    id: "pet-1500-short:aloe-blank",
    requiredSlots: ["body", "cap", "label", "liquid", "inclusions"],
    slots: {
      body: { color: "#ffffff", metalness: 0 },
      cap: { color: "#ffffff", metalness: 0, roughness: 0.29 },
      label: { color: "#ffffff", metalness: 0, roughness: 0.15, clearcoat: 0.2 },
      liquid: { color: "#ffb52e" },
      inclusions: { color: "#ffffff", metalness: 0, roughness: 0.18 },
    },
  },
  frontYaw: 0,
};

const pet1500FullAloeModel: LabModel = {
  ...pet1500ShortAloeModel,
  id: "pet-1500-juice",
  name: "PET - 1.5 L · Full label",
  description: "1500 mL · 1.5 litre PET bottle · full label · Aloe vera · blank label, ready for artwork.",
  poster: withPosterVer("/models/bottles/pet-1500-juice-poster.webp"),
  asset: {
    ...pet1500ShortAloeModel.asset,
    id: "pet-1500-juice",
    name: "PET - 1.5 L · Full label",
    src: `${pet1500FullManifest.src}?v=${pet1500FullManifest.sha256.slice(0, 12)}`,
    poster: withPosterVer("/models/bottles/pet-1500-juice-poster.webp"),
    materialSlots: pet1500FullManifest.materialSlots,
  },
  appearance: {
    ...pet1500ShortAloeModel.appearance,
    id: "pet-1500-full:aloe-blank",
  },
};

const pet320NataModel = fromPublished("cojo-pet320-watermelon-3d", {
  id: "pet-nata-watermelon",
  name: "PET - 320 mL 1",
  description: "320 mL PET bottle · Nata de coco · blank label, ready for artwork.",
  category: "pet",
});

const findBatch = (id: string) => BATCH_MODELS.find((model) => model.id === id)!;

/** All beverage models grouped cleanly by packaging type and sorted ascending by volume. */
export const LAB_MODELS: LabModel[] = [
  // Glass Bottles (280 mL → 485 mL)
  glass280LatteModel,
  glass280ShortLatteModel,
  basilGlass290Model,
  glass290ChiaModel,
  glass290MilkModel,
  glass290PullcapBasilModel,
  ...glass290PullcapVariants,
  glass300MilkModel,
  glass485MilkModel,

  // Aluminum Cans (180 mL → 500 mL)
  nativeCanModels[0], // can-180
  nativeCanModels[1], // can-250-short
  nativeCanModels[2], // can-250-slim
  nativeCanModels[3], // can-320
  can330Model,        // can-mango (330 mL)
  nativeCanModels[4], // can-500

  // PET Bottles (320 mL → 1.5 L)
  pet320NataModel,
  pet320FullNataModel,
  findBatch("pet-325-juice"),
  pet330EnergyModel,
  pet350JuiceModel,
  pet500AloeModel,
  pet500FullAloeModel,
  pet1000JuiceModel,
  findBatch("pet-1000-short-juice"),
  pet1500ShortAloeModel,
  pet1500FullAloeModel,

  // PP Bottles (500 mL → 2 L)
  findBatch("pp-500"),
  findBatch("pp-500-2"),
  findBatch("pp-1000"),
  findBatch("pp-1000-2"),
  findBatch("pp-1250"),
  findBatch("pp-2000"),
];

/** Keep the home showcase focused on three representative beverage geometries. */
export const FEATURED_MODELS: LabModel[] = [
  basilGlass290Model,
  can330Model,
  pet500AloeModel,
];

/**
 * Public web families grouped by packaging material (Glass → Cans → PET → PP)
 * and sorted ascending by volume so matching containers sit side by side.
 */
export const LAB_MODEL_FAMILIES: LabModelFamily[] = [
  // --- GLASS BOTTLES ---
  {
    id: "glass-280-latte",
    name: "Glass - 280 mL",
    description: "280 mL glass bottle · Milk coffee / Latte",
    category: "glass",
    volume: "280 mL",
    poster: glass280LatteModel.poster,
    variants: [
      { id: "full-label", label: "Full label", order: 0, modelId: glass280LatteModel.id, available: true },
      { id: "short-label", label: "Short label", order: 1, modelId: glass280ShortLatteModel.id, available: true },
    ],
  },
  {
    id: "glass-290-rotate-cap",
    name: "Glass - 290 mL",
    description: "290 mL glass bottle · screw cap · Basil, Chia, Milk",
    category: "glass",
    volume: "290 mL",
    poster: basilGlass290Model.poster,
    variants: [
      { id: "basil", label: "Basil", order: 0, modelId: basilGlass290Model.id, available: true },
      { id: "chia", label: "Chia", order: 1, modelId: glass290ChiaModel.id, available: true },
      { id: "milk", label: "Milk", order: 3, modelId: glass290MilkModel.id, available: true },
    ],
  },
  {
    id: "glass-290-pull-cap",
    name: "Glass - 290 mL 2",
    description: "290 mL glass bottle · pull cap · Basil, Chia, Milk",
    category: "glass",
    volume: "290 mL",
    poster: glass290PullcapBasilModel.poster,
    variants: [
      { id: "basil", label: "Basil", order: 0, modelId: glass290PullcapBasilModel.id, available: true },
      ...glass290PullcapVariants.map((model, index) => ({
        id: index === 0 ? "chia" : "milk",
        label: index === 0 ? "Chia" : "Milk",
        order: index + 1,
        modelId: model.id,
        available: true as const,
      })),
    ],
  },
  {
    id: "glass-300-milk",
    name: "Glass - 300 mL",
    description: "300 mL glass bottle · molded bead texture · Milk",
    category: "glass",
    volume: "300 mL",
    poster: glass300MilkModel.poster,
    variants: [{ id: "milk", label: "Milk", order: 0, modelId: glass300MilkModel.id, available: true }],
  },
  {
    id: "glass-485-milk",
    name: "Glass - 485 mL",
    description: "485 mL glass bottle · Milk",
    category: "glass",
    volume: "485 mL",
    poster: glass485MilkModel.poster,
    variants: [{ id: "milk", label: "Milk", order: 0, modelId: glass485MilkModel.id, available: true }],
  },

  // --- ALUMINUM CANS ---
  {
    id: "can-180-standard",
    name: "Can - 180 mL",
    description: "180 mL aluminum can",
    category: "can",
    volume: "180 mL",
    poster: nativeCanPosters["can-180"],
    variants: [{ id: "standard", label: "Standard", order: 0, modelId: "can-180", available: true }],
  },
  {
    id: "can-250-short",
    name: "Can - 250 mL Short",
    description: "250 mL short aluminum can",
    category: "can",
    volume: "250 mL",
    poster: nativeCanPosters["can-250-short"],
    variants: [{ id: "short", label: "Short", order: 0, modelId: "can-250-short", available: true }],
  },
  {
    id: "can-250-slim",
    name: "Can - 250 mL Slim",
    description: "250 mL slim aluminum can",
    category: "can",
    volume: "250 mL",
    poster: nativeCanPosters["can-250"],
    variants: [{ id: "slim", label: "Slim", order: 0, modelId: "can-250-slim", available: true }],
  },
  {
    id: "can-320-standard",
    name: "Can - 320 mL",
    description: "320 mL aluminum can",
    category: "can",
    volume: "320 mL",
    poster: nativeCanPosters["can-320"],
    variants: [{ id: "standard", label: "Standard", order: 0, modelId: "can-320", available: true }],
  },
  {
    id: "can-330-standard",
    name: "Can - 330 mL",
    description: "330 mL standard aluminum can",
    category: "can",
    volume: "330 mL",
    poster: can330Model.poster,
    variants: [{ id: "standard", label: "Standard", order: 0, modelId: can330Model.id, available: true }],
  },
  {
    id: "can-500-standard",
    name: "Can - 500 mL",
    description: "500 mL aluminum can",
    category: "can",
    volume: "500 mL",
    poster: nativeCanPosters["can-500"],
    variants: [{ id: "standard", label: "Standard", order: 0, modelId: "can-500", available: true }],
  },

  // --- PET BOTTLES ---
  {
    id: "pet-320-nata",
    name: "PET - 320 mL",
    description: "320 mL PET bottle · Nata de coco",
    category: "pet",
    volume: "320 mL",
    poster: pet320NataModel.poster,
    variants: [
      { id: "nata", label: "320 mL 1", order: 0, modelId: pet320NataModel.id, available: true },
      { id: "full-label", label: "320 mL 2", order: 1, modelId: pet320FullNataModel.id, available: true },
    ],
  },
  {
    id: "pet-325-juice",
    name: "PET - 325 mL",
    description: "325 mL PET bottle · Juice",
    category: "pet",
    volume: "325 mL",
    poster: findBatch("pet-325-juice").poster,
    variants: [{ id: "standard", label: "Juice", order: 0, modelId: "pet-325-juice", available: true }],
  },
  {
    id: "pet-330-energy",
    name: "PET - 330 mL",
    description: "330 mL PET bottle · Energy drink · sparkling",
    category: "pet",
    volume: "330 mL",
    poster: pet330EnergyModel.poster,
    variants: [{ id: "energy", label: "Energy drink", order: 0, modelId: pet330EnergyModel.id, available: true }],
  },
  {
    id: "pet-350-juice",
    name: "PET - 350 mL",
    description: "350 mL PET bottle · Juice",
    category: "pet",
    volume: "350 mL",
    poster: pet350JuiceModel.poster,
    variants: [{ id: "juice", label: "Juice", order: 0, modelId: pet350JuiceModel.id, available: true }],
  },
  {
    id: "pet-500-short-label",
    name: "PET - 500 mL",
    description: "500 mL PET bottle · Aloe vera · short & full label",
    category: "pet",
    volume: "500 mL",
    poster: pet500AloeModel.poster,
    variants: [
      { id: "aloe", label: "Aloe", order: 0, modelId: pet500AloeModel.id, available: true },
      { id: "full-label", label: "Full label", order: 1, modelId: pet500FullAloeModel.id, available: true },
    ],
  },
  {
    id: "pet-1000-juice",
    name: "PET - 1 L 1",
    description: "1000 mL · 1 litre PET bottle · Juice",
    category: "pet",
    volume: "1 L",
    poster: pet1000JuiceModel.poster,
    variants: [{ id: "juice", label: "Juice", order: 0, modelId: pet1000JuiceModel.id, available: true }],
  },
  {
    id: "pet-1000-short-juice",
    name: "PET - 1 L 2",
    description: "1000 mL · 1 litre PET bottle · Juice",
    category: "pet",
    volume: "1 L",
    poster: findBatch("pet-1000-short-juice").poster,
    variants: [{ id: "juice", label: "Juice", order: 0, modelId: "pet-1000-short-juice", available: true }],
  },
  {
    id: "pet-1500-juice",
    name: "PET - 1.5 L",
    description: "1500 mL · 1.5 litre PET bottle · Aloe vera · short & full label",
    category: "pet",
    volume: "1.5 L",
    poster: pet1500ShortAloeModel.poster,
    variants: [
      { id: "aloe", label: "1.5L 1", order: 0, modelId: pet1500ShortAloeModel.id, available: true },
      { id: "standard", label: "1.5L 2", order: 1, modelId: pet1500FullAloeModel.id, available: true },
    ],
  },

  // --- PP BOTTLES ---
  {
    id: "pp-500",
    name: "PP - 500 mL 1",
    description: "500 mL PP bottle · Opaque white",
    category: "pp",
    volume: "500 mL",
    poster: findBatch("pp-500").poster,
    variants: [{ id: "standard", label: "Standard", order: 0, modelId: "pp-500", available: true }],
  },
  {
    id: "pp-500-2",
    name: "PP - 500 mL 2",
    description: "500 mL PP bottle · Opaque white",
    category: "pp",
    volume: "500 mL",
    poster: findBatch("pp-500-2").poster,
    variants: [{ id: "standard", label: "Standard", order: 0, modelId: "pp-500-2", available: true }],
  },
  {
    id: "pp-1000",
    name: "PP - 1 L 1",
    description: "1 L PP bottle · Opaque white",
    category: "pp",
    volume: "1 L",
    poster: findBatch("pp-1000").poster,
    variants: [{ id: "standard", label: "Standard", order: 0, modelId: "pp-1000", available: true }],
  },
  {
    id: "pp-1000-2",
    name: "PP - 1 L 2",
    description: "1 L PP bottle · Opaque white",
    category: "pp",
    volume: "1 L",
    poster: findBatch("pp-1000-2").poster,
    variants: [{ id: "standard", label: "Standard", order: 0, modelId: "pp-1000-2", available: true }],
  },
  {
    id: "pp-1250",
    name: "PP - 1.25 L",
    description: "1250 mL · 1.25 litre PP bottle · Opaque white",
    category: "pp",
    volume: "1.25 L",
    poster: findBatch("pp-1250").poster,
    variants: [{ id: "standard", label: "Standard", order: 0, modelId: "pp-1250", available: true }],
  },
  {
    id: "pp-2000",
    name: "PP - 2 L",
    description: "2000 mL · 2 litre PP bottle · Opaque white",
    category: "pp",
    volume: "2 L",
    poster: findBatch("pp-2000").poster,
    variants: [{ id: "standard", label: "Standard", order: 0, modelId: "pp-2000", available: true }],
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
    const variants = family.variants
      .map((variant) => {
        const model = LAB_MODELS.find((item) => item.id === variant.modelId);
        return `${variant.label} ${model?.name ?? ""} ${model?.description ?? ""}`;
      })
      .join(" ");
    return `${family.name} ${family.description} ${family.volume} ${variants}`.toLowerCase().includes(search);
  });
}

export const labModels = LAB_MODELS;
export const DEFAULT_MODEL_ID = "basil-strawberry";
export const DEFAULT_MODEL = basilGlass290Model;
export function getLabModel(id?: string | null): LabModel {
  return LAB_MODELS.find((model) => model.id === id) ?? DEFAULT_MODEL;
}

/** Editable control defaults; native cap materials are retained until the user changes them. */
export function getModelMaterialDefaults(id?: string | null): MaterialPreferences {
  const model = getLabModel(id);
  const coffeeGlass = model.id === "glass-280-latte" || model.id === "glass-280-short-latte";
  const glass290Chia = model.id === "glass-290-chia" || model.id === "glass-290-pullcap-chia";
  const glass290Milk =
    model.id === "glass-290-milk" ||
    model.id === "glass-290-pullcap-milk" ||
    model.id === "glass-300-milk" ||
    model.id === "glass-485-milk";
  const liquidType = glass290Chia
    ? "chia"
    : glass290Milk
      ? "milk"
      : model.id === "basil-strawberry" || model.id === "glass-290-pullcap-basil"
        ? "basil-seed"
        : model.id === "pet-aloe" || model.id === "pet-500-full-label" || model.id === "pet-1500-short-label" || model.id === "pet-1500-juice"
          ? "aloe"
          : model.id === "pet-nata-watermelon" || model.id === "pet-320-full-nata"
            ? "nata-de-coco"
            : model.id === "pet-330-energy"
              ? "energy"
              : coffeeGlass
                ? "coffee"
                : "fruit-juice";
  return {
    ...getLiquidType(liquidType).settings,
    liquidType,
    liquidCustomized:
      model.id === "pet-350-juice" ||
      model.id === "pet-1000-juice" ||
      model.id === "pet-330-energy" ||
      coffeeGlass,
    liquidSparkling: model.asset.sparkling ? 0.516 : 0,
    liquidColor: model.appearance.slots?.liquid?.color ?? "#ffffff",
    capColor:
      model.appearance.slots?.cap?.color ??
      (model.category === "glass"
        ? "#c0c0c0"
        : model.category === "can"
          ? "#c0c0c0"
          : "#ffffff"),
    bodyColor: model.appearance.slots?.body?.color ?? "#ffffff",
    capMetalness: model.appearance.slots?.cap?.metalness ?? (model.category === "pet" ? 0 : 1),
    capRoughness:
      model.appearance.slots?.cap?.roughness ??
      (model.category === "glass" ? 0.388 : model.category === "pet" ? 0.29 : 0.22),
    bodyMetalness: model.appearance.slots?.body?.metalness ?? (model.category === "can" ? 1 : 0),
    bodyRoughness:
      model.appearance.slots?.body?.roughness ??
      (model.category === "glass" ? 0.042 : model.category === "pet" ? 0.075 : 0.22),
    labelOffset: (model.appearance.slots?.label?.textureOffsetX ?? 0) * 100,
    roughness: model.appearance.slots?.label?.roughness ?? 0.15,
    metalness: model.appearance.slots?.label?.metalness ?? 0,
    ...BATCH_MATERIAL_DEFAULTS[model.id],
  };
}
export { catalog as publishedCatalog };
