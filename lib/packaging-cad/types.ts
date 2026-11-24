/**
 * Core data contracts for the LabelLab3D Parametric Packaging CAD Engine.
 * All internal CAD coordinates and dimensions are strictly in millimetres (mm).
 * When mounted into Three.js metres space, multiply by MM_TO_METRE (0.001).
 */

export const MM_TO_METRE = 0.001;

/** 2D Cartesian point in millimetres: +X right, +Y back/up (maps to -Z in Three.js). */
export type Point2D = readonly [number, number];

export type DimensionMode = 'inner' | 'outer';
export type FluteProfile = 'none' | 'e-flute' | 'b-flute' | 'c-flute' | 'bc-flute';
export type FluteDirection = 'along-L' | 'along-W';
export type TuckStyle = 'reverse' | 'straight';

export type BoardMaterialId =
  | 'kraft-e'
  | 'white-e'
  | 'kraft-b'
  | 'white-b'
  | 'black-e'
  | 'ivory-350'
  | 'kraft-350'
  | 'rigid-20';

export type PackagingTemplateCategory = 'tray' | 'carton' | 'mailer' | 'folding-box';

export type PackagingPartGroup =
  | 'length'
  | 'width'
  | 'height'
  | 'locks'
  | 'flaps'
  | 'lid'
  | 'cutouts'
  | 'material';

export type PanelFaceRole =
  | 'base'
  | 'front'
  | 'back'
  | 'left'
  | 'right'
  | 'top'
  | 'inner'
  | 'flap'
  | 'tab'
  | 'bridge'
  | 'glue';

export interface BoardMaterialPreset {
  readonly id: BoardMaterialId;
  readonly name: string;
  readonly shortName: string;
  readonly category: 'corrugated' | 'folding-carton' | 'rigid';
  readonly thicknessMm: number;
  readonly flute: FluteProfile;
  readonly flutePitchMm: number;
  readonly bendAllowanceK: number;
  readonly gsm: number;
  readonly outsideColor: string;
  readonly insideColor: string;
  readonly edgeColor: string;
  readonly outsideRoughness: number;
  readonly insideRoughness: number;
  readonly outsideMetalness: number;
  readonly fiberStrength: number;
  readonly swatchGradient: string;
  readonly description: string;
}

export interface PackagingParams {
  templateId: string;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  dimensionMode: DimensionMode;

  // Material & Pro CAD board parameters
  materialId: BoardMaterialId;
  thicknessMm: number;
  fluteDirection: FluteDirection;
  outsideColor: string;
  insideColor: string;
  outsideRoughness: number;
  outsideMetalness: number;
  insideRoughness: number;

  // Structural options (richer than Pacdora)
  lockTabCount: 1 | 2;
  lockTabWidthMm: number;
  dustFlapTaperDeg: number;
  flapGapMm: number;
  tuckStyle: TuckStyle;
  tuckFlapLengthMm: number;
  thumbNotch: boolean;
  thumbNotchRadiusMm: number;
  handHoles: boolean;
  handHoleWidthMm: number;
  handHoleHeightMm: number;
  displayScoop: boolean;
  displayScoopDepthMm: number;
  windowCutout: boolean;
  windowWidthMm: number;
  windowHeightMm: number;
  windowRadiusMm: number;
  windowFilm: boolean;

  // Pro CAD engineering parameters
  bendAllowanceK: number;
  slotClearanceMm: number;
  bleedMm: number;

  // Kinematics & visualization
  foldProgress: number; // 0 = completely flat unfolded, 1 = completely assembled
  showDimensions: boolean;
  showFaceLabels: boolean;
  showCreaseLines: boolean;
}

export interface HingeSpec {
  /** Start point of crease line on the flat 2D dieline (mm). */
  p1: Point2D;
  /** End point of crease line on the flat 2D dieline (mm). */
  p2: Point2D;
  /** 'inward' folds toward +Y (inside face / valley fold); 'outward' folds toward -Y (mountain fold). */
  foldDirection: 'inward' | 'outward';
  /** Target fold angle in degrees at foldProgress = 1 (usually 90). */
  targetAngleDeg: number;
  /** Staged kinematics window in [0, 1] so flaps never collide during folding. */
  stageStart: number;
  stageEnd: number;
  /** Extra outward/normal offset in mm applied at hinge to eliminate double-wall Z-fighting. */
  pivotOffsetMm?: number;
  /** Whether to generate a rounded crease fillet strip along the outer bend. */
  renderCreaseFillet?: boolean;
}

export interface PanelNode2D {
  id: string;
  label: string;
  shortCode: string;
  faceRole: PanelFaceRole;
  partGroup: PackagingPartGroup;
  /** Counter-clockwise outer boundary polygon in 2D dieline mm space. */
  outline: Point2D[];
  /** Optional clockwise cutout holes in 2D dieline mm space (lock slots, hand holes, windows). */
  holes?: Point2D[][];
  /** Optional transparent PET film polygons covering display windows. */
  windowFilms?: Point2D[][];
  /** Angle in degrees to rotate upright panel artwork on the outside print-side-up dieline. */
  uprightAngleDeg: number;
  /** Whether this panel is highlighted as a primary printable surface in Quick Panel Designer. */
  printable?: boolean;
  hinge?: HingeSpec;
  children: PanelNode2D[];
}

export interface CreaseSegment2D {
  p1: Point2D;
  p2: Point2D;
  foldDirection: 'inward' | 'outward';
  panelId: string;
}

export interface BoundingBox2D {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
}

export interface FlatPanelSummary {
  id: string;
  label: string;
  shortCode: string;
  faceRole: PanelFaceRole;
  partGroup: PackagingPartGroup;
  bounds: BoundingBox2D;
  centroid: Point2D;
  uprightAngleDeg: number;
  printable: boolean;
  outline: Point2D[];
  holes: Point2D[][];
}

export interface DimensionTripleMm {
  length: number;
  width: number;
  height: number;
}

export interface SolvedDieline {
  templateId: string;
  templateCode: string;
  templateName: string;
  params: PackagingParams;
  material: BoardMaterialPreset;
  innerMm: DimensionTripleMm;
  outerMm: DimensionTripleMm;
  blankBounds: BoundingBox2D;
  blankAreaM2: number;
  estimatedWeightG: number;
  rootPanel: PanelNode2D;
  flatPanels: FlatPanelSummary[];
  cutLoops: Point2D[][];
  holeLoops: Point2D[][];
  creaseSegments: CreaseSegment2D[];
  clampNotices: string[];
}

export interface PackagingSizePreset {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly lengthMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly dimensionMode?: DimensionMode;
  readonly materialId?: BoardMaterialId;
  /** Optional badge highlighting LabelLab beverage fit compatibility. */
  readonly beverageFit?: string;
}

export interface PackagingFeatureSupport {
  readonly lockTabs: boolean;
  readonly dustFlapTaper: boolean;
  readonly flapGap: boolean;
  readonly tuckStyle: boolean;
  readonly thumbNotch: boolean;
  readonly handHoles: boolean;
  readonly displayScoop: boolean;
  readonly windowCutout: boolean;
}

export interface PackagingTemplateDefinition {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly shortName: string;
  readonly category: PackagingTemplateCategory;
  readonly tagline: string;
  readonly description: string;
  readonly defaultMaterialId: BoardMaterialId;
  readonly defaultDimensions: DimensionTripleMm;
  readonly minDimensions: DimensionTripleMm;
  readonly maxDimensions: DimensionTripleMm;
  readonly heroFold: number;
  readonly openPreviewFold: number;
  readonly features: PackagingFeatureSupport;
  readonly sizePresets: readonly PackagingSizePreset[];
  solve(params: PackagingParams, material: BoardMaterialPreset): SolvedDieline;
}

/** Per-panel quick artwork placement (Quick Panel Designer). */
export interface PanelDesignOverlay {
  panelId: string;
  surface: 'outside' | 'inside';
  fillColor?: string;
  imageUrl?: string;
  imageScale: number; // 0.1..2.0
  imageOffsetX: number; // -0.5..0.5
  imageOffsetY: number; // -0.5..0.5
  imageRotationDeg: number; // -180..180
  text?: string;
  textColor?: string;
  textSizePct?: number; // relative to min panel side
}

export interface PackagingArtworkState {
  mode: 'dieline' | 'panel';
  outsideDielineUrl?: string;
  insideDielineUrl?: string;
  panelOverlays: Record<string, PanelDesignOverlay>;
}
