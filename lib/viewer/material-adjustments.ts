import type { MeshStandardMaterial } from 'three';

/** Session edits change uniforms/UVs, never the imported model or texture files. */
export interface LiveMaterialValues {
  color?: string;
  metalness?: number;
  roughness?: number;
  textureOffsetX?: number;
  /** Optional, opt-in beverage volume controls. Missing optics retain authored shaders. */
  liquidOptics?: LiveLiquidOptics;
  sparkling?: number;
}
export interface LiveLiquidOptics {
  clarity: number;
  density: number;
  turbidity: number;
  brightness: number;
  scattering: number;
  roughness: number;
  ior: number;
}
export type LiveMaterialOverrides = Record<string, LiveMaterialValues>;

// Optical shaders keep the juice/scattering colors separate from surface tint.
// Weak ownership follows each pooled material without retaining retired labels.
export const liquidColorUpdates = new WeakMap<MeshStandardMaterial, (color: string) => void>();
