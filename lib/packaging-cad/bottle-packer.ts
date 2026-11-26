import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { LabModel } from '../labellab/catalog';
import { publicUrl } from '../public-url';
import { assetUrl, DEFAULT_VIEWER_PRESENTATION } from '../viewer-config';
import {
  aloeScatteringColor,
  aloeTransmissionClearRadiance,
  correctAloeTransmissionClear,
  fitAloeLiquidProfile,
  type AloeLiquidProfile,
} from '../viewer/aloe-bottle-materials';
import { nataScatteringColor } from '../viewer/bottle-materials';
import {
  BASIL_WEB_OPTICS,
  basilWebAbsorption,
  fitBasilWebProfile,
  type BasilWebProfile,
} from '../viewer/basil-web-optics';
import { configureBottleCaptureOnly } from '../viewer/basil-web-materials';
import {
  isBasilWebSeedMetadata,
  type BasilWebSeedMetadata,
} from '../viewer/basil-web-seed-contract';
import { preparePetRingGeometry } from '../viewer/pet-ring-geometry';
import {
  MM_TO_METRE,
  type BottlePackConfig,
  type SolvedDieline,
} from './types';
import {
  computeBottlePackLayout,
  getBeverageFootprintMm,
  type BeverageFootprintMm,
} from './pack-layout';
import { easeInOutCubic } from './kinematics/rig-builder';

export interface BottlePackVisualSource {
  model: LabModel;
  /** Optional saved Custom Project metadata when packed from a user-saved Bottles & Cans preset. */
  customProjectId?: string;
  customProjectName?: string;
  /** Optional custom uploaded label URL (tray override, custom project, or active studio). */
  customLabelUrl?: string;
  /** Label wrap horizontal offset (-100..100, matching ScenePreferences.labelOffset). */
  labelOffset?: number;
  labelRoughness?: number;
  labelMetalness?: number;
  /** Optional live or custom-project cap/top edits. */
  capColor?: string;
  capMetalness?: number;
  capRoughness?: number;
  /** Optional live or custom-project body edits. */
  bodyColor?: string;
  bodyMetalness?: number;
  bodyRoughness?: number;
  /** Optional live or custom-project liquid color & optics edits. */
  liquidColor?: string;
  liquidCustomized?: boolean;
  liquidClarity?: number;
  liquidDensity?: number;
  liquidTurbidity?: number;
  liquidBrightness?: number;
  liquidScattering?: number;
  liquidRoughness?: number;
  liquidIor?: number;
}

export type BottleOpticalProfile =
  | 'aloe'
  | 'nata'
  | 'energy'
  | 'juice'
  | 'basil-glass'
  | 'chia-glass'
  | 'milk-glass'
  | 'opaque';

interface DecodedMeshPart {
  geometry: THREE.BufferGeometry;
  materials: THREE.Material[];
  meshName: string;
  materialNames: string[];
  localToBaseMatrix: THREE.Matrix4;
  /** True when geometry was synthetically generated (e.g. merged basil seeds) and must be disposed with template. */
  synthetic?: boolean;
  /** Explicit semantic role override for synthetic parts (e.g. 'inclusions'). */
  forcedSlot?: string;
}

interface CachedBottleTemplate {
  key: string;
  parts: DecodedMeshPart[];
  footprintMm: BeverageFootprintMm;
  frontYaw: number;
  aloeProfile?: AloeLiquidProfile;
  basilProfile?: BasilWebProfile;
  /** True when the GLB had explicit bottleLiquidKind='milk' userData. */
  isMilkLiquid: boolean;
}

export interface BottlePackerHandle {
  readonly group: THREE.Group;
  /** Load/update instanced bottles for the given config, visual source & solved box. */
  sync(
    solved: SolvedDieline,
    config: BottlePackConfig,
    visualSource: BottlePackVisualSource | null,
  ): void;
  /** Update visibility & gentle materialization scale as the box unfolds/folds. */
  setFoldProgress(progress: number): void;
  /** Highlight a single packed bottle's label on pointer hover (null clears). */
  setLabelHover(instanceId: number | null): void;
  /** Visible non-capture instanced meshes participating in 3D hover & click picking. */
  getRaycastMeshes(): THREE.InstancedMesh[];
  /** World bounding box of currently visible instanced bottles (or empty Box3). */
  measureBounds(): THREE.Box3;
  /** Measured physical dimensions (mm) of the currently loaded bottle/can GLB. */
  getMeasuredFootprintMm(): BeverageFootprintMm | null;
  dispose(): void;
}

let sharedLoader: GLTFLoader | null = null;
function getBottleGltfLoader(): GLTFLoader {
  if (sharedLoader) return sharedLoader;
  const draco = new DRACOLoader()
    .setDecoderPath(publicUrl(DEFAULT_VIEWER_PRESENTATION.decoders.dracoPath))
    .setWorkerLimit(1);
  sharedLoader = new GLTFLoader()
    .setDRACOLoader(draco)
    .setMeshoptDecoder(MeshoptDecoder);
  return sharedLoader;
}

const safeHex = (value: string | undefined): string | undefined =>
  value && /^#[0-9a-f]{6}$/i.test(value) ? value : undefined;

function resolveSemanticSlot(
  model: LabModel,
  meshName: string,
  materialName: string,
): string | undefined {
  const slots = model.asset.materialSlots ?? {};
  for (const [slot, names] of Object.entries(slots)) {
    if (names.includes(materialName) || names.includes(meshName)) return slot;
  }
  const lower = `${materialName} ${meshName}`.toLowerCase();
  if (lower.includes('label') || lower.includes('lable')) return 'label';
  if (lower.includes('water') || lower.includes('liquid')) return 'liquid';
  if (lower.includes('cap')) return 'cap';
  if (lower.includes('tab')) return 'tab';
  if (lower.includes('seed') || lower.includes('pulp') || lower.includes('nata')) return 'inclusions';
  if (lower.includes('ring')) return 'ring';
  if (lower.includes('body') || lower.includes('glass') || lower.includes('neck') || lower.includes('base')) return 'body';
  return undefined;
}

/**
 * Classifies a beverage model into its Bottles & Cans optical rendering family so
 * packed bottles inside boxes/trays match standalone studio photorealism.
 */
export function resolveBottleOpticalProfile(
  model: Pick<LabModel, 'id' | 'category'>,
  isMilkLiquid = false,
): BottleOpticalProfile {
  const id = model.id;
  if (model.category === 'can' || model.category === 'pp') return 'opaque';
  if (model.category === 'glass') {
    if (
      isMilkLiquid ||
      id.includes('milk') ||
      id.includes('latte') ||
      id.startsWith('glass-280') ||
      id.startsWith('glass-300') ||
      id.startsWith('glass-485')
    ) {
      return 'milk-glass';
    }
    if (id.includes('chia')) return 'chia-glass';
    return 'basil-glass';
  }
  if (id === 'pet-aloe' || id.includes('aloe')) return 'aloe';
  if (id.includes('nata')) return 'nata';
  if (id.includes('energy')) return 'energy';
  return 'juice';
}

/**
 * Builds one compact merged BufferGeometry containing every hydrated basil seed
 * (front-facing dark seed core + back-facing translucent mucilage halo) from the
 * authored `basilWebSeeds` metadata so all 330 seeds render in a single InstancedMesh
 * draw call across up to 24 packed bottles.
 */
export function buildMergedBasilSeedsGeometry(
  metadata: BasilWebSeedMetadata,
): THREE.BufferGeometry {
  const unitSphere = new THREE.SphereGeometry(1, 6, 4);
  const srcPos = unitSphere.getAttribute('position');
  const srcNorm = unitSphere.getAttribute('normal');
  const srcIdx = unitSphere.getIndex();
  const vertsPerSphere = srcPos.count;
  const idxPerSphere = srcIdx ? srcIdx.count : vertsPerSphere;
  const seedCount = metadata.seeds.length;

  // 2 shells per seed: inner dark core (kind=1, FrontSide) + outer gel halo (kind=0, BackSide winding).
  const totalVerts = seedCount * vertsPerSphere * 2;
  const totalIndices = seedCount * idxPerSphere * 2;
  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const seedKinds = new Float32Array(totalVerts);
  const indices = new Uint32Array(totalIndices);

  const nativeToGlb = new THREE.Matrix4().set(
    ...(metadata.nativeToGlbMatrix as Parameters<THREE.Matrix4['set']>),
  );
  const coreBasis = new THREE.Matrix4();
  const haloBasis = new THREE.Matrix4();
  const coreNormalMat = new THREE.Matrix3();
  const haloNormalMat = new THREE.Matrix3();
  const axisCore = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const axisHalo = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const center = new THREE.Vector3();
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();

  let vOffset = 0;
  let iOffset = 0;

  const emitShell = (
    matrix: THREE.Matrix4,
    normalMatrix: THREE.Matrix3,
    kind: number,
    flipWinding: boolean,
  ) => {
    const baseVertex = vOffset;
    for (let v = 0; v < vertsPerSphere; v++) {
      p.fromBufferAttribute(srcPos, v).applyMatrix4(matrix);
      n.fromBufferAttribute(srcNorm, v).applyMatrix3(normalMatrix).normalize();
      if (flipWinding) n.negate();
      positions[vOffset * 3] = p.x;
      positions[vOffset * 3 + 1] = p.y;
      positions[vOffset * 3 + 2] = p.z;
      normals[vOffset * 3] = n.x;
      normals[vOffset * 3 + 1] = n.y;
      normals[vOffset * 3 + 2] = n.z;
      seedKinds[vOffset] = kind;
      vOffset++;
    }
    for (let k = 0; k < idxPerSphere; k += 3) {
      const a = baseVertex + (srcIdx ? srcIdx.getX(k) : k);
      const b = baseVertex + (srcIdx ? srcIdx.getX(k + 1) : k + 1);
      const c = baseVertex + (srcIdx ? srcIdx.getX(k + 2) : k + 2);
      if (flipWinding) {
        indices[iOffset++] = a;
        indices[iOffset++] = c;
        indices[iOffset++] = b;
      } else {
        indices[iOffset++] = a;
        indices[iOffset++] = b;
        indices[iOffset++] = c;
      }
    }
  };

  for (let s = 0; s < seedCount; s++) {
    const seed = metadata.seeds[s];
    const invAxes = [seed.inverseX, seed.inverseY, seed.inverseZ];
    let valid = true;
    for (let j = 0; j < 3; j++) {
      axisCore[j].fromArray(invAxes[j]);
      const len = axisCore[j].length();
      if (!(len > 1e-8)) {
        valid = false;
        break;
      }
      const radius = 1 / len;
      axisHalo[j].copy(axisCore[j]).multiplyScalar((radius + metadata.gelThicknessNative) / len);
      axisCore[j].multiplyScalar(radius / len);
    }
    if (!valid) continue;

    center.fromArray(seed.center);
    coreBasis.makeBasis(axisCore[0], axisCore[1], axisCore[2]).setPosition(center).premultiply(nativeToGlb);
    haloBasis.makeBasis(axisHalo[0], axisHalo[1], axisHalo[2]).setPosition(center).premultiply(nativeToGlb);
    const coreMirror = coreBasis.determinant() < 0;
    const haloMirror = haloBasis.determinant() < 0;
    coreNormalMat.getNormalMatrix(coreBasis);
    haloNormalMat.getNormalMatrix(haloBasis);

    emitShell(coreBasis, coreNormalMat, 1, coreMirror);
    emitShell(haloBasis, haloNormalMat, 0, !haloMirror);
  }

  unitSphere.dispose();
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions.subarray(0, vOffset * 3), 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals.subarray(0, vOffset * 3), 3));
  merged.setAttribute('packedSeedKind', new THREE.BufferAttribute(seedKinds.subarray(0, vOffset), 1));
  merged.setIndex(new THREE.BufferAttribute(indices.subarray(0, iOffset), 1));
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

// ---------------------------------------------------------------------------
// InstancedMesh-safe optical GLSL helpers matching Bottles & Cans studio
// ---------------------------------------------------------------------------

const PACKED_BOTTLE_SPACE_VERT_COMMON = /* glsl */`
uniform mat4 packedLocalToBottle;
uniform mat3 packedBottleToLocalMat3;
varying vec3 vPackedBottlePos;
varying vec3 vPackedBottleView;
`;

const PACKED_BOTTLE_SPACE_VERT_BEGIN = /* glsl */`
#include <begin_vertex>
vPackedBottlePos = (packedLocalToBottle * vec4(transformed, 1.0)).xyz;
mat4 packedInstM = mat4(1.0);
#ifdef USE_INSTANCING
  packedInstM = instanceMatrix;
#endif
vec4 packedWorldP = modelMatrix * packedInstM * vec4(transformed, 1.0);
vec3 packedWorldV = isOrthographic
  ? normalize(vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]))
  : normalize(cameraPosition - packedWorldP.xyz);
mat3 packedBottleToWorld = mat3(modelMatrix) * mat3(packedInstM) * packedBottleToLocalMat3;
vPackedBottleView = normalize(inverse(packedBottleToWorld) * packedWorldV);
`;

const PACKED_PET_VOLUME_FRAG_COMMON = /* glsl */`
uniform vec2 packedHeightRange;
uniform vec2 packedCenter;
uniform vec4 packedSections[16];
uniform vec3 packedScatteringColor;
uniform vec3 packedJuiceColor;
uniform float packedReferencePath;
uniform float packedBulkAbsorption;
uniform float packedMediumAbsorption;
uniform vec3 packedEnergyAbsorption;
varying vec3 vPackedBottlePos;
varying vec3 vPackedBottleView;

vec4 packedSupportAt(float y) {
  float h = clamp((y - packedHeightRange.x) / max(packedHeightRange.y - packedHeightRange.x, 0.0001), 0.0, 1.0) * 15.0;
  int idx = min(int(floor(h)), 14);
  return mix(packedSections[idx], packedSections[idx + 1], h - float(idx));
}
float packedPlaneExit(float pos, float dir, float extent) {
  if (abs(dir) < 0.000001) return 10000.0;
  return max(0.0, (extent - sign(dir) * pos) / abs(dir));
}
float packedBulkPath(vec3 point, vec3 direction) {
  vec2 p = point.xz - packedCenter;
  vec4 ext = packedSupportAt(point.y);
  float path = min(packedPlaneExit(p.x, direction.x, ext.x), packedPlaneExit(p.y, direction.z, ext.y));
  path = min(path, packedPlaneExit((p.x + p.y) * 0.70710678118, (direction.x + direction.z) * 0.70710678118, ext.z));
  path = min(path, packedPlaneExit((p.x - p.y) * 0.70710678118, (direction.x - direction.z) * 0.70710678118, ext.w));
  if (abs(direction.y) > 0.000001) {
    path = min(path, max(0.0, ((direction.y > 0.0 ? packedHeightRange.y : packedHeightRange.x) - point.y) / direction.y));
  }
  return max(0.0, path);
}
vec3 packedVolumeColor(float path) {
  float rel = clamp(path / max(packedReferencePath, 0.0001), 0.12, 1.8);
  vec3 absCoeff = -log(clamp(packedJuiceColor, vec3(0.025), vec3(1.0))) * packedBulkAbsorption;
  return packedScatteringColor * exp(absCoeff * (1.0 - rel));
}
float packedReservoirCoverage(float path, float height) {
  float neckRetention = 1.0 - 0.18 * smoothstep(0.62, 0.94, height);
  float topRetention = 1.0 - 0.30 * smoothstep(0.93, 1.0, height);
  return 1.0 - exp(-max(0.0, path) * 34.0 * neckRetention * topRetention);
}
`;

const PACKED_BASIL_CONE_VERT_HELPERS = /* glsl */`
uniform vec2 packedBasilCenter;
uniform vec2 packedBasilYBounds;
uniform vec4 packedBasilSections[8];
float packedBasilRadius(float y) {
  float r = 0.0;
  for (int i = 0; i < 8; i++) {
    vec4 s = packedBasilSections[i];
    if (y >= s.x - 0.0000001 && y <= s.y + 0.0000001) {
      r = max(r, s.z + s.w * (clamp(y, s.x, s.y) - s.x));
    }
  }
  return r;
}
void packedBasilAcceptRoot(float t, vec4 s, vec3 p, vec3 d, inout float nearest) {
  float y = p.y + d.y * t;
  float r = s.z + s.w * (y - s.x);
  float grad = dot(p.xz + d.xz * t, d.xz) - r * s.w * d.y;
  if (t > 0.0000001 && y >= s.x - 0.0000001 && y <= s.y + 0.0000001 && grad >= -0.0000000001) {
    nearest = min(nearest, t);
  }
}
float packedBasilExit(vec3 point, vec3 direction) {
  vec3 p = point - vec3(packedBasilCenter.x, 0.0, packedBasilCenter.y);
  vec3 d = normalize(direction);
  float nearest = 1000.0;
  for (int i = 0; i < 8; i++) {
    vec4 s = packedBasilSections[i];
    float r = s.z + s.w * (p.y - s.x);
    float k = s.w * d.y;
    float a = dot(d.xz, d.xz) - k * k;
    float b = dot(p.xz, d.xz) - r * k;
    float c = dot(p.xz, p.xz) - r * r;
    if (abs(a) < 0.0000000001) {
      if (abs(b) > 0.0000000001) packedBasilAcceptRoot(-c / (2.0 * b), s, p, d, nearest);
    } else {
      float det = b * b - a * c;
      if (det >= 0.0) {
        float root = sqrt(det);
        packedBasilAcceptRoot((-b - root) / a, s, p, d, nearest);
        packedBasilAcceptRoot((-b + root) / a, s, p, d, nearest);
      }
    }
  }
  if (abs(d.y) > 0.0000000001) {
    float y = d.y > 0.0 ? packedBasilYBounds.y : packedBasilYBounds.x;
    float t = (y - p.y) / d.y;
    if (t > 0.0000001 && length(p.xz + d.xz * t) <= packedBasilRadius(y) + 0.0000001) {
      nearest = min(nearest, t);
    }
  }
  return nearest < 999.0 ? nearest : 0.0;
}
`;

function createPetShellMaterial(tintHex?: string, roughnessOverride?: number): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(tintHex ?? '#ffffff'),
    roughness: typeof roughnessOverride === 'number' && Number.isFinite(roughnessOverride) ? roughnessOverride : 0.075,
    metalness: 0,
    ior: 1.47,
    reflectivity: 0.95,
    envMapIntensity: 1.55,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    side: THREE.FrontSide,
  });
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      /* glsl */`
      // Exact Bottles & Cans Fresnel + specular-only PET optics: crystal-clear center
      // (zero milky white diffuse veil) with razor-sharp studio softbox reflections.
      float petFresnel = pow(1.0 - saturate(dot(normal, geometryViewDir)), 5.0);
      float petHighlight = clamp(max(max(totalSpecular.r, totalSpecular.g), totalSpecular.b), 0.0, 1.0);
      float petAlpha = clamp(0.025 + petFresnel * 0.25 + petHighlight * 0.60, 0.025, 0.62);
      gl_FragColor = vec4((totalSpecular + totalDiffuse * 0.006) / petAlpha, petAlpha);
      `,
    );
  };
  mat.customProgramCacheKey = () => 'packed-pet-crystal-shell-v1';
  return mat;
}

function createPetRingMaterial(): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    roughness: 0.055,
    metalness: 0,
    ior: 1.57,
    reflectivity: 1,
    envMapIntensity: 1.65,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    side: THREE.FrontSide,
  });
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      /* glsl */`
      // Clear injection-molded solid PET collar: zero milky white haze, pure specular + Fresnel.
      float ringFresnel = pow(1.0 - saturate(dot(normal, geometryViewDir)), 4.2);
      float ringHighlight = clamp(max(max(totalSpecular.r, totalSpecular.g), totalSpecular.b), 0.0, 1.0);
      float ringAlpha = clamp(0.04 + ringFresnel * 0.32 + ringHighlight * 0.68, 0.04, 0.72);
      gl_FragColor = vec4((totalSpecular + totalDiffuse * 0.012) / ringAlpha, ringAlpha);
      `,
    );
  };
  mat.customProgramCacheKey = () => 'packed-pet-crystal-ring-v1';
  return mat;
}

function createPolishedGlassShellMaterial(
  physicalThickness: number,
  isNeck: boolean,
  tintHex?: string,
  roughnessOverride?: number,
): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(tintHex ?? '#ffffff'),
    metalness: 0,
    roughness:
      typeof roughnessOverride === 'number' && Number.isFinite(roughnessOverride)
        ? Math.max(0.01, roughnessOverride)
        : isNeck
          ? 0.055
          : BASIL_WEB_OPTICS.glassRoughness,
    transmission: 1,
    ior: BASIL_WEB_OPTICS.glassIOR,
    thickness: physicalThickness,
    attenuationColor: new THREE.Color('#ffffff'),
    attenuationDistance: Infinity,
    envMapIntensity: isNeck ? 1.75 : 1.62,
    transparent: true,
    opacity: 1,
    depthWrite: true,
    side: THREE.FrontSide,
  });
  const uniforms = {
    aloeClearRadiance: { value: 1 },
    packedWorldThickness: { value: physicalThickness },
    packedGlassIsNeck: { value: isNeck ? 1 : 0 },
  };
  mat.onBeforeRender = (renderer, _scene, _camera, _geometry, object) => {
    uniforms.aloeClearRadiance.value = aloeTransmissionClearRadiance(renderer);
    uniforms.packedWorldThickness.value =
      physicalThickness * Math.max(0.01, object.matrixWorld.getMaxScaleOnAxis());
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float aloeClearRadiance;\nuniform float packedWorldThickness;\nuniform float packedGlassIsNeck;',
      )
      .replace(
        '#include <transmission_pars_fragment>',
        correctAloeTransmissionClear(THREE.ShaderChunk.transmission_pars_fragment).replace(
          'return normalize( refractionVector ) * thickness * modelScale;',
          'return normalize( refractionVector ) * packedWorldThickness;',
        ),
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */`
        float capturedCoverage = clamp(material.transmissionAlpha, 0.0, 1.0);
        float highlight = clamp(max(max(totalSpecular.r, totalSpecular.g), totalSpecular.b), 0.0, 1.0);
        float ndotv = saturate(dot(normal, geometryViewDir));
        float fresnel = pow(1.0 - ndotv, 4.5);
        // Subtle cool crystal rim on bare hollow glass necks so the clear wall above the
        // label reads as solid glass even against a bright white studio floor.
        float neckRim = packedGlassIsNeck * pow(1.0 - ndotv, 2.2);
        vec3 neckRimTint = vec3(0.76, 0.79, 0.82);
        float surfaceCov = clamp(highlight * 0.40 + fresnel * 0.22 + neckRim * 0.26, 0.0, 0.88);
        float coverage = capturedCoverage + (1.0 - capturedCoverage) * surfaceCov;
        vec3 glassLight = totalDiffuse * capturedCoverage
          + neckRimTint * (1.0 - capturedCoverage) * neckRim * 0.26
          + totalSpecular;
        gl_FragColor = vec4(glassLight / max(coverage, 0.0001), coverage);
        `,
      );
  };
  mat.customProgramCacheKey = () => `packed-glass-polished-shell-${isNeck ? 'neck' : 'body'}-v2`;
  return mat;
}

/**
 * Unprinted matte warm-white paper reverse face (`BackSide`) for wrapped bottle labels.
 * Matches `lib/viewer/paper-backing-capture.ts` interior wrap lighting so looking down
 * through clear glass/PET necks shows realistic curved paper backing instead of an
 * invisible backface cutout or rear-bottle bleed-through.
 */
export function createLabelPaperBackingMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: '#ebe9e4',
    roughness: 0.9,
    metalness: 0,
    side: THREE.BackSide,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  mat.name = 'PackedPaperLabelBack';
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vPackedPaperUvY;')
      .replace(
        '#include <begin_vertex>',
        /* glsl */`
        #include <begin_vertex>
        #ifdef USE_UV
          vPackedPaperUvY = uv.y;
        #else
          vPackedPaperUvY = 0.5;
        #endif
        `,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vPackedPaperUvY;')
      .replace(
        '#include <opaque_fragment>',
        /* glsl */`
        // Three's standard fragment normal is already oriented toward the viewer for BackSide.
        vec3 pBackN = normalize(normal);
        vec3 pBackV = normalize(geometryViewDir);
        float pBackNdotV = clamp(dot(pBackN, pBackV), 0.0, 1.0);
        vec3 pBackKeyDir = normalize(vec3(0.24, 0.32, 0.92));
        vec3 pBackFillDir = normalize(vec3(-0.48, -0.22, 0.85));
        float pBackKeyWrap = clamp(dot(pBackN, pBackKeyDir) * 0.55 + 0.45, 0.0, 1.0);
        float pBackFillWrap = clamp(dot(pBackN, pBackFillDir) * 0.5 + 0.5, 0.0, 1.0);
        float pBackStudioShade = pBackKeyWrap * 0.65 + pBackFillWrap * 0.35;
        float pBackCurveFalloff = mix(0.80, 1.0, pow(pBackNdotV, 0.38));
        float pBackVertShade = mix(0.96, 0.84, clamp(vPackedPaperUvY, 0.0, 1.0));
        float pBackRadiance = (0.44 + 0.24 * pBackStudioShade) * pBackCurveFalloff * pBackVertShade;
        vec3 pBackTint = vec3(0.955, 0.94, 0.915);
        gl_FragColor = vec4(pBackTint * pBackRadiance, 1.0);
        `,
      );
  };
  mat.customProgramCacheKey = () => 'packed-paper-label-back-v2';
  return mat;
}

function buildBottleSpaceUniforms(partLocalToBase: THREE.Matrix4) {
  const inv = partLocalToBase.clone().invert();
  return {
    packedLocalToBottle: { value: partLocalToBase.clone() },
    packedBottleToLocalMat3: { value: new THREE.Matrix3().setFromMatrix4(inv) },
  };
}

function buildPetVolumeUniforms(
  profile: AloeLiquidProfile,
  partLocalToBase: THREE.Matrix4,
  juiceColorHex: string,
  optical: 'aloe' | 'nata' | 'juice' | 'energy',
) {
  const juice = new THREE.Color(juiceColorHex);
  const scattering =
    optical === 'aloe' ? aloeScatteringColor(juice) : nataScatteringColor(juice);
  const srgb = juice.clone().convertLinearToSRGB();
  const energyAbs = new THREE.Vector3(
    1 - THREE.MathUtils.clamp(srgb.r, 0, 1),
    1 - THREE.MathUtils.clamp(srgb.g, 0, 1),
    1 - THREE.MathUtils.clamp(srgb.b, 0, 1),
  ).multiplyScalar(54);
  return {
    ...buildBottleSpaceUniforms(partLocalToBase),
    packedHeightRange: { value: new THREE.Vector2(profile.minimumY, profile.maximumY) },
    packedCenter: { value: profile.center.clone() },
    packedSections: { value: profile.sections.map((s) => s.clone()) },
    packedScatteringColor: { value: scattering },
    packedJuiceColor: { value: juice },
    packedReferencePath: { value: 2 * Math.min(profile.halfBounds.x, profile.halfBounds.y) },
    packedBulkAbsorption: { value: optical === 'aloe' ? 0.3 : 0.28 },
    packedMediumAbsorption: { value: optical === 'aloe' ? 0.55 : 0.48 },
    packedEnergyAbsorption: { value: energyAbs },
  };
}

function createPetLiquidBackMaterial(
  profile: AloeLiquidProfile,
  partLocalToBase: THREE.Matrix4,
  juiceColorHex: string,
  optical: 'aloe' | 'nata' | 'juice' | 'energy',
): THREE.MeshStandardMaterial {
  const uniforms = buildPetVolumeUniforms(profile, partLocalToBase, juiceColorHex, optical);
  const mat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 1,
    metalness: 0,
    side: THREE.BackSide,
    transparent: false,
    opacity: 1,
    depthWrite: true,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${PACKED_BOTTLE_SPACE_VERT_COMMON}`)
      .replace('#include <begin_vertex>', PACKED_BOTTLE_SPACE_VERT_BEGIN);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${PACKED_PET_VOLUME_FRAG_COMMON}`)
      .replace(
        '#include <opaque_fragment>',
        optical === 'energy'
          ? /* glsl */`
            float path = packedBulkPath(vPackedBottlePos, normalize(vPackedBottleView));
            gl_FragColor = vec4(exp(-packedEnergyAbsorption * max(0.0, path)), 1.0);
          `
          : /* glsl */`
            float path = packedBulkPath(vPackedBottlePos, normalize(vPackedBottleView));
            gl_FragColor = vec4(packedVolumeColor(path), 1.0);
          `,
      );
  };
  mat.customProgramCacheKey = () => `packed-pet-liquid-back-${optical}-v1`;
  return mat;
}

function createPetLiquidFrontMaterial(
  profile: AloeLiquidProfile,
  partLocalToBase: THREE.Matrix4,
  juiceColorHex: string,
  optical: 'aloe' | 'nata' | 'juice' | 'energy',
): THREE.MeshPhysicalMaterial {
  const physicalThickness = Math.min(profile.halfBounds.x, profile.halfBounds.y) * 0.44;
  const uniforms = {
    ...buildPetVolumeUniforms(profile, partLocalToBase, juiceColorHex, optical),
    aloeClearRadiance: { value: 1 },
    packedWorldThickness: { value: physicalThickness },
  };
  const mat = new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    roughness: optical === 'energy' ? 0.055 : optical === 'aloe' ? 0.1 : 0.13,
    metalness: 0,
    transmission: 1,
    ior: 1.335,
    thickness: physicalThickness,
    attenuationColor: new THREE.Color('#ffffff'),
    attenuationDistance: Infinity,
    envMapIntensity: 1.48,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    side: THREE.FrontSide,
  });
  mat.onBeforeRender = (renderer, _scene, _camera, _geometry, object) => {
    uniforms.aloeClearRadiance.value = aloeTransmissionClearRadiance(renderer);
    uniforms.packedWorldThickness.value =
      physicalThickness * Math.max(0.01, object.matrixWorld.getMaxScaleOnAxis());
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${PACKED_BOTTLE_SPACE_VERT_COMMON}`)
      .replace('#include <begin_vertex>', PACKED_BOTTLE_SPACE_VERT_BEGIN);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nuniform float aloeClearRadiance;\nuniform float packedWorldThickness;\n${PACKED_PET_VOLUME_FRAG_COMMON}`,
      )
      .replace(
        '#include <transmission_pars_fragment>',
        correctAloeTransmissionClear(THREE.ShaderChunk.transmission_pars_fragment).replace(
          'return normalize( refractionVector ) * thickness * modelScale;',
          'return normalize( refractionVector ) * packedWorldThickness;',
        ),
      )
      .replace(
        '#include <opaque_fragment>',
        optical === 'energy'
          ? /* glsl */`
            vec3 viewRay = normalize(vPackedBottleView);
            float opticalPath = packedBulkPath(vPackedBottlePos, -viewRay);
            vec3 analyticEnergy = exp(-packedEnergyAbsorption * max(0.0, opticalPath));
            float capturedCov = clamp(material.transmissionAlpha, 0.0, 1.0);
            vec3 bodyCol = mix(analyticEnergy, totalDiffuse, capturedCov * 0.72);
            gl_FragColor = vec4(bodyCol + totalSpecular * 0.24, 1.0);
          `
          : optical === 'aloe'
            ? /* glsl */`
              vec3 viewRay = normalize(vPackedBottleView);
              float opticalPath = packedBulkPath(vPackedBottlePos, -viewRay);
              float relativePath = clamp(opticalPath / max(packedReferencePath, 0.0001), 0.12, 1.8);
              float normH = clamp((vPackedBottlePos.y - packedHeightRange.x) / max(packedHeightRange.y - packedHeightRange.x, 0.0001), 0.0, 1.0);
              vec3 volumeColor = packedVolumeColor(opticalPath);
              vec3 mediumExt = -log(clamp(packedJuiceColor, vec3(0.025), vec3(1.0))) * packedMediumAbsorption;
              vec3 captureDelta = totalDiffuse - volumeColor;
              vec3 lumW = vec3(0.2126, 0.7152, 0.0722);
              float captureDark = dot(captureDelta, lumW);
              float retained = clamp(1.0 + captureDark / max(dot(volumeColor, lumW), 0.0001), 0.81, 1.0);
              vec3 filteredCapture = captureDark < 0.0
                ? volumeColor * retained
                : volumeColor + captureDelta * exp(-mediumExt * relativePath);
              float capturedCov = clamp(material.transmissionAlpha, 0.0, 1.0);
              float reservoirCov = packedReservoirCoverage(opticalPath, normH);
              vec3 shoulderGlow = exp(-mediumExt * relativePath);
              vec3 baseWater = mix(volumeColor, filteredCapture, capturedCov);
              float effectiveCov = mix(0.26, 1.0, reservoirCov);
              vec3 mediumCol = mix(shoulderGlow, baseWater, effectiveCov);
              float fresnelRim = pow(1.0 - saturate(dot(normal, geometryViewDir)), 3.0);
              mediumCol *= (0.97 + 0.06 * saturate(normal.y * 0.5 + 0.5));
              mediumCol = mix(mediumCol, shoulderGlow * 1.04, fresnelRim * 0.16);
              gl_FragColor = vec4(mediumCol + totalSpecular * 0.16, 1.0);
            `
            : /* glsl */`
              vec3 viewRay = normalize(vPackedBottleView);
              float opticalPath = packedBulkPath(vPackedBottlePos, -viewRay);
              float relativePath = clamp(opticalPath / max(packedReferencePath, 0.0001), 0.12, 1.8);
              float normH = clamp((vPackedBottlePos.y - packedHeightRange.x) / max(packedHeightRange.y - packedHeightRange.x, 0.0001), 0.0, 1.0);
              vec3 volumeColor = packedVolumeColor(opticalPath);
              vec3 mediumExt = -log(clamp(packedJuiceColor, vec3(0.025), vec3(1.0))) * packedMediumAbsorption;
              float capturedCov = clamp(material.transmissionAlpha, 0.0, 1.0);
              // Keep refracted ivory coconut jelly cubes & vibrant fruit juice vivid
              vec3 refractedBody = mix(volumeColor, totalDiffuse, capturedCov);
              float reservoirCov = packedReservoirCoverage(opticalPath, normH);
              vec3 shoulderGlow = exp(-mediumExt * relativePath);
              vec3 mediumCol = mix(shoulderGlow, refractedBody, mix(0.38, 1.0, reservoirCov));
              float fresnelRim = pow(1.0 - saturate(dot(normal, geometryViewDir)), 3.2);
              mediumCol = mix(mediumCol, shoulderGlow * 1.02, fresnelRim * 0.12);
              gl_FragColor = vec4(mediumCol + totalSpecular * 0.22, 1.0);
            `,
      );
  };
  mat.customProgramCacheKey = () => `packed-pet-liquid-front-${optical}-v1`;
  return mat;
}

function createPetInclusionMaterial(
  profile: AloeLiquidProfile,
  partLocalToBase: THREE.Matrix4,
  juiceColorHex: string,
  optical: 'aloe' | 'nata' | 'juice' | 'energy',
): THREE.MeshStandardMaterial {
  const uniforms = buildPetVolumeUniforms(profile, partLocalToBase, juiceColorHex, optical);
  const mat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: optical === 'aloe' ? 0.24 : 0.68,
    metalness: 0,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    side: THREE.FrontSide,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${PACKED_BOTTLE_SPACE_VERT_COMMON}`)
      .replace('#include <begin_vertex>', PACKED_BOTTLE_SPACE_VERT_BEGIN);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${PACKED_PET_VOLUME_FRAG_COMMON}`)
      .replace(
        '#include <opaque_fragment>',
        optical === 'aloe'
          ? /* glsl */`
            vec3 viewRay = normalize(vPackedBottleView);
            float depth = packedBulkPath(vPackedBottlePos, viewRay);
            float fadeX = clamp((depth - 0.012) / (0.036 - 0.012), 0.0, 1.0);
            float reveal = exp(-depth * 60.0) * (1.0 - fadeX * fadeX * (3.0 - 2.0 * fadeX)) * 0.70;
            if (reveal < 0.008) discard;
            float totalPath = depth + packedBulkPath(vPackedBottlePos, -viewRay);
            vec3 waterCol = packedVolumeColor(totalPath);
            float piecePath = 0.0035 / max(abs(dot(normal, geometryViewDir)), 0.35);
            float trans = exp(-piecePath * 100.0);
            float darken = min(0.19, (1.0 - trans) * reveal);
            gl_FragColor = vec4(waterCol * (1.0 - darken), 1.0);
          `
          : /* glsl */`
            vec3 viewRay = normalize(vPackedBottleView);
            float depth = packedBulkPath(vPackedBottlePos, viewRay);
            if (depth >= 0.024) discard;
            float vis = exp(-depth * 120.0) * (1.0 - smoothstep(0.01, 0.024, depth)) * 0.45;
            vec3 paleJelly = vec3(0.98, 0.97, 0.92);
            gl_FragColor = vec4(mix(packedScatteringColor, paleJelly, vis), 1.0);
          `,
      );
  };
  mat.customProgramCacheKey = () => `packed-pet-inclusions-${optical}-v1`;
  return mat;
}

function buildBasilUniforms(
  profile: BasilWebProfile,
  partLocalToBase: THREE.Matrix4,
  juiceColorHex: string,
) {
  const color = new THREE.Color(juiceColorHex);
  const srgb = color.clone().convertLinearToSRGB();
  const absorption = basilWebAbsorption(srgb);
  return {
    ...buildBottleSpaceUniforms(partLocalToBase),
    packedBasilCenter: { value: profile.center.clone() },
    packedBasilYBounds: { value: new THREE.Vector2(profile.minimumY, profile.maximumY) },
    packedBasilSections: { value: profile.sections.map((s) => s.clone()) },
    packedBasilAbsorption: { value: absorption },
    packedBasilLiquidColor: { value: color },
  };
}

function createBasilGlassLiquidMaterial(
  profile: BasilWebProfile,
  partLocalToBase: THREE.Matrix4,
  juiceColorHex: string,
): THREE.MeshStandardMaterial {
  const uniforms = buildBasilUniforms(profile, partLocalToBase, juiceColorHex);
  const mat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 1,
    metalness: 0,
    side: THREE.BackSide,
    transparent: false,
    opacity: 1,
    depthWrite: true,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\n${PACKED_BOTTLE_SPACE_VERT_COMMON}\n${PACKED_BASIL_CONE_VERT_HELPERS}\nvarying float vPackedBasilChord;`,
      )
      .replace(
        '#include <begin_vertex>',
        `${PACKED_BOTTLE_SPACE_VERT_BEGIN}\nvPackedBasilChord = packedBasilExit(vPackedBottlePos, vPackedBottleView);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform vec3 packedBasilAbsorption;\nvarying float vPackedBasilChord;',
      )
      .replace(
        '#include <opaque_fragment>',
        'gl_FragColor = vec4(exp(-packedBasilAbsorption * max(0.0, vPackedBasilChord)), 1.0);',
      );
  };
  mat.customProgramCacheKey = () => 'packed-basil-glass-liquid-back-v1';
  return mat;
}

function createGlassSeedInclusionsMaterial(
  profile: BasilWebProfile,
  partLocalToBase: THREE.Matrix4,
  juiceColorHex: string,
  hasHydratedHaloAttribute: boolean,
): THREE.MeshStandardMaterial {
  const uniforms = buildBasilUniforms(profile, partLocalToBase, juiceColorHex);
  const mat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.74,
    metalness: 0,
    side: hasHydratedHaloAttribute ? THREE.FrontSide : THREE.DoubleSide,
    transparent: false,
    opacity: 1,
    depthWrite: true,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    const kindDecl = hasHydratedHaloAttribute
      ? 'attribute float packedSeedKind;\nvarying float vPackedSeedKind;'
      : 'varying float vPackedSeedKind;';
    const kindAssign = hasHydratedHaloAttribute
      ? 'vPackedSeedKind = packedSeedKind;'
      : 'vPackedSeedKind = 1.0;';
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\n${PACKED_BOTTLE_SPACE_VERT_COMMON}\n${PACKED_BASIL_CONE_VERT_HELPERS}\n${kindDecl}\nvarying vec2 vPackedSeedPath;`,
      )
      .replace(
        '#include <begin_vertex>',
        `${PACKED_BOTTLE_SPACE_VERT_BEGIN}
        float seedNear = packedBasilExit(vPackedBottlePos, vPackedBottleView);
        float seedFar = packedBasilExit(vPackedBottlePos, -vPackedBottleView);
        vPackedSeedPath = vec2(seedNear, seedNear + seedFar);
        ${kindAssign}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 packedBasilAbsorption;
        uniform vec3 packedBasilLiquidColor;
        varying vec2 vPackedSeedPath;
        varying float vPackedSeedKind;`,
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */`
        float depth = max(0.0, vPackedSeedPath.x);
        float vis = exp(-6.666 * depth);
        vec3 trans = exp(-packedBasilAbsorption * depth);
        vec3 reservoir = exp(-packedBasilAbsorption * max(0.0, vPackedSeedPath.y));
        vec3 seedLight = max(reflectedLight.directDiffuse + reflectedLight.indirectDiffuse, vec3(0.18));
        vec3 seedPigment = vec3(0.012, 0.018, 0.008);
        vec3 coreCol = mix(packedBasilLiquidColor * 0.4, seedPigment * seedLight * trans, vis);
        vec3 gelHaze = mix(vec3(1.0), packedBasilLiquidColor, 0.5) * trans * 0.20 * vis;
        vec3 gelCol = reservoir * (1.0 - 0.15 * vis) + gelHaze;
        gl_FragColor = vec4(mix(gelCol, coreCol, step(0.5, vPackedSeedKind)), 1.0);
        `,
      );
  };
  mat.customProgramCacheKey = () =>
    `packed-glass-seeds-${hasHydratedHaloAttribute ? 'basil-gel' : 'chia'}-v1`;
  return mat;
}

function createMilkLiquidMaterial(liquidHex: string, roughnessOverride?: number): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(liquidHex),
    roughness: typeof roughnessOverride === 'number' && Number.isFinite(roughnessOverride) ? roughnessOverride : 0.42,
    metalness: 0,
    side: THREE.FrontSide,
    transparent: false,
    opacity: 1,
    depthWrite: true,
  });
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      /* glsl */`
      // Creamy subsurface-lifted dairy/latte finish: prevents harsh gray undersides
      // inside curved refractive glass, matching Bottles & Cans studio milk optics.
      vec3 litMilk = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
      vec3 creamy = mix(diffuseColor.rgb * 0.96, litMilk, 0.24);
      gl_FragColor = vec4(creamy, 1.0);
      `,
    );
  };
  mat.customProgramCacheKey = () => 'packed-milk-creamy-v1';
  return mat;
}

interface LabelHoverUniforms {
  uLabelHoverInstance: { value: number };
  uLabelHoverMix: { value: number };
  uLabelHoverColor: { value: THREE.Color };
}

function attachPackedLabelHoverShader(
  mat: THREE.MeshStandardMaterial,
  hoverUniforms: LabelHoverUniforms,
  cacheSuffix: string,
): void {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, hoverUniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uLabelHoverInstance;
        varying float vLabelHoverFactor;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vLabelHoverFactor = abs(float(gl_InstanceID) - uLabelHoverInstance) < 0.5 ? 1.0 : 0.0;
        #else
          vLabelHoverFactor = uLabelHoverInstance >= -0.5 ? 1.0 : 0.0;
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uLabelHoverMix;
        uniform vec3 uLabelHoverColor;
        varying float vLabelHoverFactor;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        if (vLabelHoverFactor * uLabelHoverMix > 0.001) {
          gl_FragColor.rgb = mix(gl_FragColor.rgb, uLabelHoverColor, vLabelHoverFactor * uLabelHoverMix);
        }`,
      );
  };
  mat.customProgramCacheKey = () => `packed-bottle-label-hover-${cacheSuffix}-v1`;
}

function applyBrightnessToHex(hex: string, brightness?: number): string {
  if (typeof brightness !== 'number' || !Number.isFinite(brightness) || Math.abs(brightness - 1) < 0.01) {
    return hex;
  }
  const c = new THREE.Color(hex);
  const clamped = Math.max(0.15, Math.min(2.0, brightness));
  c.r = Math.min(1, c.r * clamped);
  c.g = Math.min(1, c.g * clamped);
  c.b = Math.min(1, c.b * clamped);
  return `#${c.getHexString()}`;
}

interface InstancedLayerSpec {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  partLocalMatrix: THREE.Matrix4;
  name: string;
  renderOrder: number;
  castShadow: boolean;
  receiveShadow: boolean;
  captureOnly?: boolean;
  bottleSlot?: string;
  materialSlots?: Array<string | undefined>;
  isInteractiveLabel?: boolean;
  isTransparentShell?: boolean;
  isPaperBack?: boolean;
}

/**
 * Photorealistic, 60-FPS Instanced 3D Bottle/Can Packer for HyperMockup Packaging CAD.
 * Mounts 1 to 24 real 3D beverage models inside any parametric tray, carrier, shipper,
 * mailer, or gift box with Bottles & Cans-parity optical shaders (volumetric Beer-Lambert
 * liquid, crystal Fresnel PET/glass shells, refracted pulp/nata/basil seeds) in ~6–10
 * instanced draw calls total.
 */
export function createBottlePacker(callbacks?: {
  onNeedsRender?: () => void;
  onFootprintMeasured?: (modelId: string, footprintMm: BeverageFootprintMm) => void;
}): BottlePackerHandle {
  const group = new THREE.Group();
  group.name = 'packaging-packed-bottles';

  const templateCache = new Map<string, Promise<CachedBottleTemplate>>();
  const loadedTemplates = new Map<string, CachedBottleTemplate>();
  const textureLoader = new THREE.TextureLoader();

  let activeInstanced: Array<{
    mesh: THREE.InstancedMesh;
    partLocalMatrix: THREE.Matrix4;
  }> = [];
  let ownedMaterials: THREE.Material[] = [];
  let ownedTextures: THREE.Texture[] = [];

  const labelHoverUniforms: LabelHoverUniforms = {
    uLabelHoverInstance: { value: -1 },
    uLabelHoverMix: { value: 0.36 },
    uLabelHoverColor: { value: new THREE.Color('#2563eb') },
  };

  let currentSolved: SolvedDieline | null = null;
  let currentConfig: BottlePackConfig | null = null;
  let currentVisualKey = '';
  let currentFootprintMm: BeverageFootprintMm | null = null;
  let currentFoldProgress = 1;
  let buildRevision = 0;
  let disposed = false;

  const disposeActiveInstances = () => {
    for (const entry of activeInstanced) {
      entry.mesh.removeFromParent();
      entry.mesh.dispose();
    }
    activeInstanced = [];
    for (const mat of ownedMaterials) mat.dispose();
    ownedMaterials = [];
    for (const tex of ownedTextures) tex.dispose();
    ownedTextures = [];
  };

  const loadTemplate = (model: LabModel): Promise<CachedBottleTemplate> => {
    const key = model.asset.src;
    const existing = templateCache.get(key);
    if (existing) return existing;

    const promise = (async () => {
      const src = assetUrl(model.asset.src);
      if (!src) throw new Error(`Invalid bottle URL for ${model.id}`);
      const response = await fetch(publicUrl(src), { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`Failed to fetch bottle model (${response.status})`);
      const buffer = await response.arrayBuffer();
      const gltf = await getBottleGltfLoader().parseAsync(
        buffer,
        THREE.LoaderUtils.extractUrlBase(publicUrl(src)),
      );

      const wrapper = new THREE.Group();
      wrapper.add(gltf.scene);
      if (model.asset.orientation) {
        wrapper.rotation.set(...model.asset.orientation);
      }
      // Partition neck collar into Ring on legacy 1L short PET assets.
      preparePetRingGeometry(wrapper, model.asset);
      wrapper.updateMatrixWorld(true);

      const bounds = new THREE.Box3().setFromObject(wrapper, true);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());

      // Normalize so bottom-center of the upright bottle rests at local (0, 0, 0).
      const baseOffset = new THREE.Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z);
      const parts: DecodedMeshPart[] = [];
      let isMilkLiquid = false;
      let basilSeedOwner: { metadata: BasilWebSeedMetadata; matrixWorld: THREE.Matrix4 } | null = null;

      wrapper.traverse((node) => {
        if (node.userData?.basilWebSeeds && isBasilWebSeedMetadata(node.userData.basilWebSeeds)) {
          basilSeedOwner = {
            metadata: node.userData.basilWebSeeds,
            matrixWorld: node.matrixWorld.clone(),
          };
        }
        if (!(node instanceof THREE.Mesh) || !node.geometry) return;
        const rawMats = (Array.isArray(node.material) ? node.material : [node.material]).filter(
          (m): m is THREE.Material => Boolean(m),
        );
        if (!rawMats.length) return;
        for (const m of rawMats) {
          if (m.userData?.bottleLiquidKind === 'milk') isMilkLiquid = true;
        }
        const localToBaseMatrix = baseOffset.clone().multiply(node.matrixWorld);
        parts.push({
          geometry: node.geometry,
          materials: rawMats,
          meshName: node.name || '',
          materialNames: rawMats.map((m) => m.name || ''),
          localToBaseMatrix,
        });
      });

      // Synthesize merged 3D hydrated basil seeds mesh when authored via basilWebSeeds metadata.
      if (basilSeedOwner) {
        const owner = basilSeedOwner as { metadata: BasilWebSeedMetadata; matrixWorld: THREE.Matrix4 };
        const mergedSeedsGeo = buildMergedBasilSeedsGeometry(owner.metadata);
        const seedMat = new THREE.MeshStandardMaterial({ color: '#ffffff' });
        seedMat.name = 'basil-web-seed-gel';
        parts.push({
          geometry: mergedSeedsGeo,
          materials: [seedMat],
          meshName: 'Basil hydrated seeds',
          materialNames: ['basil-web-seed-gel'],
          localToBaseMatrix: baseOffset.clone().multiply(owner.matrixWorld),
          synthetic: true,
          forcedSlot: 'inclusions',
        });
      }

      // Fit exact metric liquid volume profile once per template for volumetric Beer-Lambert optics.
      let aloeProfile: AloeLiquidProfile | undefined;
      let basilProfile: BasilWebProfile | undefined;
      const liquidPart = parts.find((p) =>
        p.materialNames.some((mn) => resolveSemanticSlot(model, p.meshName, mn) === 'liquid'),
      );
      if (liquidPart) {
        if (model.category === 'pet') {
          aloeProfile = fitAloeLiquidProfile(liquidPart.geometry, liquidPart.localToBaseMatrix);
        } else if (model.category === 'glass') {
          basilProfile = fitBasilWebProfile(liquidPart.geometry, liquidPart.localToBaseMatrix);
        }
      }

      const fallbackMm = getBeverageFootprintMm(model.id, model.asset.volumeMl);
      const validBounds =
        Number.isFinite(size.x) &&
        Number.isFinite(size.y) &&
        Number.isFinite(size.z) &&
        size.x > 0.01 &&
        size.y > 0.02 &&
        size.z > 0.01;
      const footprintMm: BeverageFootprintMm = validBounds
        ? {
            diameterXMm: Math.round(size.x * 10000) / 10,
            diameterZMm: Math.round(size.z * 10000) / 10,
            heightMm: Math.round(size.y * 10000) / 10,
          }
        : fallbackMm;

      const tpl: CachedBottleTemplate = {
        key,
        parts,
        footprintMm,
        frontYaw: Number.isFinite(model.frontYaw) ? model.frontYaw : 0,
        aloeProfile,
        basilProfile,
        isMilkLiquid,
      };
      loadedTemplates.set(key, tpl);

      // Keep template cache compact (max 3 models in memory).
      if (loadedTemplates.size > 3) {
        const oldestKey = loadedTemplates.keys().next().value;
        if (oldestKey && oldestKey !== key) {
          const old = loadedTemplates.get(oldestKey);
          old?.parts.forEach((p) => {
            p.geometry.dispose();
            p.materials.forEach((m) => m.dispose());
          });
          loadedTemplates.delete(oldestKey);
          templateCache.delete(oldestKey);
        }
      }

      return tpl;
    })().catch((err) => {
      templateCache.delete(key);
      throw err;
    });

    templateCache.set(key, promise);
    return promise;
  };

  const applySlotTransforms = (
    solved: SolvedDieline,
    config: BottlePackConfig,
    footprintMm: BeverageFootprintMm,
    frontYaw: number,
  ) => {
    if (!activeInstanced.length) return;
    const layout = computeBottlePackLayout(solved, footprintMm, config);
    const dummy = new THREE.Matrix4();
    const rotY = new THREE.Matrix4();
    const trans = new THREE.Matrix4();
    const count = layout.slots.length;

    for (const entry of activeInstanced) {
      entry.mesh.count = count;
      for (let i = 0; i < count; i++) {
        const slot = layout.slots[i];
        trans.makeTranslation(slot.xMm * MM_TO_METRE, 0, slot.zMm * MM_TO_METRE);
        rotY.makeRotationY(frontYaw + slot.yawRad);
        dummy.copy(trans).multiply(rotY).multiply(entry.partLocalMatrix);
        entry.mesh.setMatrixAt(i, dummy);
      }
      entry.mesh.instanceMatrix.needsUpdate = true;
      entry.mesh.computeBoundingBox();
      entry.mesh.computeBoundingSphere();
    }
  };

  const updateFoldVisibility = (progress: number) => {
    currentFoldProgress = Math.max(0, Math.min(1, progress));
    if (!currentConfig?.enabled || !activeInstanced.length) {
      group.visible = false;
      return;
    }
    // Hide cleanly when flat unfolded (< 22%); smoothly materialize into place from 22% -> 52%.
    if (currentFoldProgress < 0.22) {
      group.visible = false;
      return;
    }
    group.visible = true;
    const t = easeInOutCubic((currentFoldProgress - 0.22) / 0.3);
    const s = 0.01 + 0.99 * t;
    group.scale.set(s, s, s);
  };

  const buildLayersForTemplate = async (
    template: CachedBottleTemplate,
    visual: BottlePackVisualSource,
  ): Promise<{
    layers: InstancedLayerSpec[];
    materials: THREE.Material[];
    textures: THREE.Texture[];
  }> => {
    const model = visual.model;
    const optical = resolveBottleOpticalProfile(model, template.isMilkLiquid);
    const isGlassBottle =
      optical === 'basil-glass' || optical === 'chia-glass' || optical === 'milk-glass';
    const isTransmissivePet =
      optical === 'aloe' || optical === 'nata' || optical === 'juice' || optical === 'energy';
    const isTransmissiveBottle = isGlassBottle || isTransmissivePet;
    const slots = model.appearance.slots ?? {};
    const labelUrl = visual.customLabelUrl || slots.label?.baseColorMap;
    const createdTextures: THREE.Texture[] = [];

    let labelTexture: THREE.Texture | null = null;
    if (labelUrl) {
      try {
        const resolvedUrl =
          labelUrl.startsWith('blob:') || labelUrl.startsWith('data:')
            ? labelUrl
            : publicUrl(labelUrl);
        const tex = await textureLoader.loadAsync(resolvedUrl);
        tex.flipY = false;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        const extraOffset =
          typeof visual.labelOffset === 'number' && Number.isFinite(visual.labelOffset)
            ? visual.labelOffset / 100
            : 0;
        tex.wrapS =
          model.asset.textureSamplers?.label?.wrapS === 'repeat' || Math.abs(extraOffset) > 1e-4
            ? THREE.RepeatWrapping
            : THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        const baseOffset =
          typeof slots.label?.textureOffsetX === 'number' && Number.isFinite(slots.label.textureOffsetX)
            ? slots.label.textureOffsetX
            : 0;
        tex.offset.x = baseOffset + extraOffset;
        tex.needsUpdate = true;
        createdTextures.push(tex);
        labelTexture = tex;
      } catch {
        labelTexture = null;
      }
    }

    const liquidPart = template.parts.find((p) =>
      p.materialNames.some((mn) => resolveSemanticSlot(model, p.meshName, mn) === 'liquid'),
    );
    const origLiquidMat = liquidPart?.materials.find(
      (m): m is THREE.MeshStandardMaterial => m instanceof THREE.MeshStandardMaterial,
    );
    const rawLiquidHex =
      safeHex(visual.liquidColor) ??
      safeHex(slots.liquid?.color) ??
      (origLiquidMat ? `#${origLiquidMat.color.getHexString()}` : '#e8a848');
    const resolvedLiquidHex = visual.liquidCustomized
      ? applyBrightnessToHex(rawLiquidHex, visual.liquidBrightness)
      : rawLiquidHex;
    const forceCreamyLiquid =
      Boolean(visual.liquidCustomized) &&
      typeof visual.liquidClarity === 'number' &&
      typeof visual.liquidTurbidity === 'number' &&
      visual.liquidClarity <= 0.22 &&
      visual.liquidTurbidity >= 0.65;

    const createdMaterials: THREE.Material[] = [];
    const layers: InstancedLayerSpec[] = [];

    const buildSingleMaterial = (
      part: DecodedMeshPart,
      sourceMat: THREE.Material,
      slot: string | undefined,
    ): {
      material: THREE.Material;
      renderOrder: number;
      castShadow: boolean;
      receiveShadow: boolean;
      captureOnly?: boolean;
    } => {
      const origStd = sourceMat instanceof THREE.MeshStandardMaterial ? sourceMat : null;
      const slotSpec = slot ? slots[slot] : undefined;

      if (slot === 'label') {
        const isCan = model.category === 'can';
        // For glass bottles (2 mm wall refraction), keep label opaque so rear bottles seen
        // through a front bottle's clear glass neck show their REAL label (not naked liquid!).
        // For thick-volume PET bottles (12 mm liquid refraction), keep label in transparent queue
        // at alpha=1 so liquid volume refraction cannot pull label pixels across the seam.
        const deferLabelAfterTransmission = isTransmissivePet;
        const labelRough =
          typeof visual.labelRoughness === 'number' && Number.isFinite(visual.labelRoughness)
            ? visual.labelRoughness
            : (slotSpec?.roughness ?? (isCan ? 0.15 : 0.26));
        const labelMetal =
          typeof visual.labelMetalness === 'number' && Number.isFinite(visual.labelMetalness)
            ? visual.labelMetalness
            : (slotSpec?.metalness ?? (isCan ? 0 : 0.02));
        const mat = isCan
          ? new THREE.MeshPhysicalMaterial({
              color: labelTexture ? '#ffffff' : (safeHex(slotSpec?.color) ?? '#f8f7f3'),
              map: labelTexture,
              roughness: labelRough,
              metalness: labelMetal,
              clearcoat: slotSpec?.clearcoat ?? 0.35,
              clearcoatRoughness: 0.14,
              envMapIntensity: 1.35,
              polygonOffset: true,
              polygonOffsetFactor: -1,
              polygonOffsetUnits: -1,
            })
          : new THREE.MeshStandardMaterial({
              color: labelTexture ? '#ffffff' : (safeHex(slotSpec?.color) ?? '#f8f7f3'),
              map: labelTexture,
              roughness: labelRough,
              metalness: labelMetal,
              envMapIntensity: 1.18,
              transparent: deferLabelAfterTransmission,
              opacity: 1,
              depthWrite: true,
              depthTest: true,
              side: THREE.FrontSide,
              polygonOffset: true,
              polygonOffsetFactor: -2,
              polygonOffsetUnits: -2,
            });
        attachPackedLabelHoverShader(
          mat,
          labelHoverUniforms,
          isCan ? 'can' : deferLabelAfterTransmission ? 'pet' : 'std',
        );
        createdMaterials.push(mat);
        return {
          material: mat,
          renderOrder: deferLabelAfterTransmission ? 30 : isGlassBottle ? 3 : 10,
          castShadow: true,
          receiveShadow: true,
        };
      }

      if (slot === 'ring') {
        const mat = createPetRingMaterial();
        createdMaterials.push(mat);
        return {
          material: mat,
          renderOrder: 21,
          castShadow: false,
          receiveShadow: false,
        };
      }

      if (slot === 'body' && model.category === 'pet') {
        const mat = createPetShellMaterial(safeHex(visual.bodyColor), visual.bodyRoughness);
        createdMaterials.push(mat);
        return {
          material: mat,
          renderOrder: 20,
          castShadow: false,
          receiveShadow: false,
        };
      }

      if (slot === 'body' && model.category === 'glass') {
        const lower = `${sourceMat.name} ${part.meshName}`.toLowerCase();
        const isNeck = lower.includes('neck');
        const isBase = lower.includes('base');
        // Use true physical glass wall thickness (1.6–4 mm) so refraction stays realistic
        // and crisp right up to label rims and caps without smudging across seams.
        const glassThickness = isBase ? 0.004 : isNeck ? 0.0016 : 0.0024;
        const mat = createPolishedGlassShellMaterial(
          glassThickness,
          isNeck,
          safeHex(visual.bodyColor),
          visual.bodyRoughness,
        );
        createdMaterials.push(mat);
        return {
          material: mat,
          renderOrder: 10,
          castShadow: !isNeck,
          receiveShadow: false,
        };
      }

      if (slot === 'liquid') {
        if (optical === 'milk-glass' || forceCreamyLiquid) {
          const mat = createMilkLiquidMaterial(resolvedLiquidHex, visual.liquidRoughness);
          createdMaterials.push(mat);
          return {
            material: mat,
            renderOrder: 0,
            castShadow: false,
            receiveShadow: false,
            captureOnly: true,
          };
        }
        if ((optical === 'basil-glass' || optical === 'chia-glass') && template.basilProfile) {
          const mat = createBasilGlassLiquidMaterial(
            template.basilProfile,
            part.localToBaseMatrix,
            resolvedLiquidHex,
          );
          createdMaterials.push(mat);
          return {
            material: mat,
            renderOrder: 0,
            castShadow: false,
            receiveShadow: false,
            captureOnly: true,
          };
        }
        if (
          (optical === 'aloe' || optical === 'nata' || optical === 'juice' || optical === 'energy') &&
          template.aloeProfile
        ) {
          const mat = createPetLiquidFrontMaterial(
            template.aloeProfile,
            part.localToBaseMatrix,
            resolvedLiquidHex,
            optical,
          );
          createdMaterials.push(mat);
          return {
            material: mat,
            renderOrder: 10,
            castShadow: true,
            receiveShadow: false,
          };
        }
        // Fallback liquid (if profile could not be fitted): saturated glowing liquid PBR
        const mat = new THREE.MeshPhysicalMaterial({
          color: aloeScatteringColor(new THREE.Color(resolvedLiquidHex)),
          roughness: 0.12,
          metalness: 0,
          clearcoat: 0.55,
          clearcoatRoughness: 0.08,
          envMapIntensity: 1.4,
          side: THREE.FrontSide,
        });
        createdMaterials.push(mat);
        return {
          material: mat,
          renderOrder: 5,
          castShadow: true,
          receiveShadow: false,
        };
      }

      if (slot === 'inclusions') {
        if ((optical === 'basil-glass' || optical === 'chia-glass') && template.basilProfile) {
          const hasHaloAttr = Boolean(part.geometry.getAttribute('packedSeedKind'));
          const mat = createGlassSeedInclusionsMaterial(
            template.basilProfile,
            part.localToBaseMatrix,
            resolvedLiquidHex,
            hasHaloAttr,
          );
          createdMaterials.push(mat);
          return {
            material: mat,
            renderOrder: 1,
            castShadow: false,
            receiveShadow: false,
            captureOnly: true,
          };
        }
        if (
          (optical === 'aloe' || optical === 'nata' || optical === 'juice' || optical === 'energy') &&
          template.aloeProfile
        ) {
          const mat = createPetInclusionMaterial(
            template.aloeProfile,
            part.localToBaseMatrix,
            resolvedLiquidHex,
            optical,
          );
          createdMaterials.push(mat);
          return {
            material: mat,
            renderOrder: 1,
            castShadow: false,
            receiveShadow: false,
            captureOnly: true,
          };
        }
        const incHex = safeHex(slotSpec?.color) ?? '#3a332b';
        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(incHex),
          roughness: slotSpec?.roughness ?? 0.65,
          metalness: 0,
        });
        createdMaterials.push(mat);
        return {
          material: mat,
          renderOrder: 4,
          castShadow: false,
          receiveShadow: false,
        };
      }

      if (slot === 'cap' || slot === 'tab') {
        const capHex =
          safeHex(visual.capColor) ??
          safeHex(slotSpec?.color) ??
          (origStd ? `#${origStd.color.getHexString()}` : '#c4c8cc');
        const isPlasticCap = model.category === 'pet' || model.category === 'pp';
        const capMetal =
          typeof visual.capMetalness === 'number' && Number.isFinite(visual.capMetalness)
            ? visual.capMetalness
            : (slotSpec?.metalness ?? (isPlasticCap ? 0 : 0.92));
        const capRough =
          typeof visual.capRoughness === 'number' && Number.isFinite(visual.capRoughness)
            ? visual.capRoughness
            : (slotSpec?.roughness ?? (isPlasticCap ? 0.29 : 0.3));
        // Glass bottle caps stay opaque so clear glass necks refract rear caps realistically.
        const deferCapAfterTransmission = isTransmissivePet;
        const mat = isPlasticCap
          ? new THREE.MeshPhysicalMaterial({
              color: new THREE.Color(capHex),
              metalness: capMetal,
              roughness: capRough,
              clearcoat: 0.16,
              clearcoatRoughness: 0.24,
              envMapIntensity: 1.22,
              transparent: deferCapAfterTransmission,
              opacity: 1,
              depthWrite: true,
              depthTest: true,
            })
          : new THREE.MeshStandardMaterial({
              color: new THREE.Color(capHex),
              metalness: capMetal,
              roughness: capRough,
              envMapIntensity: 1.5,
              transparent: deferCapAfterTransmission,
              opacity: 1,
              depthWrite: true,
              depthTest: true,
            });
        createdMaterials.push(mat);
        return {
          material: mat,
          renderOrder: deferCapAfterTransmission ? 30 : isGlassBottle ? 4 : 6,
          castShadow: true,
          receiveShadow: true,
        };
      }

      // Aluminum can body, PP opaque body, or untagged solid mesh (e.g. Glass 280 White layer)
      const mat = origStd
        ? origStd.clone()
        : new THREE.MeshStandardMaterial({ color: '#d4d8dc', roughness: 0.28, metalness: 0.7 });
      if (slot === 'body') {
        if (safeHex(visual.bodyColor)) mat.color.set(visual.bodyColor!);
        if (typeof visual.bodyMetalness === 'number' && Number.isFinite(visual.bodyMetalness)) {
          mat.metalness = visual.bodyMetalness;
        }
        if (typeof visual.bodyRoughness === 'number' && Number.isFinite(visual.bodyRoughness)) {
          mat.roughness = visual.bodyRoughness;
        }
      }
      if (model.category === 'can') {
        mat.envMapIntensity = 1.48;
      } else if (model.category === 'pp') {
        if (typeof visual.bodyRoughness !== 'number') {
          mat.roughness = slotSpec?.roughness ?? 0.3;
        }
        mat.envMapIntensity = 1.18;
      } else {
        mat.envMapIntensity = 1.2;
      }
      if (sourceMat.name === 'White layer') {
        mat.side = THREE.DoubleSide;
        mat.transparent = isTransmissiveBottle;
        mat.opacity = 1;
        mat.depthWrite = true;
      }
      createdMaterials.push(mat);
      return {
        material: mat,
        renderOrder: sourceMat.name === 'White layer' ? 30 : 2,
        castShadow: true,
        receiveShadow: true,
      };
    };

    for (const part of template.parts) {
      // Multi-material primitive (e.g., pet-1000-short-juice Body + Ring split): preserve all groups!
      if (part.materials.length > 1) {
        const partSlots = part.materials.map((_, idx) =>
          part.forcedSlot ?? resolveSemanticSlot(model, part.meshName, part.materialNames[idx] ?? ''),
        );
        const built = part.materials.map((srcMat, idx) =>
          buildSingleMaterial(part, srcMat, partSlots[idx]),
        );
        layers.push({
          geometry: part.geometry,
          material: built.map((b) => b.material),
          partLocalMatrix: part.localToBaseMatrix,
          name: `packed-bottle:${part.meshName || 'multi'}`,
          renderOrder: Math.max(...built.map((b) => b.renderOrder)),
          castShadow: built.some((b) => b.castShadow),
          receiveShadow: built.some((b) => b.receiveShadow),
          captureOnly: built.every((b) => b.captureOnly === true),
          materialSlots: partSlots,
          isInteractiveLabel: partSlots.includes('label'),
          isTransparentShell:
            (model.category === 'pet' || model.category === 'glass') && partSlots.includes('body'),
        });
        continue;
      }

      const srcMat = part.materials[0];
      const slot =
        part.forcedSlot ?? resolveSemanticSlot(model, part.meshName, part.materialNames[0] ?? '');

      // For translucent PET bottles, insert an opaque BackSide volumetric reservoir
      // captured exclusively into Three's transmission pass before the transmissive front liquid!
      if (
        slot === 'liquid' &&
        !forceCreamyLiquid &&
        template.aloeProfile &&
        (optical === 'aloe' || optical === 'nata' || optical === 'juice' || optical === 'energy')
      ) {
        const backMat = createPetLiquidBackMaterial(
          template.aloeProfile,
          part.localToBaseMatrix,
          resolvedLiquidHex,
          optical,
        );
        createdMaterials.push(backMat);
        layers.push({
          geometry: part.geometry,
          material: backMat,
          partLocalMatrix: part.localToBaseMatrix,
          name: `packed-bottle:${part.meshName || 'liquid'}:back`,
          renderOrder: 0,
          castShadow: false,
          receiveShadow: false,
          captureOnly: true,
          bottleSlot: 'liquid-back',
        });
      }

      // For clear glass & PET bottles, add the unprinted matte inner paper backing (BackSide)
      // of the wrapped label so looking through clear necks shows realistic curved paper stock
      // instead of an invisible culled backface or rear-bottle liquid bleeding through.
      if (slot === 'label' && isTransmissiveBottle) {
        const backPaperMat = createLabelPaperBackingMaterial();
        createdMaterials.push(backPaperMat);
        layers.push({
          geometry: part.geometry,
          material: backPaperMat,
          partLocalMatrix: part.localToBaseMatrix,
          name: `packed-bottle:${part.meshName || 'label'}:paper-back`,
          renderOrder: 2,
          castShadow: false,
          receiveShadow: false,
          bottleSlot: 'paper-back',
          isPaperBack: true,
        });
      }

      const built = buildSingleMaterial(part, srcMat, slot);
      layers.push({
        geometry: part.geometry,
        material: built.material,
        partLocalMatrix: part.localToBaseMatrix,
        name: `packed-bottle:${part.meshName || slot || 'part'}`,
        renderOrder: built.renderOrder,
        castShadow: built.castShadow,
        receiveShadow: built.receiveShadow,
        captureOnly: built.captureOnly,
        bottleSlot: slot,
        isInteractiveLabel: slot === 'label',
        isTransparentShell: slot === 'body' && (model.category === 'pet' || model.category === 'glass'),
      });
    }

    return { layers, materials: createdMaterials, textures: createdTextures };
  };

  return {
    group,
    sync(solved, config, visualSource) {
      if (disposed) return;
      currentSolved = solved;
      currentConfig = { ...config };

      if (!config.enabled || !visualSource) {
        buildRevision++;
        currentVisualKey = '';
        disposeActiveInstances();
        group.visible = false;
        callbacks?.onNeedsRender?.();
        return;
      }

      const maxSlots = Math.max(1, Math.min(24, Math.round(config.cols) * Math.round(config.rows)));
      const nextVisualKey = JSON.stringify([
        visualSource.model.id,
        visualSource.model.asset.src,
        visualSource.customProjectId ?? '',
        visualSource.customLabelUrl ?? '',
        visualSource.labelOffset ?? 0,
        visualSource.labelRoughness ?? '',
        visualSource.labelMetalness ?? '',
        visualSource.liquidColor ?? '',
        visualSource.liquidCustomized ?? false,
        visualSource.liquidClarity ?? '',
        visualSource.liquidDensity ?? '',
        visualSource.liquidTurbidity ?? '',
        visualSource.liquidBrightness ?? '',
        visualSource.liquidRoughness ?? '',
        visualSource.capColor ?? '',
        visualSource.capMetalness ?? '',
        visualSource.capRoughness ?? '',
        visualSource.bodyColor ?? '',
        visualSource.bodyMetalness ?? '',
        visualSource.bodyRoughness ?? '',
      ]);

      // Fast path: same model & appearance and capacity fits — update instance matrices in < 0.1 ms!
      if (
        nextVisualKey === currentVisualKey &&
        activeInstanced.length > 0 &&
        activeInstanced[0].mesh.instanceMatrix.count >= maxSlots &&
        loadedTemplates.has(visualSource.model.asset.src)
      ) {
        const tpl = loadedTemplates.get(visualSource.model.asset.src)!;
        currentFootprintMm = tpl.footprintMm;
        applySlotTransforms(solved, config, tpl.footprintMm, tpl.frontYaw);
        updateFoldVisibility(currentFoldProgress);
        callbacks?.onNeedsRender?.();
        return;
      }

      // Async load & build instanced bottle meshes (capacity = 24 so grid resizes never reallocate!)
      const rev = ++buildRevision;
      currentVisualKey = nextVisualKey;
      void (async () => {
        try {
          const template = await loadTemplate(visualSource.model);
          if (disposed || rev !== buildRevision) return;
          const { layers, materials, textures } = await buildLayersForTemplate(
            template,
            visualSource,
          );
          if (disposed || rev !== buildRevision) {
            materials.forEach((m) => m.dispose());
            textures.forEach((t) => t.dispose());
            return;
          }

          disposeActiveInstances();
          ownedMaterials = materials;
          ownedTextures = textures;
          currentFootprintMm = template.footprintMm;

          const maxCapacity = 24;
          for (const layer of layers) {
            const inst = new THREE.InstancedMesh(layer.geometry, layer.material, maxCapacity);
            inst.name = layer.name;
            inst.renderOrder = layer.renderOrder;
            inst.castShadow = layer.castShadow;
            inst.receiveShadow = layer.receiveShadow;
            inst.frustumCulled = false;
            inst.userData.packedBottle = true;
            inst.userData.bottleSlot = layer.bottleSlot;
            inst.userData.materialSlots = layer.materialSlots;
            inst.userData.isInteractiveLabel = Boolean(layer.isInteractiveLabel);
            inst.userData.isTransparentShell = Boolean(layer.isTransparentShell);
            inst.userData.isCaptureOnly = Boolean(layer.captureOnly);
            inst.userData.isPaperBack = Boolean(layer.isPaperBack);
            if (layer.captureOnly) {
              configureBottleCaptureOnly(inst);
            }
            group.add(inst);
            activeInstanced.push({
              mesh: inst,
              partLocalMatrix: layer.partLocalMatrix,
            });
          }

          if (currentSolved && currentConfig) {
            applySlotTransforms(currentSolved, currentConfig, template.footprintMm, template.frontYaw);
          }
          updateFoldVisibility(currentFoldProgress);
          callbacks?.onFootprintMeasured?.(visualSource.model.id, template.footprintMm);
          callbacks?.onNeedsRender?.();
        } catch {
          if (!disposed && rev === buildRevision) {
            disposeActiveInstances();
            group.visible = false;
          }
        }
      })();
    },
    setFoldProgress(progress) {
      updateFoldVisibility(progress);
    },
    setLabelHover(instanceId) {
      const next = instanceId === null || !Number.isFinite(instanceId) ? -1 : instanceId;
      if (labelHoverUniforms.uLabelHoverInstance.value === next) return;
      labelHoverUniforms.uLabelHoverInstance.value = next;
    },
    getRaycastMeshes() {
      if (!group.visible || !activeInstanced.length) return [];
      const out: THREE.InstancedMesh[] = [];
      for (const entry of activeInstanced) {
        const m = entry.mesh;
        if (!m.visible || m.count <= 0) continue;
        if (m.userData.isCaptureOnly || m.userData.isPaperBack) continue;
        out.push(m);
      }
      return out;
    },
    measureBounds() {
      const box = new THREE.Box3();
      if (!group.visible || !activeInstanced.length || !currentSolved || !currentConfig) {
        return box;
      }
      group.updateMatrixWorld(true);
      const fp =
        currentFootprintMm ?? getBeverageFootprintMm(currentConfig.modelId);
      const layout = computeBottlePackLayout(currentSolved, fp, currentConfig);
      if (!layout.slots.length) return box;

      const rx = fp.diameterXMm * 0.5 * MM_TO_METRE;
      const rz = fp.diameterZMm * 0.5 * MM_TO_METRE;
      const h = fp.heightMm * MM_TO_METRE;
      const corner = new THREE.Vector3();

      for (const slot of layout.slots) {
        const cx = slot.xMm * MM_TO_METRE;
        const cz = slot.zMm * MM_TO_METRE;
        for (const dx of [-rx, rx]) {
          for (const dy of [0, h]) {
            for (const dz of [-rz, rz]) {
              corner.set(cx + dx, dy, cz + dz).applyMatrix4(group.matrixWorld);
              box.expandByPoint(corner);
            }
          }
        }
      }
      return box;
    },
    getMeasuredFootprintMm() {
      return currentFootprintMm;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      buildRevision++;
      disposeActiveInstances();
      for (const tpl of loadedTemplates.values()) {
        tpl.parts.forEach((p) => {
          p.geometry.dispose();
          p.materials.forEach((m) => m.dispose());
        });
      }
      loadedTemplates.clear();
      templateCache.clear();
    },
  };
}
