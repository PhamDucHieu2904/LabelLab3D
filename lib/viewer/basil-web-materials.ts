import * as THREE from 'three';
import { addBottleBackdropProjection, createBottleBackdropUniforms, updateBottleBackdropUniforms } from './bottle-backdrop';
import type { ProductAsset } from '../viewer-config';
import { liquidColorUpdates } from './material-adjustments';
import { aloeTransmissionClearRadiance, correctAloeTransmissionClear } from './aloe-bottle-materials';
import { BASIL_WEB_OPTICS, BASIL_WEB_VOLUME_GLSL, basilWebAbsorption, configureBasilWebInclusions, createBasilWebUniforms, fitBasilWebProfile } from './basil-web-optics';
import { BASIL_WEB_SEED_MATERIAL, isBasilWebSeedMetadata } from './basil-web-seed-contract';
import { createGlassNeckMaterialContext } from './glass-neck-material';
import { configureGlass300Base } from './glass-300-base';
import { configurePaperBackingSampler, createPaperBackingUniforms, updatePaperBackingUniforms } from './paper-backing-capture';

type Role = 'body' | 'ring' | 'liquid' | 'liquid-back' | 'inclusions' | 'cap' | 'label';
const PROFILE = 'basil-web-v1';
const GLASS_PROFILES = new Set(['glass-290-v1', 'glass-300-v1']);
const GOLD = [.9528302, .8926178, .3460751] as const;
// Unprinted warm-white paper stock for the far side of wrapped 290 ml labels.
// When viewed through the glass body and liquid, the shaded BackSide capture
// feeds into Beer-Lambert water absorption instead of overwriting water pixels.
const PAPER_BACK_COLOR = '#ebe9e4';
// The clear 290 ml seed drinks use an explicit unprinted paper reverse. The
// artwork remains opaque on the near side; the back-face pass supplies the
// unprinted paper surface when viewed directly outside glass and feeds the
// shaded rear-paper capture for liquid Beer-Lambert attenuation.
const PAPER_BACKING_ASSETS = new Set([
  'basil-strawberry',
  'registry-glass-290-basil',
  'glass-290-chia',
  'glass-290-pullcap-basil',
  'glass-290-pullcap-chia',
]);

function isProfiledGlassNeck(asset: ProductAsset, mesh: THREE.Mesh, material: THREE.Material): boolean {
  const role = basilWebMaterialRole(asset, mesh, material);
  if (role !== 'body') return false;
  const name = `${material.name} ${mesh.name}`.toLowerCase();
  if (!name.includes('neck')) return false;
  return GLASS_PROFILES.has(material.userData.bottleProfile) ||
    GLASS_PROFILES.has(mesh.userData.bottleProfile) ||
    material.userData.basilProfile === PROFILE || mesh.userData.basilProfile === PROFILE;
}

export function basilWebMaterialRole(asset: ProductAsset, mesh: THREE.Mesh, material: THREE.Material): Role | undefined {
  if (mesh.userData.basilWebSeedBeauty === true) return 'inclusions';
  if (asset.packaging !== 'glass' ||
    (mesh.userData.basilProfile !== PROFILE && material.userData.basilProfile !== PROFILE &&
      !GLASS_PROFILES.has(mesh.userData.bottleProfile) && !GLASS_PROFILES.has(material.userData.bottleProfile))) return;
  return Object.entries(asset.materialSlots ?? {}).find(([, names]) => names.includes(material.name) || names.includes(mesh.name))?.[0] as Role | undefined;
}

/** Hydrated ellipsoids retain the High core fits and fixed gel offset. One
 * instance draw replaces 330 separate meshes; source geometry stays untouched. */
export function prepareBasilWebLayers(root: THREE.Object3D, asset: ProductAsset): void {
  if (asset.packaging !== 'glass') return;
  // Pooled GLTF roots can be cloned before their world matrices have been
  // refreshed. Ensure the explicit opaque backing is attached to the current
  // label geometry before appearance clones are made.
  root.updateMatrixWorld(true);
  // The appearance pool commits materials from a prepared clone, not its mesh
  // callbacks. Attach capture hooks to the actual root before cloning as well.
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    if (node.userData.basilWebLabelBackBeauty === true) {
      configureBottleBeautyOnly(node);
      return;
    }
    if (node.userData.basilWebSeedBeauty === true) {
      configureBottleBeautyOnly(node);
      return;
    }
    const role = (Array.isArray(node.material) ? node.material : [node.material]).map(material => basilWebMaterialRole(asset, node, material)).find(Boolean);
    if (role === 'liquid' || role === 'inclusions') configureCaptureOnly(node);
    else if (role === 'cap' || role === 'label') configureBottleBeautyOnly(node);
  });
  if (PAPER_BACKING_ASSETS.has(asset.id)) {
    const labels: THREE.Mesh[] = [];
    root.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      const role = (Array.isArray(node.material) ? node.material : [node.material])
        .map(material => basilWebMaterialRole(asset, node, material)).find(Boolean);
      if (role === 'label' && !node.userData.basilWebLabelBack && !node.userData.basilWebLabelBackBeauty) labels.push(node);
    });
    for (const label of labels) {
      const hasBeauty = label.children.some(child => child.userData.basilWebLabelBackBeauty === true);
      if (!hasBeauty) {
        // Keep the unprinted inner paper surface at the true 1:1 wrap radius.
        // Do NOT place a shrunken un-attenuated mesh in the transmission capture
        // pass: shrinking inside the water shoulder causes raw gray overwrites
        // and vertical Z-fighting spikes. Instead, paperBackingCapture renders
        // this mesh's shaded BackSide so Water and Seeds attenuate it through
        // the full Beer-Lambert liquid chord.
        const beautyMaterial = new THREE.MeshStandardMaterial({
          // Unprinted matte paper stock. It never samples the label artwork map,
          // so it cannot mirror front graphics onto the reverse side.
          color: PAPER_BACK_COLOR, roughness: .9, metalness: 0,
          side: THREE.BackSide, transparent: false, opacity: 1,
          depthWrite: true, depthTest: true,
          polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
        });
        beautyMaterial.name = 'PaperLabelBackBeauty';
        beautyMaterial.userData = { basilProfile: PROFILE, basilWebLabelBackBeauty: true };
        beautyMaterial.customProgramCacheKey = () => 'basil-web-paper-label-back-beauty-v2';
        const beautyBacking = new THREE.Mesh(label.geometry.clone(), beautyMaterial);
        beautyBacking.name = 'PaperLabel back (beauty)';
        beautyBacking.userData = { basilProfile: PROFILE, basilWebLabelBackBeauty: true };
        beautyBacking.renderOrder = 29;
        beautyBacking.visible = true;
        label.add(beautyBacking);
        configureBottleBeautyOnly(beautyBacking);
      }
      // Create the child before pooled appearance clones are made. The actual
      // artwork map is attached later by configure(), but the render slot must
      // already exist on every pooled root.
      // Opaque labels must terminate the ray. Do not add rear artwork or
      // liquid silhouettes: either pass makes the back of the label visible
      // through the front face.
    }
  }
  let owner: THREE.Object3D | undefined;
  root.traverse(node => { if (node.userData.basilWebSeeds) owner = node; });
  if (!owner || owner.children.some(child => child.userData.basilWebGenerated)) return;
  const metadata: unknown = owner.userData.basilWebSeeds;
  if (!isBasilWebSeedMetadata(metadata))
    throw new Error('Basil web gel metadata is invalid');
  const geometry = new THREE.SphereGeometry(1, 10, 6);
  const ratios = new Float32Array(metadata.count * 3);
  const material = new THREE.MeshStandardMaterial({ color: 'white' });
  material.name = BASIL_WEB_SEED_MATERIAL; material.userData.basilProfile = PROFILE;
  const mesh = new THREE.InstancedMesh(geometry, material, metadata.count);
  mesh.name = 'Basil hydrated seeds'; mesh.userData = { basilProfile: PROFILE, basilWebGenerated: true };
  const nativeToGlb = new THREE.Matrix4().set(...metadata.nativeToGlbMatrix as Parameters<THREE.Matrix4['set']>);
  const basis = new THREE.Matrix4(), axis = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  metadata.seeds.forEach((seed, i) => {
    const inverseAxes = [seed.inverseX, seed.inverseY, seed.inverseZ];
    inverseAxes.forEach((values, j) => {
      if (values.length !== 3 || !values.every(Number.isFinite)) throw new Error('Basil seed axis is invalid');
      axis[j].fromArray(values);
      const length = axis[j].length(), radius = 1 / length;
      if (!(length > 0)) throw new Error('Basil seed radius is invalid');
      ratios[i * 3 + j] = radius / (radius + metadata.gelThicknessNative);
      axis[j].multiplyScalar((radius + metadata.gelThicknessNative) / length);
    });
    basis.makeBasis(...axis as [THREE.Vector3, THREE.Vector3, THREE.Vector3]);
    basis.setPosition(new THREE.Vector3().fromArray(seed.center));
    basis.premultiply(nativeToGlb);
    // Ellipsoids are invariant under an axis reflection. Keep positive instance
    // determinants because Three does not support mirrored InstancedMesh draws.
    if (basis.determinant() < 0) for (let j = 0; j < 3; j++) basis.elements[j] *= -1;
    mesh.setMatrixAt(i, basis);
  });
  geometry.setAttribute('basilCoreRatio', new THREE.InstancedBufferAttribute(ratios, 3));
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.computeBoundingBox(); mesh.computeBoundingSphere();
  owner.add(mesh);
  configureCaptureOnly(mesh);
}

const beautyTargets = new WeakMap<THREE.WebGLRenderer, THREE.WebGLRenderTarget | null>();
const restorations = new WeakMap<THREE.WebGLRenderer, Set<() => void>>();
const captureOnly = new WeakSet<THREE.Mesh>();
const beautyOnly = new WeakSet<THREE.Mesh>();
export function beginBasilWebRender(renderer: THREE.WebGLRenderer) { beautyTargets.set(renderer, renderer.getRenderTarget()); }
export function endBasilWebRender(renderer: THREE.WebGLRenderer) {
  restorations.get(renderer)?.forEach(restore => restore());
  beautyTargets.delete(renderer);
}
export function configureBottleCaptureOnly(mesh: THREE.Mesh) {
  configureCaptureOnly(mesh);
}
function configureCaptureOnly(mesh: THREE.Mesh) {
  if (captureOnly.has(mesh)) return;
  captureOnly.add(mesh);
  configureRenderLayer(mesh, false);
}

/** Exclude solid cap/print from the refracted reservoir while retaining their
 * depth and interior faces in the final beauty draw. */
export function configureBottleBeautyOnly(mesh: THREE.Mesh) {
  if (beautyOnly.has(mesh)) return;
  beautyOnly.add(mesh);
  configureRenderLayer(mesh, true);
}

function configureRenderLayer(mesh: THREE.Mesh, onlyBeauty: boolean) {
  const before = mesh.onBeforeRender, after = mesh.onAfterRender;
  let restore: (() => void) | undefined;
  mesh.onBeforeRender = function(renderer, scene, camera, geometry, material, group) {
    before.call(this, renderer, scene, camera, geometry, material, group);
    if (!beautyTargets.has(renderer)) return;
    const isBeauty = renderer.getRenderTarget() === beautyTargets.get(renderer);
    if (isBeauty === onlyBeauty) return;
    const { start, count } = geometry.drawRange;
    let pending = restorations.get(renderer);
    if (!pending) { pending = new Set(); restorations.set(renderer, pending); }
    const restoreDraw = () => { geometry.setDrawRange(start, count); pending.delete(restoreDraw); restore = undefined; };
    restore = restoreDraw; pending.add(restoreDraw); geometry.setDrawRange(0, 0);
  };
  mesh.onAfterRender = function(renderer, scene, camera, geometry, material, group) {
    restore?.(); after.call(this, renderer, scene, camera, geometry, material, group);
  };
}

/** Geometry supplies molded base refraction. A single native opaque capture
 * contains the back water and seed/gel response, with no BVH/data textures,
 * per-seed transmission, DOM backdrop capture, or alternate environment. */
export function createBasilWebBottleMaterialContext(root: THREE.Object3D, asset: ProductAsset) {
  let water: THREE.Mesh | undefined;
  root.traverse(node => {
    if (node instanceof THREE.Mesh && (Array.isArray(node.material) ? node.material : [node.material]).some(material => basilWebMaterialRole(asset, node, material) === 'liquid')) water = node;
  });
  if (!water) return;
  root.updateMatrixWorld(true);
  const rootInverse = root.matrixWorld.clone().invert();
  const toMetric = (mesh: THREE.Mesh) => new THREE.Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld);
  let tracedNeck = false;
  root.traverse(node => {
    if (node instanceof THREE.Mesh && (Array.isArray(node.material) ? node.material : [node.material]).some(material =>
      (Number.isFinite(material.userData.basilWebNeckWallMetres) && material.userData.basilWebNeckWallMetres > 0) ||
      isProfiledGlassNeck(asset, node, material))) tracedNeck = true;
  });
  const neckOptics = tracedNeck ? createGlassNeckMaterialContext(root, (mesh, material) => {
    if ((Number.isFinite(material.userData.basilWebNeckWallMetres) && material.userData.basilWebNeckWallMetres > 0) ||
      isProfiledGlassNeck(asset, mesh, material)) return 1;
    const role = basilWebMaterialRole(asset, mesh, material);
      return role === 'cap' ? 3 : role === 'label' ? 4 : role === 'liquid' ? 5 : undefined;
  }) : undefined;
  const profile = fitBasilWebProfile(water.geometry, toMetric(water));
  if (!profile) throw new Error('Basil web water profile is empty');
  const color = new THREE.Color('#be2838');
  const shared: Record<string, THREE.IUniform> = {
    ...createBottleBackdropUniforms(),
    ...createPaperBackingUniforms(),
    basilWebLiquidColor: { value: color }, basilWebAbsorption: { value: new THREE.Vector3() },
    basilWebSeedColor: { value: new THREE.Color().setRGB(...BASIL_WEB_OPTICS.seedColorSrgb, THREE.SRGBColorSpace) },
    basilWebSeedDepth: { value: BASIL_WEB_OPTICS.seedDepthPerMetre },
    // The shared softbox is brighter than the reference room. Keep the hydrated
    // rim visible without turning its transmitted haze into a white ring.
    basilWebGelHaze: { value: .18 },
  };
  const srgb = new THREE.Color();
  const applyColor = (value: string) => {
    color.set(value); srgb.copy(color).convertLinearToSRGB();
    shared.basilWebAbsorption.value.copy(basilWebAbsorption(srgb));
    const paper = new THREE.Color(PAPER_BACK_COLOR);
    root.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      if (node.userData.basilWebLabelBackBeauty !== true) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach(material => {
        if (material.name === 'PaperLabelBackBeauty') material.color.copy(paper);
      });
    });
  };
  applyColor('#be2838');
  return {
    ready: undefined as Promise<void> | undefined,
    dispose: neckOptics ? () => neckOptics.dispose() : undefined,
    defaultColor: color.clone(),
    configure(material: THREE.MeshStandardMaterial, mesh: THREE.Mesh, role: Role, juiceColor?: string, capColor?: string) {
      material.visible = true;
      if (role === 'cap' || role === 'label') {
        neckOptics?.registerOpaque(material, role === 'cap' ? 3 : 4);
        configureBottleBeautyOnly(mesh);
        material.transparent = false; material.opacity = 1; material.depthWrite = true; material.depthTest = true;
        material.side = THREE.DoubleSide; material.forceSinglePass = true;
        if (material instanceof THREE.MeshPhysicalMaterial) material.transmission = 0;
        if (role === 'cap') { material.metalness = 1; material.roughness = .388; material.color.setRGB(...GOLD, THREE.SRGBColorSpace); if (capColor) material.color.set(capColor); }
        else {
          // The near printed face remains opaque.  For the clear 290 ml seed
          // drinks, culling the far beauty face lets the transmission pass
          // show water and seeds over the opaque paper backing underneath.
          material.side = PAPER_BACKING_ASSETS.has(asset.id) ? THREE.FrontSide : THREE.DoubleSide;
          material.metalness = 0; material.roughness = .5;
        }
        return;
      }
      const meshToMetric = toMetric(mesh);
      if (role === 'liquid' || role === 'inclusions') {
        applyColor(juiceColor ?? '#be2838');
        liquidColorUpdates.set(material, applyColor);
        if (mesh.userData.basilWebSeedBeauty === true) configureBottleBeautyOnly(mesh);
        else configureCaptureOnly(mesh);
        if (role === 'inclusions') {
          if (mesh instanceof THREE.InstancedMesh) {
            configureBasilWebInclusions(material, mesh, profile, meshToMetric, shared);
            return;
          }
          // Glass 290 Chia ships its authored seeds as a regular mesh. Draw it
          // into the Basil water capture only; the final beauty pass then shows
          // it through the calibrated glass and keeps it behind the label.
          material.color.set('#302a24'); material.metalness = 0; material.roughness = .74;
          material.transparent = false; material.opacity = 1; material.depthWrite = true;
          material.side = THREE.DoubleSide; material.toneMapped = false;
          configureCaptureOnly(mesh);
          material.customProgramCacheKey = () => 'basil-web-raw-seeds-v1';
          return;
        }
        const uniforms = createBasilWebUniforms(profile, meshToMetric, shared);
        material.color.setRGB(1, 1, 1); material.metalness = 0; material.roughness = 1;
        material.transparent = false; material.opacity = 1; material.side = THREE.BackSide; material.depthWrite = true;
        if (material instanceof THREE.MeshPhysicalMaterial) material.transmission = 0;
        // Milk shares the same glass/capture layers, but its dense liquid must
        // retain its own pigment rather than expose the page through water.
        if (material.userData.bottleLiquidKind === 'milk') {
          // Opaque milk shades the nearest outward interface. The absorption
          // reservoir's BackSide would expose the far wall and hide its top.
          material.side = THREE.FrontSide;
          const updateMilk = (value: string) => material.color.set(value);
          updateMilk(juiceColor ?? '#fff5e4');
          liquidColorUpdates.set(material, updateMilk);
          neckOptics?.registerLiquid(material.color, {
            clarity: 0, density: 1, turbidity: 1, brightness: 1,
            scattering: .9, roughness: .8, ior: 1.333,
          }, material, material.userData.bottleProfile === 'glass-300-v1' ? .18 : 0);
          // The Milk interior outputs the liquid pigment directly. Native
          // diffuse lighting creates a gray disc on the downward-facing water
          // surface. Glass still supplies the outer reflections/refraction;
          // tone mapping and explicit live optics run after this reservoir.
          material.onBeforeCompile = shader => {
            shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>',
              'gl_FragColor = vec4(diffuse, 1.0);');
          };
          material.customProgramCacheKey = () => 'basil-web-milk-reservoir-v2';
          return;
        }
        neckOptics?.registerLiquid(color, undefined, material);
        material.onBeforeCompile = shader => {
          Object.assign(shader.uniforms, uniforms);
          addBottleBackdropProjection(shader);
          configurePaperBackingSampler(shader, uniforms as ReturnType<typeof createPaperBackingUniforms>);
          shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${BASIL_WEB_VOLUME_GLSL}\nvarying float vBasilWebChord;`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>\nvec3 basilPoint=(basilWebMeshToMetric*vec4(transformed,1.0)).xyz;\nvec3 basilRay=basilWebOrthographic>.5?-basilWebViewMetric:normalize(basilWebCameraMetric-basilPoint);\nvBasilWebChord=basilWebExit(basilPoint,basilRay);`);
          shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 basilWebAbsorption;\nvarying float vBasilWebChord;')
            .replace('#include <opaque_fragment>', 'vec2 basilWaterUv=bottleBackdropUv(); vec4 basilPaper=paperBackingSample(basilWaterUv); vec3 basilPaperColor=basilPaper.a>.001?basilPaper.rgb/basilPaper.a:paperBackingRadiance; vec3 basilWaterSource=mix(bottleBackdropAt(basilWaterUv),basilPaperColor,basilPaper.a); gl_FragColor=vec4(basilWaterSource*exp(-basilWebAbsorption*max(0.0,vBasilWebChord)),1.0);');
        };
        const inverseWorld = new THREE.Matrix4();
        material.onBeforeRender = (_renderer, scene, camera, _geometry, object) => {
          updateBottleBackdropUniforms(shared as ReturnType<typeof createBottleBackdropUniforms>, scene);
          updatePaperBackingUniforms(shared as ReturnType<typeof createPaperBackingUniforms>, _renderer);
          inverseWorld.copy(object.matrixWorld).invert();
          camera.getWorldPosition(uniforms.basilWebCameraMetric.value).applyMatrix4(inverseWorld).applyMatrix4(meshToMetric);
          camera.getWorldDirection(uniforms.basilWebViewMetric.value).transformDirection(inverseWorld).transformDirection(meshToMetric);
          uniforms.basilWebOrthographic.value = camera instanceof THREE.OrthographicCamera ? 1 : 0;
        };
        material.customProgramCacheKey = () => 'basil-web-back-water-v2';
        return;
      }
      if (role !== 'body' || !(material instanceof THREE.MeshPhysicalMaterial)) return;
      if (material.userData.bottleProfile === 'glass-300-v1' &&
        (material.name === 'Base' || material.name === 'GlassBase' || mesh.name === 'Base' || mesh.name === 'GlassBase')) {
        configureGlass300Base(material, mesh, meshToMetric);
        return;
      }
      const neck = material.name === 'basil-web-neck' || material.name === 'Neck';
      const authoredNeckWall = neck && typeof material.userData.basilWebNeckWallMetres === 'number' && Number.isFinite(material.userData.basilWebNeckWallMetres)
        ? Math.max(.0001, material.userData.basilWebNeckWallMetres) : undefined;
      material.color.setRGB(1, 1, 1); material.metalness = 0; material.roughness = neck ? .15 : BASIL_WEB_OPTICS.glassRoughness;
      material.normalMap = null; material.roughnessMap = null; material.map = null;
      material.transparent = true; material.opacity = 1; material.depthWrite = true; material.side = THREE.FrontSide;
      material.transmission = 1; material.ior = BASIL_WEB_OPTICS.glassIOR;
      material.attenuationColor.setRGB(1, 1, 1); material.attenuationDistance = Infinity;
      const tracedNeckWall = authoredNeckWall ?? (isProfiledGlassNeck(asset, mesh, material) ? .0013 : undefined);
      if (tracedNeckWall && neckOptics) {
        material.thickness = tracedNeckWall * 2;
        neckOptics.configure(material, mesh);
        return;
      }
      // Legacy Basil surfaces retain their calibrated native transmission.
      // The authored pull-cap shell above follows its actual inner/outer mesh.
      const physicalThickness = neck ? .0013 : Math.min(profile.halfBounds.x, profile.halfBounds.y) * .42;
      material.thickness = physicalThickness;
      const uniforms = { aloeClearRadiance: { value: 1 }, basilWebWorldThickness: { value: physicalThickness } };
      const metricToLocal = meshToMetric.clone().invert(), metricToWorld = new THREE.Matrix4();
      material.onBeforeRender = (renderer, _scene, _camera, _geometry, object) => {
        uniforms.aloeClearRadiance.value = aloeTransmissionClearRadiance(renderer);
        metricToWorld.copy(object.matrixWorld).multiply(metricToLocal);
        uniforms.basilWebWorldThickness.value = physicalThickness * metricToWorld.getMaxScaleOnAxis();
      };
      material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, uniforms);
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float aloeClearRadiance;\nuniform float basilWebWorldThickness;')
          .replace('#include <transmission_pars_fragment>', correctAloeTransmissionClear(THREE.ShaderChunk.transmission_pars_fragment)
            .replace('return normalize( refractionVector ) * thickness * modelScale;', 'return normalize( refractionVector ) * basilWebWorldThickness;'))
          .replace('#include <opaque_fragment>', `
            float capturedCoverage=clamp(material.transmissionAlpha,0.0,1.0);
            float highlight=clamp(max(max(totalSpecular.r,totalSpecular.g),totalSpecular.b),0.0,1.0);
            float fresnel=pow(1.0-saturate(dot(normal,geometryViewDir)),5.0);
            float coverage=capturedCoverage+(1.0-capturedCoverage)*clamp(highlight*.35+fresnel*.15,0.0,1.0);
            gl_FragColor=vec4((totalDiffuse*capturedCoverage+totalSpecular)/max(coverage,.0001),coverage);
          `);
      };
      material.customProgramCacheKey = () => 'basil-web-polished-shell-v1';
    },
  };
}
