import * as THREE from 'three';

/** Pixel rectangles use the export image's top-left origin. */
export interface ExportRefractionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExportRefractionSource {
  texture: THREE.Texture;
  width: number;
  height: number;
}

function validateRect(rect: ExportRefractionRect): void {
  if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
    || rect.width <= 0 || rect.height <= 0) {
    throw new RangeError('Refraction rectangles must have finite coordinates and positive dimensions');
  }
}

/**
 * Convert the tile's bottom-left WebGL UV into the shared source atlas UV.
 * Both rectangles remain in full-export pixels; no output pixel is rescaled.
 * The explicit full height makes the top-to-bottom origin conversion visible,
 * even though it cancels out when subtracting the two framebuffer origins.
 */
export function exportRefractionUvTransform(
  sourceRect: ExportRefractionRect,
  tileRect: ExportRefractionRect,
  outputFullHeight: number,
): [number, number, number, number] {
  validateRect(sourceRect);
  validateRect(tileRect);
  if (!Number.isFinite(outputFullHeight) || outputFullHeight <= 0) {
    throw new RangeError('The full export height must be positive');
  }
  const sourceBottom = outputFullHeight - sourceRect.y - sourceRect.height;
  const tileBottom = outputFullHeight - tileRect.y - tileRect.height;
  return [
    (tileRect.x - sourceRect.x) / sourceRect.width,
    (tileBottom - sourceBottom) / sourceRect.height,
    tileRect.width / sourceRect.width,
    tileRect.height / sourceRect.height,
  ];
}

const declarations = /* glsl */`
uniform float mockupExportRefractionEnabled;
uniform sampler2D mockupExportRefractionMap;
uniform vec2 mockupExportRefractionSize;
uniform float mockupExportRefractionLodWidth;
uniform vec4 mockupExportRefractionRegion;
`;

const sharedSample = /* glsl */`
  if (mockupExportRefractionEnabled > 0.5) {
    vec2 atlasUv = mockupExportRefractionRegion.xy + fragCoord * mockupExportRefractionRegion.zw;
    // Match Three's transmission clear reservoir for this runtime's non-
    // premultiplied context. Existing bottle shaders still apply their native
    // optical-coverage correction to this sample after this function returns.
    if (any(lessThan(atlasUv, vec2(0.0))) || any(greaterThan(atlasUv, vec2(1.0)))) {
      return vec4(1.0, 1.0, 1.0, 0.5);
    }
    // Cropping empty export pixels must not change the glass roughness blur.
    float atlasLod = log2(mockupExportRefractionLodWidth) * applyIorToRoughness(roughness, ior);
    float atlasLastMip = floor(log2(max(mockupExportRefractionSize.x, mockupExportRefractionSize.y)));
    // Three's bicubic helper reads both floor(lod) and int(lod + 1.0),
    // including at integral LODs. Never ask it for a missing adjacent level.
    if (atlasLastMip < 1.0) return texture2D(mockupExportRefractionMap, atlasUv);
    atlasLod = clamp(atlasLod, 0.0, max(0.0, atlasLastMip - 1.0));
    return textureBicubic(mockupExportRefractionMap, atlasUv, atlasLod);
  }
`;

const sampleFunction = /vec4\s+getTransmissionSample\s*\(\s*const\s+in\s+vec2\s+fragCoord\s*,\s*const\s+in\s+float\s+roughness\s*,\s*const\s+in\s+float\s+ior\s*\)\s*\{/;

function createBinding() {
  return {
    uniforms: {
      mockupExportRefractionEnabled: { value: 0 },
      mockupExportRefractionMap: { value: null as THREE.Texture | null },
      mockupExportRefractionSize: { value: new THREE.Vector2(1, 1) },
      mockupExportRefractionLodWidth: { value: 1 },
      mockupExportRefractionRegion: { value: new THREE.Vector4(0, 0, 1, 1) },
    },
    nativeUniforms: [] as {
      map: THREE.IUniform<THREE.Texture | null>;
      size: THREE.IUniform<THREE.Vector2>;
    }[],
  };
}

// Three may reuse a material's compiled export program without invoking a new
// onBeforeCompile callback. Retain its uniform *objects* across sessions, with
// all texture values cleared at disposal. This also avoids creating a different
// GPU program variant for every PNG download.
const compiledBindings = new WeakMap<THREE.Material, Map<string, ReturnType<typeof createBinding>>>();

/**
 * A capture-scoped adapter around Three's native transmission shader. All
 * beauty tiles use one full-resolution optical source and its mip hierarchy,
 * while reservoir construction and normal preview retain the native path.
 * The caller owns the atlas texture and its GPU lifetime.
 */
export function createExportRefractionSession(scene: THREE.Object3D) {
  const materials = new Set<THREE.MeshPhysicalMaterial>();
  scene.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (material instanceof THREE.MeshPhysicalMaterial && material.transmission > 0) materials.add(material);
    }
  });
  const originals = [...materials].map(material => {
    // The default key reads this.onBeforeCompile. Capture it before wrapping so
    // the export variant is based on the actual authored shader, not our hook.
    const programKey = material.customProgramCacheKey();
    let variants = compiledBindings.get(material);
    if (!variants) { variants = new Map(); compiledBindings.set(material, variants); }
    let binding = variants.get(programKey);
    if (!binding) { binding = createBinding(); variants.set(programKey, binding); }
    return { material, compile: material.onBeforeCompile, cacheKey: material.customProgramCacheKey, programKey, binding };
  });
  let disposed = false;
  let sourceRect: ExportRefractionRect | null = null;
  let tileRect: ExportRefractionRect | null = null;
  let fullHeight = 1;

  for (const original of originals) {
    const { material } = original;
    material.onBeforeCompile = function(shader, renderer) {
      original.compile.call(this, shader, renderer);
      // Some bottle profiles expand and customize this chunk themselves; other
      // physical materials leave the native include for Three to expand later.
      let fragment = shader.fragmentShader.replace(
        '#include <transmission_pars_fragment>',
        THREE.ShaderChunk.transmission_pars_fragment,
      );
      if (!sampleFunction.test(fragment)) {
        throw new Error('The export refraction adapter requires Three transmission sampling');
      }
      fragment = fragment.replace(sampleFunction, match => `${declarations}\n${match}\n${sharedSample}`);
      shader.fragmentShader = fragment;
      Object.assign(shader.uniforms, original.binding.uniforms);
      const map = shader.uniforms.transmissionSamplerMap;
      const size = shader.uniforms.transmissionSamplerSize;
      if (map && size) original.binding.nativeUniforms.push({ map, size });
    };
    material.customProgramCacheKey = () => `${original.programKey}:mockup-export-refraction-v3`;
    material.needsUpdate = true;
  }

  const updateRegion = () => {
    if (!sourceRect) return;
    const transform = exportRefractionUvTransform(sourceRect, tileRect ?? sourceRect, fullHeight);
    for (const { binding } of originals) binding.uniforms.mockupExportRefractionRegion.value.fromArray(transform);
  };
  const assertActive = () => {
    if (disposed) throw new Error('The export refraction session has been disposed');
  };

  return {
    materialCount: materials.size,
    /** Native uniforms are refreshed by Three at draw time, after compilation. */
    getNativeSource(): ExportRefractionSource | null {
      if (disposed) return null;
      for (const { binding } of originals) {
        for (let index = binding.nativeUniforms.length - 1; index >= 0; index--) {
          const { map, size } = binding.nativeUniforms[index];
          const texture = map.value;
          const dimensions = size.value;
          if (texture instanceof THREE.Texture && dimensions instanceof THREE.Vector2
            && dimensions.x > 0 && dimensions.y > 0) {
            return { texture, width: dimensions.x, height: dimensions.y };
          }
        }
      }
      return null;
    },
    bindAtlas(texture: THREE.Texture, width: number, height: number, rect: ExportRefractionRect,
      outputFullHeight: number, referenceWidth = width) {
      assertActive();
      validateRect(rect);
      if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
        || width !== rect.width || height !== rect.height) {
        throw new RangeError('The refraction atlas must retain its full-resolution source pixels');
      }
      if (!Number.isFinite(referenceWidth) || referenceWidth <= 0) {
        throw new RangeError('The refraction blur reference width must be positive');
      }
      // Validate before changing any existing export binding.
      exportRefractionUvTransform(rect, tileRect ?? rect, outputFullHeight);
      sourceRect = { ...rect };
      fullHeight = outputFullHeight;
      for (const { binding } of originals) {
        binding.uniforms.mockupExportRefractionMap.value = texture;
        binding.uniforms.mockupExportRefractionSize.value.set(width, height);
        binding.uniforms.mockupExportRefractionLodWidth.value = referenceWidth;
      }
      updateRegion();
      for (const { binding } of originals) binding.uniforms.mockupExportRefractionEnabled.value = 1;
    },
    setTile(rect: ExportRefractionRect) {
      assertActive();
      validateRect(rect);
      tileRect = { ...rect };
      updateRegion();
    },
    disable() {
      for (const { binding } of originals) binding.uniforms.mockupExportRefractionEnabled.value = 0;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      sourceRect = null;
      tileRect = null;
      for (const original of originals) {
        original.binding.uniforms.mockupExportRefractionEnabled.value = 0;
        original.binding.uniforms.mockupExportRefractionMap.value = null;
        for (const native of original.binding.nativeUniforms) native.map.value = null;
        original.material.onBeforeCompile = original.compile;
        original.material.customProgramCacheKey = original.cacheKey;
        original.material.needsUpdate = true;
      }
      originals.length = 0;
      materials.clear();
    },
  };
}
