import type {
  BoardMaterialId,
  BottlePackConfig,
  CarrierPackLayout,
  PackagingFinishMode,
  PackagingFinishTarget,
  PackagingParams,
} from './types';
import { BOARD_MATERIAL_IDS, PACKAGING_FINISH_MODES } from './materials/paper-presets';
import {
  createDefaultPackagingParams,
  DEFAULT_PACKAGING_TEMPLATE_ID,
  PACKAGING_TEMPLATES,
} from './templates/registry';

export const PACKAGING_PREFERENCES_KEY = 'labellab.packaging.preferences.v1';
export const PACKAGING_BOTTLE_PACK_KEY = 'labellab.packaging.bottle-pack.v1';

const validTemplateIds = new Set(PACKAGING_TEMPLATES.map((t) => t.id));
const validMaterialIds = new Set<string>(BOARD_MATERIAL_IDS);
const validFinishModes = new Set<string>(PACKAGING_FINISH_MODES);
const validFinishTargets = new Set<PackagingFinishTarget>(['auto-artwork', 'brand-frame', 'full-surface']);

const safeColor = (value: unknown, fallback: string) =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
const bounded = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
const bool = (value: unknown, fallback: boolean) =>
  typeof value === 'boolean' ? value : fallback;

/** Sanitize persisted or imported packaging parameters strictly against known allowlists. */
export function parsePackagingParams(raw: unknown): PackagingParams {
  const fallback = createDefaultPackagingParams(DEFAULT_PACKAGING_TEMPLATE_ID);
  try {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback;
    const proto = Object.getPrototypeOf(raw);
    if (proto !== Object.prototype && proto !== null) return fallback;
    const own = (key: keyof PackagingParams): unknown => {
      const d = Object.getOwnPropertyDescriptor(raw, key);
      return d && 'value' in d ? d.value : undefined;
    };

    const rawTemplateId = own('templateId');
    const templateId =
      typeof rawTemplateId === 'string' && validTemplateIds.has(rawTemplateId)
        ? rawTemplateId
        : DEFAULT_PACKAGING_TEMPLATE_ID;
    const rawMatId = own('materialId');
    const materialId: BoardMaterialId =
      typeof rawMatId === 'string' && validMaterialIds.has(rawMatId)
        ? (rawMatId as BoardMaterialId)
        : createDefaultPackagingParams(templateId).materialId;

    const defaults = createDefaultPackagingParams(templateId, materialId);
    const tpl = PACKAGING_TEMPLATES.find((t) => t.id === templateId)!;

    return {
      templateId,
      lengthMm: bounded(own('lengthMm'), defaults.lengthMm, tpl.minDimensions.length, tpl.maxDimensions.length),
      widthMm: bounded(own('widthMm'), defaults.widthMm, tpl.minDimensions.width, tpl.maxDimensions.width),
      heightMm: bounded(own('heightMm'), defaults.heightMm, tpl.minDimensions.height, tpl.maxDimensions.height),
      dimensionMode: own('dimensionMode') === 'outer' ? 'outer' : own('dimensionMode') === 'inner' ? 'inner' : defaults.dimensionMode,

      materialId,
      thicknessMm: bounded(own('thicknessMm'), defaults.thicknessMm, 0.25, 8),
      fluteDirection:
        own('fluteDirection') === 'along-W'
          ? 'along-W'
          : own('fluteDirection') === 'along-L'
            ? 'along-L'
            : defaults.fluteDirection,
      outsideColor: safeColor(own('outsideColor'), defaults.outsideColor),
      insideColor: safeColor(own('insideColor'), defaults.insideColor),
      outsideRoughness: bounded(own('outsideRoughness'), defaults.outsideRoughness, 0.05, 1),
      outsideMetalness: bounded(own('outsideMetalness'), defaults.outsideMetalness, 0, 1),
      insideRoughness: bounded(own('insideRoughness'), defaults.insideRoughness, 0.05, 1),

      finishMode: (typeof own('finishMode') === 'string' && validFinishModes.has(own('finishMode') as string)
        ? own('finishMode')
        : defaults.finishMode) as PackagingFinishMode,
      finishTarget: (typeof own('finishTarget') === 'string' && validFinishTargets.has(own('finishTarget') as PackagingFinishTarget)
        ? own('finishTarget')
        : defaults.finishTarget) as PackagingFinishTarget,
      finishIntensity: bounded(own('finishIntensity'), defaults.finishIntensity, 0.2, 1),
      finishRelief: bounded(own('finishRelief'), defaults.finishRelief, -1, 1),
      finishThreshold: bounded(own('finishThreshold'), defaults.finishThreshold, 0.1, 0.9),
      finishInvertMask: bool(own('finishInvertMask'), defaults.finishInvertMask),

      lockTabCount: own('lockTabCount') === 1 ? 1 : 2,
      lockTabWidthMm: bounded(own('lockTabWidthMm'), defaults.lockTabWidthMm, 10, 180),
      dustFlapTaperDeg: bounded(own('dustFlapTaperDeg'), defaults.dustFlapTaperDeg, 0, 22),
      flapGapMm: bounded(own('flapGapMm'), defaults.flapGapMm, 0, 40),
      tuckStyle: own('tuckStyle') === 'straight' ? 'straight' : 'reverse',
      tuckFlapLengthMm: bounded(own('tuckFlapLengthMm'), defaults.tuckFlapLengthMm, 10, 45),
      thumbNotch: bool(own('thumbNotch'), defaults.thumbNotch),
      thumbNotchRadiusMm: bounded(own('thumbNotchRadiusMm'), defaults.thumbNotchRadiusMm, 5, 22),
      handHoles: bool(own('handHoles'), defaults.handHoles),
      handHoleWidthMm: bounded(own('handHoleWidthMm'), defaults.handHoleWidthMm, 30, 120),
      handHoleHeightMm: bounded(own('handHoleHeightMm'), defaults.handHoleHeightMm, 14, 40),
      displayScoop: bool(own('displayScoop'), defaults.displayScoop),
      displayScoopDepthMm: bounded(own('displayScoopDepthMm'), defaults.displayScoopDepthMm, 8, 120),
      windowCutout: bool(own('windowCutout'), defaults.windowCutout),
      windowWidthMm: bounded(own('windowWidthMm'), defaults.windowWidthMm, 14, 500),
      windowHeightMm: bounded(own('windowHeightMm'), defaults.windowHeightMm, 12, 400),
      windowRadiusMm: bounded(own('windowRadiusMm'), defaults.windowRadiusMm, 0, 80),
      windowFilm: bool(own('windowFilm'), defaults.windowFilm),

      lidDepthMm: bounded(own('lidDepthMm'), defaults.lidDepthMm, 14, 280),
      carrierPack: (own('carrierPack') === '4-pack' || own('carrierPack') === '8-pack'
        ? own('carrierPack')
        : '6-pack') as CarrierPackLayout,
      dividerGrid: bool(own('dividerGrid'), defaults.dividerGrid),

      bendAllowanceK: bounded(own('bendAllowanceK'), defaults.bendAllowanceK, 0.2, 1.0),
      slotClearanceMm: bounded(own('slotClearanceMm'), defaults.slotClearanceMm, 0.08, 1.5),
      bleedMm: bounded(own('bleedMm'), defaults.bleedMm, 0, 15),

      foldProgress: bounded(own('foldProgress'), defaults.foldProgress, 0, 1),
      showDimensions: bool(own('showDimensions'), defaults.showDimensions),
      showFaceLabels: bool(own('showFaceLabels'), defaults.showFaceLabels),
      showCreaseLines: bool(own('showCreaseLines'), defaults.showCreaseLines),
    };
  } catch {
    return fallback;
  }
}

export function loadPackagingParams(storage?: Pick<Storage, 'getItem'>): PackagingParams {
  try {
    const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    const raw = target?.getItem(PACKAGING_PREFERENCES_KEY);
    if (!raw) return createDefaultPackagingParams();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return createDefaultPackagingParams();
    const env = parsed as Record<string, unknown>;
    return env.version === 1 ? parsePackagingParams(env.params) : createDefaultPackagingParams();
  } catch {
    return createDefaultPackagingParams();
  }
}

export function savePackagingParams(params: PackagingParams, storage?: Pick<Storage, 'setItem'>): boolean {
  try {
    const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!target) return false;
    target.setItem(
      PACKAGING_PREFERENCES_KEY,
      JSON.stringify({ version: 1, params: parsePackagingParams(params) }),
    );
    return true;
  } catch {
    return false;
  }
}

export function createDefaultBottlePackConfig(modelId = 'can-mango'): BottlePackConfig {
  return {
    enabled: false,
    modelId,
    cols: 3,
    rows: 2,
    spacingMm: 2,
    wallPaddingMm: 2,
    facingYawDeg: 0,
    organicJitter: false,
    autoFitOnChange: true,
  };
}

export function parseBottlePackConfig(
  raw: unknown,
  validModelIds?: ReadonlySet<string>,
  fallbackModelId = 'can-mango',
): BottlePackConfig {
  const fallback = createDefaultBottlePackConfig(fallbackModelId);
  try {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback;
    const proto = Object.getPrototypeOf(raw);
    if (proto !== Object.prototype && proto !== null) return fallback;
    const own = (key: keyof BottlePackConfig): unknown => {
      const d = Object.getOwnPropertyDescriptor(raw, key);
      return d && 'value' in d ? d.value : undefined;
    };
    const rawModelId = own('modelId');
    const modelId =
      typeof rawModelId === 'string' &&
      /^[a-z0-9-]+$/i.test(rawModelId) &&
      (!validModelIds || validModelIds.has(rawModelId))
        ? rawModelId
        : fallback.modelId;
    const rawCustomProjectId = own('customProjectId');
    const customProjectId =
      typeof rawCustomProjectId === 'string' && /^[a-z0-9_-]{1,100}$/i.test(rawCustomProjectId)
        ? rawCustomProjectId
        : undefined;
    const rawPackLabelArtworkId = own('packLabelArtworkId');
    const packLabelArtworkId =
      typeof rawPackLabelArtworkId === 'string' && /^[a-z0-9_-]{1,100}$/i.test(rawPackLabelArtworkId)
        ? rawPackLabelArtworkId
        : undefined;

    return {
      enabled: bool(own('enabled'), fallback.enabled),
      modelId,
      ...(customProjectId ? { customProjectId } : {}),
      ...(packLabelArtworkId ? { packLabelArtworkId } : {}),
      cols: Math.round(bounded(own('cols'), fallback.cols, 1, 6)),
      rows: Math.round(bounded(own('rows'), fallback.rows, 1, 4)),
      spacingMm: bounded(own('spacingMm'), fallback.spacingMm, 0, 16),
      wallPaddingMm: bounded(own('wallPaddingMm'), fallback.wallPaddingMm, 0, 16),
      facingYawDeg: bounded(own('facingYawDeg'), fallback.facingYawDeg, -180, 180),
      organicJitter: bool(own('organicJitter'), fallback.organicJitter),
      autoFitOnChange: bool(own('autoFitOnChange'), fallback.autoFitOnChange),
    };
  } catch {
    return fallback;
  }
}

export function loadBottlePackConfig(
  validModelIds?: ReadonlySet<string>,
  fallbackModelId = 'can-mango',
  storage?: Pick<Storage, 'getItem'>,
): BottlePackConfig {
  try {
    const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    const raw = target?.getItem(PACKAGING_BOTTLE_PACK_KEY);
    if (!raw) return createDefaultBottlePackConfig(fallbackModelId);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return createDefaultBottlePackConfig(fallbackModelId);
    }
    const env = parsed as Record<string, unknown>;
    return env.version === 1
      ? parseBottlePackConfig(env.config, validModelIds, fallbackModelId)
      : createDefaultBottlePackConfig(fallbackModelId);
  } catch {
    return createDefaultBottlePackConfig(fallbackModelId);
  }
}

export function saveBottlePackConfig(
  config: BottlePackConfig,
  validModelIds?: ReadonlySet<string>,
  storage?: Pick<Storage, 'setItem'>,
): boolean {
  try {
    const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!target) return false;
    target.setItem(
      PACKAGING_BOTTLE_PACK_KEY,
      JSON.stringify({ version: 1, config: parseBottlePackConfig(config, validModelIds) }),
    );
    return true;
  } catch {
    return false;
  }
}
