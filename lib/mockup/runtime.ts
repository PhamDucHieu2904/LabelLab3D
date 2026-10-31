import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { OutputShader } from 'three/examples/jsm/shaders/OutputShader.js';
import { publicUrl } from '../public-url';
import { assetUrl, DEFAULT_VIEWER_PRESENTATION, type ProductAppearance, type ProductAsset } from '../viewer-config';
import { disposeProduct } from '../viewer/appearance';
import type { LiveMaterialOverrides } from '../viewer/material-adjustments';
import { createPooledAppearanceHandle, type PooledAppearanceHandle } from '../viewer/pooled-appearance';
import { createResourcePrefetcher } from '../viewer/resource-prefetch';
import { createDaylightEnvironment } from '../viewer/environment';
import { createProductHitRegion, hitVisibleProduct, visibleProductGestureMeshes } from '../viewer/product-hit-region';
import { renderBottleScene } from '../viewer/bottle-materials';
import { setBottleBackdrop } from '../viewer/bottle-backdrop';
import { setBasilHighBackdrop } from '../viewer/basil-bottle-materials';
import { isBasilHighAsset, basilHighPresentation } from '../viewer/basil-presentation';
import { fitMockupCamera, mockupCameraDirection, mockupOrbitBounds, mockupShowcaseBounds, normalizeMockupAspect, unityMockupCameraFocus } from './camera';
import { UNITY_CAMERA_SMOOTH_TIME, unityCameraDestination, unitySmoothDamp, unitySmoothDampAngle, type UnityCameraPresetId } from './unity-camera-presets';
import { updateMockupProductDepthRange } from './depth-range';
import { MOCKUP_FOCAL_FOV } from './focal-length';
import { centeredMockupCrop, createMockupCaptureGate, createMockupTiles, encodeMockupCanvasPng, flipMockupPixels, mockupAbortError, mockupCaptureSize } from './capture';
import { disposeMockupDetachedTextures, neutralizeMockupLabelArtwork } from './appearance';
import { createBasilNeckExport } from './basil-neck-export';
import { createRefractiveBackdrop, type RefractiveBackdropRegion } from './refractive-backdrop';
import { createExportRefractionSession } from './export-refraction';
import { createRefractionAtlas, projectedRefractionRect } from './refraction-atlas';
import { mockupModelKey, mockupSelectionKey } from './selection';
import { createStudioGround } from '../labellab/studio-ground';
import type { MockupAnimation, MockupBackdropPainter, MockupBackground, MockupCameraPreset, MockupFocalPreset, MockupRuntime, MockupRuntimeOptions, MockupRenderPreviewOptions, MockupStatus } from './contracts';

type LoadedModel = {
  root: THREE.Group; content: THREE.Group; asset: ProductAsset; key: string;
  bounds: THREE.Box3; radius: number; pool: PooledAppearanceHandle;
  recent: (ProductAppearance | undefined)[];
  committedAppearance?: ProductAppearance;
  detachedTextures: Set<THREE.Texture>;
};
const modelKey = mockupModelKey;
const safeColor = (color: string | undefined, fallback: string) => color && /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
const abortable = <T>(promise: Promise<T>, signal: AbortSignal, timeoutMs: number): Promise<T> => new Promise((resolve, reject) => {
  const abort = () => finish(undefined, mockupAbortError());
  const timer = setTimeout(() => finish(undefined, new Error('3D operation timed out')), timeoutMs);
  let done = false;
  function finish(value?: T, error?: unknown) {
    if (done) return;
    done = true; clearTimeout(timer); signal.removeEventListener('abort', abort);
    if (error) reject(error); else resolve(value as T);
  }
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  promise.then(value => finish(value), error => finish(undefined, error));
});

/**
 * Studio owns its camera and motion. Shared appearance/environment modules own
 * their resources. Showcase shares the homepage pose/input without its decorations.
 */
export function createMockupRuntime(host: HTMLDivElement, options: MockupRuntimeOptions): MockupRuntime {
  let settings = DEFAULT_VIEWER_PRESENTATION;
  const mobile = window.matchMedia('(max-width: 760px)').matches;
  const capacity = mobile ? 3 : 5;
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
  const linearType = renderer.extensions.has('EXT_color_buffer_float') ? THREE.HalfFloatType : THREE.UnsignedByteType;
  host.dataset.mockupQuality = linearType === THREE.HalfFloatType ? 'standard' : 'compatible';
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = settings.exposure;
  renderer.setClearColor('#000000', 0);
  renderer.autoClear = true;
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { width: '100%', height: '100%', display: 'block' });
  host.appendChild(canvas);
  const scene = new THREE.Scene();
  const studioGround = createStudioGround(scene);
  let sceneMode: 'website' | 'studio' = 'website';
  let websiteBackground: MockupBackground = { type: 'white' };
  const camera = new THREE.PerspectiveCamera(30, 1, 0.0001, 100);
  camera.zoom = Number.isFinite(options.displayScale)
    ? THREE.MathUtils.clamp(options.displayScale!, 0.5, 2) : 1;
  camera.updateProjectionMatrix();
  camera.position.set(0, 0.01, 0.4);
  // Three caches transmission buffers per camera ID; reuse one export camera
  // so repeated PNG captures do not retain another full-size buffer each time.
  const captureCamera = camera.clone();
  const thumbnailCamera = camera.clone();
  const thumbnailScratch = document.createElement('canvas');
  let thumbnailCanvas: HTMLCanvasElement | null = null;
  let thumbnailOptions: MockupRenderPreviewOptions = {};
  let thumbnailLinear: THREE.WebGLRenderTarget | null = null;
  let thumbnailOutput: THREE.WebGLRenderTarget | null = null;
  let thumbnailAt = -Infinity;
  const product = new THREE.Group(); scene.add(product);
  const hitRegion = createProductHitRegion(host);
  const rest = new THREE.Quaternion().setFromEuler(new THREE.Euler(...settings.pose, 'YXZ'));
  const pose = new THREE.Quaternion(), targetPose = new THREE.Quaternion();
  const spin = new THREE.Quaternion(), dragStep = new THREE.Quaternion(), candidatePose = new THREE.Quaternion();
  const yawAxis = new THREE.Vector3(0, 1, 0), dragAxis = new THREE.Vector3(), up = new THREE.Vector3();
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  const pointers = new Map<number, { x: number; y: number }>();
  let dragging = false, motionTime = 0, lastInputAt = -Infinity, returnElapsed = 0;
  let returnFrom: THREE.Quaternion | null = null;
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minPolarAngle = 0.04; controls.maxPolarAngle = Math.PI - 0.04;
  controls.rotateSpeed = 0.65; controls.zoomSpeed = 0.8;
  // Page scrolling and browser pinch zoom remain available over the preview.
  canvas.style.touchAction = 'pan-y pinch-zoom';
  const lights = settings.lights.map(light => {
    const result = light.type === 'hemisphere' ? new THREE.HemisphereLight(light.color, light.groundColor, light.intensity)
      : new THREE.DirectionalLight(light.color, light.intensity);
    scene.add(result); return result;
  });
  const pmrem = new THREE.PMREMGenerator(renderer);
  const draco = new DRACOLoader().setDecoderPath(publicUrl(settings.decoders.dracoPath)).setWorkerLimit(2);
  const basis = new KTX2Loader().setTranscoderPath(publicUrl(settings.decoders.basisPath)).setWorkerLimit(2).detectSupport(renderer);
  const loader = new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(basis).setMeshoptDecoder(MeshoptDecoder);
  const captureGate = createMockupCaptureGate();
  const prefetch = createResourcePrefetcher({ maxCandidates: capacity, onDiagnostics(value) {
    host.dataset.prefetchFiles = String(value.entries); host.dataset.prefetchBytes = String(value.bytes);
  } });
  prefetch.setEnabled(false);
  let disposed = false;
  let contextLost = false;
  let visible = true;
  let revision = 0;
  let readyRevision = -1;
  let active: LoadedModel | null = null;
  let cached: LoadedModel | null = null;
  const candidates = new Set<LoadedModel>();
  const discarded = new WeakSet<LoadedModel>();
  let desired: { asset: ProductAsset; appearance?: ProductAppearance; frontYaw: number } | null = null;
  let queuedSelection: { asset: ProductAsset; appearance?: ProductAppearance; frontYaw: number } | null = null;
  let desiredKey = '';
  let materialOverrides: LiveMaterialOverrides = {};
  let request: AbortController | null = null;
  let exportAbort: AbortController | null = null;
  let aspect = 1;
  let fitDistance = 0.4;
  let animation: MockupAnimation = { mode: 'off', speed: 1, playing: false };
  let focal: MockupFocalPreset = 'standard';
  let cameraTransition: {
    fromPosition: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toPosition: THREE.Vector3;
    toTarget: THREE.Vector3;
    fromFov: number;
    toFov: number;
    startedAt: number;
    duration: number;
    unity?: {
      yaw: number; pitch: number; distance: number;
      toYaw: number; toPitch: number;
      yawVelocity: number; pitchVelocity: number; distanceVelocity: number; fovVelocity: number;
      targetVelocity: THREE.Vector3;
    };
  } | null = null;
  let raf = 0;
  let dirty = true;
  let lastTime = performance.now();
  let lastDraw = 0;
  let environmentTarget: THREE.WebGLRenderTarget | null = null;
  let environmentRevision = 0;
  let previewTarget: THREE.WebGLRenderTarget | null = null;
  let studioMatteTarget: THREE.WebGLRenderTarget | null = null;
  let statusPhase: MockupStatus['phase'] = 'loading-model';
  let renderFrames = 0;
  let lastFrameMs = 0;
  let diagnosticsAt = 0;
  const warmedTextures = new WeakSet<THREE.Texture>();

  // Preview and PNG share one output stage. Scene radiance is linear half float;
  // this final stage applies the runtime's exact tone map and sRGB transfer once.
  // MSAA resolves transparent edges as premultiplied radiance, so unpremultiply
  // before nonlinear tone/color transforms, then compose the chosen background.
  const outputUniforms = {
    ...THREE.UniformsUtils.clone(OutputShader.uniforms),
    backgroundTop: { value: new THREE.Color('#ffffff') },
    backgroundBottom: { value: new THREE.Color('#ffffff') },
    backgroundAlpha: { value: 1 },
    outputRegion: { value: new THREE.Vector4(0, 0, 1, 1) },
    studioMatte: { value: null as THREE.Texture | null },
    studioMatteEnabled: { value: 0 },
    basilNeckEnabled: { value: 0 },
    basilNeckRadiance: { value: null as THREE.Texture | null },
    basilNeckCoverage: { value: null as THREE.Texture | null },
  };
  const outputMaterial = new THREE.RawShaderMaterial({
    name: 'Mockup PNG output', uniforms: outputUniforms,
    vertexShader: OutputShader.vertexShader,
    fragmentShader: OutputShader.fragmentShader
      .replace('uniform sampler2D tDiffuse;', 'uniform sampler2D tDiffuse;\nuniform sampler2D studioMatte;\nuniform float studioMatteEnabled;\nuniform vec3 backgroundTop;\nuniform vec3 backgroundBottom;\nuniform float backgroundAlpha;\nuniform vec4 outputRegion;\nuniform float basilNeckEnabled;\nuniform sampler2D basilNeckRadiance;\nuniform sampler2D basilNeckCoverage;')
      .replace('gl_FragColor = texture2D( tDiffuse, vUv );', 'gl_FragColor = texture2D( tDiffuse, vUv );\nif (gl_FragColor.a > 0.00001) gl_FragColor.rgb /= gl_FragColor.a; else gl_FragColor.rgb = vec3(0.0);')
      .replace('// color space', `
        // GlassNeckExportScope: tone radiance first, then reserve its alpha
        // carrier and replace only the visible neck mask in premultiplied space.
        if (basilNeckEnabled > .5) {
          vec4 neck = texture2D(basilNeckRadiance, vUv);
          vec3 radiance = ACESFilmicToneMapping(neck.rgb);
          float carrier = clamp(max(neck.a, max(max(radiance.r, radiance.g), radiance.b)), 0.0, 1.0);
          vec3 mask = texture2D(basilNeckCoverage, vUv).rgb;
          float coverage = clamp(max(max(mask.r, mask.g), mask.b), 0.0, 1.0);
          if (coverage > 1.0 / 255.0) {
            float alpha = mix(gl_FragColor.a, carrier, coverage);
            vec3 premultiplied = mix(gl_FragColor.rgb * gl_FragColor.a, radiance, coverage);
            gl_FragColor = vec4(alpha > .00001 ? premultiplied / alpha : vec3(0.0), alpha);
          }
        }
        // color space`)
      .replace(/\}\s*$/, '\nvec3 backdrop = studioMatteEnabled > .5 ? texture2D(studioMatte, vUv).rgb : mix(backgroundBottom, backgroundTop, outputRegion.y + vUv.y * outputRegion.w);\n#ifdef SRGB_TRANSFER\nbackdrop = sRGBTransferOETF(vec4(backdrop, 1.0)).rgb;\n#endif\nif (backgroundAlpha > 0.5) { gl_FragColor.rgb = mix(backdrop, gl_FragColor.rgb, gl_FragColor.a); gl_FragColor.a = 1.0; }\n}'),
    defines: { NEUTRAL_TONE_MAPPING: '', SRGB_TRANSFER: '' },
    depthTest: false, depthWrite: false, blending: THREE.NoBlending,
  });
  const outputQuad = new FullScreenQuad(outputMaterial);
  const neckExport = createBasilNeckExport(renderer);
  const previewBackdrop = createRefractiveBackdrop();
  const thumbnailBackdrop = createRefractiveBackdrop(384);
  const captureBackdrop = createRefractiveBackdrop(1536);
  let frozenCaptureBackdrop: THREE.Texture | null = null;
  const captureBackdropRegion = new THREE.Vector4();
  const sampleDiagnostics = () => {
    host.dataset.renderFrames = String(renderFrames); host.dataset.frameMs = lastFrameMs.toFixed(2);
    host.dataset.cameraNear = String(camera.near); host.dataset.cameraFar = String(camera.far);
    host.dataset.geometryCount = String(renderer.info.memory.geometries); host.dataset.textureCount = String(renderer.info.memory.textures);
    diagnosticsAt = performance.now();
  };
  const emit = (phase: MockupStatus['phase'], error?: MockupStatus['error'], message?: string) => {
    statusPhase = phase; host.dataset.mockupPhase = phase; host.dataset.viewerReady = phase === 'ready' ? 'true' : 'false';
    host.dataset.modelPoolSize = String(Number(Boolean(active)) + Number(Boolean(cached)) + candidates.size);
    sampleDiagnostics();
    if (!disposed) options.onStatus({ phase, assetId: desired?.asset.id ?? '', appearanceId: desired?.appearance?.id ?? '', selectionKey: desiredKey, revision, hasProduct: Boolean(active), materials: phase === 'ready' ? active?.pool.materialValues?.() : undefined, error, message });
  };
  const isVisible = () => !disposed && !contextLost && visible && !document.hidden;
  const moving = () => Boolean(active) && !captureGate.busy && (Boolean(cameraTransition)
    || animation.playing && animation.mode !== 'off'
    || animation.mode === 'showcase' && (dragging || Boolean(returnFrom) || pose.angleTo(targetPose) > 0.00001 && Number.isFinite(lastInputAt)));
  const requestRender = () => {
    dirty = true;
    if (!raf && isVisible() && !captureGate.busy) raf = requestAnimationFrame(frame);
  };
  const pauseFromInteraction = (manual = true) => {
    const wasPlaying = animation.playing;
    if (animation.mode !== 'showcase') {
      if (wasPlaying) animation = { ...animation, playing: false };
      if (manual || wasPlaying) options.onInteraction?.();
    }
    lastTime = performance.now(); requestRender();
  };
  const createLinearTarget = (width: number, height: number) => new THREE.WebGLRenderTarget(width, height, {
    type: linearType, format: THREE.RGBAFormat, depthBuffer: true,
    samples: Math.min(4, renderer.capabilities.maxSamples),
  });
  const renderTo = (linear: THREE.WebGLRenderTarget, output: THREE.WebGLRenderTarget | null, view: THREE.PerspectiveCamera, transparent = false,
    backdropSurface = previewBackdrop, paintBackground: MockupBackdropPainter | undefined = options.paintBackground, backdropRegion?: RefractiveBackdropRegion) => {
    const region = outputUniforms.outputRegion.value;
    if (backdropRegion) region.set(backdropRegion.x / backdropRegion.fullWidth,
      (backdropRegion.fullHeight - backdropRegion.y - backdropRegion.height) / backdropRegion.fullHeight,
      backdropRegion.width / backdropRegion.fullWidth, backdropRegion.height / backdropRegion.fullHeight);
    else region.set(0, 0, 1, 1);
    // Each live/thumbnail/export camera needs precision at its current distance,
    // including every frame while a Unity view is still moving. active.bounds
    // already includes the authored front yaw; only its animated parent remains.
    if (active) {
      product.updateWorldMatrix(true, false);
      updateMockupProductDepthRange(view, active.bounds, product.matrixWorld, active.radius);
    }
    // Render the display matte separately: white/grid must bypass product HDR
    // exposure and ACES/Neutral curves, including in exported PNGs.
    outputUniforms.studioMatteEnabled.value = 0;
    const previousBackgroundAlpha = outputUniforms.backgroundAlpha.value;
    if (transparent) { outputUniforms.backgroundAlpha.value = 0; studioGround.setVisible(false); }
    const studio = sceneMode === 'studio' && !transparent;
    const background = scene.background;
    const fog = scene.fog;
    if (transparent) { scene.background = null; scene.fog = null; }
    if (studio) {
      if (!studioMatteTarget) studioMatteTarget = createLinearTarget(linear.width, linear.height);
      else studioMatteTarget.setSize(linear.width, linear.height);
      const previousToneMapping = renderer.toneMapping;
      const productVisible = product.visible;
      const productNear = view.near;
      try {
        product.visible = false;
        // The floor extends towards the eye. Give only this separate matte pass
        // its close near plane; the print/glass pass keeps its precise product
        // range. Changing Z clipping leaves camera rays and tile offsets intact.
        view.near = Math.min(productNear, Math.max(0.00001, (active?.radius ?? 0.02) * 0.005));
        if (view.near !== productNear) view.updateProjectionMatrix();
        renderer.toneMapping = THREE.NoToneMapping;
        renderer.setRenderTarget(studioMatteTarget); renderer.clear(); renderer.render(scene, view);
        outputUniforms.studioMatte.value = studioMatteTarget.texture;
        outputUniforms.studioMatteEnabled.value = 1;
      } finally {
        if (view.near !== productNear) { view.near = productNear; view.updateProjectionMatrix(); }
        product.visible = productVisible;
        renderer.toneMapping = previousToneMapping;
      }
      studioGround.setVisible(false);
      scene.background = null;
    }
    try {
    // Enhanced Graphics uses the actual backdrop as the transmitted light
    // reservoir. Without it, Basil's water falls back to opaque white lighting.
    const refractive = active?.asset.packaging === 'glass' || active?.asset.packaging === 'pet';
    const opticalBackdrop = !transparent && refractive
      ? frozenCaptureBackdrop ?? (studio ? studioMatteTarget?.texture ?? null
        : paintBackground ? backdropSurface.update(linear.width, linear.height, paintBackground, backdropRegion) : null
        )
      : null;
    if (frozenCaptureBackdrop && backdropRegion) captureBackdropRegion.copy(region);
    else captureBackdropRegion.set(0, 0, 1, 1);
    setBottleBackdrop(scene, opticalBackdrop, captureBackdropRegion);
    if (backdropSurface === previewBackdrop) host.dataset.backdropRefraction = opticalBackdrop ? 'true' : 'false';
    // The High integrator sees the selected studio matte before the final output pass.
    const solid = outputUniforms.backgroundAlpha.value > .5;
    setBasilHighBackdrop(scene, null, solid ? outputUniforms.backgroundTop.value : null,
      solid ? outputUniforms.backgroundBottom.value : null, !solid);
    const nativeNeck = !solid && isBasilHighAsset(active?.asset);
    const neckMeshes: THREE.Mesh[] = [];
    if (nativeNeck) scene.traverseVisible(node => {
      if (node instanceof THREE.Mesh && (Array.isArray(node.material) ? node.material : [node.material]).some(material => material.name === 'basil-high-neck')) neckMeshes.push(node);
    });
    outputUniforms.basilNeckEnabled.value = 0;
    outputUniforms.basilNeckRadiance.value = null;
    outputUniforms.basilNeckCoverage.value = null;
    if (!nativeNeck) neckExport.release();
    renderer.setRenderTarget(linear); renderer.setClearColor('#000000', 0); renderer.clear();
    try {
      neckMeshes.forEach(mesh => { mesh.visible = false; });
      renderBottleScene(renderer, scene, view);
    } finally {
      neckMeshes.forEach(mesh => { mesh.visible = true; });
    }
    if (nativeNeck) {
      const native = neckExport.render(scene, view, linear.width, linear.height);
      if (native) {
        outputUniforms.basilNeckEnabled.value = 1;
        outputUniforms.basilNeckRadiance.value = native.radiance;
        outputUniforms.basilNeckCoverage.value = native.coverage;
      }
    }
    outputUniforms.tDiffuse.value = linear.texture;
    outputUniforms.toneMappingExposure.value = renderer.toneMappingExposure;
    renderer.setRenderTarget(output); renderer.clear(); outputQuad.render(renderer);
    } finally {
      if (studio) { studioGround.setVisible(true); scene.background = background; }
      if (transparent) {
        outputUniforms.backgroundAlpha.value = previousBackgroundAlpha;
        scene.background = background; scene.fog = fog;
        studioGround.setVisible(sceneMode === 'studio');
      }
    }
  };

  // This is the same off-axis crop for both the thumbnail and every export tile.
  // Camera position, target, zoom, FOV and product pose are copied without a fit.
  const frameCamera = (view: THREE.PerspectiveCamera, width: number, height: number, targetAspect: number) => {
    const sourceWidth = Math.max(1, host.clientWidth), sourceHeight = Math.max(1, host.clientHeight);
    const crop = centeredMockupCrop(sourceWidth, sourceHeight, targetAspect);
    const scale = height / crop.height;
    view.copy(camera, false);
    view.clearViewOffset();
    // One scale on both axes preserves the camera rays at rounded output sizes.
    const fullWidth = sourceWidth * scale, fullHeight = sourceHeight * scale;
    const offsetX = crop.x * scale + (crop.width * scale - width) / 2;
    return { fullWidth, fullHeight, offsetX, offsetY: crop.y * scale };
  };
  const paintThumbnail = (now: number, force = false) => {
    if (!thumbnailCanvas || !active || readyRevision !== revision || !force && now - thumbnailAt < 100) return;
    const ratio = normalizeMockupAspect(thumbnailOptions.aspect ?? aspect);
    const size = mockupCaptureSize(384, ratio);
    thumbnailCanvas.width = size.width; thumbnailCanvas.height = size.height;
    const context = thumbnailCanvas.getContext('2d');
    const scratch = thumbnailScratch.getContext('2d');
    if (!context || !scratch) return;
    if (!thumbnailLinear) thumbnailLinear = createLinearTarget(size.width, size.height);
    else thumbnailLinear.setSize(size.width, size.height);
    if (!thumbnailOutput) thumbnailOutput = new THREE.WebGLRenderTarget(size.width, size.height, { depthBuffer: false });
    else thumbnailOutput.setSize(size.width, size.height);
    const frame = frameCamera(thumbnailCamera, size.width, size.height, ratio);
    thumbnailCamera.setViewOffset(frame.fullWidth, frame.fullHeight, frame.offsetX, frame.offsetY, size.width, size.height);
    const previousTarget = renderer.getRenderTarget();
    const previousViewport = renderer.getViewport(new THREE.Vector4());
    try {
      renderTo(thumbnailLinear, thumbnailOutput, thumbnailCamera, thumbnailOptions.transparent, thumbnailBackdrop, thumbnailOptions.paintBackground);
      const pixels = new Uint8Array(size.width * size.height * 4);
      renderer.readRenderTargetPixels(thumbnailOutput, 0, 0, size.width, size.height, pixels);
      thumbnailScratch.width = size.width; thumbnailScratch.height = size.height;
      scratch.putImageData(new ImageData(flipMockupPixels(pixels, size.width, size.height), size.width, size.height), 0, 0);
      thumbnailOptions.paintBackground?.(context, size.width, size.height);
      context.drawImage(thumbnailScratch, 0, 0);
      thumbnailAt = now;
    } finally { renderer.setRenderTarget(previousTarget); renderer.setViewport(previousViewport); }
  };
  function frame(now: number) {
    raf = 0;
    if (!isVisible() || captureGate.busy) return;
    const dt = Math.min(0.06, Math.max(0, (now - lastTime) / 1000)); lastTime = now;
    const transitionAtFrame = cameraTransition;
    if (transitionAtFrame) {
      const transition = transitionAtFrame;
      let complete = false;
      if (transition.unity) {
        const state = transition.unity;
        const yaw = unitySmoothDampAngle(state.yaw, state.toYaw, state.yawVelocity, UNITY_CAMERA_SMOOTH_TIME, dt);
        const pitch = unitySmoothDampAngle(state.pitch, state.toPitch, state.pitchVelocity, UNITY_CAMERA_SMOOTH_TIME, dt);
        const distance = unitySmoothDamp(state.distance, transition.toPosition.distanceTo(transition.toTarget), state.distanceVelocity, UNITY_CAMERA_SMOOTH_TIME, dt);
        const lens = unitySmoothDamp(camera.fov, transition.toFov, state.fovVelocity, UNITY_CAMERA_SMOOTH_TIME, dt);
        state.yaw = yaw.value; state.yawVelocity = yaw.velocity;
        state.pitch = pitch.value; state.pitchVelocity = pitch.velocity;
        state.distance = distance.value; state.distanceVelocity = distance.velocity; state.fovVelocity = lens.velocity;
        for (const axis of ['x', 'y', 'z'] as const) {
          const pan = unitySmoothDamp(controls.target[axis], transition.toTarget[axis], state.targetVelocity[axis], UNITY_CAMERA_SMOOTH_TIME, dt);
          controls.target[axis] = pan.value; state.targetVelocity[axis] = pan.velocity;
        }
        const yawRadians = THREE.MathUtils.degToRad(state.yaw), pitchRadians = THREE.MathUtils.degToRad(state.pitch);
        camera.position.set(Math.sin(yawRadians) * Math.cos(pitchRadians), Math.sin(pitchRadians), Math.cos(yawRadians) * Math.cos(pitchRadians))
          .multiplyScalar(state.distance).add(controls.target);
        camera.fov = lens.value;
        complete = camera.position.distanceTo(transition.toPosition) < 0.000001
          && controls.target.distanceTo(transition.toTarget) < 0.000001 && Math.abs(camera.fov - transition.toFov) < 0.0001;
        if (complete) {
          camera.position.copy(transition.toPosition); controls.target.copy(transition.toTarget); camera.fov = transition.toFov;
          host.dataset.cameraPresetState = 'settled';
          host.dataset.cameraPosition = JSON.stringify(camera.position.toArray());
          host.dataset.cameraTarget = JSON.stringify(controls.target.toArray());
          host.dataset.productPose = JSON.stringify(product.quaternion.toArray());
        }
        host.dataset.cameraFov = String(camera.fov);
      } else {
        const progress = THREE.MathUtils.clamp((now - transition.startedAt) / transition.duration, 0, 1);
        const eased = progress * progress * (3 - 2 * progress);
        camera.position.lerpVectors(transition.fromPosition, transition.toPosition, eased);
        controls.target.lerpVectors(transition.fromTarget, transition.toTarget, eased);
        camera.fov = THREE.MathUtils.lerp(transition.fromFov, transition.toFov, eased);
        complete = progress >= 1;
      }
      camera.updateProjectionMatrix();
      camera.lookAt(controls.target);
      controls.update();
      dirty = true;
      if (complete) cameraTransition = null;
    }
    if (moving()) {
      if (animation.mode === 'showcase') {
        motionTime += dt;
        if (dragging) pose.slerp(targetPose, 1 - Math.exp(-dt * 14));
        else if (returnFrom) {
          returnElapsed += dt;
          const t = Math.min(1, returnElapsed / settings.motion.settleSeconds);
          pose.copy(returnFrom).slerp(rest, t * t * t * (10 + t * (-15 + 6 * t)));
          if (t === 1) { returnFrom = null; lastInputAt = -Infinity; targetPose.copy(pose); }
        } else if (animation.playing && Number.isFinite(lastInputAt) && motionTime - lastInputAt >= settings.motion.returnDelay) {
          returnFrom = pose.clone(); returnElapsed = 0;
        } else if (animation.playing && !Number.isFinite(lastInputAt)) {
          pose.multiply(spin.setFromAxisAngle(yawAxis, dt * animation.speed * settings.motion.idleSpeed));
        } else pose.slerp(targetPose, 1 - Math.exp(-dt * 10));
        product.quaternion.copy(pose);
      } else if (animation.mode === 'turntable' && animation.playing) product.rotation.y = (product.rotation.y + dt * animation.speed * 0.65) % (Math.PI * 2);
      dirty = true;
    }
    if (dirty && previewTarget && now - lastDraw >= 1000 / (mobile ? 30 : 60)) {
      const started = performance.now();
      hitRegion.update(animation.mode === 'showcase' ? active?.root ?? null : null, camera, host.clientWidth, host.clientHeight, now, dragging);
      renderTo(previewTarget, null, camera);
      paintThumbnail(now);
      lastFrameMs = performance.now() - started; renderFrames++;
      if (now - diagnosticsAt >= 1000) sampleDiagnostics();
      lastDraw = now; dirty = false;
    }
    // OrbitControls may request a frame from its synchronous change event.
    // Reuse that request instead of starting a second animation chain.
    // The transition branch already synchronizes OrbitControls after moving
    // the camera. Avoid damping it twice in the same frame.
    const controlsMoving = transitionAtFrame ? false : controls.update();
    if ((moving() || controlsMoving || dirty) && !raf) raf = requestAnimationFrame(frame);
  }
  const fit = (preset?: MockupCameraPreset, animate = false, targetFov = camera.fov, transitionDuration = 660) => {
    if (!active) return;
    const authored = preset?.startsWith('view-') ? unityCameraDestination(preset as UnityCameraPresetId) : undefined;
    if (authored) targetFov = authored.fieldOfView;
    const direction = sceneMode === 'studio' && preset === 'three-quarter' ? new THREE.Vector3(Math.sin(Math.PI / 4) * Math.cos(.34), Math.sin(.34), Math.cos(Math.PI / 4) * Math.cos(.34))
      : preset === 'front' && animation.mode === 'showcase' ? new THREE.Vector3(0, 0, 1)
      : preset ? mockupCameraDirection(preset)
      : camera.position.clone().sub(controls.target).normalize();
    const tilted = animation.mode === 'showcase' || Math.abs(product.rotation.x) + Math.abs(product.rotation.z) > 0.00001;
    const bounds = tilted ? mockupShowcaseBounds(active.bounds, animation.mode === 'showcase' ? rest : product.quaternion) : mockupOrbitBounds(active.bounds);
    const nextDistance = authored ? authored.distanceMetres : fitMockupCamera(bounds, direction, aspect, targetFov);
    const ratio = preset ? 1 : camera.position.distanceTo(controls.target) / Math.max(fitDistance, 0.0001);
    fitDistance = nextDistance;
    const nextTarget = authored ? unityMockupCameraFocus(active.bounds, active.asset.src) : active.bounds.getCenter(new THREE.Vector3());
    const nextPosition = nextTarget.clone().addScaledVector(direction, nextDistance * Math.min(6, Math.max(0.45, ratio)));
    controls.minDistance = Math.max(active.radius * 1.1, nextDistance * 0.35);
    controls.maxDistance = nextDistance * 6;
    // Keep the full 12–20 m ground fade inside the frustum. Actual-metre
    // bottles otherwise fit with a 10 m far plane and expose a hard grid edge.
    camera.far = Math.max(sceneMode === 'studio' ? 30 : 10, nextDistance * 30);
    if (!animate) {
      camera.fov = targetFov;
      camera.updateProjectionMatrix();
    }
    if (animate && (preset || Math.abs(targetFov - camera.fov) > 0.001)) {
      const prior = cameraTransition?.unity;
      const relative = camera.position.clone().sub(controls.target);
      cameraTransition = {
        fromPosition: camera.position.clone(), fromTarget: controls.target.clone(),
        toPosition: nextPosition, toTarget: nextTarget,
        fromFov: camera.fov, toFov: targetFov,
        startedAt: performance.now(), duration: transitionDuration,
        ...(authored ? { unity: {
          yaw: THREE.MathUtils.radToDeg(Math.atan2(relative.x, relative.z)),
          pitch: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(relative.y / Math.max(relative.length(), 0.000001), -1, 1))),
          distance: relative.length(), toYaw: authored.yawDegrees, toPitch: authored.pitchDegrees,
          yawVelocity: prior?.yawVelocity ?? 0, pitchVelocity: prior?.pitchVelocity ?? 0,
          distanceVelocity: prior?.distanceVelocity ?? 0, fovVelocity: prior?.fovVelocity ?? 0,
          targetVelocity: prior?.targetVelocity.clone() ?? new THREE.Vector3(),
        } } : {}),
      };
    } else {
      cameraTransition = null;
      controls.target.copy(nextTarget); camera.position.copy(nextPosition);
      camera.lookAt(controls.target); controls.update();
    }
    if (authored) {
      host.dataset.cameraPreset = preset;
      host.dataset.cameraPresetState = animate ? 'moving' : 'settled';
      host.dataset.cameraFov = String(camera.fov);
      if (!animate) {
        host.dataset.cameraPosition = JSON.stringify(camera.position.toArray());
        host.dataset.cameraTarget = JSON.stringify(controls.target.toArray());
        host.dataset.productPose = JSON.stringify(product.quaternion.toArray());
      }
    }
    requestRender();
  };
  const resize = () => {
    if (disposed || captureGate.busy) return;
    const width = Math.max(1, Math.round(host.clientWidth));
    const height = Math.max(1, Math.round(width / aspect));
    const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.5);
    renderer.setPixelRatio(dpr); renderer.setSize(width, height, false);
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    if (!previewTarget) previewTarget = createLinearTarget(size.x, size.y); else previewTarget.setSize(size.x, size.y);
    camera.aspect = aspect; camera.updateProjectionMatrix(); fit(); requestRender();
  };
  const discard = (model: LoadedModel | null) => {
    if (!model || discarded.has(model)) return;
    discarded.add(model);
    candidates.delete(model); model.root.removeFromParent(); model.pool.dispose(); disposeProduct(model.root); disposeMockupDetachedTextures(model.detachedTextures);
  };
  const recycle = (model: LoadedModel | null) => {
    if (!model) return;
    model.root.removeFromParent(); model.pool.dispose(); model.recent = [];
    if (mobile || disposed) { discarded.add(model); disposeProduct(model.root); disposeMockupDetachedTextures(model.detachedTextures); return; }
    discard(cached); cached = model;
  };
  const warmup = async (root: THREE.Object3D, isCurrent: () => boolean) => {
    const textures = new Set<THREE.Texture>();
    root.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        Object.values(material).forEach(value => { if (value instanceof THREE.Texture) textures.add(value); });
      }
    });
    for (const texture of textures) {
      if (disposed || !isCurrent()) return;
      if (!warmedTextures.has(texture)) { renderer.initTexture(texture); warmedTextures.add(texture); }
    }
    if (!disposed && isCurrent()) {
      const previous = renderer.getRenderTarget();
      // Prepare the linear offscreen variant used by both preview and capture.
      // Compiling against the default framebuffer would warm a different shader.
      // r180 compileAsync keeps uninterruptible timers that can dereference
      // disposed material/renderer properties after navigation or context loss.
      // Owned synchronous preparation plus the first draw before ready avoids
      // those orphaned polls while keeping texture/shader work out of animation.
      try { renderer.setRenderTarget(previewTarget); renderer.compile(root, camera, scene); }
      finally { renderer.setRenderTarget(previous); }
    }
  };
  const createPool = (content: THREE.Group, asset: ProductAsset) => createPooledAppearanceHandle(content, asset, {
    editable: true,
    capacity, acquireUrl: prefetch.acquireUrl, warmup,
    onChange(ready, pending) { host.dataset.labelPoolReady = String(ready); host.dataset.labelPoolPending = String(pending); },
  });
  const loadEnvironment = async () => {
    const thisRevision = ++environmentRevision;
    let texture: THREE.Texture;
    try {
      const source = settings.environment.src;
      texture = await (/\.exr(?:\?|$)/i.test(source) ? new EXRLoader() : new HDRLoader()).loadAsync(publicUrl(source));
    } catch { texture = createDaylightEnvironment(settings.environment.procedural); }
    if (disposed || thisRevision !== environmentRevision) { texture.dispose(); return; }
    try {
      const target = pmrem.fromEquirectangular(texture);
      environmentTarget?.dispose(); environmentTarget = target;
      scene.environment = target.texture; scene.environmentIntensity = settings.environment.intensity;
      scene.environmentRotation.set(...settings.environment.rotation);
      host.dataset.environment = 'ready'; requestRender();
    } finally { texture.dispose(); }
  };
  let environmentReady = loadEnvironment();
  const select = (asset: ProductAsset, appearance?: ProductAppearance, frontYaw = 0) => {
    if (disposed) return;
    if (contextLost || captureGate.busy) { queuedSelection = { asset, appearance, frontYaw }; return; }
    const nextKey = mockupSelectionKey(asset, appearance, frontYaw);
    if (nextKey === desiredKey && readyRevision === revision && statusPhase === 'ready') { emit('ready'); return; }
    desired = { asset, appearance, frontYaw: Number.isFinite(frontYaw) ? frontYaw : 0 }; desiredKey = nextKey;
    const nextSettings = isBasilHighAsset(asset) ? basilHighPresentation() : DEFAULT_VIEWER_PRESENTATION;
    if (settings.environment.src !== nextSettings.environment.src) {
      settings = nextSettings;
      renderer.toneMapping = settings.toneMapping === 'aces' ? THREE.ACESFilmicToneMapping : THREE.NeutralToneMapping;
      renderer.toneMappingExposure = settings.exposure;
      outputMaterial.defines = { [settings.toneMapping === 'aces' ? 'ACES_FILMIC_TONE_MAPPING' : 'NEUTRAL_TONE_MAPPING']: '', SRGB_TRANSFER: '' };
      outputMaterial.needsUpdate = true;
      lights.forEach((light, index) => { light.color.set(settings.lights[index].color); light.intensity = settings.lights[index].intensity; });
      environmentReady = loadEnvironment();
    }
    if (pointers.size) cancelPointers();
    const thisRevision = ++revision;
    request?.abort(); request = new AbortController(); const signal = request.signal;
    // Invalidate an older label request on the outgoing model. Its stable cached
    // appearance remains visible while a different model or label is preparing.
    if (active) void active.pool.apply(active.committedAppearance).catch(() => {});
    const current = () => !disposed && !signal.aborted && revision === thisRevision;
    readyRevision = -1; prefetch.setEnabled(false); pauseFromInteraction(false);
    const started = performance.now();
    emit(active?.key === modelKey(asset) ? 'loading-label' : 'loading-model');
    void (async () => {
      let candidate: LoadedModel | null = null;
      let failure: MockupStatus['error'] = 'model';
      try {
        const key = modelKey(asset);
        if (active?.key === key) candidate = active;
        else if (cached?.key === key) {
          candidate = cached; cached = null; candidate.pool = createPool(candidate.content, asset); candidates.add(candidate);
        } else {
          // Keep one outgoing model and one replacement, never a third idle GLB.
          discard(cached); cached = null;
          const src = assetUrl(asset.src);
          if (!src) throw new Error('Invalid model URL');
          const lease = prefetch.acquireUrl(src);
          let gltf;
          try {
            const download = new AbortController();
            const cancelDownload = () => download.abort();
            signal.addEventListener('abort', cancelDownload, { once: true });
            let buffer: ArrayBuffer;
            try {
              const response = await abortable(fetch(lease.url, { signal: download.signal, credentials: 'same-origin' }), signal, 30000);
              if (!response.ok) throw new Error('Model download failed');
              buffer = await abortable(response.arrayBuffer(), signal, 30000);
            } finally {
              signal.removeEventListener('abort', cancelDownload); download.abort();
            }
            const parsing = loader.parseAsync(buffer, THREE.LoaderUtils.extractUrlBase(publicUrl(src)));
            // parse/decode cannot be aborted by GLTFLoader; late results retain an
            // explicit owner and are disposed even after timeout/navigation.
            let abandonParsing = false;
            parsing.then(result => { if (!current() || abandonParsing) disposeProduct(result.scene); }, () => {});
            try { gltf = await abortable(parsing, signal, 45000); } catch (error) { abandonParsing = true; throw error; }
          } finally { lease.release(); }
          if (!current()) return;
          const unwanted: THREE.Object3D[] = [];
          gltf.scene.traverse(node => { if (node instanceof THREE.Light || node instanceof THREE.Camera) unwanted.push(node); });
          unwanted.forEach(node => node.removeFromParent());
          const content = new THREE.Group(); content.add(gltf.scene);
          if (asset.orientation) content.rotation.set(...asset.orientation);
          content.updateMatrixWorld(true);
          const original = new THREE.Box3().setFromObject(content);
          const size = original.getSize(new THREE.Vector3());
          if (!Number.isFinite(size.length()) || size.length() <= 0) { disposeProduct(content); throw new Error('Model has empty bounds'); }
          content.position.sub(original.getCenter(new THREE.Vector3())); content.updateMatrixWorld(true);
          const bounds = new THREE.Box3().setFromObject(content);
          const root = new THREE.Group(); root.add(content);
          const detachedTextures = neutralizeMockupLabelArtwork(content, asset);
          candidate = { root, content, bounds, radius: bounds.getBoundingSphere(new THREE.Sphere()).radius,
            asset, key, pool: createPool(content, asset), recent: [], detachedTextures };
          candidates.add(candidate);
        }
        if (!current()) { if (candidate !== active) discard(candidate); return; }
        emit('preparing');
        await abortable(environmentReady, signal, 45000);
        if (!current()) { if (candidate !== active) discard(candidate); return; }
        failure = 'label'; emit(appearance ? 'loading-label' : 'preparing');
        const appearanceKey = JSON.stringify(appearance ?? null);
        candidate.recent = [appearance, ...candidate.recent.filter(value => JSON.stringify(value ?? null) !== appearanceKey)].slice(0, capacity);
        candidate.pool.setWindow(candidate.recent);
        host.dataset.labelCacheHit = candidate.pool.has(appearance) ? 'true' : 'false';
        await abortable(candidate.pool.apply(appearance), signal, 45000);
        if (!current()) { if (candidate !== active) discard(candidate); return; }
        emit('preparing');
        const changingModel = candidate !== active;
        if (changingModel) {
          recycle(active); active = candidate; candidates.delete(candidate); product.add(candidate.root);
          product.quaternion.copy(sceneMode !== 'studio' && animation.mode === 'showcase' ? rest : new THREE.Quaternion());
          pose.copy(product.quaternion); targetPose.copy(pose); lastInputAt = -Infinity; returnFrom = null;
        }
        candidate.asset = asset; candidate.root.rotation.y = desired!.frontYaw; candidate.committedAppearance = appearance;
        candidate.pool.setLiveOverrides?.(materialOverrides);
        // Bounds belong to the upright model, not its currently animated parent.
        // Otherwise a label switch would bake today's tilt/yaw into future lens fits.
        candidate.root.removeFromParent(); candidate.root.updateMatrixWorld(true);
        candidate.bounds = new THREE.Box3().setFromObject(candidate.root);
        product.add(candidate.root); product.updateMatrixWorld(true);
        studioGround.setFloorY(candidate.bounds.min.y);
        studioGround.setRadius(candidate.radius);
        lights.forEach((light, index) => light.position.set(...settings.lights[index].position).multiplyScalar(candidate!.radius));
        if (changingModel) fit(sceneMode === 'studio' ? 'view-4' : animation.mode === 'showcase' ? 'front' : 'view-1'); else requestRender();
        // The shared pool prepared textures and shaders against the ready studio
        // environment before commit. Render that revision before capture becomes ready.
        if (previewTarget && isVisible()) { renderTo(previewTarget, null, camera); renderFrames++; }
        readyRevision = thisRevision; host.dataset.labelSwitchMs = String(Math.round(performance.now() - started));
        host.dataset.productId = asset.id; emit('ready'); requestRender();
        prefetch.configure(candidate.recent.map(value => ({ asset, appearance: value })));
        prefetch.setEnabled(isVisible());
      } catch (error) {
        if (candidate && candidate !== active) discard(candidate);
        if (candidate && candidate === active && current()) void candidate.pool.apply(candidate.committedAppearance).catch(() => {});
        if (current()) emit('error', failure, error instanceof Error ? error.message : '3D selection failed');
      }
    })();
  };
  const setBackground = (value: MockupBackground) => {
    if (disposed || captureGate.busy) return;
    websiteBackground = value;
    if (sceneMode === 'studio') value = { type: 'white' };
    const base = { white: '#ffffff', gray: '#e7e9e8', dark: '#162a24', color: safeColor(value.color, '#dcece4'), gradient: safeColor(value.color, '#f0f8f3'), transparent: '#000000' }[value.type];
    outputUniforms.backgroundTop.value.set(base);
    outputUniforms.backgroundBottom.value.set(value.type === 'gradient' ? safeColor(value.colorEnd, '#bfd9ca') : base);
    outputUniforms.backgroundAlpha.value = value.type === 'transparent' ? 0 : 1;
    host.dataset.background = value.type; requestRender();
  };
  const manualCamera = (preset: MockupCameraPreset) => {
    if (disposed || captureGate.busy) return;
    const wasAnimated = animation.mode !== 'off';
    cancelPointers();
    // Clear OrbitControls momentum without advancing the visible camera.
    const position = camera.position.clone(), target = controls.target.clone();
    controls.enableDamping = false; controls.update();
    camera.position.copy(position); controls.target.copy(target); camera.lookAt(target); controls.update();
    controls.enableDamping = true;
    if (animation.mode !== 'off' || animation.playing) {
      animation = { ...animation, mode: 'off', playing: false };
      controls.enableRotate = true; controls.enableZoom = true;
      host.dataset.motionMode = 'off';
    }
    // Exiting the web showcase returns its tilted object to the idle pose.
    // Subsequent Unity views change the camera only, as ProductCameraOrbit does.
    if (wasAnimated) { product.quaternion.identity(); pose.identity(); targetPose.identity(); }
    returnFrom = null; lastInputAt = -Infinity;
    controls.maxPolarAngle = Math.PI - 0.04;
    host.dataset.cameraPreset = preset; host.dataset.cameraPresetState = 'moving';
    pauseFromInteraction(); fit(preset, !matchMedia('(prefers-reduced-motion: reduce)').matches);
  };
  const rotateProduct = (axis: THREE.Vector3, angle: number) => {
    candidatePose.copy(targetPose).premultiply(dragStep.setFromAxisAngle(axis, angle)).normalize();
    up.set(0, 1, 0).applyQuaternion(candidatePose);
    if (up.y >= -0.25) targetPose.copy(candidatePose);
    lastInputAt = motionTime; returnFrom = null; requestRender();
  };
  const pointerDown = (event: PointerEvent) => {
    if (animation.mode !== 'showcase' || !active || captureGate.busy || contextLost || event.button !== 0 || pointers.has(event.pointerId)) return;
    if ((event.pointerType === 'touch' || event.pointerType === 'pen') && event.target !== hitRegion.element) return;
    const rect = canvas.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return;
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
    product.updateWorldMatrix(true, true); camera.updateMatrixWorld(); raycaster.setFromCamera(pointer, camera);
    if (!hitVisibleProduct(raycaster, visibleProductGestureMeshes(active.root))) return;
    targetPose.copy(pose); returnFrom = null;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try { canvas.setPointerCapture(event.pointerId); } catch { pointers.delete(event.pointerId); return; }
    dragging = true; hitRegion.beginDrag(); hitRegion.element.style.cursor = canvas.style.cursor = 'grabbing';
    lastInputAt = motionTime; requestRender();
  };
  const pointerMove = (event: PointerEvent) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size > 1) return;
    const dx = event.clientX - previous.x, dy = event.clientY - previous.y, distance = Math.hypot(dx, dy);
    if (distance < 0.1) return;
    rotateProduct(dragAxis.set(dy, dx, 0).normalize(), Math.min(distance * 0.008, 0.24));
  };
  const pointerUp = (event: PointerEvent) => {
    if (!pointers.delete(event.pointerId)) return;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    dragging = pointers.size > 0;
    if (!dragging) { hitRegion.endDrag(); hitRegion.element.style.cursor = canvas.style.cursor = 'grab'; lastInputAt = motionTime; }
    requestRender();
  };
  const cancelPointers = () => {
    const ids = [...pointers.keys()]; pointers.clear(); dragging = false;
    hitRegion.endDrag();
    for (const id of ids) if (canvas.hasPointerCapture(id)) {
      try { canvas.releasePointerCapture(id); } catch { /* The browser may have cancelled capture already. */ }
    }
    hitRegion.element.style.cursor = canvas.style.cursor = 'grab'; lastInputAt = motionTime;
  };
  const zoomCamera = (factor: number) => {
    if (disposed || captureGate.busy || !Number.isFinite(factor) || factor <= 0) return;
    cameraTransition = null; pauseFromInteraction();
    const direction = camera.position.clone().sub(controls.target);
    direction.setLength(THREE.MathUtils.clamp(direction.length() / factor, controls.minDistance, controls.maxDistance));
    camera.position.copy(controls.target).add(direction); controls.update(); requestRender();
  };
  const preserveTransitionOffset = (offset: THREE.Vector3, fromFov: number) => {
    const transition = cameraTransition;
    if (!transition) return;
    // The transition's `from*` values are already the live, panned camera.
    // Only the fitted destination is centered by `fit()`, so apply the
    // existing pan offset to its destination without moving the first frame.
    transition.toPosition.add(offset);
    transition.toTarget.add(offset);
    transition.fromFov = fromFov;
  };
  const adjustFov = (deltaDegrees: number) => {
    if (disposed || captureGate.busy || !active || !Number.isFinite(deltaDegrees)) return;
    const nextFov = THREE.MathUtils.clamp(camera.fov + deltaDegrees, 10, 90);
    if (Math.abs(nextFov - camera.fov) < 0.001) return;

    // Keep the user's current framing while changing the lens. `fit()`
    // recalculates the distance required by the new FOV and preserves the
    // current zoom ratio, but it intentionally recenters the controls target.
    // Save and restore that offset so WASD/pan adjustments do not jump.
    const center = active.bounds.getCenter(new THREE.Vector3());
    const targetOffset = controls.target.clone().sub(center);
    const previousFov = camera.fov;
    cameraTransition = null; pauseFromInteraction();
    focal = 'standard';
    host.dataset.cameraFov = String(nextFov);
    fit(undefined, true, nextFov, 260);
    preserveTransitionOffset(targetOffset, previousFov);
    requestRender();
  };
  const panView = (horizontal: number, vertical: number) => {
    if (disposed || captureGate.busy || !Number.isFinite(horizontal) || !Number.isFinite(vertical)) return;
    cameraTransition = null; pauseFromInteraction();
    if (!active) return;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    right.y = 0;
    if (right.lengthSq() < 0.0001) right.set(1, 0, 0);
    else right.normalize();
    const delta = right.multiplyScalar(horizontal).add(up.set(0, vertical, 0));
    const center = active.bounds.getCenter(new THREE.Vector3());
    const nextTarget = controls.target.clone().add(delta);
    const maxOffset = Math.max(active.radius * 2.5, fitDistance * 0.7, 0.05);
    const offset = nextTarget.clone().sub(center);
    if (offset.length() > maxOffset) nextTarget.copy(center).add(offset.setLength(maxOffset));
    const applied = nextTarget.sub(controls.target);
    cameraTransition = {
      fromPosition: camera.position.clone(), fromTarget: controls.target.clone(),
      toPosition: camera.position.clone().add(applied), toTarget: nextTarget.clone(),
      fromFov: camera.fov, toFov: camera.fov,
      startedAt: performance.now(), duration: 180,
    };
    requestRender();
  };
  const wheel = (event: WheelEvent) => {
    if (options.enableWheelZoom === false || animation.mode !== 'showcase' || !active || !isVisible() || captureGate.busy || event.ctrlKey) return;
    event.preventDefault();
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? host.clientHeight : 1);
    zoomCamera(Math.exp(THREE.MathUtils.clamp(-pixels * 0.001 * controls.zoomSpeed, -0.5, 0.5)));
  };
  host.addEventListener('pointerdown', pointerDown); host.addEventListener('pointermove', pointerMove);
  host.addEventListener('pointerup', pointerUp); host.addEventListener('pointercancel', pointerUp);
  canvas.addEventListener('lostpointercapture', pointerUp);
  host.addEventListener('wheel', wheel, { passive: false });
  const onControlsStart = () => { if (!captureGate.busy) { cameraTransition = null; pauseFromInteraction(); } };
  const onControlsChange = () => requestRender();
  controls.addEventListener('start', onControlsStart); controls.addEventListener('change', onControlsChange);
  const syncVisibility = () => {
    if (!isVisible()) { cancelPointers(); hitRegion.clear(); if (raf) cancelAnimationFrame(raf); raf = 0; prefetch.setEnabled(false); }
    else { lastTime = performance.now(); prefetch.setEnabled(readyRevision === revision); requestRender(); }
  };
  const lostContext = (event: Event) => {
    event.preventDefault(); contextLost = true; readyRevision = -1; request?.abort(); exportAbort?.abort();
    controls.enabled = false; syncVisibility(); emit('error', 'webgl', 'WebGL context lost');
  };
  const restoredContext = () => {
    if (disposed) return;
    contextLost = false; controls.enabled = true;
    environmentReady = loadEnvironment();
    const next = queuedSelection ?? desired; queuedSelection = null;
    if (next) select(next.asset, next.appearance, next.frontYaw);
    syncVisibility();
  };
  canvas.addEventListener('webglcontextlost', lostContext); canvas.addEventListener('webglcontextrestored', restoredContext);
  document.addEventListener('visibilitychange', syncVisibility);
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host);
  const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; syncVisibility(); }); intersection.observe(host);
  resize();

  return {
    select,
    setSceneMode(mode) {
      if (disposed || captureGate.busy || mode === sceneMode) return;
      cancelPointers(); hitRegion.clear();
      sceneMode = mode;
      studioGround.setEnabled(mode === 'studio');
      if (mode === 'studio') {
        animation = { mode: 'off', speed: 1, playing: false };
        product.quaternion.identity(); pose.identity(); targetPose.identity(); returnFrom = null;
        controls.enableRotate = true; controls.enableZoom = true;
        controls.maxPolarAngle = Math.PI / 2 - .015;
        if (active) { studioGround.setFloorY(active.bounds.min.y); studioGround.setRadius(active.radius); }
      } else controls.maxPolarAngle = Math.PI - .04;
      setBackground(websiteBackground);
      host.dataset.sceneMode = mode;
      fit(mode === 'studio' ? 'view-4' : animation.mode === 'showcase' ? 'front' : 'view-1'); requestRender();
    },
    setMaterialOverrides(overrides = {}) {
      if (disposed || captureGate.busy) return;
      materialOverrides = overrides;
      if (readyRevision === revision) active?.pool.setLiveOverrides?.(overrides);
      requestRender();
    },
    setCamera: manualCamera,
    setFocalLength(preset) {
      if (disposed || captureGate.busy || !(preset in MOCKUP_FOCAL_FOV)) return;
      focal = preset; camera.fov = MOCKUP_FOCAL_FOV[focal]; camera.updateProjectionMatrix();
      host.dataset.focalLength = focal; host.dataset.cameraFov = String(camera.fov);
      fit(); requestRender();
    },
    setBackground,
    setAnimation(value) {
      if (disposed || captureGate.busy) return;
      if (sceneMode === 'studio' && value.mode === 'showcase') value = { mode: 'off', speed: value.speed, playing: false };
      const previousMode = animation.mode;
      const changed = value.mode !== animation.mode;
      animation = { mode: value.mode, playing: value.mode !== 'off' && value.playing,
        speed: Number.isFinite(value.speed) ? Math.min(3, Math.max(0.2, value.speed)) : 1 };
      if (changed) {
        cancelPointers(); hitRegion.clear();
        controls.enableRotate = animation.mode !== 'showcase';
        controls.enableZoom = animation.mode !== 'showcase';
        if (animation.mode === 'showcase') product.quaternion.copy(rest);
        else if (previousMode === 'showcase' && animation.mode === 'turntable') product.quaternion.identity();
        pose.copy(product.quaternion); targetPose.copy(pose); lastInputAt = -Infinity; returnFrom = null;
        if (animation.mode === 'showcase' || previousMode === 'showcase' && animation.mode === 'turntable') fit('front');
      }
      host.dataset.motionMode = animation.mode;
      lastTime = performance.now(); requestRender();
    },
    setAspect(value) {
      if (disposed || captureGate.busy) return;
      aspect = normalizeMockupAspect(value); resize();
    },
    orbitView(yawRadians, pitchRadians) {
      if (disposed || captureGate.busy || !Number.isFinite(yawRadians) || !Number.isFinite(pitchRadians)) return;
      cameraTransition = null;
      if (animation.mode === 'showcase') {
        targetPose.copy(pose); rotateProduct(yawAxis, yawRadians);
        rotateProduct(new THREE.Vector3(1, 0, 0), pitchRadians); return;
      }
      pauseFromInteraction();
      const relative = camera.position.clone().sub(controls.target);
      const spherical = new THREE.Spherical().setFromVector3(relative);
      spherical.theta += yawRadians;
      spherical.phi = THREE.MathUtils.clamp(spherical.phi + pitchRadians, controls.minPolarAngle, controls.maxPolarAngle);
      const nextPosition = controls.target.clone().add(new THREE.Vector3().setFromSpherical(spherical));
      cameraTransition = {
        fromPosition: camera.position.clone(), fromTarget: controls.target.clone(),
        toPosition: nextPosition, toTarget: controls.target.clone(),
        fromFov: camera.fov, toFov: camera.fov,
        startedAt: performance.now(), duration: 180,
      };
      requestRender();
    },
    adjustFov,
    panView,
    zoom: zoomCamera,
    requestFrame: requestRender,
    setRenderPreview(target, value) {
      thumbnailCanvas = target; thumbnailOptions = value; thumbnailAt = -Infinity;
      if (!target) { thumbnailLinear?.dispose(); thumbnailOutput?.dispose(); thumbnailLinear = null; thumbnailOutput = null; }
      requestRender();
    },
    resetView() {
      if (disposed || captureGate.busy) return;
      cameraTransition = null; cancelPointers(); pauseFromInteraction();
      product.quaternion.copy(animation.mode === 'showcase' ? rest : new THREE.Quaternion());
      pose.copy(product.quaternion); targetPose.copy(pose); lastInputAt = -Infinity; returnFrom = null;
      focal = 'standard'; camera.fov = MOCKUP_FOCAL_FOV[focal]; camera.updateProjectionMatrix();
      host.dataset.focalLength = focal; host.dataset.cameraFov = String(camera.fov); fit(sceneMode === 'studio' ? 'view-4' : animation.mode === 'showcase' ? 'front' : 'view-1');
    },
    async capture(captureOptions) {
      if (disposed || contextLost || !active || readyRevision !== revision || statusPhase !== 'ready') throw new Error('The selected scene is not ready for export');
      const captureModel = active;
      const exportAspect = normalizeMockupAspect(captureOptions.aspect ?? aspect);
      const snapshotRevision = revision;
      const previousTarget = renderer.getRenderTarget();
      const previousViewport = renderer.getViewport(new THREE.Vector4());
      const previousScissor = renderer.getScissor(new THREE.Vector4());
      const previousScissorTest = renderer.getScissorTest();
      const previousClearColor = renderer.getClearColor(new THREE.Color()); const previousClearAlpha = renderer.getClearAlpha();
      const previousControls = controls.enabled;
      let linear: THREE.WebGLRenderTarget | null = null;
      let output: THREE.WebGLRenderTarget | null = null;
      let refraction: ReturnType<typeof createExportRefractionSession> | null = null;
      let refractionAtlas: ReturnType<typeof createRefractionAtlas> | null = null;
      let frozenMatte: THREE.WebGLRenderTarget | null = null;
      const refractionCulling: { mesh: THREE.Mesh; enabled: boolean }[] = [];
      const stitched = document.createElement('canvas');
      const tileCanvas = document.createElement('canvas');
      const abortExport = () => exportAbort?.abort();
      return captureGate.run(async () => {
        exportAbort = new AbortController(); const signal = exportAbort.signal;
        captureOptions.signal?.addEventListener('abort', abortExport, { once: true });
        if (captureOptions.signal?.aborted) exportAbort.abort();
        if (pointers.size) cancelPointers();
        if (raf) cancelAnimationFrame(raf); raf = 0; controls.enabled = false; emit('exporting');
        paintThumbnail(performance.now(), true);
        const gl = renderer.getContext();
        const maxTileSize = Math.min(1536, renderer.capabilities.maxTextureSize, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
        const size = mockupCaptureSize(captureOptions.longEdge, exportAspect);
        host.dataset.captureSize = `${size.width}x${size.height}`;
        if (signal.aborted) throw mockupAbortError();
        stitched.width = size.width; stitched.height = size.height;
        const context = stitched.getContext('2d'), tileContext = tileCanvas.getContext('2d');
        if (!context || !tileContext) throw new Error('Unable to create the image rendering canvas.');
        if (!captureOptions.transparent) captureOptions.paintBackground?.(context, size.width, size.height);
        const tiled = captureOptions.longEdge >= 4096 || size.longEdge > maxTileSize;
        const tiles = createMockupTiles(size.width, size.height, tiled ? maxTileSize : size.longEdge, tiled ? 64 : 0);
        host.dataset.captureTiles = String(tiles.length);
        host.dataset.captureTransparent = String(Boolean(captureOptions.transparent));
        const frame = frameCamera(captureCamera, size.width, size.height, exportAspect);
        captureOptions.onProgress?.(0);
        let reservoirTiles = 0;
        const prepareTile = (width: number, height: number) => {
          if (!linear) linear = createLinearTarget(width, height);
          else linear.setSize(width, height);
          if (!output) output = new THREE.WebGLRenderTarget(width, height, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false });
          else output.setSize(width, height);
        };
        if (tiled) {
          refraction = createExportRefractionSession(scene);
          if (refraction.materialCount) {
            // Three skips its native reservoir if no transmissive render item
            // survives tile culling. Keep these draws in the list even for an
            // empty guard tile, so its source cannot reuse a preceding tile.
            scene.traverseVisible(node => {
              if (!(node instanceof THREE.Mesh)) return;
              const materials = Array.isArray(node.material) ? node.material : [node.material];
              if (!materials.some(material => material.visible && material instanceof THREE.MeshPhysicalMaterial && material.transmission > 0)) return;
              refractionCulling.push({ mesh: node, enabled: node.frustumCulled });
              node.frustumCulled = false;
            });
            // Freeze the entire optical background, so refracted UVs may cross
            // tile boundaries without clamping to an independently painted tile.
            if (!captureOptions.transparent && sceneMode === 'website' && captureOptions.paintBackground) {
              frozenCaptureBackdrop = captureBackdrop.update(size.width, size.height, captureOptions.paintBackground);
            } else if (!captureOptions.transparent && sceneMode === 'studio') {
              const scale = Math.min(1, 1536 / size.longEdge);
              frozenMatte = createLinearTarget(Math.max(1, Math.round(size.width * scale)), Math.max(1, Math.round(size.height * scale)));
              captureCamera.setViewOffset(frame.fullWidth * scale, frame.fullHeight * scale,
                frame.offsetX * scale, frame.offsetY * scale, size.width * scale, size.height * scale);
              const productVisible = product.visible, near = captureCamera.near, tone = renderer.toneMapping;
              try {
                product.visible = false;
                captureCamera.near = Math.min(near, Math.max(.00001, captureModel.radius * .005));
                captureCamera.updateProjectionMatrix();
                renderer.toneMapping = THREE.NoToneMapping;
                renderer.setRenderTarget(frozenMatte); renderer.clear(); renderer.render(scene, captureCamera);
                frozenCaptureBackdrop = frozenMatte.texture;
              } finally {
                product.visible = productVisible; captureCamera.near = near;
                captureCamera.updateProjectionMatrix(); renderer.toneMapping = tone;
              }
            }
            captureCamera.setViewOffset(frame.fullWidth, frame.fullHeight, frame.offsetX, frame.offsetY, size.width, size.height);
            product.updateWorldMatrix(true, false);
            const sourceRect = projectedRefractionRect(captureModel.bounds, product.matrixWorld, captureCamera, size.width, size.height);
            if (sourceRect.width > renderer.capabilities.maxTextureSize || sourceRect.height > renderer.capabilities.maxTextureSize) {
              throw new Error('This device cannot allocate the full-resolution refraction source for this export.');
            }
            refractionAtlas = createRefractionAtlas(renderer, sourceRect, linearType);
            const sourceTiles = createMockupTiles(sourceRect.width, sourceRect.height, maxTileSize, 64);
            reservoirTiles = sourceTiles.length;
            host.dataset.captureRefraction = `${sourceRect.width}x${sourceRect.height}`;
            for (let index = 0; index < sourceTiles.length; index++) {
              if (disposed || signal.aborted || snapshotRevision !== revision) throw mockupAbortError();
              const tile = sourceTiles[index];
              prepareTile(tile.renderWidth, tile.renderHeight);
              const x = sourceRect.x + tile.renderX, y = sourceRect.y + tile.renderY;
              captureCamera.setViewOffset(frame.fullWidth, frame.fullHeight, frame.offsetX + x, frame.offsetY + y, tile.renderWidth, tile.renderHeight);
              renderTo(linear!, output!, captureCamera, captureOptions.transparent, captureBackdrop, captureOptions.paintBackground,
                { x, y, width: tile.renderWidth, height: tile.renderHeight, fullWidth: size.width, fullHeight: size.height });
              const native = refraction.getNativeSource();
              if (!native || native.width !== tile.renderWidth || native.height !== tile.renderHeight) {
                throw new Error('Unable to prepare the full-resolution refraction source.');
              }
              refractionAtlas.copy(native.texture, tile, index === sourceTiles.length - 1);
              captureOptions.onProgress?.((index + 1) / (tiles.length + reservoirTiles + 1));
              await new Promise<void>(resolve => setTimeout(resolve, 0));
            }
            refraction.bindAtlas(refractionAtlas.texture, sourceRect.width, sourceRect.height, sourceRect, size.height, size.width);
            refractionCulling.forEach(({ mesh, enabled }) => { mesh.frustumCulled = enabled; });
            refractionCulling.length = 0;
          }
        }
        for (let index = 0; index < tiles.length; index++) {
          if (disposed || signal.aborted || snapshotRevision !== revision) throw mockupAbortError();
          const tile = tiles[index];
          prepareTile(tile.renderWidth, tile.renderHeight);
          refraction?.setTile({ x: tile.renderX, y: tile.renderY, width: tile.renderWidth, height: tile.renderHeight });
          captureCamera.setViewOffset(frame.fullWidth, frame.fullHeight, frame.offsetX + tile.renderX, frame.offsetY + tile.renderY, tile.renderWidth, tile.renderHeight);
          renderTo(linear!, output!, captureCamera, captureOptions.transparent, captureBackdrop, captureOptions.paintBackground,
            { x: tile.renderX, y: tile.renderY, width: tile.renderWidth, height: tile.renderHeight, fullWidth: size.width, fullHeight: size.height });
          const pixels = new Uint8Array(tile.renderWidth * tile.renderHeight * 4);
          await abortable(renderer.readRenderTargetPixelsAsync(output!, 0, 0, tile.renderWidth, tile.renderHeight, pixels), signal, 30000);
          if (disposed || signal.aborted) throw mockupAbortError();
          tileCanvas.width = tile.renderWidth; tileCanvas.height = tile.renderHeight;
          tileContext.putImageData(new ImageData(flipMockupPixels(pixels, tile.renderWidth, tile.renderHeight), tile.renderWidth, tile.renderHeight), 0, 0);
          context.drawImage(tileCanvas, tile.cropX, tile.cropY, tile.width, tile.height, tile.x, tile.y, tile.width, tile.height);
          captureOptions.onProgress?.((reservoirTiles + index + 1) / (tiles.length + reservoirTiles + 1));
          await new Promise<void>(resolve => setTimeout(resolve, 0));
        }
        const blob = await encodeMockupCanvasPng(stitched, signal);
        captureOptions.onProgress?.(1);
        return blob;
      }, () => {
        captureOptions.signal?.removeEventListener('abort', abortExport); exportAbort = null;
        refraction?.dispose(); refractionAtlas?.dispose();
        refractionCulling.forEach(({ mesh, enabled }) => { mesh.frustumCulled = enabled; });
        frozenCaptureBackdrop = null; frozenMatte?.dispose();
        linear?.dispose(); output?.dispose();
        setBottleBackdrop(scene, null); captureBackdrop.dispose();
        captureCamera.clearViewOffset();
        stitched.width = 1; stitched.height = 1; tileCanvas.width = 1; tileCanvas.height = 1;
        if (!disposed) {
          renderer.setRenderTarget(previousTarget); renderer.setViewport(previousViewport); renderer.setScissor(previousScissor);
          renderer.setScissorTest(previousScissorTest); renderer.setClearColor(previousClearColor, previousClearAlpha);
          controls.enabled = previousControls && !contextLost;
          lastTime = performance.now();
          if (!contextLost) { emit('ready'); resize(); }
        }
      }).catch(error => {
        if (!disposed && !contextLost && !(error instanceof DOMException && error.name === 'AbortError')) {
          // Export failure is recoverable and does not invalidate committed geometry.
          options.onStatus({ phase: 'ready', assetId: desired?.asset.id ?? '', appearanceId: desired?.appearance?.id ?? '', selectionKey: desiredKey, revision, hasProduct: Boolean(active), error: 'export',
            message: error instanceof Error ? error.message : 'PNG export failed' });
        }
        throw error;
      }).finally(() => {
        if (!disposed && !contextLost) {
          const next = queuedSelection; queuedSelection = null;
          if (next) select(next.asset, next.appearance, next.frontYaw);
          resize(); requestRender();
        }
      });
    },
    dispose() {
      if (disposed) return;
      cancelPointers(); hitRegion.dispose();
      disposed = true; revision++; environmentRevision++; queuedSelection = null; request?.abort(); exportAbort?.abort();
      if (raf) cancelAnimationFrame(raf); raf = 0;
      resizeObserver.disconnect(); intersection.disconnect();
      document.removeEventListener('visibilitychange', syncVisibility);
      canvas.removeEventListener('webglcontextlost', lostContext); canvas.removeEventListener('webglcontextrestored', restoredContext);
      host.removeEventListener('pointerdown', pointerDown); host.removeEventListener('pointermove', pointerMove);
      host.removeEventListener('pointerup', pointerUp); host.removeEventListener('pointercancel', pointerUp);
      canvas.removeEventListener('lostpointercapture', pointerUp);
      host.removeEventListener('wheel', wheel);
      controls.removeEventListener('start', onControlsStart); controls.removeEventListener('change', onControlsChange); controls.dispose();
      discard(active); active = null; discard(cached); cached = null; [...candidates].forEach(discard);
      prefetch.dispose(); previewTarget?.dispose(); environmentTarget?.dispose();
      thumbnailLinear?.dispose(); thumbnailOutput?.dispose();
      thumbnailCanvas = null; thumbnailScratch.width = 1; thumbnailScratch.height = 1;
      studioMatteTarget?.dispose();
      setBottleBackdrop(scene, null);
      previewBackdrop.dispose(); thumbnailBackdrop.dispose(); captureBackdrop.dispose();
      studioGround.dispose();
      neckExport.dispose(); outputQuad.dispose(); outputMaterial.dispose(); pmrem.dispose(); draco.dispose(); basis.dispose();
      renderer.dispose(); canvas.remove();
    },
  };
}
