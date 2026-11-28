import * as THREE from 'three';
import { buildEnvironmentPresetTexture } from '../mockup/environment-presets';
import { createPackagingMaterialSet } from './materials/corrugated-materials';
import { buildPackagingRig } from './kinematics/rig-builder';
import {
  createDefaultPackagingParams,
  PACKAGING_TEMPLATES,
  solvePackagingTemplate,
} from './templates/registry';
import type { PackagingTemplateDefinition } from './types';

interface ThumbnailPose {
  readonly yawDeg: number;
  readonly pitchDeg: number;
  readonly foldProgress?: number;
  readonly fill?: number;
}

/** Curated commercial 3/4 angles so each box silhouette & opening style reads at a glance. */
const TEMPLATE_THUMBNAIL_POSES: Readonly<Record<string, ThumbnailPose>> = {
  'fefco-0421-tray': { yawDeg: 34, pitchDeg: 33, foldProgress: 1.0, fill: 0.88 },
  'fefco-0427-mailer': { yawDeg: -34, pitchDeg: 25, foldProgress: 0.69, fill: 0.87 },
  'ecma-a10-seal-end': { yawDeg: 34, pitchDeg: 26, foldProgress: 0.9, fill: 0.87 },
  'ecma-a21-snap-lock': { yawDeg: 32, pitchDeg: 24, foldProgress: 0.84, fill: 0.87 },
  'fefco-0201e-beer-case': { yawDeg: 40, pitchDeg: 25, foldProgress: 0.91, fill: 0.88 },
  'fefco-0201-rsc': { yawDeg: 36, pitchDeg: 29, foldProgress: 0.89, fill: 0.87 },
  'rigid-lid-base': { yawDeg: 36, pitchDeg: 27, foldProgress: 0.78, fill: 0.86 },
};

const THUMB_SIZE = 320;
const cachedThumbnails = new Map<string, string>();

/**
 * Fit a perspective camera tightly around an arbitrary 3D Box3 from a spherical `(yaw, pitch)` angle
 * by projecting all 8 corners onto the camera's local right/up/depth basis.
 */
function fitCameraToBox3(
  camera: THREE.PerspectiveCamera,
  box: THREE.Box3,
  yawDeg: number,
  pitchDeg: number,
  fill = 0.86,
) {
  const center = box.getCenter(new THREE.Vector3());
  const min = box.min;
  const max = box.max;
  const corners = [
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(min.x, max.y, min.z),
    new THREE.Vector3(min.x, max.y, max.z),
    new THREE.Vector3(max.x, min.y, min.z),
    new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(max.x, max.y, min.z),
    new THREE.Vector3(max.x, max.y, max.z),
  ];

  const yaw = THREE.MathUtils.degToRad(yawDeg);
  const pitch = THREE.MathUtils.degToRad(pitchDeg);
  const viewDir = new THREE.Vector3(
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    Math.cos(yaw) * Math.cos(pitch),
  ).normalize();

  const worldUp = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(worldUp, viewDir).normalize();
  const up = new THREE.Vector3().crossVectors(viewDir, right).normalize();

  const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
  const safeFill = Math.max(0.4, Math.min(0.95, fill));

  let requiredDist = 0.25;
  const rel = new THREE.Vector3();
  for (const corner of corners) {
    rel.subVectors(corner, center);
    const xProj = Math.abs(rel.dot(right));
    const yProj = Math.abs(rel.dot(up));
    const zDepth = rel.dot(viewDir);
    const dX = zDepth + xProj / (tanHalfFov * camera.aspect * safeFill);
    const dY = zDepth + yProj / (tanHalfFov * safeFill);
    requiredDist = Math.max(requiredDist, dX, dY);
  }

  camera.position.copy(center).addScaledVector(viewDir, requiredDist);
  camera.lookAt(center);
  camera.near = Math.max(0.005, requiredDist * 0.05);
  camera.far = Math.max(10, requiredDist * 10);
  camera.updateProjectionMatrix();
}

/**
 * Render photorealistic finished-3D studio thumbnails for every registered packaging template
 * using a single short-lived offscreen Three.js WebGLRenderer, then immediately dispose the
 * WebGL context and cache the resulting WebP/PNG Data URLs for the entire browser session.
 */
export function renderPackagingTemplateThumbnails(
  templates: readonly PackagingTemplateDefinition[] = PACKAGING_TEMPLATES,
): Record<string, string> {
  const result: Record<string, string> = {};
  if (typeof document === 'undefined') return result;

  const missing: PackagingTemplateDefinition[] = [];
  for (const tpl of templates) {
    const existing = cachedThumbnails.get(tpl.id);
    if (existing) result[tpl.id] = existing;
    else missing.push(tpl);
  }
  if (!missing.length) return result;

  let renderer: THREE.WebGLRenderer | null = null;
  let pmrem: THREE.PMREMGenerator | null = null;
  let envSourceTex: THREE.DataTexture | null = null;
  let envTarget: THREE.WebGLRenderTarget | null = null;
  let floorGeo: THREE.PlaneGeometry | null = null;
  let floorMat: THREE.ShadowMaterial | null = null;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = THUMB_SIZE;
    canvas.height = THUMB_SIZE;

    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'default',
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(1);
    renderer.setSize(THUMB_SIZE, THUMB_SIZE, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    scene.environmentIntensity = 0.72;

    pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    envSourceTex = buildEnvironmentPresetTexture('studio-bright');
    envTarget = pmrem.fromEquirectangular(envSourceTex);
    scene.environment = envTarget.texture;

    // Bright studio softbox lighting so both kraft cartons and white rigid boxes show crisp 3D depth.
    const hemi = new THREE.HemisphereLight('#ffffff', '#ddd3ca', 0.88);
    scene.add(hemi);

    const key = new THREE.DirectionalLight('#fffdf8', 1.55);
    key.castShadow = true;
    key.shadow.mapSize.set(512, 512);
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.008;
    key.shadow.radius = 4;
    scene.add(key);
    scene.add(key.target);

    const fillLight = new THREE.DirectionalLight('#f2f6ff', 0.45);
    fillLight.position.set(-2.2, 1.4, 1.8);
    scene.add(fillLight);

    const rim = new THREE.DirectionalLight('#fff4e8', 0.52);
    rim.position.set(-1.6, 2.2, -2.6);
    scene.add(rim);

    floorGeo = new THREE.PlaneGeometry(4, 4);
    floorMat = new THREE.ShadowMaterial({ opacity: 0.16 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI * 0.5;
    floor.receiveShadow = true;
    scene.add(floor);

    const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 20);

    for (const tpl of missing) {
      const pose = TEMPLATE_THUMBNAIL_POSES[tpl.id] ?? {
        yawDeg: 35,
        pitchDeg: 28,
        foldProgress: tpl.heroFold,
        fill: 0.86,
      };
      const params = {
        ...createDefaultPackagingParams(tpl.id),
        foldProgress: pose.foldProgress ?? tpl.heroFold,
        showDimensions: false,
        showCreaseLines: false,
        showFaceLabels: false,
      };
      const solved = solvePackagingTemplate(params);
      const materials = createPackagingMaterialSet(solved.params, solved.material);
      materials.syncDieline(solved);
      materials.updateFoldProgress(solved.params.foldProgress);

      const rig = buildPackagingRig(solved, materials, { creaseSegments: 5 });
      rig.setFoldProgress(solved.params.foldProgress);
      rig.setCreaseLinesVisible(false);

      // Center horizontally on X/Z and rest bottom flush at y = 0 for accurate ground shadow contact.
      rig.root.position.set(0, 0, 0);
      rig.root.updateMatrixWorld(true);
      const rawBounds = rig.measureBounds();
      const rawCenter = rawBounds.getCenter(new THREE.Vector3());
      rig.root.position.set(-rawCenter.x, -rawBounds.min.y, -rawCenter.z);
      rig.root.updateMatrixWorld(true);

      const grounded = rawBounds.clone().translate(new THREE.Vector3(-rawCenter.x, -rawBounds.min.y, -rawCenter.z));
      const boxCenter = grounded.getCenter(new THREE.Vector3());
      const sphereRadius = Math.max(0.05, grounded.getBoundingSphere(new THREE.Sphere()).radius);

      // Scale shadow frustum tightly to the box footprint for razor-sharp contact shading.
      const frustum = sphereRadius * 1.9;
      key.position.set(boxCenter.x + sphereRadius * 2.2, boxCenter.y + sphereRadius * 3.8, boxCenter.z + sphereRadius * 2.4);
      key.target.position.copy(boxCenter);
      key.target.updateMatrixWorld();
      key.shadow.camera.left = -frustum;
      key.shadow.camera.right = frustum;
      key.shadow.camera.top = frustum;
      key.shadow.camera.bottom = -frustum;
      key.shadow.camera.near = sphereRadius * 0.2;
      key.shadow.camera.far = sphereRadius * 12;
      key.shadow.camera.updateProjectionMatrix();

      // Add a tiny vertical drop below min.y so the contact shadow is included inside camera framing.
      const framedBounds = grounded.clone();
      framedBounds.min.y -= sphereRadius * 0.08;

      scene.add(rig.root);
      fitCameraToBox3(camera, framedBounds, pose.yawDeg, pose.pitchDeg, pose.fill ?? 0.86);
      renderer.render(scene, camera);

      const dataUrl = canvas.toDataURL('image/webp', 0.9);
      const finalUrl = dataUrl.startsWith('data:image/webp') ? dataUrl : canvas.toDataURL('image/png');
      cachedThumbnails.set(tpl.id, finalUrl);
      result[tpl.id] = finalUrl;

      scene.remove(rig.root);
      rig.dispose();
      materials.dispose();
    }
  } catch {
    // Gracefully return any already rendered entries; caller can fall back to SVG dieline.
  } finally {
    floorGeo?.dispose();
    floorMat?.dispose();
    envSourceTex?.dispose();
    envTarget?.dispose();
    pmrem?.dispose();
    if (renderer) {
      renderer.dispose();
      renderer.forceContextLoss();
    }
  }

  return result;
}
