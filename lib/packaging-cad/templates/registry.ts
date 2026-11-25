import type {
  BoardMaterialId,
  PackagingParams,
  PackagingTemplateCategory,
  PackagingTemplateDefinition,
  SolvedDieline,
} from '../types';
import { getBoardMaterialPreset } from '../materials/paper-presets';
import { FEFCO_0421_TRAY_TEMPLATE } from './fefco-0421-tray';
import { FEFCO_0201_RSC_TEMPLATE } from './fefco-0201-rsc';
import { FEFCO_0427_MAILER_TEMPLATE } from './fefco-0427-mailer';
import { ECMA_A20_TUCK_TEMPLATE } from './ecma-a20-tuck';
import { BEVERAGE_CARRIER_TEMPLATE } from './beverage-carrier';
import { RIGID_LID_BASE_TEMPLATE } from './rigid-lid-base';
import { RIGID_MAGNETIC_BOX_TEMPLATE } from './rigid-magnetic-box';
import { RIGID_DRAWER_SLEEVE_TEMPLATE } from './rigid-drawer-sleeve';

export const PACKAGING_TEMPLATES: readonly PackagingTemplateDefinition[] = Object.freeze([
  FEFCO_0421_TRAY_TEMPLATE,
  BEVERAGE_CARRIER_TEMPLATE,
  FEFCO_0201_RSC_TEMPLATE,
  FEFCO_0427_MAILER_TEMPLATE,
  ECMA_A20_TUCK_TEMPLATE,
  RIGID_LID_BASE_TEMPLATE,
  RIGID_MAGNETIC_BOX_TEMPLATE,
  RIGID_DRAWER_SLEEVE_TEMPLATE,
]);

export const DEFAULT_PACKAGING_TEMPLATE_ID = FEFCO_0421_TRAY_TEMPLATE.id;

export function getPackagingTemplate(id?: string | null): PackagingTemplateDefinition {
  return PACKAGING_TEMPLATES.find((tpl) => tpl.id === id) ?? PACKAGING_TEMPLATES[0];
}

export function filterPackagingTemplates(
  query = '',
  category: 'all' | PackagingTemplateCategory = 'all',
): PackagingTemplateDefinition[] {
  const q = query.trim().toLowerCase();
  return PACKAGING_TEMPLATES.filter((tpl) => {
    if (category !== 'all' && tpl.category !== category) return false;
    if (!q) return true;
    return `${tpl.name} ${tpl.code} ${tpl.tagline} ${tpl.description} ${tpl.category}`
      .toLowerCase()
      .includes(q);
  });
}

export function createDefaultPackagingParams(
  templateId: string = DEFAULT_PACKAGING_TEMPLATE_ID,
  materialOverrideId?: BoardMaterialId,
): PackagingParams {
  const tpl = getPackagingTemplate(templateId);
  const mat = getBoardMaterialPreset(materialOverrideId ?? tpl.defaultMaterialId);
  return {
    templateId: tpl.id,
    lengthMm: tpl.defaultDimensions.length,
    widthMm: tpl.defaultDimensions.width,
    heightMm: tpl.defaultDimensions.height,
    dimensionMode: tpl.id === 'fefco-0421-tray' ? 'outer' : 'inner',

    materialId: mat.id,
    thicknessMm: mat.thicknessMm,
    // FEFCO 0421 display trays run flutes vertically on front/back walls ('along-W') for stacking
    // crush strength and exposed sinusoidal corrugated waves along the rollover side-wall profile.
    fluteDirection: tpl.id === 'fefco-0421-tray' ? 'along-W' : 'along-L',
    outsideColor: mat.outsideColor,
    insideColor: mat.insideColor,
    outsideRoughness: mat.outsideRoughness,
    outsideMetalness: mat.outsideMetalness,
    insideRoughness: mat.insideRoughness,

    finishMode: 'none',
    finishTarget: 'auto-artwork',
    finishIntensity: 0.92,
    finishRelief: 0.45,
    finishThreshold: 0.45,
    finishInvertMask: false,

    lockTabCount: 2,
    lockTabWidthMm: 34,
    dustFlapTaperDeg: 6,
    flapGapMm: 2,
    tuckStyle: 'reverse',
    tuckFlapLengthMm: 18,
    thumbNotch: true,
    thumbNotchRadiusMm: 10,
    handHoles: false,
    handHoleWidthMm: 78,
    handHoleHeightMm: 24,
    displayScoop: false,
    displayScoopDepthMm: 24,
    windowCutout: false,
    windowWidthMm: Math.round(tpl.defaultDimensions.length * 0.55),
    windowHeightMm: Math.round(Math.min(tpl.defaultDimensions.width, tpl.defaultDimensions.height) * 0.52),
    windowRadiusMm: 8,
    windowFilm: true,

    lidDepthMm: Math.max(18, Math.round(tpl.defaultDimensions.height * 0.42)),
    carrierPack: '6-pack',
    dividerGrid: true,

    bendAllowanceK: mat.bendAllowanceK,
    slotClearanceMm: 0.25,
    bleedMm: 3,

    foldProgress: tpl.heroFold,
    showDimensions: true,
    showFaceLabels: false,
    showCreaseLines: true,
  };
}

export function solvePackagingTemplate(params: PackagingParams): SolvedDieline {
  const tpl = getPackagingTemplate(params.templateId);
  const mat = getBoardMaterialPreset(params.materialId);
  return tpl.solve(params, mat);
}
