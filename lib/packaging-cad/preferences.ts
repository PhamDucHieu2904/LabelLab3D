import type { BoardMaterialId, PackagingParams } from './types';
import { BOARD_MATERIAL_IDS } from './materials/paper-presets';
import {
  createDefaultPackagingParams,
  DEFAULT_PACKAGING_TEMPLATE_ID,
  PACKAGING_TEMPLATES,
} from './templates/registry';

export const PACKAGING_PREFERENCES_KEY = 'labellab.packaging.preferences.v1';

const validTemplateIds = new Set(PACKAGING_TEMPLATES.map((t) => t.id));
const validMaterialIds = new Set<string>(BOARD_MATERIAL_IDS);

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
      fluteDirection: own('fluteDirection') === 'along-W' ? 'along-W' : 'along-L',
      outsideColor: safeColor(own('outsideColor'), defaults.outsideColor),
      insideColor: safeColor(own('insideColor'), defaults.insideColor),
      outsideRoughness: bounded(own('outsideRoughness'), defaults.outsideRoughness, 0.05, 1),
      outsideMetalness: bounded(own('outsideMetalness'), defaults.outsideMetalness, 0, 1),
      insideRoughness: bounded(own('insideRoughness'), defaults.insideRoughness, 0.05, 1),

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
