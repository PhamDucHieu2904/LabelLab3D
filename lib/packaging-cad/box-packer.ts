import * as THREE from 'three';
import {
  MM_TO_METRE,
  type BottlePackConfig,
  type PackagingArtworkState,
  type PackagingParams,
  type SolvedDieline,
} from './types';
import {
  createDefaultPackagingParams,
  solvePackagingTemplate,
} from './templates/registry';
import {
  createPackagingMaterialSet,
  type PackagingMaterialSet,
} from './materials/corrugated-materials';
import {
  buildPackagingRig,
  easeInOutCubic,
  type BuiltPackagingRig,
} from './kinematics/rig-builder';
import {
  createPackagingTextureComposer,
  type PackagingTextureComposer,
} from './artwork-composer';
import {
  canPackRetailBoxes,
  computeBottlePackLayout,
  DEFAULT_PACKABLE_BOX_TEMPLATE_ID,
  isPackableRetailBoxTemplate,
  type BeverageFootprintMm,
} from './pack-layout';

export interface BoxPackVisualSource {
  /** Packaging parameters of the Tier-2 retail box (rendered strictly closed at foldProgress = 1). */
  params: PackagingParams;
  /** Optional hydrated face/dieline artwork & finish mask for saved retail box projects. */
  artwork?: PackagingArtworkState;
  /** Optional saved Custom Project metadata. */
  customProjectId?: string;
  customProjectName?: string;
  /** Stable cache key for artwork changes so texture baking only runs when artwork actually updates. */
  artworkKey?: string;
}

export interface MergedClosedBoxResult {
  geometry: THREE.BufferGeometry;
  windowFilmGeometry: THREE.BufferGeometry | null;
  footprintMm: BeverageFootprintMm;
  localBounds: THREE.Box3;
}

export interface BoxPackerHandle {
  readonly group: THREE.Group;
  sync(
    outerSolved: SolvedDieline,
    config: BottlePackConfig,
    visualSource: BoxPackVisualSource | null,
  ): void;
  setFoldProgress(progress: number): void;
  measureBounds(): THREE.Box3;
  getMeasuredFootprintMm(): BeverageFootprintMm | null;
  dispose(): void;
}

const EMPTY_ARTWORK: PackagingArtworkState = {
  mode: 'panel',
  panelOverlays: {},
};

function innerGeoSignature(p: PackagingParams): string {
  return JSON.stringify([
    p.templateId,
    p.lengthMm,
    p.widthMm,
    p.heightMm,
    p.dimensionMode,
    p.thicknessMm,
    p.fluteDirection,
    p.lockTabCount,
    p.frontLockTabCount,
    p.lockTabWidthMm,
    p.dustFlapTaperDeg,
    p.flapGapMm,
    p.tuckStyle,
    p.tuckFlapLengthMm,
    p.thumbNotch,
    p.thumbNotchRadiusMm,
    p.handHoles,
    p.handHoleWidthMm,
    p.handHoleHeightMm,
    p.displayScoop,
    p.displayScoopDepthMm,
    p.windowCutout,
    p.windowWidthMm,
    p.windowHeightMm,
    p.windowRadiusMm,
    p.windowFilm,
    p.lidDepthMm,
    p.carrierPack,
    p.dividerGrid,
    p.bendAllowanceK,
    p.slotClearanceMm,
  ]);
}

function innerVisualSignature(source: BoxPackVisualSource): string {
  const p = source.params;
  return JSON.stringify([
    p.materialId,
    p.outsideColor,
    p.insideColor,
    p.outsideRoughness,
    p.outsideMetalness,
    p.insideRoughness,
    p.finishMode,
    p.finishTarget,
    p.finishIntensity,
    p.finishRelief,
    p.finishThreshold,
    p.finishInvertMask,
    source.customProjectId ?? '',
    source.artworkKey ?? '',
  ]);
}

/**
 * Bake a closed Tier-2 packaging rig (`foldProgress = 1`) into a single bottom-centered
 * indexed BufferGeometry with 3 material groups (`0: outside`, `1: inside`, `2: edge`) plus
 * an optional merged transparent window-film geometry.
 *
 * Allows rendering up to 24 packed retail boxes inside an outer tray/carton in a single
 * `THREE.InstancedMesh` with 3 draw calls total and zero lingering per-box rig overhead.
 */
export function mergeClosedBoxRigGeometry(rig: BuiltPackagingRig): MergedClosedBoxResult {
  rig.setFoldProgress(1);
  rig.root.updateMatrixWorld(true);
  const rawBounds = rig.measureBounds();
  const center = rawBounds.getCenter(new THREE.Vector3());
  const rawSize = rawBounds.getSize(new THREE.Vector3());

  const offsetMat = new THREE.Matrix4().makeTranslation(-center.x, -rawBounds.min.y, -center.z);
  const combinedMat = new THREE.Matrix4();
  const normalMat = new THREE.Matrix3();
  const vPos = new THREE.Vector3();
  const vNorm = new THREE.Vector3();

  // Bucket triangles by target material group: 0 = outside, 1 = inside, 2 = edge.
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const bucketIndices: [number[], number[], number[]] = [[], [], []];

  const appendMesh = (
    mesh: THREE.Mesh,
    mapGroupIndex: (srcMatIndex: number) => 0 | 1 | 2,
  ) => {
    const geo = mesh.geometry;
    const posAttr = geo.getAttribute('position');
    if (!posAttr || posAttr.count === 0) return;
    const normAttr = geo.getAttribute('normal');
    const uvAttr = geo.getAttribute('uv');
    const colorAttr = geo.getAttribute('color');
    const idxAttr = geo.getIndex();

    combinedMat.multiplyMatrices(offsetMat, mesh.matrixWorld);
    normalMat.getNormalMatrix(combinedMat);

    const baseVertex = positions.length / 3;
    for (let i = 0; i < posAttr.count; i++) {
      vPos.fromBufferAttribute(posAttr, i).applyMatrix4(combinedMat);
      positions.push(vPos.x, vPos.y, vPos.z);

      if (normAttr) {
        vNorm.fromBufferAttribute(normAttr, i).applyMatrix3(normalMat).normalize();
        normals.push(vNorm.x, vNorm.y, vNorm.z);
      } else {
        normals.push(0, 1, 0);
      }

      if (uvAttr) {
        uvs.push(uvAttr.getX(i), uvAttr.getY(i));
      } else {
        uvs.push(0, 0);
      }

      if (colorAttr) {
        colors.push(colorAttr.getX(i), colorAttr.getY(i), colorAttr.getZ(i));
      } else {
        colors.push(1, 1, 1);
      }
    }

    const groups =
      geo.groups.length > 0
        ? geo.groups
        : [{ start: 0, count: idxAttr ? idxAttr.count : posAttr.count, materialIndex: 0 }];

    for (const grp of groups) {
      const targetSlot = mapGroupIndex(grp.materialIndex ?? 0);
      const dst = bucketIndices[targetSlot];
      const end = grp.start + grp.count;
      if (idxAttr) {
        for (let i = grp.start; i < end; i++) {
          dst.push(baseVertex + idxAttr.getX(i));
        }
      } else {
        for (let i = grp.start; i < end; i++) {
          dst.push(baseVertex + i);
        }
      }
    }
  };

  for (const { mesh } of rig.panelMeshes.values()) {
    appendMesh(mesh, (matIdx) => (matIdx === 1 ? 1 : matIdx === 2 ? 2 : 0));
  }
  for (const joint of rig.joints) {
    if (joint.fillet) {
      // Crease fillet groups: 0 = outside strip, 1 = 3-ply solid end caps (edge material).
      appendMesh(joint.fillet.mesh, (matIdx) => (matIdx === 0 ? 0 : 2));
    }
  }

  // Merge all 3 material buckets into a single BufferGeometry with contiguous group ranges.
  const mergedIndices: number[] = [];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  for (let slot = 0; slot < 3; slot++) {
    const start = mergedIndices.length;
    const list = bucketIndices[slot];
    for (let i = 0; i < list.length; i++) {
      mergedIndices.push(list[i]);
    }
    geo.addGroup(start, list.length, slot);
  }
  geo.setIndex(mergedIndices);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();

  // Collect optional transparent display window film meshes if present on the inner box.
  const filmPositions: number[] = [];
  const filmNormals: number[] = [];
  const filmUvs: number[] = [];
  const filmIndices: number[] = [];
  rig.root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || !obj.name.startsWith('window-film:')) return;
    const fGeo = obj.geometry;
    const fPos = fGeo.getAttribute('position');
    if (!fPos || fPos.count === 0) return;
    const fNorm = fGeo.getAttribute('normal');
    const fUv = fGeo.getAttribute('uv');
    const fIdx = fGeo.getIndex();
    combinedMat.multiplyMatrices(offsetMat, obj.matrixWorld);
    normalMat.getNormalMatrix(combinedMat);
    const baseV = filmPositions.length / 3;
    for (let i = 0; i < fPos.count; i++) {
      vPos.fromBufferAttribute(fPos, i).applyMatrix4(combinedMat);
      filmPositions.push(vPos.x, vPos.y, vPos.z);
      if (fNorm) {
        vNorm.fromBufferAttribute(fNorm, i).applyMatrix3(normalMat).normalize();
        filmNormals.push(vNorm.x, vNorm.y, vNorm.z);
      } else {
        filmNormals.push(0, 1, 0);
      }
      if (fUv) filmUvs.push(fUv.getX(i), fUv.getY(i));
      else filmUvs.push(0, 0);
    }
    if (fIdx) {
      for (let i = 0; i < fIdx.count; i++) filmIndices.push(baseV + fIdx.getX(i));
    } else {
      for (let i = 0; i < fPos.count; i++) filmIndices.push(baseV + i);
    }
  });

  let windowFilmGeometry: THREE.BufferGeometry | null = null;
  if (filmIndices.length > 0) {
    windowFilmGeometry = new THREE.BufferGeometry();
    windowFilmGeometry.setAttribute('position', new THREE.Float32BufferAttribute(filmPositions, 3));
    windowFilmGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(filmNormals, 3));
    windowFilmGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(filmUvs, 2));
    windowFilmGeometry.setIndex(filmIndices);
    windowFilmGeometry.computeBoundingBox();
    windowFilmGeometry.computeBoundingSphere();
  }

  const localBounds = geo.boundingBox ? geo.boundingBox.clone() : new THREE.Box3();
  const footprintMm: BeverageFootprintMm = {
    diameterXMm: Math.max(20, rawSize.x * 1000),
    diameterZMm: Math.max(20, rawSize.z * 1000),
    heightMm: Math.max(20, rawSize.y * 1000),
  };

  return {
    geometry: geo,
    windowFilmGeometry,
    footprintMm,
    localBounds,
  };
}

/**
 * Instanced 3D packer for Tier-2 retail boxes (e.g. ECMA A10 4-Can cartons, FEFCO 0427 mailers,
 * Rigid 2PC boxes) mounted inside a Tier-3 outer display tray or master shipping carton.
 *
 * Strictly non-recursive: inner boxes always render closed (`foldProgress = 1`) as a single
 * merged `InstancedMesh` sharing board PBR materials & composed artwork textures.
 */
export function createBoxPacker(callbacks?: {
  onNeedsRender?: () => void;
}): BoxPackerHandle {
  const group = new THREE.Group();
  group.name = 'packaging-packed-boxes';
  group.visible = false;

  let disposed = false;
  let innerSolved: SolvedDieline | null = null;
  let innerMaterials: PackagingMaterialSet | null = null;
  let innerComposer: PackagingTextureComposer | null = null;
  let mergedResult: MergedClosedBoxResult | null = null;
  let bodyInstanced: THREE.InstancedMesh | null = null;
  let filmInstanced: THREE.InstancedMesh | null = null;

  let lastGeoSig = '';
  let lastVisualSig = '';
  let bakeRevision = 0;
  let activeSlotCount = 0;
  let lastFoldProgress = 1;
  let lastEnabled = false;

  const tempMat = new THREE.Matrix4();
  const tempPos = new THREE.Vector3();
  const tempQuat = new THREE.Quaternion();
  const tempScale = new THREE.Vector3(1, 1, 1);
  const yAxis = new THREE.Vector3(0, 1, 0);

  const disposeInstancedMeshes = () => {
    if (bodyInstanced) {
      bodyInstanced.removeFromParent();
      bodyInstanced.dispose();
      bodyInstanced = null;
    }
    if (filmInstanced) {
      filmInstanced.removeFromParent();
      filmInstanced.dispose();
      filmInstanced = null;
    }
  };

  const disposePrototype = () => {
    disposeInstancedMeshes();
    if (mergedResult) {
      mergedResult.geometry.dispose();
      mergedResult.windowFilmGeometry?.dispose();
      mergedResult = null;
    }
    if (innerMaterials) {
      innerMaterials.dispose();
      innerMaterials = null;
    }
    if (innerComposer) {
      innerComposer.dispose();
      innerComposer = null;
    }
    innerSolved = null;
    lastGeoSig = '';
    lastVisualSig = '';
    activeSlotCount = 0;
  };

  const updateVisibilityForFold = () => {
    if (!lastEnabled || !bodyInstanced || activeSlotCount <= 0) {
      group.visible = false;
      return;
    }
    const reveal = easeInOutCubic((lastFoldProgress - 0.32) / 0.34);
    if (reveal <= 0.01) {
      group.visible = false;
      return;
    }
    group.visible = true;
    const s = Math.max(0.01, reveal);
    group.scale.set(s, s, s);
  };

  const updateInstanceTransforms = (outerSolved: SolvedDieline, config: BottlePackConfig) => {
    if (!mergedResult || !innerMaterials) return;
    const layout = computeBottlePackLayout(outerSolved, mergedResult.footprintMm, config);
    const count = layout.slots.length;
    activeSlotCount = count;

    if (count === 0) {
      disposeInstancedMeshes();
      group.visible = false;
      return;
    }

    if (!bodyInstanced || bodyInstanced.count !== count) {
      disposeInstancedMeshes();
      bodyInstanced = new THREE.InstancedMesh(
        mergedResult.geometry,
        [innerMaterials.outside, innerMaterials.inside, innerMaterials.edge],
        count,
      );
      bodyInstanced.name = 'packed-retail-boxes-body';
      bodyInstanced.castShadow = true;
      bodyInstanced.receiveShadow = true;
      bodyInstanced.frustumCulled = false;
      bodyInstanced.userData = { packedRetailBox: true };
      group.add(bodyInstanced);

      if (mergedResult.windowFilmGeometry) {
        filmInstanced = new THREE.InstancedMesh(
          mergedResult.windowFilmGeometry,
          innerMaterials.windowFilm,
          count,
        );
        filmInstanced.name = 'packed-retail-boxes-film';
        filmInstanced.castShadow = false;
        filmInstanced.receiveShadow = false;
        filmInstanced.frustumCulled = false;
        filmInstanced.userData = { packedRetailBox: true };
        group.add(filmInstanced);
      }
    }

    for (let i = 0; i < count; i++) {
      const slot = layout.slots[i];
      tempPos.set(slot.xMm * MM_TO_METRE, 0, slot.zMm * MM_TO_METRE);
      tempQuat.setFromAxisAngle(yAxis, slot.yawRad);
      tempScale.set(1, 1, 1);
      tempMat.compose(tempPos, tempQuat, tempScale);
      bodyInstanced.setMatrixAt(i, tempMat);
      filmInstanced?.setMatrixAt(i, tempMat);
    }
    bodyInstanced.instanceMatrix.needsUpdate = true;
    if (filmInstanced) filmInstanced.instanceMatrix.needsUpdate = true;
    updateVisibilityForFold();
  };

  const rebakeInnerTextures = async (
    targetSolved: SolvedDieline,
    artwork: PackagingArtworkState,
  ) => {
    if (!innerComposer || !innerMaterials) return;
    const rev = ++bakeRevision;
    const [outsideMap, insideMap, finishMaskMap] = await Promise.all([
      innerComposer.compose(targetSolved, artwork, 'outside'),
      innerComposer.compose(targetSolved, artwork, 'inside'),
      innerComposer.composeFinishMask(targetSolved, artwork),
    ]);
    if (disposed || rev !== bakeRevision || !innerMaterials || !innerComposer) return;
    innerMaterials.sync(targetSolved.params, targetSolved.material, {
      outsideMap,
      insideMap,
      finishMaskMap,
    });
    innerComposer.flushRetired();
    callbacks?.onNeedsRender?.();
  };

  return {
    group,
    sync(outerSolved, config, visualSource) {
      if (disposed) return;

      const active =
        Boolean(config.enabled) &&
        config.itemKind === 'box' &&
        canPackRetailBoxes(outerSolved.templateId);
      lastEnabled = active;

      if (!active) {
        group.visible = false;
        return;
      }

      // Resolve a strictly non-recursive Tier-2 retail box source (falling back to catalog ECMA A10).
      const rawParams =
        visualSource && isPackableRetailBoxTemplate(visualSource.params.templateId)
          ? visualSource.params
          : createDefaultPackagingParams(
              config.boxTemplateId && isPackableRetailBoxTemplate(config.boxTemplateId)
                ? config.boxTemplateId
                : DEFAULT_PACKABLE_BOX_TEMPLATE_ID,
            );

      const closedParams: PackagingParams = {
        ...rawParams,
        foldProgress: 1,
        showDimensions: false,
        showFaceLabels: false,
        showCreaseLines: false,
      };
      const effectiveSource: BoxPackVisualSource = {
        ...(visualSource ?? {}),
        params: closedParams,
      };

      const nextGeoSig = innerGeoSignature(closedParams);
      const nextVisualSig = innerVisualSignature(effectiveSource);
      const geoChanged = nextGeoSig !== lastGeoSig || !mergedResult || !innerMaterials || !innerSolved;
      const visualChanged = geoChanged || nextVisualSig !== lastVisualSig;

      if (geoChanged) {
        disposePrototype();
        const solvedInner = solvePackagingTemplate(closedParams);
        const mats = createPackagingMaterialSet(solvedInner.params, solvedInner.material);
        mats.syncDieline(solvedInner);
        mats.updateFoldProgress(1);
        const tempRig = buildPackagingRig(solvedInner, mats, { creaseSegments: 4 });
        const merged = mergeClosedBoxRigGeometry(tempRig);
        tempRig.dispose();

        innerSolved = solvedInner;
        innerMaterials = mats;
        innerComposer = createPackagingTextureComposer();
        mergedResult = merged;
        lastGeoSig = nextGeoSig;
      }

      if (visualChanged && innerSolved && innerMaterials) {
        innerSolved = {
          ...innerSolved,
          params: closedParams,
        };
        innerMaterials.sync(innerSolved.params, innerSolved.material);
        lastVisualSig = nextVisualSig;
        void rebakeInnerTextures(innerSolved, effectiveSource.artwork ?? EMPTY_ARTWORK);
      }

      updateInstanceTransforms(outerSolved, config);
    },
    setFoldProgress(progress) {
      if (disposed) return;
      lastFoldProgress = Math.max(0, Math.min(1, progress));
      updateVisibilityForFold();
    },
    measureBounds() {
      const out = new THREE.Box3();
      if (
        disposed ||
        !group.visible ||
        !bodyInstanced ||
        !mergedResult ||
        activeSlotCount <= 0
      ) {
        return out;
      }
      group.updateMatrixWorld(true);
      const instBox = new THREE.Box3();
      const instMat = new THREE.Matrix4();
      const worldMat = new THREE.Matrix4();
      for (let i = 0; i < activeSlotCount; i++) {
        bodyInstanced.getMatrixAt(i, instMat);
        worldMat.multiplyMatrices(bodyInstanced.matrixWorld, instMat);
        instBox.copy(mergedResult.localBounds).applyMatrix4(worldMat);
        out.union(instBox);
      }
      return out;
    },
    getMeasuredFootprintMm() {
      return mergedResult ? { ...mergedResult.footprintMm } : null;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      bakeRevision++;
      disposePrototype();
    },
  };
}
