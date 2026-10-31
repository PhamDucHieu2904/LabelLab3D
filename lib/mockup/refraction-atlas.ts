import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { OutputShader } from 'three/examples/jsm/shaders/OutputShader.js';
import type { MockupCaptureTile } from './capture';

export interface PixelRect { x: number; y: number; width: number; height: number }

/** Reserve every projected opaque product pixel, plus a clear filtering border.
 * The atlas stays at export resolution; cropping empty canvas saves GPU memory. */
export function projectedRefractionRect(bounds: THREE.Box3, world: THREE.Matrix4,
  camera: THREE.PerspectiveCamera, width: number, height: number, guard = 96): PixelRect {
  const full = { x: 0, y: 0, width, height };
  camera.updateWorldMatrix(true, false);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const point = new THREE.Vector3();
  for (let index = 0; index < 8; index++) {
    point.set(index & 1 ? bounds.max.x : bounds.min.x,
      index & 2 ? bounds.max.y : bounds.min.y, index & 4 ? bounds.max.z : bounds.min.z)
      .applyMatrix4(world).applyMatrix4(camera.matrixWorldInverse);
    if (-point.z <= camera.near) return full;
    point.applyMatrix4(camera.projectionMatrix);
    if (![point.x, point.y].every(Number.isFinite)) return full;
    const x = (point.x + 1) * width / 2, y = (1 - point.y) * height / 2;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const x = Math.max(0, Math.min(width - 1, Math.floor(minX) - guard));
  const y = Math.max(0, Math.min(height - 1, Math.floor(minY) - guard));
  const right = Math.max(x + 1, Math.min(width, Math.ceil(maxX) + guard));
  const bottom = Math.max(y + 1, Math.min(height, Math.ceil(maxY) + guard));
  return { x, y, width: right - x, height: bottom - y };
}

/** Assemble native linear transmission cores on the GPU. No full-frame MSAA or
 * depth buffer, no 8-bit/HDR loss, no scaling, and one shared mip pyramid. */
export function createRefractionAtlas(renderer: THREE.WebGLRenderer, rect: PixelRect, type: THREE.TextureDataType) {
  const target = new THREE.WebGLRenderTarget(rect.width, rect.height, {
    type, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false,
    generateMipmaps: false, minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter, colorSpace: THREE.LinearSRGBColorSpace,
  });
  target.texture.name = 'Full-resolution shared export refraction';
  const uniforms = { source: { value: null as THREE.Texture | null }, uvRect: { value: new THREE.Vector4() } };
  const material = new THREE.RawShaderMaterial({
    name: 'Copy native transmission core', uniforms,
    vertexShader: OutputShader.vertexShader,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform sampler2D source;
      uniform vec4 uvRect;
      varying vec2 vUv;
      void main() { gl_FragColor = texture2D(source, uvRect.xy + vUv * uvRect.zw); }
    `,
    depthTest: false, depthWrite: false, blending: THREE.NoBlending,
  });
  const quad = new FullScreenQuad(material);
  let validated = false;
  return {
    texture: target.texture,
    copy(source: THREE.Texture, tile: MockupCaptureTile, final: boolean) {
      uniforms.source.value = source;
      uniforms.uvRect.value.set(tile.cropX / tile.renderWidth,
        (tile.renderHeight - tile.cropY - tile.height) / tile.renderHeight,
        tile.width / tile.renderWidth, tile.height / tile.renderHeight);
      target.texture.generateMipmaps = final;
      renderer.setRenderTarget(target);
      if (!validated) {
        const gl = renderer.getContext();
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
          throw new Error('This device cannot allocate the full-resolution refraction source for this export.');
        }
        validated = true;
      }
      renderer.setViewport(tile.x, rect.height - tile.y - tile.height, tile.width, tile.height);
      const autoClear = renderer.autoClear;
      try { renderer.autoClear = false; quad.render(renderer); }
      finally { renderer.autoClear = autoClear; }
    },
    dispose() { target.dispose(); quad.dispose(); material.dispose(); },
  };
}
