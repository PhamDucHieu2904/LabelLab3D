import type {
  BottlePackConfig,
  DimensionTripleMm,
  PackagingParams,
  SolvedDieline,
} from './types';
import {
  getPackagingTemplate,
  PACKAGING_TEMPLATES,
  solvePackagingTemplate,
} from './templates/registry';
import { clampNum } from './templates/helpers';
import { getHoneycombDividerThicknessMm } from './geometry/partition-builder';

export interface BeverageFootprintMm {
  readonly diameterXMm: number;
  readonly diameterZMm: number;
  readonly heightMm: number;
}

export interface BottleSlotPoseMm {
  readonly col: number;
  readonly row: number;
  readonly xMm: number;
  readonly zMm: number;
  readonly yawRad: number;
}

export interface BottlePackLayoutResult {
  readonly slots: readonly BottleSlotPoseMm[];
  readonly itemCount: number;
  readonly requiredInnerMm: DimensionTripleMm;
  readonly fitsHorizontal: boolean;
  readonly fitsHeight: boolean;
  readonly fitsAll: boolean;
  readonly overflowLengthMm: number;
  readonly overflowWidthMm: number;
  readonly overflowHeightMm: number;
  readonly openTopTemplate: boolean;
  /** True when packed bottles/cans lie down horizontally (e.g. flat FEFCO 0427 gift mailer). */
  readonly horizontal: boolean;
}

export interface PackGridPreset {
  readonly id: string;
  readonly label: string;
  readonly cols: number;
  readonly rows: number;
}

export const PACK_GRID_PRESETS: readonly PackGridPreset[] = Object.freeze([
  { id: '1x1', label: '1×1', cols: 1, rows: 1 },
  { id: '2x1', label: '2×1', cols: 2, rows: 1 },
  { id: '3x1', label: '3×1', cols: 3, rows: 1 },
  { id: '2x2', label: '4-Pk', cols: 2, rows: 2 },
  { id: '3x2', label: '6-Pk', cols: 3, rows: 2 },
  { id: '4x2', label: '8-Pk', cols: 4, rows: 2 },
  { id: '4x3', label: '12-Pk', cols: 4, rows: 3 },
  { id: '6x4', label: '24-Pk', cols: 6, rows: 4 },
]);

/**
 * Physical millimetre footprints derived from LabelLab's metre-scale GLB manifests.
 * At runtime, the 3D bottle packer also measures the decoded GLB Box3 and refines automatically.
 */
export const KNOWN_BEVERAGE_FOOTPRINTS_MM: Readonly<Record<string, BeverageFootprintMm>> = Object.freeze({
  'can-mango': { diameterXMm: 65.8, diameterZMm: 65.8, heightMm: 114.9 },
  'can-330': { diameterXMm: 65.8, diameterZMm: 65.8, heightMm: 114.9 },
  'can-180': { diameterXMm: 53.4, diameterZMm: 53.4, heightMm: 109.8 },
  'can-250-short': { diameterXMm: 66.0, diameterZMm: 66.0, heightMm: 91.0 },
  'can-250-slim': { diameterXMm: 54.4, diameterZMm: 54.4, heightMm: 133.0 },
  'can-320': { diameterXMm: 57.9, diameterZMm: 57.9, heightMm: 145.9 },
  'can-500': { diameterXMm: 66.0, diameterZMm: 66.0, heightMm: 167.9 },

  'basil-strawberry': { diameterXMm: 68.0, diameterZMm: 68.0, heightMm: 180.0 },
  'glass-290-chia': { diameterXMm: 68.0, diameterZMm: 68.0, heightMm: 180.0 },
  'glass-290-milk': { diameterXMm: 68.0, diameterZMm: 68.0, heightMm: 180.0 },
  'glass-290-pullcap-basil': { diameterXMm: 68.0, diameterZMm: 68.0, heightMm: 180.0 },
  'glass-290-pullcap-chia': { diameterXMm: 68.0, diameterZMm: 68.0, heightMm: 180.0 },
  'glass-290-pullcap-milk': { diameterXMm: 68.0, diameterZMm: 68.0, heightMm: 180.0 },
  'glass-280-latte': { diameterXMm: 59.0, diameterZMm: 59.0, heightMm: 170.0 },
  'glass-280-short-latte': { diameterXMm: 59.0, diameterZMm: 59.0, heightMm: 170.0 },
  'glass-300-milk': { diameterXMm: 62.0, diameterZMm: 62.0, heightMm: 178.0 },
  'glass-485-milk': { diameterXMm: 71.0, diameterZMm: 71.0, heightMm: 210.0 },

  'pet-aloe': { diameterXMm: 58.6, diameterZMm: 58.6, heightMm: 208.8 },
  'pet-500-full-label': { diameterXMm: 58.6, diameterZMm: 58.6, heightMm: 208.8 },
  'pet-nata-watermelon': { diameterXMm: 58.5, diameterZMm: 58.5, heightMm: 158.0 },
  'pet-320-full-nata': { diameterXMm: 58.5, diameterZMm: 58.5, heightMm: 158.0 },
  'pet-325-juice': { diameterXMm: 60.0, diameterZMm: 60.0, heightMm: 165.0 },
  'pet-330-energy': { diameterXMm: 59.5, diameterZMm: 59.5, heightMm: 172.0 },
  'pet-350-juice': { diameterXMm: 61.5, diameterZMm: 61.5, heightMm: 175.0 },
  'pet-1000-juice': { diameterXMm: 78.0, diameterZMm: 78.0, heightMm: 266.0 },
  'pet-1000-short-juice': { diameterXMm: 78.0, diameterZMm: 78.0, heightMm: 266.0 },
  'pet-1500-short-label': { diameterXMm: 88.0, diameterZMm: 88.0, heightMm: 308.0 },
  'pet-1500-juice': { diameterXMm: 88.0, diameterZMm: 88.0, heightMm: 308.0 },

  'pp-500': { diameterXMm: 65.0, diameterZMm: 65.0, heightMm: 194.0 },
  'pp-500-2': { diameterXMm: 65.0, diameterZMm: 65.0, heightMm: 194.0 },
  'pp-1000': { diameterXMm: 80.0, diameterZMm: 80.0, heightMm: 248.0 },
  'pp-1000-2': { diameterXMm: 80.0, diameterZMm: 80.0, heightMm: 248.0 },
  'pp-1250': { diameterXMm: 86.0, diameterZMm: 86.0, heightMm: 264.0 },
  'pp-2000': { diameterXMm: 102.0, diameterZMm: 102.0, heightMm: 294.0 },
});

const OPEN_TOP_TEMPLATES = new Set(['fefco-0421-tray']);
const HORIZONTAL_PACK_TEMPLATES = new Set(['fefco-0427-mailer']);

/**
 * Strict 3-tier packaging hierarchy (non-recursive by construction):
 *  - Tier 1 (Primary):   Bottles & Cans (`itemKind: 'beverage'`)
 *  - Tier 2 (Secondary): Retail boxes (`RETAIL_BOX_TEMPLATE_IDS`) — pack Tier 1 only
 *  - Tier 3 (Tertiary):  Outer trays & master cartons (`OUTER_CASE_TEMPLATE_IDS`) — pack Tier 1 OR Tier 2
 */
export const RETAIL_BOX_TEMPLATE_IDS: ReadonlySet<string> = new Set([
  'ecma-a10-seal-end',
  'ecma-a21-snap-lock',
  'fefco-0427-mailer',
  'rigid-lid-base',
]);

export const OUTER_CASE_TEMPLATE_IDS: ReadonlySet<string> = new Set([
  'fefco-0421-tray',
  'fefco-0201-rsc',
  'fefco-0201e-beer-case',
]);

export const DEFAULT_PACKABLE_BOX_TEMPLATE_ID = 'ecma-a10-seal-end';

/** True when this outer tray/carton template can pack Tier-2 retail boxes inside it. */
export function canPackRetailBoxes(templateId: string): boolean {
  return OUTER_CASE_TEMPLATE_IDS.has(templateId);
}

/** True when this template is a Tier-2 retail box eligible to be packed inside an outer tray/carton. */
export function isPackableRetailBoxTemplate(templateId: string): boolean {
  return RETAIL_BOX_TEMPLATE_IDS.has(templateId);
}

/** Catalog list of packable Tier-2 retail box templates. */
export function getPackableRetailBoxTemplates() {
  return PACKAGING_TEMPLATES.filter((tpl) => RETAIL_BOX_TEMPLATE_IDS.has(tpl.id));
}

/**
 * Resolve exact closed outer bounding dimensions (mm) of a Tier-2 retail box so it can be
 * packed inside a Tier-3 tray or master carton with the same grid & Auto-Fit math as bottles/cans.
 */
export function getRetailBoxFootprintMm(params: PackagingParams): BeverageFootprintMm {
  const solved = solvePackagingTemplate({
    ...params,
    foldProgress: 1,
    showDimensions: false,
    showFaceLabels: false,
    showCreaseLines: false,
  });
  return {
    diameterXMm: solved.outerMm.length,
    diameterZMm: solved.outerMm.width,
    heightMm: solved.outerMm.height,
  };
}

/** Snap rectangular packed-box rotation cleanly to orthogonal 90° steps (-180, -90, 0, 90, 180). */
export function snapPackedBoxYawDeg(rawDeg: number): number {
  if (!Number.isFinite(rawDeg)) return 0;
  const snapped = Math.round(rawDeg / 90) * 90;
  if (snapped === -180 || snapped === 180) return 180;
  if (snapped === 0 || Object.is(snapped, -0)) return 0;
  return snapped;
}

/** True when an orthogonal box rotation swaps its X (length) and Z (width) spans (±90°). */
export function isQuarterTurnYawDeg(rawDeg: number): boolean {
  const snapped = Math.abs(snapPackedBoxYawDeg(rawDeg));
  return snapped % 180 === 90;
}

/**
 * Square flat-sided bottle models that physically rest flat on one of their 4 faces (0°/90°/180°/-90°)
 * when laid horizontally inside a flat mailer box, instead of balancing awkwardly on a 45° corner edge.
 */
const SQUARE_SECTION_MODEL_IDS = new Set([
  'pet-aloe',
  'pet-500-full-label',
  'pet-1000-juice',
  'pet-1500-short-label',
  'pet-1500-juice',
  'pp-1000',
  'pp-2000',
]);

/**
 * Snap horizontal lying roll angle to physically stable flat resting faces for square/rectangular
 * bottles (90° for square cross-sections, 180° for wide rectangular cross-sections) while allowing
 * cylindrical cans and round glass/PET bottles to roll freely across 360°.
 */
export function snapHorizontalRestingYawRad(
  modelId: string,
  itemMm: BeverageFootprintMm,
  rawYawRad: number,
): number {
  if (!Number.isFinite(rawYawRad)) return 0;
  // Wide rectangular cross-section (e.g. pet-1000-short-juice 86×62 mm) rests stably on its broad face (0° / 180°).
  if (Math.abs(itemMm.diameterXMm - itemMm.diameterZMm) > 6) {
    return Math.round(rawYawRad / Math.PI) * Math.PI;
  }
  // Square cross-section rests stably on one of its 4 flat faces (0° / ±90° / 180°).
  if (SQUARE_SECTION_MODEL_IDS.has(modelId)) {
    const step = Math.PI * 0.5;
    return Math.round(rawYawRad / step) * step;
  }
  return rawYawRad;
}

export function getBeverageFootprintMm(modelId: string, volumeMl?: number): BeverageFootprintMm {
  const known = KNOWN_BEVERAGE_FOOTPRINTS_MM[modelId];
  if (known) return known;
  const vol = volumeMl && Number.isFinite(volumeMl) ? volumeMl : 330;
  if (vol <= 200) return { diameterXMm: 54, diameterZMm: 54, heightMm: 112 };
  if (vol <= 350) return { diameterXMm: 63, diameterZMm: 63, heightMm: 155 };
  if (vol <= 600) return { diameterXMm: 66, diameterZMm: 66, heightMm: 205 };
  return { diameterXMm: 82, diameterZMm: 82, heightMm: 265 };
}

/** Full 360° unconstrained random rotation in radians for natural hand-packed realism. */
function deterministicJitterRad(col: number, row: number, seed = 0): number {
  const hash = Math.sin((col + 1) * 12.9898 + (row + 1) * 78.233 + seed * 37.719) * 43758.5453;
  const frac = hash - Math.floor(hash); // [0, 1)
  return (frac * 2 - 1) * Math.PI; // Full unconstrained 360° (-180° .. +180°)
}

export function isOpenTopPackagingTemplate(templateId: string): boolean {
  return OPEN_TOP_TEMPLATES.has(templateId);
}

/** True for flat/low-profile mailers where packed bottles & cans lie down horizontally. */
export function isHorizontalPackTemplate(templateId: string): boolean {
  return HORIZONTAL_PACK_TEMPLATES.has(templateId);
}

/**
 * Compute ideal inner box dimensions (mm) to fit a `(cols × rows)` grid of bottles/cans
 * inside a given packaging template, accounting for board dividers, flat lying orientation,
 * and die-cut corrugated product insert margins when applicable.
 */
export function computeAutoFitBoxDimensions(input: {
  templateId: string;
  itemMm: BeverageFootprintMm;
  config: Pick<
    BottlePackConfig,
    'cols' | 'rows' | 'spacingMm' | 'wallPaddingMm' | 'honeycombDividers' | 'productInsert'
  > &
    Partial<Pick<BottlePackConfig, 'itemKind' | 'facingYawDeg'>>;
  thicknessMm: number;
  dividerGrid?: boolean;
}): {
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  clamped: boolean;
} {
  const tpl = getPackagingTemplate(input.templateId);
  const cols = Math.max(1, Math.min(6, Math.round(input.config.cols)));
  const rows = Math.max(1, Math.min(4, Math.round(input.config.rows)));
  const isBox = input.config.itemKind === 'box' && canPackRetailBoxes(tpl.id);
  const horizontal = !isBox && isHorizontalPackTemplate(tpl.id);
  const hasHoneycomb =
    !isBox &&
    tpl.id === 'fefco-0201-rsc' &&
    Boolean(input.config.honeycombDividers) &&
    (cols > 1 || rows > 1);
  const hasProductInsert =
    !isBox && tpl.id === 'fefco-0427-mailer' && Boolean(input.config.productInsert);
  const honeycombDivGap = hasHoneycomb ? getHoneycombDividerThicknessMm(input.thicknessMm) + 2.0 : 0;

  // Die-cut corrugated insert trays need sturdy perimeter walls (~10 mm) and solid bridges (~10 mm) between pockets.
  const wallPad = hasProductInsert
    ? Math.max(10, input.config.wallPaddingMm)
    : Math.max(0.5, input.config.wallPaddingMm);
  const insertColGap = hasProductInsert ? 10 : 0;
  const insertRowGap = hasProductInsert ? 12 : 0;

  const colGap = Math.max(
    input.config.spacingMm,
    cols > 1 ? Math.max(honeycombDivGap, insertColGap) : 0,
  );
  const rowGap = Math.max(
    input.config.spacingMm,
    rows > 1 ? Math.max(honeycombDivGap, insertRowGap) : 0,
  );

  // Swap X/Z spans when a rectangular retail box is rotated ±90°.
  const swapXZ = isBox && isQuarterTurnYawDeg(input.config.facingYawDeg ?? 0);
  const baseX = swapXZ ? input.itemMm.diameterZMm : input.itemMm.diameterXMm;
  const baseZ = swapXZ ? input.itemMm.diameterXMm : input.itemMm.diameterZMm;

  // Horizontal mailer lays bottles/cans flat along Z (caps toward back hinge, labels facing up).
  const itemSpanX = baseX;
  const itemSpanZ = horizontal ? input.itemMm.heightMm : baseZ;
  const itemSpanY = horizontal ? input.itemMm.diameterZMm : input.itemMm.heightMm;

  const rawL = Math.ceil(cols * itemSpanX + Math.max(0, cols - 1) * colGap + 2 * wallPad);
  const rawW = Math.ceil(rows * itemSpanZ + Math.max(0, rows - 1) * rowGap + 2 * wallPad);

  let rawH: number;
  if (tpl.id === 'fefco-0421-tray') {
    // Showcase tray: ~46% of bottle/can height (~44% of retail box height) so front artwork shines clearly.
    rawH = isBox
      ? Math.round(clampNum(itemSpanY * 0.44, 46, 96))
      : Math.round(clampNum(itemSpanY * 0.46, 46, 88));
  } else if (horizontal) {
    // Low-profile flat mailer clears lying cylinder diameter cleanly beneath the closed lid.
    rawH = Math.ceil(itemSpanY + (hasProductInsert ? 6 : 5));
  } else {
    // Enclosed shipping / rigid boxes clear caps or retail boxes cleanly under the lid.
    rawH = Math.ceil(itemSpanY + (isBox ? 4 : 5));
  }

  const lengthMm = Math.round(clampNum(rawL, tpl.minDimensions.length, tpl.maxDimensions.length));
  const widthMm = Math.round(clampNum(rawW, tpl.minDimensions.width, tpl.maxDimensions.width));
  const heightMm = Math.round(clampNum(rawH, tpl.minDimensions.height, tpl.maxDimensions.height));
  const clamped = lengthMm !== rawL || widthMm !== rawW || heightMm !== rawH;

  return { lengthMm, widthMm, heightMm, clamped };
}

/**
 * Compute exact local 3D slot coordinates (mm relative to `solved.contentAnchor.center2D`)
 * and fit diagnostics for packing `(cols × rows)` bottles/cans or Tier-2 retail boxes inside the current box.
 */
export function computeBottlePackLayout(
  solved: SolvedDieline,
  itemMm: BeverageFootprintMm,
  config: BottlePackConfig,
): BottlePackLayoutResult {
  const cols = Math.max(1, Math.min(6, Math.round(config.cols)));
  const rows = Math.max(1, Math.min(4, Math.round(config.rows)));
  const t = solved.params.thicknessMm;
  const isBox = config.itemKind === 'box' && canPackRetailBoxes(solved.templateId);
  const horizontal = !isBox && isHorizontalPackTemplate(solved.templateId);
  const hasHoneycomb =
    !isBox &&
    solved.templateId === 'fefco-0201-rsc' &&
    Boolean(config.honeycombDividers) &&
    (cols > 1 || rows > 1);
  const hasProductInsert =
    !isBox && solved.templateId === 'fefco-0427-mailer' && Boolean(config.productInsert);
  const honeycombDivGap = hasHoneycomb ? getHoneycombDividerThicknessMm(t) + 2.0 : 0;
  const openTopTemplate = isOpenTopPackagingTemplate(solved.templateId);

  const insertColGap = hasProductInsert ? 10 : 0;
  const insertRowGap = hasProductInsert ? 12 : 0;

  const colGap = Math.max(
    config.spacingMm,
    cols > 1 ? Math.max(honeycombDivGap, insertColGap) : 0,
  );
  const rowGap = Math.max(
    config.spacingMm,
    rows > 1 ? Math.max(honeycombDivGap, insertRowGap) : 0,
  );
  const wallPad = hasProductInsert
    ? Math.max(10, config.wallPaddingMm)
    : Math.max(0, config.wallPaddingMm);

  const snappedBoxYawDeg = isBox ? snapPackedBoxYawDeg(config.facingYawDeg) : config.facingYawDeg;
  const swapXZ = isBox && isQuarterTurnYawDeg(snappedBoxYawDeg);
  const baseX = swapXZ ? itemMm.diameterZMm : itemMm.diameterXMm;
  const baseZ = swapXZ ? itemMm.diameterXMm : itemMm.diameterZMm;

  const itemSpanX = baseX;
  const itemSpanZ = horizontal ? itemMm.heightMm : baseZ;
  const itemSpanY = horizontal ? itemMm.diameterZMm : itemMm.heightMm;

  const requiredLength = cols * itemSpanX + Math.max(0, cols - 1) * colGap + 2 * wallPad;
  const requiredWidth = rows * itemSpanZ + Math.max(0, rows - 1) * rowGap + 2 * wallPad;
  const requiredHeight = openTopTemplate ? solved.innerMm.height : itemSpanY + 2;

  const overflowLengthMm = Math.max(0, Math.round((requiredLength - solved.innerMm.length) * 10) / 10);
  const overflowWidthMm = Math.max(0, Math.round((requiredWidth - solved.innerMm.width) * 10) / 10);
  const overflowHeightMm = openTopTemplate
    ? 0
    : Math.max(0, Math.round((itemSpanY - solved.innerMm.height) * 10) / 10);

  const fitsHorizontal = overflowLengthMm <= 0.8 && overflowWidthMm <= 0.8;
  const fitsHeight = overflowHeightMm <= 0.8;

  // When packing inside a honeycomb-partitioned RSC carton that fits,
  // center each bottle inside its physical cell so it never clips internal divider walls!
  const alignToCells = fitsHorizontal && hasHoneycomb;

  const pitchX = alignToCells
    ? solved.innerMm.length / cols
    : itemSpanX + colGap;
  const pitchZ = alignToCells
    ? solved.innerMm.width / rows
    : itemSpanZ + rowGap;

  const totalSpanX = (cols - 1) * pitchX;
  const totalSpanZ = (rows - 1) * pitchZ;
  const baseYawRad = (snappedBoxYawDeg * Math.PI) / 180;

  const slots: BottleSlotPoseMm[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const xMm = -totalSpanX * 0.5 + col * pitchX;
      // Front row (+Z) has highest row index or symmetric around 0
      const zMm = -totalSpanZ * 0.5 + row * pitchZ;
      const jitter =
        !isBox && config.organicJitter ? deterministicJitterRad(col, row, config.jitterSeed ?? 0) : 0;
      const rawYawRad = baseYawRad + jitter;
      const yawRad = horizontal
        ? snapHorizontalRestingYawRad(config.modelId, itemMm, rawYawRad)
        : rawYawRad;
      slots.push({
        col,
        row,
        xMm,
        zMm,
        yawRad,
      });
    }
  }

  return {
    slots,
    itemCount: slots.length,
    requiredInnerMm: {
      length: Math.ceil(requiredLength),
      width: Math.ceil(requiredWidth),
      height: Math.ceil(requiredHeight),
    },
    fitsHorizontal,
    fitsHeight,
    fitsAll: fitsHorizontal && fitsHeight,
    overflowLengthMm,
    overflowWidthMm,
    overflowHeightMm,
    openTopTemplate,
    horizontal,
  };
}
