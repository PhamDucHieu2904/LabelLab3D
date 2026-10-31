import type { CatalogData } from "../catalog/contracts";
import type { ProductAppearance, ProductAsset } from "../viewer-config";
import { resolveDisplay3D } from "../catalog/resolve";
import { canAssets } from "../product-assets";
import sourceCatalog from "./source-catalog.json";

/** Published source snapshot. Private draft records are never imported. */
const catalog = sourceCatalog as unknown as CatalogData;
export interface LabModel {
  id: string;
  name: string;
  description: string;
  category: "glass" | "can" | "pet";
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
];

/** Keep the home showcase focused on the three published sample scenes. */
export const FEATURED_MODELS = LAB_MODELS.slice(0, 3);

/**
 * Public web families. Chia and Milk are retained as ordered placeholders
 * because the PC project has them, but remain disabled until their optimized
 * Vinut web GLBs are published. This prevents accidentally loading Basil's
 * geometry under another drink name.
 */
export const LAB_MODEL_FAMILIES: LabModelFamily[] = [
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
      { id: "chia", label: "Chia", order: 1, available: false },
      { id: "milk", label: "Milk", order: 3, available: false },
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
export function getModelMaterialDefaults(id?: string | null) {
  const model = getLabModel(id);
  return {
    liquidColor: model.appearance.slots?.liquid?.color ?? "#ffffff",
    capColor:
      model.appearance.slots?.cap?.color ??
      (model.category === "glass"
        ? "#d8c738"
        : model.category === "can"
          ? "#c0c0c0"
          : "#ffffff"),
    labelOffset: (model.appearance.slots?.label?.textureOffsetX ?? 0) * 100,
    roughness: model.appearance.slots?.label?.roughness ?? 0.15,
    metalness: model.appearance.slots?.label?.metalness ?? 0,
  };
}
export { catalog as publishedCatalog };
