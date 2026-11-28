import * as THREE from 'three';
import type { InteractivePickTarget, ProceduralSubject } from '../mockup/contracts';
import type {
  BottlePackConfig,
  PackagingArtworkState,
  PackagingParams,
  PackagingPartGroup,
  SolvedDieline,
} from './types';
import { solvePackagingTemplate } from './templates/registry';
import { createPackagingMaterialSet } from './materials/corrugated-materials';
import { buildPackagingRig, type BuiltPackagingRig } from './kinematics/rig-builder';
import { cad2DToLocal3D } from './geometry/solid-builder';
import { createDimensionOverlay3D } from './geometry/dimension-overlay';
import {
  createPackagingTextureComposer,
  getPanelUprightSizeMm,
  isInteractivePackagingPanel,
} from './artwork-composer';
import {
  createBottlePacker,
  type BottlePackVisualSource,
} from './bottle-packer';
import {
  createBoxPacker,
  type BoxPackVisualSource,
} from './box-packer';
import {
  canPackRetailBoxes,
  computeBottlePackLayout,
  getBeverageFootprintMm,
  type BeverageFootprintMm,
} from './pack-layout';
import {
  buildHoneycombPartitionGeometry,
  buildMailerInsertTrayGeometry,
  getHoneycombDividerThicknessMm,
} from './geometry/partition-builder';

export interface PackagingSubjectController extends ProceduralSubject {
  getSolved(): SolvedDieline;
  /** Rebuild geometry & materials when structural/dimension/material params change. */
  syncParams(params: PackagingParams, options?: { interactive?: boolean }): SolvedDieline;
  /** Sync "Pack Your Products" combo contents (bottles/cans OR Tier-2 retail boxes) inside the current box/tray. */
  syncBottlePack(
    config: BottlePackConfig,
    visualSource: BottlePackVisualSource | null,
    boxVisualSource?: BoxPackVisualSource | null,
  ): void;
  /** Ultra-fast folding update (zero geometry rebuild, 60-120 FPS). */
  setFoldProgress(progress: number): void;
  /** Toggle smooth ping-pong open/close fold playback animation. */
  setFoldPlaying(playing: boolean, onProgress?: (progress: number) => void): void;
  /** Live highlight specific parts when hovering inspector inputs. */
  setHighlightGroup(group: PackagingPartGroup | null): void;
  /** Re-bake outside/inside canvas textures from artwork & quick panel overlays. */
  syncArtwork(artwork: PackagingArtworkState): Promise<void>;
  /** Hide/show 3D CAD dimension rulers (e.g. toggle or temporarily hide for clean PNG capture). */
  setDimensionsVisible(visible: boolean): void;
}

function geometrySignature(p: PackagingParams): string {
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

/**
 * Bridges `lib/packaging-cad/` to LabelLab's shared Three.js `MockupRuntime`.
 * Manages geometry rebuilds, zero-leak disposal, smooth folding animation,
 * 3D millimeter callout overlays, rounded-box ground shadows, and dual-side artwork textures.
 */
export function createPackagingSubject(
  initialParams: PackagingParams,
  initialArtwork: PackagingArtworkState,
  callbacks?: {
    onNeedsRender?: () => void;
    onBottleFootprintMeasured?: (modelId: string, footprintMm: BeverageFootprintMm) => void;
    onBoundsChanged?: () => void;
  },
): PackagingSubjectController {
  const root = new THREE.Group();
  root.name = 'packaging-subject-root';

  let currentParams = { ...initialParams };
  let currentArtwork = initialArtwork;
  let currentBottleConfig: BottlePackConfig | null = null;
  let currentBottleVisual: BottlePackVisualSource | null = null;
  let currentBoxVisual: BoxPackVisualSource | null = null;
  let solved = solvePackagingTemplate(currentParams);
  let lastGeoSig = geometrySignature(solved.params);
  let currentHighlight: PackagingPartGroup | null = null;
  let currentHoverTarget: InteractivePickTarget | null = null;
  let foldPlaying = false;
  let foldDirection: 1 | -1 = -1;
  let foldCallback: ((progress: number) => void) | undefined;
  let disposed = false;
  let artworkRevision = 0;

  const materials = createPackagingMaterialSet(solved.params, solved.material);
  materials.syncDieline(solved);
  materials.updateFoldProgress(solved.params.foldProgress);
  const composer = createPackagingTextureComposer();
  const dimensionsOverlay = createDimensionOverlay3D();
  root.add(dimensionsOverlay.group);

  let rig: BuiltPackagingRig = buildPackagingRig(solved, materials, { creaseSegments: 6 });
  root.add(rig.root);

  let cachedBoxBounds = new THREE.Box3();
  let cachedBounds = new THREE.Box3();
  let honeycombMesh: THREE.Mesh | null = null;
  let lastHoneycombSig = '';

  const disposeHoneycombMesh = () => {
    if (!honeycombMesh) return;
    honeycombMesh.removeFromParent();
    honeycombMesh.geometry.dispose();
    honeycombMesh = null;
    lastHoneycombSig = '';
  };

  const syncHoneycombPartition = () => {
    if (disposed) return;
    const cfg = currentBottleConfig;
    const packingBoxes = Boolean(cfg?.enabled) && cfg?.itemKind === 'box' && canPackRetailBoxes(solved.templateId);
    const showHoneycomb =
      !packingBoxes &&
      solved.templateId === 'fefco-0201-rsc' &&
      Boolean(cfg?.enabled) &&
      Boolean(cfg?.honeycombDividers) &&
      (Math.round(cfg?.cols ?? 1) > 1 || Math.round(cfg?.rows ?? 1) > 1);
    const showMailerInsert =
      !packingBoxes &&
      solved.templateId === 'fefco-0427-mailer' &&
      Boolean(cfg?.enabled) &&
      Boolean(cfg?.productInsert);

    if ((!showHoneycomb && !showMailerInsert) || !cfg) {
      disposeHoneycombMesh();
      return;
    }

    const cols = Math.max(1, Math.min(6, Math.round(cfg.cols)));
    const rows = Math.max(1, Math.min(4, Math.round(cfg.rows)));
    const measuredFp =
      bottlePacker.getMeasuredFootprintMm() ??
      getBeverageFootprintMm(cfg.modelId, currentBottleVisual?.model.asset.volumeMl);

    if (showMailerInsert) {
      const layout = computeBottlePackLayout(solved, measuredFp, cfg);
      const sig = JSON.stringify([
        'mailer-insert',
        solved.innerMm.length,
        solved.innerMm.width,
        solved.innerMm.height,
        solved.params.thicknessMm,
        cols,
        rows,
        cfg.spacingMm,
        cfg.wallPaddingMm,
        Math.round(measuredFp.diameterXMm * 10),
        Math.round(measuredFp.diameterZMm * 10),
        Math.round(measuredFp.heightMm * 10),
      ]);
      if (sig === lastHoneycombSig && honeycombMesh) {
        if (honeycombMesh.parent !== bottlePacker.group) {
          bottlePacker.group.add(honeycombMesh);
        }
        return;
      }

      disposeHoneycombMesh();
      const geo = buildMailerInsertTrayGeometry({
        innerL: solved.innerMm.length,
        innerW: solved.innerMm.width,
        innerH: solved.innerMm.height,
        slots: layout.slots,
        itemMm: measuredFp,
        boardThicknessMm: solved.params.thicknessMm,
      });
      if (!geo) return;

      const mesh = new THREE.Mesh(geo, [materials.partition, materials.edge]);
      mesh.name = 'mailer-product-insert';
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      bottlePacker.group.add(mesh);
      honeycombMesh = mesh;
      lastHoneycombSig = sig;
      return;
    }

    const divT = getHoneycombDividerThicknessMm(solved.params.thicknessMm);
    const sig = JSON.stringify([
      'honeycomb',
      solved.innerMm.length,
      solved.innerMm.width,
      solved.innerMm.height,
      cols,
      rows,
      divT,
      Math.round(measuredFp.heightMm * 10),
    ]);
    if (sig === lastHoneycombSig && honeycombMesh) {
      if (honeycombMesh.parent !== bottlePacker.group) {
        bottlePacker.group.add(honeycombMesh);
      }
      return;
    }

    disposeHoneycombMesh();
    const geo = buildHoneycombPartitionGeometry({
      innerL: solved.innerMm.length,
      innerW: solved.innerMm.width,
      innerH: solved.innerMm.height,
      cols,
      rows,
      dividerThicknessMm: divT,
      itemHeightMm: measuredFp.heightMm,
    });
    if (!geo) return;

    const mesh = new THREE.Mesh(geo, [materials.partition, materials.edge]);
    mesh.name = 'honeycomb-partition';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    bottlePacker.group.add(mesh);
    honeycombMesh = mesh;
    lastHoneycombSig = sig;
  };

  const bottlePacker = createBottlePacker({
    onNeedsRender: () => {
      if (disposed) return;
      syncHoneycombPartition();
      cachedBounds = computeCombinedBounds();
      callbacks?.onBoundsChanged?.();
      callbacks?.onNeedsRender?.();
    },
    onFootprintMeasured: (modelId, footprintMm) => {
      syncHoneycombPartition();
      callbacks?.onBottleFootprintMeasured?.(modelId, footprintMm);
    },
  });

  const boxPacker = createBoxPacker({
    onNeedsRender: () => {
      if (disposed) return;
      cachedBounds = computeCombinedBounds();
      callbacks?.onBoundsChanged?.();
      callbacks?.onNeedsRender?.();
    },
  });

  const attachBottlePackToRig = () => {
    const anchor = solved.contentAnchor;
    const frame = rig.panelFrames.get(anchor.panelId);
    const hostGroup = frame?.group ?? rig.root;
    const originX = frame?.originX ?? 0;
    const originY = frame?.originY ?? 0;
    const pivotYmm = frame?.pivotYmm ?? 0;
    const [ax, ay, az] = cad2DToLocal3D(
      anchor.center2D,
      originX,
      originY,
      anchor.floorOffsetMm - pivotYmm,
    );
    bottlePacker.group.position.set(ax, ay, az);
    hostGroup.add(bottlePacker.group);
    bottlePacker.setFoldProgress(currentParams.foldProgress);
    boxPacker.group.position.set(ax, ay, az);
    hostGroup.add(boxPacker.group);
    boxPacker.setFoldProgress(currentParams.foldProgress);
  };

  const syncInteriorPackers = () => {
    if (!currentBottleConfig) return;
    const packingBoxes =
      currentBottleConfig.enabled &&
      currentBottleConfig.itemKind === 'box' &&
      canPackRetailBoxes(solved.templateId);
    if (packingBoxes) {
      bottlePacker.sync(solved, { ...currentBottleConfig, enabled: false }, null);
      boxPacker.sync(solved, currentBottleConfig, currentBoxVisual);
    } else {
      boxPacker.sync(solved, { ...currentBottleConfig, enabled: false }, null);
      bottlePacker.sync(solved, currentBottleConfig, currentBottleVisual);
    }
  };

  const computeCombinedBounds = (): THREE.Box3 => {
    const combined = cachedBoxBounds.clone();
    const bottleBounds = bottlePacker.measureBounds();
    if (!bottleBounds.isEmpty()) {
      combined.union(bottleBounds);
    }
    const boxBounds = boxPacker.measureBounds();
    if (!boxBounds.isEmpty()) {
      combined.union(boxBounds);
    }
    return combined;
  };

  attachBottlePackToRig();

  const centerRigAndMeasure = (): THREE.Box3 => {
    // Keep the box horizontally centered on X/Z and resting with its lowest point at y = 0.
    rig.root.position.set(0, 0, 0);
    rig.root.updateMatrixWorld(true);
    const raw = rig.measureBounds();
    const center = raw.getCenter(new THREE.Vector3());
    rig.root.position.set(-center.x, -raw.min.y, -center.z);
    rig.root.updateMatrixWorld(true);

    const grounded = raw.clone().translate(new THREE.Vector3(-center.x, -raw.min.y, -center.z));
    cachedBoxBounds = grounded;
    const displayDims = currentParams.dimensionMode === 'inner' ? solved.innerMm : solved.outerMm;
    dimensionsOverlay.update(grounded, displayDims, {
      visible: currentParams.showDimensions,
      highlight: currentHighlight,
      modeLabel: currentParams.dimensionMode,
    });
    return computeCombinedBounds();
  };

  cachedBounds = centerRigAndMeasure();

  const rebakeTextures = async (artworkState: PackagingArtworkState) => {
    const rev = ++artworkRevision;
    const targetSolved = solved;
    const [outsideMap, insideMap, finishMaskMap] = await Promise.all([
      composer.compose(targetSolved, artworkState, 'outside'),
      composer.compose(targetSolved, artworkState, 'inside'),
      composer.composeFinishMask(targetSolved, artworkState),
    ]);
    if (disposed || rev !== artworkRevision) return;
    materials.sync(targetSolved.params, targetSolved.material, { outsideMap, insideMap, finishMaskMap });
    composer.flushRetired();
    callbacks?.onNeedsRender?.();
  };

  void rebakeTextures(currentArtwork);

  const controller: PackagingSubjectController = {
    get id() {
      return `packaging:${solved.templateId}`;
    },
    root,
    getSolved() {
      return solved;
    },
    getBounds() {
      return cachedBounds.clone();
    },
    getContactFootprint() {
      const size = cachedBoxBounds.getSize(new THREE.Vector3());
      return {
        width: Math.max(0.05, size.x),
        depth: Math.max(0.05, size.z),
        shape: 'rounded-box',
      };
    },
    syncParams(nextParams, options) {
      if (disposed) return solved;
      const prevShowLabels = currentParams.showFaceLabels;
      const prevShowCreases = currentParams.showCreaseLines;
      const prevOutsideColor = currentParams.outsideColor;
      const prevInsideColor = currentParams.insideColor;
      const prevFinishMode = currentParams.finishMode;
      const prevFinishTarget = currentParams.finishTarget;
      const prevFinishThreshold = currentParams.finishThreshold;
      const prevFinishInvertMask = currentParams.finishInvertMask;

      currentParams = { ...nextParams };
      solved = solvePackagingTemplate(currentParams);
      const nextSig = geometrySignature(solved.params);
      const geoChanged = nextSig !== lastGeoSig;

      if (geoChanged) {
        lastGeoSig = nextSig;
        bottlePacker.group.removeFromParent();
        boxPacker.group.removeFromParent();
        rig.root.removeFromParent();
        rig.dispose();
        rig = buildPackagingRig(solved, materials, {
          creaseSegments: options?.interactive ? 3 : 6,
        });
        root.add(rig.root);
        rig.setHighlightGroup(currentHighlight);
        if (currentHoverTarget?.kind === 'packaging-face') {
          rig.setHoverFace({
            panelId: currentHoverTarget.panelId,
            surface: currentHoverTarget.surface,
          });
        }
        attachBottlePackToRig();
        materials.syncDieline(solved);
        syncInteriorPackers();
        syncHoneycombPartition();
      } else {
        rig.setFoldProgress(solved.params.foldProgress);
        rig.setCreaseLinesVisible(solved.params.showCreaseLines);
        bottlePacker.setFoldProgress(solved.params.foldProgress);
        boxPacker.setFoldProgress(solved.params.foldProgress);
      }

      materials.sync(solved.params, solved.material);
      materials.updateFoldProgress(solved.params.foldProgress);
      if (
        prevShowLabels !== solved.params.showFaceLabels ||
        prevShowCreases !== solved.params.showCreaseLines ||
        prevOutsideColor !== solved.params.outsideColor ||
        prevInsideColor !== solved.params.insideColor ||
        prevFinishMode !== solved.params.finishMode ||
        prevFinishTarget !== solved.params.finishTarget ||
        prevFinishThreshold !== solved.params.finishThreshold ||
        prevFinishInvertMask !== solved.params.finishInvertMask ||
        geoChanged
      ) {
        void rebakeTextures(currentArtwork);
      }

      cachedBounds = centerRigAndMeasure();
      return solved;
    },
    syncBottlePack(config, visualSource, boxVisualSource = null) {
      if (disposed) return;
      currentBottleConfig = { ...config };
      currentBottleVisual = visualSource;
      currentBoxVisual = boxVisualSource;
      attachBottlePackToRig();
      syncInteriorPackers();
      syncHoneycombPartition();
      cachedBounds = centerRigAndMeasure();
    },
    setFoldProgress(progress) {
      if (disposed) return;
      const clamped = Math.max(0, Math.min(1, progress));
      currentParams = { ...currentParams, foldProgress: clamped };
      rig.setFoldProgress(clamped);
      bottlePacker.setFoldProgress(clamped);
      boxPacker.setFoldProgress(clamped);
      materials.updateFoldProgress(clamped);
      cachedBounds = centerRigAndMeasure();
    },
    setFoldPlaying(playing, onProgress) {
      foldPlaying = playing;
      foldCallback = onProgress;
      if (playing) {
        // If already near closed, start by unfolding smoothly; if near flat, fold up!
        foldDirection = currentParams.foldProgress > 0.5 ? -1 : 1;
      }
    },
    setHighlightGroup(group) {
      if (disposed) return;
      currentHighlight = group;
      rig.setHighlightGroup(group);
      const displayDims = currentParams.dimensionMode === 'inner' ? solved.innerMm : solved.outerMm;
      dimensionsOverlay.update(cachedBoxBounds, displayDims, {
        visible: currentParams.showDimensions,
        highlight: currentHighlight,
        modeLabel: currentParams.dimensionMode,
      });
    },
    async syncArtwork(artwork) {
      currentArtwork = artwork;
      await rebakeTextures(artwork);
    },
    setDimensionsVisible(visible) {
      currentParams = { ...currentParams, showDimensions: visible };
      const displayDims = currentParams.dimensionMode === 'inner' ? solved.innerMm : solved.outerMm;
      dimensionsOverlay.update(cachedBoxBounds, displayDims, {
        visible,
        highlight: currentHighlight,
        modeLabel: currentParams.dimensionMode,
      });
    },
    pickTarget(raycaster) {
      if (disposed) return null;
      root.updateMatrixWorld(true);

      const candidates: THREE.Object3D[] = [];
      for (const { mesh } of rig.panelMeshes.values()) {
        if (mesh.visible) candidates.push(mesh);
      }
      const bottleMeshes = bottlePacker.getRaycastMeshes();
      for (const bm of bottleMeshes) candidates.push(bm);

      if (!candidates.length) return null;
      const hits = raycaster.intersectObjects(candidates, false);
      if (!hits.length) return null;

      const hitIsBottleLabel = (hit: THREE.Intersection): boolean => {
        const obj = hit.object;
        if (!obj.userData?.packedBottle) return false;
        const slots = obj.userData.materialSlots as Array<string | undefined> | undefined;
        if (slots && hit.face) {
          return slots[hit.face.materialIndex] === 'label';
        }
        return Boolean(obj.userData.isInteractiveLabel);
      };

      const packCount =
        currentBottleConfig?.enabled
          ? Math.max(1, Math.min(24, Math.round(currentBottleConfig.cols) * Math.round(currentBottleConfig.rows)))
          : 1;

      for (let i = 0; i < hits.length; i++) {
        const hit = hits[i];
        const obj = hit.object;

        if (obj.userData?.packedBottle) {
          if (hitIsBottleLabel(hit)) {
            if (!currentBottleVisual) return null;
            return {
              kind: 'bottle-label',
              modelId: currentBottleVisual.model.id,
              instanceId: typeof hit.instanceId === 'number' ? hit.instanceId : 0,
              label: currentBottleVisual.customProjectName
                ? `${currentBottleVisual.customProjectName} Label`
                : `${currentBottleVisual.model.name} Label`,
              packCount,
            };
          }
          // If ray hits transparent outer glass/PET bottle shell first, check if the bottle's
          // wrapped label lies immediately behind (within 5 mm) on the same bottle!
          if (obj.userData.isTransparentShell) {
            for (let j = i + 1; j < hits.length; j++) {
              const nextHit = hits[j];
              if (nextHit.distance - hit.distance > 0.005) break;
              if (
                hitIsBottleLabel(nextHit) &&
                (nextHit.instanceId === undefined || nextHit.instanceId === hit.instanceId)
              ) {
                if (!currentBottleVisual) return null;
                return {
                  kind: 'bottle-label',
                  modelId: currentBottleVisual.model.id,
                  instanceId: typeof nextHit.instanceId === 'number' ? nextHit.instanceId : 0,
                  label: currentBottleVisual.customProjectName
                    ? `${currentBottleVisual.customProjectName} Label`
                    : `${currentBottleVisual.model.name} Label`,
                  packCount,
                };
              }
            }
          }
          // Bottle cap, body, or liquid occludes anything behind it.
          return null;
        }

        const panelId = obj.userData?.panelId as string | undefined;
        if (panelId) {
          const matIdx = hit.face?.materialIndex ?? -1;
          if (matIdx !== 0 && matIdx !== 1) return null; // Cut edge blocks without selecting face.
          const surface: 'outside' | 'inside' = matIdx === 0 ? 'outside' : 'inside';
          const panel = solved.flatPanels.find((p) => p.id === panelId);
          if (!panel || !isInteractivePackagingPanel(panel)) return null;
          const { widthMm, heightMm } = getPanelUprightSizeMm(panel);
          return {
            kind: 'packaging-face',
            templateId: solved.templateId,
            panelId: panel.id,
            surface,
            label: panel.label,
            shortCode: panel.shortCode,
            widthMm,
            heightMm,
          };
        }
      }
      return null;
    },
    setHoverTarget(target) {
      if (disposed) return;
      const same =
        currentHoverTarget === target ||
        (currentHoverTarget !== null &&
          target !== null &&
          currentHoverTarget.kind === target.kind &&
          (target.kind === 'packaging-face' && currentHoverTarget.kind === 'packaging-face'
            ? currentHoverTarget.panelId === target.panelId &&
              currentHoverTarget.surface === target.surface
            : target.kind === 'bottle-label' && currentHoverTarget.kind === 'bottle-label'
              ? currentHoverTarget.instanceId === target.instanceId &&
                currentHoverTarget.modelId === target.modelId
              : false));
      if (same) return;
      currentHoverTarget = target;
      if (target?.kind === 'packaging-face') {
        bottlePacker.setLabelHover(null);
        rig.setHoverFace({ panelId: target.panelId, surface: target.surface });
      } else if (target?.kind === 'bottle-label') {
        rig.setHoverFace(null);
        bottlePacker.setLabelHover(target.instanceId);
      } else {
        rig.setHoverFace(null);
        bottlePacker.setLabelHover(null);
      }
      callbacks?.onNeedsRender?.();
    },
    update(dt) {
      if (disposed || !foldPlaying) return false;
      const speed = 0.34; // Full open <-> close sweep in ~2.9 seconds
      let next = currentParams.foldProgress + dt * speed * foldDirection;
      if (next >= 1) {
        next = 1;
        foldDirection = -1;
      } else if (next <= 0) {
        next = 0;
        foldDirection = 1;
      }
      currentParams = { ...currentParams, foldProgress: next };
      rig.setFoldProgress(next);
      bottlePacker.setFoldProgress(next);
      boxPacker.setFoldProgress(next);
      materials.updateFoldProgress(next);
      cachedBounds = centerRigAndMeasure();
      foldCallback?.(next);
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      foldPlaying = false;
      disposeHoneycombMesh();
      bottlePacker.group.removeFromParent();
      bottlePacker.dispose();
      boxPacker.group.removeFromParent();
      boxPacker.dispose();
      rig.root.removeFromParent();
      rig.dispose();
      dimensionsOverlay.group.removeFromParent();
      dimensionsOverlay.dispose();
      composer.dispose();
      materials.dispose();
    },
  };

  return controller;
}
