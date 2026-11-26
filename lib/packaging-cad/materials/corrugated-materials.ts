import * as THREE from 'three';
import type { BoardMaterialPreset, PackagingParams, SolvedDieline } from '../types';
import { getPackagingFinishPreset } from './paper-presets';

export interface PackagingMaterialSet {
  outside: THREE.MeshPhysicalMaterial;
  inside: THREE.MeshPhysicalMaterial;
  /** Unprinted matte interior kraft/board material for honeycomb cell partition inserts. */
  partition: THREE.MeshPhysicalMaterial;
  /** Interactive Pacdora-style hover highlight material for outside face only. */
  hoverOutside: THREE.MeshPhysicalMaterial;
  /** Interactive Pacdora-style hover highlight material for inside face only. */
  hoverInside: THREE.MeshPhysicalMaterial;
  edge: THREE.MeshStandardMaterial;
  windowFilm: THREE.MeshPhysicalMaterial;
  highlightEmissive: THREE.Color;
  /** Re-sync colors, roughness, metalness, flute pitch, washboarding, finish masks, and artwork maps in-place. */
  sync(
    params: PackagingParams,
    preset: BoardMaterialPreset,
    maps?: {
      outsideMap?: THREE.Texture | null;
      insideMap?: THREE.Texture | null;
      finishMaskMap?: THREE.Texture | null;
    },
  ): void;
  /** Bake structural crease-line & interior crevice AO maps from the current SolvedDieline (~1.5 ms). */
  syncDieline(solved: SolvedDieline): void;
  /** Update dynamic fold progress [0..1] to modulate crease crevice shadows in real-time (0 ms). */
  updateFoldProgress(progress: number): void;
  dispose(): void;
}

/** Deterministic PRNG for procedural paper PBR textures (zero external downloads). */
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

interface SharedPaperPbrMaps {
  normalMap: THREE.DataTexture;
  roughnessMap: THREE.DataTexture;
  grainMap: THREE.DataTexture;
}

let cachedPaperMaps: SharedPaperPbrMaps | null = null;

/**
 * Synthesize a seamless tileable 512x512 studio-grade paper PBR texture suite:
 *  - Tangent-space Normal Map (directional cellulose fibers + fine micro-tooth + gentle paper undulation)
 *  - Roughness Variation Map (breaks up synthetic CGI uniform specular on cardboard & cardstock)
 *  - Micro-Albedo Pulp Grain Map (subtle organic tonal variation & recycled kraft flecks)
 *
 * Pure Uint8Array DataTextures: runs identically in browsers and headless Node tests,
 * cached globally once per session (~14 ms one-time startup, 0 ms thereafter).
 */
function getSharedPaperPbrMaps(): SharedPaperPbrMaps {
  if (cachedPaperMaps) return cachedPaperMaps;

  const size = 512;
  const rand = mulberry32(20261125);
  const raw = new Float32Array(size * size);
  const low = new Float32Array(size * size);
  const fleck = new Float32Array(size * size);

  for (let i = 0; i < size * size; i++) {
    raw[i] = rand() - 0.5;
    fleck[i] = rand() > 0.994 ? -(0.28 + rand() * 0.35) : (rand() > 0.997 ? 0.18 : 0);
  }

  // Smooth multi-scale paper pulp clouds via separable periodic interpolation.
  const lowSize = 32;
  const coarse = new Float32Array(lowSize * lowSize);
  for (let i = 0; i < coarse.length; i++) coarse[i] = rand() - 0.5;

  const sampleCoarse = (u: number, v: number): number => {
    const fx = u * lowSize;
    const fy = v * lowSize;
    const x0 = Math.floor(fx) & (lowSize - 1);
    const y0 = Math.floor(fy) & (lowSize - 1);
    const x1 = (x0 + 1) & (lowSize - 1);
    const y1 = (y0 + 1) & (lowSize - 1);
    const tx = fx - Math.floor(fx);
    const ty = fy - Math.floor(fy);
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const a = coarse[y0 * lowSize + x0];
    const b = coarse[y0 * lowSize + x1];
    const c = coarse[y1 * lowSize + x0];
    const d = coarse[y1 * lowSize + x1];
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
  };

  // Fine pressed cellulose micro-grain + subtle directional machine-grain fibers.
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const rowStreak = (rand() - 0.5) * 0.1;
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const u = x / size;
      const xm2 = (x - 2 + size) & (size - 1);
      const xm1 = (x - 1 + size) & (size - 1);
      const xp1 = (x + 1) & (size - 1);
      const xp2 = (x + 2) & (size - 1);
      const ym1 = (y - 1 + size) & (size - 1);
      const yp1 = (y + 1) & (size - 1);

      const hFiber =
        raw[idx] * 0.36 +
        (raw[y * size + xm1] + raw[y * size + xp1]) * 0.22 +
        (raw[y * size + xm2] + raw[y * size + xp2]) * 0.1;
      const vTooth = (raw[ym1 * size + x] + raw[yp1 * size + x]) * 0.1;
      const cloud = sampleCoarse(u, v) * 0.65 + sampleCoarse((u * 2) % 1, (v * 2) % 1) * 0.35;
      low[idx] = cloud;
      height[idx] = hFiber * 0.68 + vTooth * 0.6 + rowStreak * 0.25 + cloud * 0.22 + fleck[idx] * 0.16;
    }
  }

  const normalData = new Uint8Array(size * size * 4);
  const roughData = new Uint8Array(size * size * 4);
  const grainData = new Uint8Array(size * size * 4);

  const normalStrength = 1.15;
  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) & (size - 1);
    const yp = (y + 1) & (size - 1);
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) & (size - 1);
      const xp = (x + 1) & (size - 1);
      const idx = y * size + x;
      const p = idx * 4;

      // Sobel tangent-space normal from seamless paper heightfield
      const tl = height[ym * size + xm];
      const t = height[ym * size + x];
      const tr = height[ym * size + xp];
      const l = height[y * size + xm];
      const r = height[y * size + xp];
      const bl = height[yp * size + xm];
      const b = height[yp * size + x];
      const br = height[yp * size + xp];

      const gx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const gy = (bl + 2 * b + br) - (tl + 2 * t + tr);
      let nx = -gx * normalStrength;
      let ny = -gy * normalStrength;
      let nz = 1.0;
      const invLen = 1 / Math.hypot(nx, ny, nz);
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;

      normalData[p] = Math.max(0, Math.min(255, Math.round((nx * 0.5 + 0.5) * 255)));
      normalData[p + 1] = Math.max(0, Math.min(255, Math.round((ny * 0.5 + 0.5) * 255)));
      normalData[p + 2] = Math.max(0, Math.min(255, Math.round((nz * 0.5 + 0.5) * 255)));
      normalData[p + 3] = 255;

      // Roughness variation centered around ~0.92 (multiplied by material.roughness)
      const rVal = Math.max(185, Math.min(255, Math.round((0.91 + height[idx] * 0.14 - fleck[idx] * 0.08) * 255)));
      roughData[p] = rVal;
      roughData[p + 1] = rVal;
      roughData[p + 2] = rVal;
      roughData[p + 3] = 255;

      // Subtle warm/cool pulp & fleck albedo modulation centered at 0.5 (encoded in [0..1], unpacked around 1.0 in shader)
      const gVal = Math.max(0, Math.min(255, Math.round((0.5 + low[idx] * 0.24 + height[idx] * 0.18 + fleck[idx] * 0.32) * 255)));
      grainData[p] = gVal;
      grainData[p + 1] = gVal;
      grainData[p + 2] = gVal;
      grainData[p + 3] = 255;
    }
  }

  const makeTex = (data: Uint8Array) => {
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.colorSpace = THREE.NoColorSpace;
    tex.needsUpdate = true;
    return tex;
  };

  cachedPaperMaps = {
    normalMap: makeTex(normalData),
    roughnessMap: makeTex(roughData),
    grainMap: makeTex(grainData),
  };
  return cachedPaperMaps;
}

/**
 * Bake a 512x512 grayscale Crevice & Hinge Ambient Occlusion texture for the
 * solved 2D dieline in ~1.5 ms.
 *  - Inside face: broad soft valley shadows along every hinge fold + interior corner darkening.
 *  - Outside face: crisp subtle die-pressed score indentation along creases + micro rim shading.
 */
function bakeCreviceAoCanvas(
  solved: SolvedDieline,
  side: 'outside' | 'inside',
  canvas: HTMLCanvasElement,
): void {
  const size = 512;
  if (canvas.width !== size || canvas.height !== size) {
    canvas.width = size;
    canvas.height = size;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const b = solved.blankBounds;
  const bw = Math.max(b.width, 1);
  const bh = Math.max(b.height, 1);
  const pxPerMm = size / Math.max(bw, bh);

  const mapPt = (pt: readonly [number, number]): [number, number] => {
    const u = side === 'inside' ? (pt[0] - b.minX) / bw : (b.maxX - pt[0]) / bw;
    const v = (b.maxY - pt[1]) / bh;
    return [u * size, v * size];
  };

  // Start clean white (AO = 1.0)
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  if (side === 'inside') {
    // 1. Subtle interior panel concavity (walls & floor get slightly deeper inside a folded box)
    for (const panel of solved.flatPanels) {
      const [cx, cy] = mapPt(panel.centroid);
      const rad = Math.max(panel.bounds.width, panel.bounds.height) * pxPerMm * 0.72;
      if (rad < 4) continue;
      ctx.save();
      ctx.beginPath();
      panel.outline.forEach((pt, idx) => {
        const [x, y] = mapPt(pt);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.clip();
      const grad = ctx.createRadialGradient(cx, cy, rad * 0.15, cx, cy, rad);
      grad.addColorStop(0, 'rgba(38, 28, 20, 0.04)');
      grad.addColorStop(1, 'rgba(38, 28, 20, 0.15)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      ctx.restore();
    }

    // 2. Multi-pass soft Gaussian valley shadows along every fold crease (true corner occlusion!)
    ctx.lineCap = 'round';
    const passes: Array<{ widthMm: number; alpha: number }> = [
      { widthMm: 22, alpha: 0.08 },
      { widthMm: 12, alpha: 0.13 },
      { widthMm: 5.5, alpha: 0.19 },
      { widthMm: 2.2, alpha: 0.24 },
    ];
    for (const pass of passes) {
      ctx.strokeStyle = `rgba(28, 20, 14, ${pass.alpha})`;
      ctx.lineWidth = Math.max(1.5, pass.widthMm * pxPerMm);
      ctx.beginPath();
      for (const seg of solved.creaseSegments) {
        const [x1, y1] = mapPt(seg.p1);
        const [x2, y2] = mapPt(seg.p2);
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
      ctx.stroke();
    }
  } else {
    // Outside face: ultra-delicate die-pressed score indentation along fold creases (no dark perimeter ink outline)
    ctx.lineCap = 'round';
    const outerPasses: Array<{ widthMm: number; alpha: number }> = [
      { widthMm: 5.0, alpha: 0.022 },
      { widthMm: 1.8, alpha: 0.036 },
    ];
    for (const pass of outerPasses) {
      ctx.strokeStyle = `rgba(36, 26, 18, ${pass.alpha})`;
      ctx.lineWidth = Math.max(1.0, pass.widthMm * pxPerMm);
      ctx.beginPath();
      for (const seg of solved.creaseSegments) {
        const [x1, y1] = mapPt(seg.p1);
        const [x2, y2] = mapPt(seg.p2);
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
      ctx.stroke();
    }
  }

  ctx.restore();
}

interface BoardFaceShaderUniforms {
  uBlankSizeMm: { value: THREE.Vector2 };
  uGrainMap: { value: THREE.Texture };
  uGrainStrength: { value: number };
  uFlutePitchMm: { value: number };
  uFluteAlongL: { value: number };
  uWashboardStrength: { value: number };
  uCreviceMap: { value: THREE.Texture };
  uHasCreviceMap: { value: number };
  uFoldProgress: { value: number };
  uCreviceStrength: { value: number };
  uInteriorDim: { value: number };
  // Print Finishes: Spot UV / Hot Foil Stamping / Holographic Foil / Emboss-Deboss Relief
  uFinishMode: { value: number }; // 0=none, 1=spot-uv, 2=metallic foil, 3=holo foil
  uFinishMaskMap: { value: THREE.Texture };
  uHasFinishMask: { value: number };
  uFinishMaskTexel: { value: THREE.Vector2 };
  uFinishIntensity: { value: number };
  uFinishRelief: { value: number };
  uFinishFoilColor: { value: THREE.Color };
  uFinishMetalness: { value: number };
  uFinishRoughness: { value: number };
  uFinishClearcoat: { value: number };
  uFinishClearcoatRoughness: { value: number };
  uFinishSpecBoost: { value: number };
}

/** Create a 1x1 white fallback texture so shader samplers stay valid in headless tests. */
let cachedWhiteTex: THREE.DataTexture | null = null;
function getWhiteFallbackTexture(): THREE.DataTexture {
  if (cachedWhiteTex) return cachedWhiteTex;
  const tex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  cachedWhiteTex = tex;
  return tex;
}

/**
 * Attach photorealistic cardboard & paper shader enhancements onto MeshPhysicalMaterial:
 *  - Physical-millimetre tiled micro-albedo paper grain (never stretches with box size)
 *  - Corrugated washboarding micro-ribs aligned with real E-flute / B-flute spacing
 *  - Dynamic fold-aware Crevice AO map (deepens interior corners & crease grooves as box folds)
 *  - Subtle interior cavity ambient attenuation so open lids reveal realistic depth inside the box
 */
function enhancePaperFaceMaterial(
  material: THREE.MeshPhysicalMaterial,
  uniforms: BoardFaceShaderUniforms,
  cacheKey: string,
  hoverTint?: { color: THREE.Color; mix: number },
): void {
  const hoverUniforms = hoverTint
    ? {
        uHoverColor: { value: hoverTint.color },
        uHoverMix: { value: hoverTint.mix },
      }
    : null;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    if (hoverUniforms) Object.assign(shader.uniforms, hoverUniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vPaperDielineUv;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vPaperDielineUv = uv;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec2 uBlankSizeMm;
        uniform sampler2D uGrainMap;
        uniform float uGrainStrength;
        uniform float uFlutePitchMm;
        uniform float uFluteAlongL;
        uniform float uWashboardStrength;
        uniform sampler2D uCreviceMap;
        uniform float uHasCreviceMap;
        uniform float uFoldProgress;
        uniform float uCreviceStrength;
        uniform float uInteriorDim;
        uniform float uFinishMode;
        uniform sampler2D uFinishMaskMap;
        uniform float uHasFinishMask;
        uniform vec2 uFinishMaskTexel;
        uniform float uFinishIntensity;
        uniform float uFinishRelief;
        uniform vec3 uFinishFoilColor;
        uniform float uFinishMetalness;
        uniform float uFinishRoughness;
        uniform float uFinishClearcoat;
        uniform float uFinishClearcoatRoughness;
        uniform float uFinishSpecBoost;
        ${hoverUniforms ? 'uniform vec3 uHoverColor;\n        uniform float uHoverMix;' : ''}
        varying vec2 vPaperDielineUv;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 pPaperMm = vPaperDielineUv * uBlankSizeMm;
        // Evaluate Spot UV / Hot Foil / Holographic mask (0 = natural board, 1 = special finish)
        float pFinishRaw = uFinishMode > 0.5
          ? (uHasFinishMask > 0.5 ? texture2D(uFinishMaskMap, vPaperDielineUv).r : 1.0)
          : 0.0;
        float pFinishWeight = clamp(pFinishRaw * uFinishIntensity, 0.0, 1.0);
        float pPaperMask = 1.0 - pFinishWeight * 0.84;

        // 1. Physical millimetre tiled paper pulp & fiber grain (64 mm per tile)
        vec2 pGrainUv = pPaperMm / 64.0;
        float pGrainSample = texture2D(uGrainMap, pGrainUv).r - 0.5;
        diffuseColor.rgb *= (1.0 + pGrainSample * uGrainStrength * pPaperMask);

        // 2. Subtle corrugated flute washboarding shading aligned to physical flute pitch
        if (uWashboardStrength > 0.001) {
          float pFluteCoord = mix(pPaperMm.x, pPaperMm.y, uFluteAlongL);
          float pWbPhase = pFluteCoord / max(uFlutePitchMm, 1.5) * 6.2831853;
          float pWbWave = sin(pWbPhase);
          diffuseColor.rgb *= (1.0 + pWbWave * 0.018 * uWashboardStrength * pPaperMask);
        }

        // 3. Spot UV ink richness deepening, Metallic Hot Foil albedo, or Prismatic Holographic foil
        if (pFinishWeight > 0.001) {
          if (uFinishMode < 1.5) {
            // Spot UV: cured gloss varnish deepens matte printed ink saturation slightly
            diffuseColor.rgb *= mix(1.0, 0.93, pFinishWeight);
          } else if (uFinishMode < 2.5) {
            // Hot Foil Stamping (Gold / Silver / Rose Gold / Copper / Gloss Black)
            float pFoilSheen = 1.0 + sin(pPaperMm.x * 2.4 + pPaperMm.y * 0.35) * 0.025;
            diffuseColor.rgb = mix(diffuseColor.rgb, uFinishFoilColor * pFoilSheen, pFinishWeight);
          } else {
            // Prismatic Holographic Diffraction Foil: shifts iridescence with view angle & position
            #ifdef FLAT_SHADED
              vec3 pHoloN = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
            #else
              vec3 pHoloN = normalize(vNormal);
            #endif
            vec3 pHoloV = normalize(vViewPosition);
            float pHoloView = clamp(dot(pHoloN, pHoloV), 0.0, 1.0);
            float pHoloPhase = pHoloView * 2.85 + (pPaperMm.x * 0.028 + pPaperMm.y * 0.021) + sin(pPaperMm.x * 0.11) * 0.22;
            vec3 pHoloSpectrum = 0.54 + 0.46 * cos(6.2831853 * (pHoloPhase + vec3(0.0, 0.33, 0.67)));
            vec3 pHoloCol = mix(uFinishFoilColor, pHoloSpectrum, 0.78);
            diffuseColor.rgb = mix(diffuseColor.rgb, pHoloCol, pFinishWeight);
          }
        }

        // 4. Dynamic fold-aware crease & interior corner Ambient Occlusion
        float pFoldAmt = smoothstep(0.08, 0.92, uFoldProgress);
        if (uHasCreviceMap > 0.5) {
          float pRawAo = texture2D(uCreviceMap, vPaperDielineUv).r;
          float pAoWeight = mix(0.22, 1.0, pFoldAmt) * uCreviceStrength;
          float pAoFactor = mix(1.0, pRawAo, clamp(pAoWeight, 0.0, 1.0));
          diffuseColor.rgb *= pAoFactor;
        }
        if (uInteriorDim > 0.001) {
          diffuseColor.rgb *= mix(1.0, 1.0 - uInteriorDim, pFoldAmt);
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        if (pFinishWeight > 0.001) {
          float pMicroBrush = sin(pPaperMm.x * 3.8 + pPaperMm.y * 0.6) * 0.014;
          roughnessFactor = mix(roughnessFactor, clamp(uFinishRoughness + pMicroBrush, 0.04, 0.55), pFinishWeight);
        }`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
        if (pFinishWeight > 0.001) {
          metalnessFactor = mix(metalnessFactor, uFinishMetalness, pFinishWeight);
        }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        // Smooth out coarse paper normal under cured UV lacquer or hot-pressed foil
        if (pFinishWeight > 0.001) {
          normal = normalize(mix(normal, nonPerturbedNormal, pFinishWeight * 0.68));
        }
        // Perturb surface normal gently for corrugated washboarding ribs
        if (uWashboardStrength > 0.001) {
          float pFluteCoordN = mix(pPaperMm.x, pPaperMm.y, uFluteAlongL);
          float pWbSlope = cos(pFluteCoordN / max(uFlutePitchMm, 1.5) * 6.2831853) * 0.055 * uWashboardStrength * pPaperMask;
          vec3 pDPosX = dFdx(vViewPosition);
          vec3 pDPosY = dFdy(vViewPosition);
          vec2 pDUvX = dFdx(vPaperDielineUv);
          vec2 pDUvY = dFdy(vPaperDielineUv);
          float pDCoordX = mix(pDUvX.x * uBlankSizeMm.x, pDUvX.y * uBlankSizeMm.y, uFluteAlongL);
          float pDCoordY = mix(pDUvY.x * uBlankSizeMm.x, pDUvY.y * uBlankSizeMm.y, uFluteAlongL);
          vec3 pFluteDirView = pDPosX * pDCoordX + pDPosY * pDCoordY;
          float pDirLen = length(pFluteDirView);
          if (pDirLen > 1e-6) {
            normal = normalize(normal + (pFluteDirView / pDirLen) * pWbSlope);
          }
        }
        // Physical cotangent-frame Sobel Emboss (+) / Deboss (-) micro-bevel along Spot UV & Foil edges
        vec3 pReliefPerturb = vec3(0.0);
        if (uFinishMode > 0.5 && uHasFinishMask > 0.5 && abs(uFinishRelief) > 0.01) {
          float pML = texture2D(uFinishMaskMap, vPaperDielineUv - vec2(uFinishMaskTexel.x, 0.0)).r;
          float pMR = texture2D(uFinishMaskMap, vPaperDielineUv + vec2(uFinishMaskTexel.x, 0.0)).r;
          float pMD = texture2D(uFinishMaskMap, vPaperDielineUv - vec2(0.0, uFinishMaskTexel.y)).r;
          float pMU = texture2D(uFinishMaskMap, vPaperDielineUv + vec2(0.0, uFinishMaskTexel.y)).r;
          float pGradU = (pMR - pML);
          float pGradV = (pMU - pMD);
          if (abs(pGradU) + abs(pGradV) > 0.002) {
            vec3 pRelDpX = dFdx(vViewPosition);
            vec3 pRelDpY = dFdy(vViewPosition);
            vec2 pRelDuvX = dFdx(vPaperDielineUv);
            vec2 pRelDuvY = dFdy(vPaperDielineUv);
            float pRelDet = pRelDuvX.x * pRelDuvY.y - pRelDuvX.y * pRelDuvY.x;
            if (abs(pRelDet) > 1e-10) {
              float pRelInv = 1.0 / pRelDet;
              vec3 pTanU = normalize((pRelDpX * pRelDuvY.y - pRelDpY * pRelDuvX.y) * pRelInv);
              vec3 pTanV = normalize((-pRelDpX * pRelDuvY.x + pRelDpY * pRelDuvX.x) * pRelInv);
              float pReliefScale = uFinishRelief * 0.68 * uFinishIntensity;
              pReliefPerturb = -(pTanU * pGradU + pTanV * pGradV) * pReliefScale;
              normal = normalize(normal + pReliefPerturb);
            }
          }
        }`,
      )
      .replace(
        '#include <clearcoat_normal_fragment_maps>',
        `#include <clearcoat_normal_fragment_maps>
        #ifdef USE_CLEARCOAT
          if (length(pReliefPerturb) > 0.0001) {
            clearcoatNormal = normalize(clearcoatNormal + pReliefPerturb * 1.15);
          }
        #endif`,
      )
      .replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
        #ifdef USE_CLEARCOAT
          if (pFinishWeight > 0.001) {
            material.clearcoat = mix(material.clearcoat, uFinishClearcoat, pFinishWeight);
            material.clearcoatRoughness = mix(material.clearcoatRoughness, max(uFinishClearcoatRoughness, 0.0525), pFinishWeight);
          }
        #endif`,
      )
      .replace(
        '#include <lights_fragment_maps>',
        `#include <lights_fragment_maps>
        // Boost studio softbox IBL reflection selectively on metallic foil & Spot UV without washing out matte board
        if (pFinishWeight > 0.001) {
          float pSpecGain = mix(1.0, uFinishSpecBoost, pFinishWeight);
          radiance *= pSpecGain;
          #ifdef USE_CLEARCOAT
            clearcoatRadiance *= pSpecGain;
          #endif
        }`,
      );

    if (hoverUniforms) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        // Crisp interactive face highlight visible on Kraft, White, Ivory, Black & printed art.
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uHoverColor, uHoverMix);`,
      );
    }
  };
  material.customProgramCacheKey = () => cacheKey;
}

/**
 * Create a realistic micro-beveled corrugated cut-edge material whose fragment shader renders:
 *  - Outer & inner beveled paper liner lips matching the live outside/inside board colors
 *  - Recessed sinusoidal corrugated flute waves with 3D normal perturbation on cross-cut edges
 *  - Layered paperboard ply striations on non-fluted solid/rigid boards (Ivory, Rigid 2mm)
 */
function createCorrugatedEdgeMaterial(
  params: PackagingParams,
  preset: BoardMaterialPreset,
  grainMap: THREE.Texture,
): {
  material: THREE.MeshStandardMaterial;
  uniforms: {
    uFlutePitchMm: { value: number };
    uHasFlute: { value: number };
    uOuterColor: { value: THREE.Color };
    uInnerColor: { value: THREE.Color };
    uEdgeColor: { value: THREE.Color };
    uGrainMap: { value: THREE.Texture };
  };
} {
  const uniforms = {
    uFlutePitchMm: { value: Math.max(1.5, preset.flutePitchMm || 3.2) },
    uHasFlute: { value: preset.flute === 'none' ? 0 : 1 },
    uOuterColor: { value: new THREE.Color(params.outsideColor) },
    uInnerColor: { value: new THREE.Color(params.insideColor) },
    uEdgeColor: { value: new THREE.Color(preset.edgeColor) },
    uGrainMap: { value: grainMap },
  };

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#ffffff'),
    roughness: 0.9,
    metalness: 0,
    envMapIntensity: 0.72,
    vertexColors: false,
  });

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec3 color;
        varying vec2 vEdgeUv;
        varying float vFluteExposure;
        varying float vBevelRim;
        varying float vSideSign;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vEdgeUv = uv;
        vFluteExposure = color.r;
        vBevelRim = color.g;
        vSideSign = color.b;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uFlutePitchMm;
        uniform float uHasFlute;
        uniform vec3 uOuterColor;
        uniform vec3 uInnerColor;
        uniform vec3 uEdgeColor;
        uniform sampler2D uGrainMap;
        varying vec2 vEdgeUv;
        varying float vFluteExposure;
        varying float vBevelRim;
        varying float vSideSign;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float v = vEdgeUv.y;
        float grain = (texture2D(uGrainMap, vec2(vEdgeUv.x / 28.0, v * 0.8)).r - 0.5) * 0.16;
        vec3 linerColor = mix(uOuterColor, uInnerColor, smoothstep(0.35, 0.65, vSideSign));
        vec3 baseCol = mix(uEdgeColor, linerColor, smoothstep(0.18, 0.85, vBevelRim));
        baseCol *= (1.0 + grain);

        if (uHasFlute > 0.5) {
          // Outer & inner paper liners occupy [0..0.16] and [0.84..1.0] across board thickness.
          float inCore = smoothstep(0.14, 0.21, v) * (1.0 - smoothstep(0.79, 0.86, v));
          float phase = vEdgeUv.x / max(uFlutePitchMm, 1.0) * 6.2831853;
          float waveCenter = 0.5 + 0.30 * sin(phase);
          float distToWave = abs(v - waveCenter);
          // Fluting medium paper ribbon vs deeply shadowed hollow air tunnels.
          float ribbon = 1.0 - smoothstep(0.05, 0.125, distToWave);
          // Subtle crest highlight on top edge of flute ribbon vs dark tunnel cavity
          float crest = smoothstep(0.0, 0.08, distToWave) * 0.10;
          float cavityDark = mix(0.26, 0.98 - crest, ribbon);
          float parallelDark = mix(0.78, 1.0, 1.0 - inCore * 0.32);
          float coreFactor = mix(parallelDark, mix(1.0, cavityDark, inCore), clamp(vFluteExposure, 0.0, 1.0));
          baseCol *= coreFactor;
        } else {
          // Solid cardstock / laminated greyboard: ultra-fine horizontal paper ply striations
          float ply = sin(v * 28.0) * 0.045 + sin(v * 64.0) * 0.02;
          float coreShade = mix(1.0, 0.92 + ply, (1.0 - vBevelRim));
          baseCol *= coreShade;
        }
        diffuseColor.rgb = baseCol;`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        if (uHasFlute > 0.5 && vFluteExposure > 0.15 && vBevelRim < 0.35) {
          float vN = vEdgeUv.y;
          float inCoreN = smoothstep(0.16, 0.22, vN) * (1.0 - smoothstep(0.78, 0.84, vN));
          float phaseN = vEdgeUv.x / max(uFlutePitchMm, 1.0) * 6.2831853;
          float waveSlope = cos(phaseN) * 0.32 * inCoreN * vFluteExposure;
          vec3 tVec = normalize(dFdx(vViewPosition) + vec3(1e-6, 0.0, 0.0));
          normal = normalize(normal + tVec * waveSlope);
        }`,
      );
  };
  material.customProgramCacheKey = () => 'hypermockup-corrugated-edge-v2';

  return { material, uniforms };
}

/** Determine realistic physical finish parameters (sheen / clearcoat / washboarding) per board preset. */
function resolvePhysicalBoardProfile(preset: BoardMaterialPreset, hasArtwork: boolean) {
  const isCorrugated = preset.flute !== 'none';
  const isUncoatedKraft = preset.id.startsWith('kraft');
  const isCoatedSmooth = preset.id === 'ivory-350' || preset.id === 'rigid-20' || preset.id === 'white-e' || preset.id === 'white-b';
  const isMatteBlack = preset.id === 'black-e';

  const sheen = isUncoatedKraft ? 0.34 : isMatteBlack ? 0.28 : 0.14;
  const sheenRoughness = isUncoatedKraft ? 0.82 : 0.68;
  const sheenColor = isUncoatedKraft
    ? '#efe0cc'
    : isMatteBlack
      ? '#4d525c'
      : '#ffffff';

  // Coated boards & printed ink get a subtle realistic satin/matte lamination clearcoat
  const clearcoat = isCoatedSmooth
    ? (hasArtwork ? 0.28 : 0.16)
    : isMatteBlack
      ? (hasArtwork ? 0.18 : 0.08)
      : (hasArtwork ? 0.12 : 0.0);
  const clearcoatRoughness = preset.id === 'ivory-350' ? 0.34 : 0.48;

  const normalScale = Math.max(0.03, Math.min(0.22, preset.fiberStrength * 0.38));
  const grainStrength = Math.max(0.02, Math.min(0.14, preset.fiberStrength * (hasArtwork ? 0.22 : 0.34)));
  const washboardStrength = !isCorrugated
    ? 0
    : preset.flute === 'b-flute'
      ? (hasArtwork ? 0.18 : 0.26)
      : (hasArtwork ? 0.1 : 0.16);

  return {
    sheen,
    sheenRoughness,
    sheenColor,
    clearcoat,
    clearcoatRoughness,
    normalScale,
    grainStrength,
    washboardStrength,
  };
}

/**
 * Creates the full studio-grade PBR material set for a Parametric Box/Tray:
 *  - Outside board face: MeshPhysicalMaterial with normal/roughness maps, sheen/clearcoat,
 *    physical-mm washboarding, and fold-aware crease AO
 *  - Inside board face: MeshPhysicalMaterial with deeper interior crevice AO & kraft fiber tooth
 *  - Cut edges: Micro-beveled liner lips + 3D normal-perturbed corrugated flute core
 *  - Clear PET film for optional display windows
 */
export function createPackagingMaterialSet(
  params: PackagingParams,
  preset: BoardMaterialPreset,
): PackagingMaterialSet {
  const paperPbr = getSharedPaperPbrMaps();
  const whiteFallback = getWhiteFallbackTexture();

  let outsideCreviceCanvas: HTMLCanvasElement | null = null;
  let insideCreviceCanvas: HTMLCanvasElement | null = null;
  let outsideCreviceTex: THREE.CanvasTexture | null = null;
  let insideCreviceTex: THREE.CanvasTexture | null = null;

  const blankSizeMm = new THREE.Vector2(420, 320);

  const outsideProfile = resolvePhysicalBoardProfile(preset, false);
  const initialFinish = getPackagingFinishPreset(params.finishMode);
  const outsideUniforms: BoardFaceShaderUniforms = {
    uBlankSizeMm: { value: blankSizeMm },
    uGrainMap: { value: paperPbr.grainMap },
    uGrainStrength: { value: outsideProfile.grainStrength },
    uFlutePitchMm: { value: Math.max(1.5, preset.flutePitchMm || 3.2) },
    uFluteAlongL: { value: params.fluteDirection === 'along-L' ? 1 : 0 },
    uWashboardStrength: { value: outsideProfile.washboardStrength },
    uCreviceMap: { value: whiteFallback },
    uHasCreviceMap: { value: 0 },
    uFoldProgress: { value: params.foldProgress },
    uCreviceStrength: { value: 0.72 },
    uInteriorDim: { value: 0.0 },
    uFinishMode: { value: initialFinish.shaderMode },
    uFinishMaskMap: { value: whiteFallback },
    uHasFinishMask: { value: 0 },
    uFinishMaskTexel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) },
    uFinishIntensity: { value: params.finishIntensity },
    uFinishRelief: { value: params.finishRelief },
    uFinishFoilColor: { value: new THREE.Color(initialFinish.foilColor) },
    uFinishMetalness: { value: initialFinish.metalness },
    uFinishRoughness: { value: initialFinish.roughness },
    uFinishClearcoat: { value: initialFinish.clearcoat },
    uFinishClearcoatRoughness: { value: initialFinish.clearcoatRoughness },
    uFinishSpecBoost: { value: initialFinish.specBoost },
  };

  const insideUniforms: BoardFaceShaderUniforms = {
    uBlankSizeMm: { value: blankSizeMm },
    uGrainMap: { value: paperPbr.grainMap },
    uGrainStrength: { value: Math.max(0.08, preset.fiberStrength * 0.65) },
    uFlutePitchMm: { value: Math.max(1.5, preset.flutePitchMm || 3.2) },
    uFluteAlongL: { value: params.fluteDirection === 'along-L' ? 1 : 0 },
    uWashboardStrength: { value: outsideProfile.washboardStrength * 0.85 },
    uCreviceMap: { value: whiteFallback },
    uHasCreviceMap: { value: 0 },
    uFoldProgress: { value: params.foldProgress },
    uCreviceStrength: { value: 1.0 },
    uInteriorDim: { value: 0.14 },
    uFinishMode: { value: 0 },
    uFinishMaskMap: { value: whiteFallback },
    uHasFinishMask: { value: 0 },
    uFinishMaskTexel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) },
    uFinishIntensity: { value: 0 },
    uFinishRelief: { value: 0 },
    uFinishFoilColor: { value: new THREE.Color('#ffffff') },
    uFinishMetalness: { value: 0 },
    uFinishRoughness: { value: 0.72 },
    uFinishClearcoat: { value: 0 },
    uFinishClearcoatRoughness: { value: 0.4 },
    uFinishSpecBoost: { value: 1 },
  };

  const { material: edge, uniforms: edgeUniforms } = createCorrugatedEdgeMaterial(
    params,
    preset,
    paperPbr.grainMap,
  );

  // Clone lightweight Texture wrappers so outside/inside can set independent physical-mm repeats
  const outsideNormal = paperPbr.normalMap.clone();
  outsideNormal.repeat.set(6, 6);
  outsideNormal.needsUpdate = true;
  const outsideRough = paperPbr.roughnessMap.clone();
  outsideRough.repeat.set(6, 6);
  outsideRough.needsUpdate = true;

  const insideNormal = paperPbr.normalMap.clone();
  insideNormal.repeat.set(6, 6);
  insideNormal.needsUpdate = true;
  const insideRough = paperPbr.roughnessMap.clone();
  insideRough.repeat.set(6, 6);
  insideRough.needsUpdate = true;

  const partitionNormal = paperPbr.normalMap.clone();
  partitionNormal.repeat.set(1, 1);
  partitionNormal.needsUpdate = true;
  const partitionRough = paperPbr.roughnessMap.clone();
  partitionRough.repeat.set(1, 1);
  partitionRough.needsUpdate = true;

  const outside = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(params.outsideColor),
    roughness: params.outsideRoughness,
    metalness: params.outsideMetalness,
    normalMap: outsideNormal,
    normalScale: new THREE.Vector2(outsideProfile.normalScale, outsideProfile.normalScale),
    roughnessMap: outsideRough,
    sheen: outsideProfile.sheen,
    sheenRoughness: outsideProfile.sheenRoughness,
    sheenColor: new THREE.Color(outsideProfile.sheenColor),
    // Keep clearcoat > 0 so Three.js always compiles USE_CLEARCOAT once (0 shader recompiles when toggling Spot UV/Foil!)
    clearcoat: Math.max(0.001, outsideProfile.clearcoat),
    clearcoatRoughness: outsideProfile.clearcoatRoughness,
    envMapIntensity: 0.88,
    side: THREE.FrontSide,
  });
  enhancePaperFaceMaterial(outside, outsideUniforms, 'hypermockup-paper-outside-v3');

  const hoverOutside = outside.clone();
  enhancePaperFaceMaterial(hoverOutside, outsideUniforms, 'hypermockup-paper-outside-hover-v2', {
    color: new THREE.Color('#2563eb'),
    mix: 0.34,
  });

  const inside = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(params.insideColor),
    roughness: params.insideRoughness,
    metalness: 0,
    normalMap: insideNormal,
    normalScale: new THREE.Vector2(
      Math.max(0.14, outsideProfile.normalScale * 1.15),
      Math.max(0.14, outsideProfile.normalScale * 1.15),
    ),
    roughnessMap: insideRough,
    sheen: Math.max(0.2, outsideProfile.sheen),
    sheenRoughness: 0.84,
    sheenColor: new THREE.Color('#e6d7c4'),
    clearcoat: 0,
    envMapIntensity: 0.72,
    side: THREE.FrontSide,
  });
  enhancePaperFaceMaterial(inside, insideUniforms, 'hypermockup-paper-inside-v2');

  const hoverInside = inside.clone();
  enhancePaperFaceMaterial(hoverInside, insideUniforms, 'hypermockup-paper-inside-hover-v1', {
    color: new THREE.Color('#2563eb'),
    mix: 0.34,
  });

  const partition = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(params.insideColor).multiplyScalar(0.95),
    roughness: Math.max(0.76, params.insideRoughness),
    metalness: 0,
    normalMap: partitionNormal,
    normalScale: new THREE.Vector2(
      Math.max(0.16, outsideProfile.normalScale * 1.15),
      Math.max(0.16, outsideProfile.normalScale * 1.15),
    ),
    roughnessMap: partitionRough,
    sheen: Math.max(0.24, outsideProfile.sheen),
    sheenRoughness: 0.85,
    sheenColor: new THREE.Color('#e6d7c4'),
    clearcoat: 0,
    envMapIntensity: 0.72,
    side: THREE.FrontSide,
  });

  const windowFilm = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#ffffff'),
    roughness: 0.05,
    metalness: 0,
    transparent: true,
    opacity: 0.22,
    reflectivity: 0.95,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    envMapIntensity: 1.35,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const highlightEmissive = new THREE.Color('#2563eb');
  let hasOutsideArtwork = false;
  let hasInsideArtwork = false;

  const syncRepeatToBlank = () => {
    const rx = Math.max(3, Math.min(24, blankSizeMm.x / 46));
    const ry = Math.max(3, Math.min(24, blankSizeMm.y / 46));
    outsideNormal.repeat.set(rx, ry);
    outsideRough.repeat.set(rx, ry);
    insideNormal.repeat.set(rx, ry);
    insideRough.repeat.set(rx, ry);
  };

  const sync: PackagingMaterialSet['sync'] = (nextParams, nextPreset, maps) => {
    if (maps && 'outsideMap' in maps) {
      hasOutsideArtwork = Boolean(maps.outsideMap);
      outside.map = maps.outsideMap ?? null;
      outside.needsUpdate = true;
      hoverOutside.map = outside.map;
      hoverOutside.needsUpdate = true;
    }
    if (maps && 'insideMap' in maps) {
      hasInsideArtwork = Boolean(maps.insideMap);
      inside.map = maps.insideMap ?? null;
      inside.needsUpdate = true;
      hoverInside.map = inside.map;
      hoverInside.needsUpdate = true;
    }
    if (maps && 'finishMaskMap' in maps) {
      const fMap = maps.finishMaskMap ?? null;
      outsideUniforms.uFinishMaskMap.value = fMap ?? whiteFallback;
      outsideUniforms.uHasFinishMask.value = fMap ? 1 : 0;
      const img = fMap?.image as { width?: number; height?: number } | undefined;
      const mw = Math.max(64, img?.width || 1024);
      const mh = Math.max(64, img?.height || 1024);
      outsideUniforms.uFinishMaskTexel.value.set(1.5 / mw, 1.5 / mh);
    }

    const prof = resolvePhysicalBoardProfile(nextPreset, hasOutsideArtwork);
    const finishPreset = getPackagingFinishPreset(nextParams.finishMode);

    // When a baked artwork/dieline canvas texture is bound, keep tint white because
    // the base board color is already composited into the canvas texture.
    outside.color.set(hasOutsideArtwork ? '#ffffff' : nextParams.outsideColor);
    outside.roughness = nextParams.outsideRoughness;
    outside.metalness = nextParams.outsideMetalness;
    outside.normalScale.set(prof.normalScale, prof.normalScale);
    outside.sheen = prof.sheen;
    outside.sheenRoughness = prof.sheenRoughness;
    outside.sheenColor.set(prof.sheenColor);
    outside.clearcoat = Math.max(0.001, prof.clearcoat);
    outside.clearcoatRoughness = prof.clearcoatRoughness;

    hoverOutside.color.copy(outside.color);
    hoverOutside.roughness = outside.roughness;
    hoverOutside.metalness = outside.metalness;
    hoverOutside.normalScale.copy(outside.normalScale);
    hoverOutside.sheen = outside.sheen;
    hoverOutside.sheenRoughness = outside.sheenRoughness;
    hoverOutside.sheenColor.copy(outside.sheenColor);
    hoverOutside.clearcoat = outside.clearcoat;
    hoverOutside.clearcoatRoughness = outside.clearcoatRoughness;

    outsideUniforms.uGrainStrength.value = prof.grainStrength;
    outsideUniforms.uFlutePitchMm.value = Math.max(1.5, nextPreset.flutePitchMm || 3.2);
    outsideUniforms.uFluteAlongL.value = nextParams.fluteDirection === 'along-L' ? 1 : 0;
    outsideUniforms.uWashboardStrength.value = prof.washboardStrength;
    outsideUniforms.uFoldProgress.value = nextParams.foldProgress;

    outsideUniforms.uFinishMode.value = finishPreset.shaderMode;
    outsideUniforms.uFinishIntensity.value = nextParams.finishIntensity;
    outsideUniforms.uFinishRelief.value = nextParams.finishRelief;
    outsideUniforms.uFinishFoilColor.value.set(finishPreset.foilColor);
    outsideUniforms.uFinishMetalness.value = finishPreset.metalness;
    outsideUniforms.uFinishRoughness.value = finishPreset.roughness;
    outsideUniforms.uFinishClearcoat.value = finishPreset.clearcoat;
    outsideUniforms.uFinishClearcoatRoughness.value = finishPreset.clearcoatRoughness;
    outsideUniforms.uFinishSpecBoost.value = finishPreset.specBoost;

    const inProf = resolvePhysicalBoardProfile(nextPreset, hasInsideArtwork);
    inside.color.set(hasInsideArtwork ? '#ffffff' : nextParams.insideColor);
    inside.roughness = nextParams.insideRoughness;
    const inNorm = Math.max(0.14, inProf.normalScale * 1.15);
    inside.normalScale.set(inNorm, inNorm);
    inside.sheen = Math.max(0.18, inProf.sheen);

    hoverInside.color.copy(inside.color);
    hoverInside.roughness = inside.roughness;
    hoverInside.normalScale.copy(inside.normalScale);
    hoverInside.sheen = inside.sheen;

    partition.color.set(nextParams.insideColor).multiplyScalar(0.95);
    partition.roughness = Math.max(0.76, nextParams.insideRoughness);
    partition.normalScale.set(inNorm, inNorm);
    partition.sheen = Math.max(0.24, inProf.sheen);

    insideUniforms.uGrainStrength.value = Math.max(0.06, nextPreset.fiberStrength * (hasInsideArtwork ? 0.35 : 0.65));
    insideUniforms.uFlutePitchMm.value = Math.max(1.5, nextPreset.flutePitchMm || 3.2);
    insideUniforms.uFluteAlongL.value = nextParams.fluteDirection === 'along-L' ? 1 : 0;
    insideUniforms.uWashboardStrength.value = inProf.washboardStrength * 0.85;
    insideUniforms.uFoldProgress.value = nextParams.foldProgress;

    edgeUniforms.uOuterColor.value.set(nextParams.outsideColor);
    edgeUniforms.uInnerColor.value.set(nextParams.insideColor);
    edgeUniforms.uEdgeColor.value.set(nextPreset.edgeColor);
    edgeUniforms.uHasFlute.value = nextPreset.flute === 'none' ? 0 : 1;
    edgeUniforms.uFlutePitchMm.value = Math.max(1.5, nextPreset.flutePitchMm || 3.2);
  };

  const syncDieline: PackagingMaterialSet['syncDieline'] = (solved) => {
    blankSizeMm.set(
      Math.max(40, solved.blankBounds.width),
      Math.max(40, solved.blankBounds.height),
    );
    syncRepeatToBlank();

    if (typeof document === 'undefined') return;
    if (!outsideCreviceCanvas) outsideCreviceCanvas = document.createElement('canvas');
    if (!insideCreviceCanvas) insideCreviceCanvas = document.createElement('canvas');

    bakeCreviceAoCanvas(solved, 'outside', outsideCreviceCanvas);
    bakeCreviceAoCanvas(solved, 'inside', insideCreviceCanvas);

    if (!outsideCreviceTex) {
      outsideCreviceTex = new THREE.CanvasTexture(outsideCreviceCanvas);
      outsideCreviceTex.flipY = false;
      outsideCreviceTex.colorSpace = THREE.NoColorSpace;
      outsideCreviceTex.wrapS = THREE.ClampToEdgeWrapping;
      outsideCreviceTex.wrapT = THREE.ClampToEdgeWrapping;
      outsideUniforms.uCreviceMap.value = outsideCreviceTex;
    } else {
      outsideCreviceTex.needsUpdate = true;
    }
    outsideUniforms.uHasCreviceMap.value = 1;

    if (!insideCreviceTex) {
      insideCreviceTex = new THREE.CanvasTexture(insideCreviceCanvas);
      insideCreviceTex.flipY = false;
      insideCreviceTex.colorSpace = THREE.NoColorSpace;
      insideCreviceTex.wrapS = THREE.ClampToEdgeWrapping;
      insideCreviceTex.wrapT = THREE.ClampToEdgeWrapping;
      insideUniforms.uCreviceMap.value = insideCreviceTex;
    } else {
      insideCreviceTex.needsUpdate = true;
    }
    insideUniforms.uHasCreviceMap.value = 1;
  };

  const updateFoldProgress: PackagingMaterialSet['updateFoldProgress'] = (progress) => {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
    outsideUniforms.uFoldProgress.value = clamped;
    insideUniforms.uFoldProgress.value = clamped;
  };

  return {
    outside,
    inside,
    partition,
    hoverOutside,
    hoverInside,
    edge,
    windowFilm,
    highlightEmissive,
    sync,
    syncDieline,
    updateFoldProgress,
    dispose() {
      outside.dispose();
      inside.dispose();
      partition.dispose();
      hoverOutside.dispose();
      hoverInside.dispose();
      edge.dispose();
      windowFilm.dispose();
      outsideNormal.dispose();
      outsideRough.dispose();
      insideNormal.dispose();
      insideRough.dispose();
      partitionNormal.dispose();
      partitionRough.dispose();
      outsideCreviceTex?.dispose();
      insideCreviceTex?.dispose();
      outsideCreviceTex = null;
      insideCreviceTex = null;
      outsideCreviceCanvas = null;
      insideCreviceCanvas = null;
    },
  };
}
