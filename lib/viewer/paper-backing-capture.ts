import * as THREE from 'three';

// Warm-neutral unprinted paper base tint (linear RGB). Kept slightly warm and
// matte so the far side of a white wrap label reads as real paper backing
// behind the glass/liquid rather than cold flat gray.
const PAPER_TINT = new THREE.Color().setRGB(.99, .975, .945);
const PAPER_FALLBACK_RADIANCE = new THREE.Color().setRGB(.64, .63, .61);
const states = new WeakMap<THREE.WebGLRenderer, State>();
const hasActiveCapture = new WeakMap<THREE.WebGLRenderer, boolean>();

const PAPER_CAPTURE_VERTEX_GLSL = /* glsl */ `
varying vec3 vPaperViewNormal;
varying vec3 vPaperViewDir;
varying vec2 vPaperUv;
void main() {
  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
  vPaperViewNormal = normalize(normalMatrix * normal);
  vPaperViewDir = projectionMatrix[3][3] > 0.5 ? vec3(0.0, 0.0, 1.0) : normalize(-mvPos.xyz);
  vPaperUv = uv;
  gl_Position = projectionMatrix * mvPos;
}
`;

const PAPER_CAPTURE_FRAGMENT_GLSL = /* glsl */ `
uniform vec3 paperBackingTint;
varying vec3 vPaperViewNormal;
varying vec3 vPaperViewDir;
varying vec2 vPaperUv;
void main() {
  // Render only BackSide faces of the conical/cylindrical wrap; flip the normal
  // so it always points inward toward the liquid volume and viewer.
  vec3 n = normalize(vPaperViewNormal);
  if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(vPaperViewDir);
  float ndotv = clamp(dot(n, v), 0.0, 1.0);
  // Soft interior studio wrap illumination entering from the open glass body
  // plus gentle ambient transmittance through coated paper stock.
  vec3 keyDir = normalize(vec3(0.24, 0.32, 0.92));
  vec3 fillDir = normalize(vec3(-0.48, -0.22, 0.85));
  float keyWrap = clamp(dot(n, keyDir) * 0.55 + 0.45, 0.0, 1.0);
  float fillWrap = clamp(dot(n, fillDir) * 0.5 + 0.5, 0.0, 1.0);
  float studioShade = keyWrap * 0.65 + fillWrap * 0.35;
  // Matte coated paper is predominantly Lambertian: avoid heavy grazing
  // darkening so thin liquid flanks reveal soft rosy/white paper rather than
  // muddy charcoal, while keeping gentle cylindrical curvature and depth.
  float curveFalloff = mix(0.86, 1.0, pow(ndotv, 0.35));
  // Lower edge nearest the clear liquid opening catches slightly more entering
  // light than the upper collar deeper inside the wrapped sleeve.
  float verticalShade = mix(1.0, 0.88, clamp(vPaperUv.y, 0.0, 1.0));
  float radiance = (0.50 + 0.22 * studioShade) * curveFalloff * verticalShade;
  gl_FragColor = vec4(paperBackingTint * radiance, 1.0);
}
`;

type State = {
  target: THREE.WebGLRenderTarget;
  material: THREE.ShaderMaterial;
  width: number;
  height: number;
};

export type PaperBackingUniforms = {
  paperBackingCapture: { value: THREE.Texture | null };
  paperBackingCaptureEnabled: { value: number };
  paperBackingRadiance: { value: THREE.Color };
};

function stateFor(renderer: THREE.WebGLRenderer, width: number, height: number): State {
  let state = states.get(renderer);
  if (!state) {
    state = {
      target: new THREE.WebGLRenderTarget(width, height, {
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        depthBuffer: true,
        stencilBuffer: false,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        generateMipmaps: false,
        colorSpace: THREE.NoColorSpace,
      }),
      material: new THREE.ShaderMaterial({
        uniforms: {
          paperBackingTint: { value: PAPER_TINT.clone() },
        },
        vertexShader: PAPER_CAPTURE_VERTEX_GLSL,
        fragmentShader: PAPER_CAPTURE_FRAGMENT_GLSL,
        side: THREE.BackSide,
        toneMapped: false,
        transparent: false,
        depthWrite: true,
        depthTest: true,
      }),
      width,
      height,
    };
    state.target.texture.name = 'Paper backing capture';
    states.set(renderer, state);
  } else if (state.width !== width || state.height !== height) {
    state.target.setSize(width, height);
    state.width = width;
    state.height = height;
  }
  return state;
}

/** Render only the marked rear-paper meshes' inner BackSide into a reusable
 * screen-space radiance + coverage buffer. The caller's draw callback runs
 * after the capture and sees the original renderer, scene and camera state. */
export function renderPaperBackingCapture(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Object3D,
  camera: THREE.Camera,
  draw: () => void,
): void {
  const markedAncestors = new Set<THREE.Object3D>();
  let hasMarked = false;
  scene.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    if (node.userData.basilWebLabelBackBeauty !== true) return;
    hasMarked = true;
    let parent = node.parent;
    while (parent) { markedAncestors.add(parent); parent = parent.parent; }
  });
  // Most products have no separate rear-paper mesh. Skip target allocation,
  // visibility toggling and the extra render pass completely for them.
  if (!hasMarked) {
    hasActiveCapture.set(renderer, false);
    draw();
    return;
  }
  hasActiveCapture.set(renderer, true);
  const target = renderer.getRenderTarget();
  const drawingBuffer = renderer.getDrawingBufferSize(new THREE.Vector2());
  const width = target?.width ?? drawingBuffer.x;
  const height = target?.height ?? drawingBuffer.y;
  const state = stateFor(renderer, Math.max(1, width), Math.max(1, height));
  const viewport = renderer.getViewport(new THREE.Vector4());
  const scissor = renderer.getScissor(new THREE.Vector4());
  const scissorTest = renderer.getScissorTest();
  const clearColor = renderer.getClearColor(new THREE.Color());
  const clearAlpha = renderer.getClearAlpha();
  const background = scene instanceof THREE.Scene ? scene.background : null;
  const override = scene instanceof THREE.Scene ? scene.overrideMaterial : null;
  const visibility: Array<[THREE.Mesh, boolean, number, number]> = [];
  scene.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    const marked = node.userData.basilWebLabelBackBeauty === true;
    const ancestor = markedAncestors.has(node);
    const { start, count } = node.geometry.drawRange;
    visibility.push([node, node.visible, start, count]);
    node.visible = marked || ancestor;
    if (ancestor && !marked) node.geometry.setDrawRange(0, 0);
  });
  try {
    if (scene instanceof THREE.Scene) {
      scene.background = null;
      scene.overrideMaterial = state.material;
    }
    renderer.setRenderTarget(state.target);
    renderer.setViewport(0, 0, state.width, state.height);
    renderer.setScissorTest(false);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, false);
    renderer.render(scene, camera);
  } finally {
    visibility.forEach(([mesh, visible, start, count]) => {
      mesh.visible = visible;
      mesh.geometry.setDrawRange(start, count);
    });
    if (scene instanceof THREE.Scene) {
      scene.background = background;
      scene.overrideMaterial = override;
    }
    renderer.setRenderTarget(target);
    renderer.setViewport(viewport);
    renderer.setScissor(scissor);
    renderer.setScissorTest(scissorTest);
    renderer.setClearColor(clearColor, clearAlpha);
    draw();
  }
}

export function createPaperBackingUniforms(): PaperBackingUniforms {
  return {
    paperBackingCapture: { value: null },
    paperBackingCaptureEnabled: { value: 0 },
    paperBackingRadiance: { value: PAPER_FALLBACK_RADIANCE.clone() },
  };
}

export function updatePaperBackingUniforms(uniforms: PaperBackingUniforms, renderer: THREE.WebGLRenderer): void {
  const active = hasActiveCapture.get(renderer) !== false;
  const state = active ? states.get(renderer) : undefined;
  uniforms.paperBackingCapture.value = state?.target.texture ?? null;
  uniforms.paperBackingCaptureEnabled.value = state ? 1 : 0;
  uniforms.paperBackingRadiance.value.copy(PAPER_FALLBACK_RADIANCE);
}

export const PAPER_BACKING_CAPTURE_GLSL = /* glsl */ `
uniform sampler2D paperBackingCapture;
uniform float paperBackingCaptureEnabled;
uniform vec3 paperBackingRadiance;
vec4 paperBackingSample(vec2 uv) {
  if (paperBackingCaptureEnabled < .5) return vec4(0.0);
  return texture2D(paperBackingCapture, clamp(uv, vec2(.001), vec2(.999)));
}
float paperBackingCoverage(vec2 uv) {
  return paperBackingSample(uv).a;
}
vec3 paperBackingAt(vec2 uv) {
  vec4 s = paperBackingSample(uv);
  return s.a > .001 ? s.rgb / s.a : paperBackingRadiance;
}
`;

export function configurePaperBackingSampler(
  shader: { uniforms: Record<string, THREE.IUniform>; fragmentShader: string },
  uniforms: PaperBackingUniforms,
): void {
  Object.assign(shader.uniforms, uniforms);
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <common>',
    `#include <common>\n${PAPER_BACKING_CAPTURE_GLSL}`,
  );
}

export function disposePaperBackingCapture(renderer: THREE.WebGLRenderer): void {
  hasActiveCapture.delete(renderer);
  const state = states.get(renderer);
  if (!state) return;
  state.target.dispose();
  state.material.dispose();
  states.delete(renderer);
}
