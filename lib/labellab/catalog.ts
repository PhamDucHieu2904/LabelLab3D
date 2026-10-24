import type { CatalogData } from "../catalog/contracts";
import type { ProductAppearance, ProductAsset } from "../viewer-config";
import { resolveDisplay3D } from "../catalog/resolve";
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
];
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
