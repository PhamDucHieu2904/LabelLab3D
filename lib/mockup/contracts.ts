import type { ProductAppearance, ProductAsset } from '../viewer-config';
import type { LiveMaterialOverrides } from '../viewer/material-adjustments';
import type { UnityCameraPresetId } from './unity-camera-presets';

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
  /** Demo embeds allow dragging while wheel gestures keep scrolling the page. */
  enableWheelZoom?: boolean;
  /** Optical display scale for an embed; leaves model geometry and Studio fit intact. */
  displayScale?: number;
  /** Authored scene decoration beneath the product, excluding all editor UI. */
  paintBackground?: MockupBackdropPainter;
  /** Manual input pauses turntable; showcase resumes after releasing the product. */
  onInteraction?(): void;
}
export interface MockupRuntime {
  setSceneMode(mode: 'website' | 'studio'): void;
  select(asset: ProductAsset, appearance?: ProductAppearance, frontYaw?: number): void;
  setMaterialOverrides(overrides?: LiveMaterialOverrides): void;
  setCamera(preset: MockupCameraPreset): void;
  /** Changes perspective and compensates camera distance to retain the framing. */
  setFocalLength(preset: MockupFocalPreset): void;
  setBackground(background: MockupBackground): void;
  setAnimation(animation: MockupAnimation): void;
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
  setRenderPreview(canvas: HTMLCanvasElement | null, options: MockupRenderPreviewOptions): void;
  capture(options: MockupCaptureOptions): Promise<Blob>;
  dispose(): void;
}
