import * as THREE from 'three';
import type { BoardMaterialPreset, PackagingParams } from '../types';

export interface PackagingMaterialSet {
  outside: THREE.MeshStandardMaterial;
  inside: THREE.MeshStandardMaterial;
  edge: THREE.MeshStandardMaterial;
  windowFilm: THREE.MeshPhysicalMaterial;
  highlightEmissive: THREE.Color;
  /** Re-sync colors, roughness, metalness, flute pitch and artwork maps in-place. */
  sync(
    params: PackagingParams,
    preset: BoardMaterialPreset,
    maps?: { outsideMap?: THREE.Texture | null; insideMap?: THREE.Texture | null },
  ): void;
  dispose(): void;
}

/** Deterministic PRNG for procedural paper fiber texture (zero external downloads). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Synthesize a seamless tileable kraft / cardstock paper micro-grain bump + albedo noise texture.
 * Works safely in browser and gracefully returns null in headless Node tests.
 */
function createPaperFiberTexture(strength: number): THREE.DataTexture {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  const rand = mulberry32(4210421);
  const amp = Math.max(0.02, Math.min(0.6, strength));

  // Layer fine grain + subtle horizontal paper fibers.
  const base = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    base[i] = (rand() - 0.5) * 2;
  }
  for (let y = 0; y < size; y++) {
    const rowJitter = (rand() - 0.5) * 0.45;
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const left = base[y * size + ((x - 1 + size) % size)];
      const right = base[y * size + ((x + 1) % size)];
      const fiber = base[idx] * 0.55 + (left + right) * 0.225 + rowJitter * 0.35;
      const speck = rand() > 0.992 ? -0.35 : 0;
      const v = Math.max(0, Math.min(255, Math.round((0.86 + (fiber * 0.14 + speck) * amp) * 255)));
      const p = idx * 4;
      data[p] = v;
      data[p + 1] = v;
      data[p + 2] = v;
      data[p + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Create a realistic corrugated cut-edge material whose fragment shader renders
 * sinusoidal hollow flute waves on cross-cut edges (vertex color R ≈ 1) and clean
 * solid linerboard on parallel edges (vertex color R ≈ 0).
 */
function createCorrugatedEdgeMaterial(edgeColor: string, flutePitchMm: number): {
  material: THREE.MeshStandardMaterial;
  uniforms: { uFlutePitchMm: { value: number }; uHasFlute: { value: number } };
} {
  const uniforms = {
    uFlutePitchMm: { value: Math.max(1.5, flutePitchMm || 3.2) },
    uHasFlute: { value: flutePitchMm > 0 ? 1 : 0 },
  };

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(edgeColor),
    roughness: 0.92,
    metalness: 0,
    vertexColors: false,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFlutePitchMm = uniforms.uFlutePitchMm;
    shader.uniforms.uHasFlute = uniforms.uHasFlute;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec3 color;
        varying vec2 vEdgeUv;
        varying float vFluteExposure;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vEdgeUv = uv;
        vFluteExposure = color.r;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uFlutePitchMm;
        uniform float uHasFlute;
        varying vec2 vEdgeUv;
        varying float vFluteExposure;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        if (uHasFlute > 0.5) {
          // Outer & inner paper liners occupy [0..0.16] and [0.84..1.0] across board thickness.
          float v = vEdgeUv.y;
          float inCore = smoothstep(0.14, 0.20, v) * (1.0 - smoothstep(0.80, 0.86, v));
          float phase = vEdgeUv.x / max(uFlutePitchMm, 1.0) * 6.2831853;
          float waveCenter = 0.5 + 0.30 * sin(phase);
          float distToWave = abs(v - waveCenter);
          // Fluting medium paper ribbon vs shadowed air cavities inside the corrugated core.
          float ribbon = 1.0 - smoothstep(0.055, 0.125, distToWave);
          float cavityDark = mix(0.36, 0.94, ribbon);
          float parallelDark = mix(0.82, 1.0, 1.0 - inCore * 0.25);
          float coreFactor = mix(parallelDark, mix(1.0, cavityDark, inCore), clamp(vFluteExposure, 0.0, 1.0));
          diffuseColor.rgb *= coreFactor;
        }`,
      );
  };
  material.customProgramCacheKey = () => 'labellab-corrugated-edge-v1';

  return { material, uniforms };
}

/**
 * Creates the full PBR material set for a Parametric Box/Tray:
 *  - Outside board face (supports full-dieline or quick-panel artwork texture)
 *  - Inside board face (supports independent inside print or kraft liner)
 *  - Cut edges with procedural corrugated flute wave shader
 *  - Clear PET film for optional display windows
 */
export function createPackagingMaterialSet(
  params: PackagingParams,
  preset: BoardMaterialPreset,
): PackagingMaterialSet {
  const bumpTex = createPaperFiberTexture(preset.fiberStrength);
  const { material: edge, uniforms: edgeUniforms } = createCorrugatedEdgeMaterial(
    preset.edgeColor,
    preset.flute === 'none' ? 0 : preset.flutePitchMm,
  );

  const outside = new THREE.MeshStandardMaterial({
    color: new THREE.Color(params.outsideColor),
    roughness: params.outsideRoughness,
    metalness: params.outsideMetalness,
    bumpMap: bumpTex,
    bumpScale: 0.00045 * preset.fiberStrength,
    side: THREE.FrontSide,
  });

  const inside = new THREE.MeshStandardMaterial({
    color: new THREE.Color(params.insideColor),
    roughness: params.insideRoughness,
    metalness: 0,
    bumpMap: bumpTex,
    bumpScale: 0.00055 * Math.max(0.15, preset.fiberStrength),
    side: THREE.FrontSide,
  });

  const windowFilm = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#ffffff'),
    roughness: 0.06,
    metalness: 0,
    transparent: true,
    opacity: 0.24,
    reflectivity: 0.9,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const highlightEmissive = new THREE.Color('#2563eb');

  const sync: PackagingMaterialSet['sync'] = (nextParams, nextPreset, maps) => {
    const hasOutsideMap = Boolean(maps?.outsideMap);
    const hasInsideMap = Boolean(maps?.insideMap);

    // When a baked artwork/dieline canvas texture is bound, keep tint white because
    // the base board color is already composited into the canvas texture.
    outside.color.set(hasOutsideMap ? '#ffffff' : nextParams.outsideColor);
    outside.roughness = nextParams.outsideRoughness;
    outside.metalness = nextParams.outsideMetalness;
    outside.bumpScale = 0.00045 * nextPreset.fiberStrength;
    if (maps && 'outsideMap' in maps) {
      outside.map = maps.outsideMap ?? null;
      outside.needsUpdate = true;
    }

    inside.color.set(hasInsideMap ? '#ffffff' : nextParams.insideColor);
    inside.roughness = nextParams.insideRoughness;
    inside.bumpScale = 0.00055 * Math.max(0.15, nextPreset.fiberStrength);
    if (maps && 'insideMap' in maps) {
      inside.map = maps.insideMap ?? null;
      inside.needsUpdate = true;
    }

    edge.color.set(nextPreset.edgeColor);
    edgeUniforms.uHasFlute.value = nextPreset.flute === 'none' ? 0 : 1;
    edgeUniforms.uFlutePitchMm.value = Math.max(1.5, nextPreset.flutePitchMm || 3.2);
  };

  return {
    outside,
    inside,
    edge,
    windowFilm,
    highlightEmissive,
    sync,
    dispose() {
      outside.dispose();
      inside.dispose();
      edge.dispose();
      windowFilm.dispose();
      bumpTex.dispose();
    },
  };
}
