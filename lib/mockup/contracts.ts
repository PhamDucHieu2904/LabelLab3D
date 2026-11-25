import type * as THREE from 'three';
import type { ProductAppearance, ProductAsset } from '../viewer-config';
import type { LiveMaterialOverrides } from '../viewer/material-adjustments';
import type { UnityCameraPresetId } from './unity-camera-presets';
import type { QualityPreference, QualityRuntimeReport } from './quality-tier';

export interface ProceduralContactFootprint {
  width: number;
  depth: number;
  shape: 'circle' | 'rounded-box';
}

/** Interactive 3D target hit by pointer hover or click on a bottle label or packaging face. */
export type InteractivePickTarget =
  | {
      kind: 'packaging-face';
      templateId: string;
      panelId: string;
      surface: 'outside' | 'inside';
      label: string;
      shortCode: string;
      widthMm: number;
      heightMm: number;
    }
  | {
      kind: 'bottle-label';
      modelId: string;
      instanceId: number;
      label: string;
      packCount?: number;
    };

/**
 * Domain-agnostic 3D subject adapter mounted inside the shared MockupRuntime.
 * Used by Parametric Boxes/Trays today and Apparel/Fashion modules in the future.
 */
export interface ProceduralSubject {
  readonly id: string;
  readonly root: THREE.Group;
  /** Measure upright world bounds in metres for camera framing, depth range and ground contact. */
  getBounds(): THREE.Box3;
  /** Optional contact shadow footprint on the Studio floor. */
  getContactFootprint?(): ProceduralContactFootprint;
  /** Optional interactive 3D hit-testing for hover highlighting and click-to-edit artwork. */
  pickTarget?(raycaster: THREE.Raycaster): InteractivePickTarget | null;
  /** Apply or clear live 3D hover highlight on the picked packaging face or bottle label. */
  setHoverTarget?(target: InteractivePickTarget | null): void;
  /** Optional per-frame animation hook (e.g., folding playback). Returns true to keep rendering. */
  update?(dt: number): boolean;
  /** Dispose owned geometries, materials and textures when unmounted. */
  dispose(): void;
}

export type MockupCameraPreset = 'front' | 'three-quarter' | UnityCameraPresetId;
export type MockupFocalPreset = 'ultraWide' | 'wide' | 'standard' | 'long' | 'telephoto';
export type MockupBackgroundType = 'white' | 'gray' | 'dark' | 'color' | 'gradient' | 'transparent';
export interface MockupBackground { type: MockupBackgroundType; color?: string; colorEnd?: string }
export interface MockupAnimation { mode: 'off' | 'turntable' | 'showcase'; speed: number; playing: boolean }
export type MockupBackdropPainter = (context: CanvasRenderingContext2D, width: number, height: number) => void;
export interface MockupCaptureOptions {
  longEdge: 1024 | 2048 | 4096 | 8129;
  aspect?: number;
  transparent?: boolean;
  signal?: AbortSignal;
  onProgress?(progress: number): void;
  paintBackground?: MockupBackdropPainter;
}
export type MockupRenderPreviewOptions = Pick<MockupCaptureOptions, 'aspect' | 'transparent' | 'paintBackground'>;
export interface MockupStatus {
  phase: 'loading-model' | 'loading-label' | 'preparing' | 'ready' | 'exporting' | 'error';
  assetId: string;
  appearanceId?: string;
  selectionKey?: string;
  revision: number;
  hasProduct: boolean;
  materials?: LiveMaterialOverrides;
  message?: string;
  error?: 'model' | 'label' | 'webgl' | 'export';
}
export interface MockupRuntimeOptions {
  onStatus(value: MockupStatus): void;
  /** Optional quality tier preference ('auto' | 'low' | 'medium' | 'high' | 'ultra'). */
  qualityPreference?: QualityPreference;
  /** Notifies Studio UI of the detected & active quality tier / MSAA state. */
  onQualityChange?(report: QualityRuntimeReport): void;
  /** Demo embeds allow dragging while wheel gestures keep scrolling the page. */
  enableWheelZoom?: boolean;
  /** Optical display scale for an embed; leaves model geometry and Studio fit intact. */
  displayScale?: number;
  /** Authored scene decoration beneath the product, excluding all editor UI. */
  paintBackground?: MockupBackdropPainter;
  /** Manual input pauses turntable; showcase resumes after releasing the product. */
  onInteraction?(): void;
  /** Notifies Studio UI when pointer hovers or leaves an interactive 3D face/label. */
  onHoverTarget?(target: InteractivePickTarget | null): void;
  /** Notifies Studio UI when user clicks (without dragging) an interactive 3D face/label. */
  onPickTarget?(target: InteractivePickTarget): void;
}
export interface MockupRuntime {
  setSceneMode(mode: 'website' | 'studio'): void;
  select(asset: ProductAsset, appearance?: ProductAppearance, frontYaw?: number): void;
  /** Mount a domain procedural subject (e.g. Parametric Box/Tray or Apparel) inside the shared runtime. */
  setProceduralSubject(subject: ProceduralSubject | null): void;
  /** Recompute bounds, studio ground floor/shadow and optionally refit camera after live procedural edits. */
  refreshProceduralBounds(options?: { refitCamera?: boolean }): void;
  /** Smoothly transition camera to arbitrary spherical angles (degrees) fitted to current product bounds. */
  setCameraAngles(yawDegrees: number, pitchDegrees: number, fov?: number, animate?: boolean): void;
  setMaterialOverrides(overrides?: LiveMaterialOverrides): void;
  setCamera(preset: MockupCameraPreset): void;
  /** Changes perspective and compensates camera distance to retain the framing. */
  setFocalLength(preset: MockupFocalPreset): void;
  /** Switch live rendering quality tier ('auto' | 'low' | 'medium' | 'high' | 'ultra'). */
  setQualityPreference(preference: QualityPreference): void;
  setBackground(background: MockupBackground): void;
  setAnimation(animation: MockupAnimation): void;
  /** Suspend background rendering for a modal without resetting the view or animation clock. */
  setPaused(paused: boolean): void;
  /** Numeric width/height ratio; the host should display the same frame. */
  setAspect(aspect: number): void;
  /** Keyboard-accessible free orbit; pitch increases the polar angle. */
  orbitView(yawRadians: number, pitchRadians: number): void;
  /** Adjust the live perspective field of view in degrees. */
  adjustFov(deltaDegrees: number): void;
  /** Translate the camera and focus point in the current view plane. */
  panView(horizontal: number, vertical: number): void;
  /** Factors above 1 zoom in; factors below 1 zoom out. */
  zoom(factor: number): void;
  resetView(): void;
  requestFrame(): void;
  /** Access live WebGL canvas for video recording (e.g. folding animation export). */
  getCanvas(): HTMLCanvasElement;
  setRenderPreview(canvas: HTMLCanvasElement | null, options: MockupRenderPreviewOptions): void;
  capture(options: MockupCaptureOptions): Promise<Blob>;
  dispose(): void;
}
