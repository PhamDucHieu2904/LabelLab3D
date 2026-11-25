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
import type { BeverageFootprintMm } from './pack-layout';

export interface PackagingSubjectController extends ProceduralSubject {
  getSolved(): SolvedDieline;
  /** Rebuild geometry & materials when structural/dimension/material params change. */
  syncParams(params: PackagingParams, options?: { interactive?: boolean }): SolvedDieline;
  /** Sync "Pack Your Bottles" combo contents mounted inside the current box/tray. */
  syncBottlePack(config: BottlePackConfig, visualSource: BottlePackVisualSource | null): void;
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

  const bottlePacker = createBottlePacker({
    onNeedsRender: () => {
      if (disposed) return;
      cachedBounds = computeCombinedBounds();
      callbacks?.onBoundsChanged?.();
      callbacks?.onNeedsRender?.();
    },
    onFootprintMeasured: (modelId, footprintMm) => {
      callbacks?.onBottleFootprintMeasured?.(modelId, footprintMm);
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
  };

  const computeCombinedBounds = (): THREE.Box3 => {
    const combined = cachedBoxBounds.clone();
    const bottleBounds = bottlePacker.measureBounds();
    if (!bottleBounds.isEmpty()) {
      combined.union(bottleBounds);
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
    const [outsideMap, insideMap, finishMaskMap] = await Promise.all([
      composer.compose(solved, artworkState, 'outside'),
      composer.compose(solved, artworkState, 'inside'),
      composer.composeFinishMask(solved, artworkState),
    ]);
    if (disposed || rev !== artworkRevision) return;
    materials.sync(solved.params, solved.material, { outsideMap, insideMap, finishMaskMap });
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
        if (currentBottleConfig) {
          bottlePacker.sync(solved, currentBottleConfig, currentBottleVisual);
        }
      } else {
        rig.setFoldProgress(solved.params.foldProgress);
        rig.setCreaseLinesVisible(solved.params.showCreaseLines);
        bottlePacker.setFoldProgress(solved.params.foldProgress);
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
    syncBottlePack(config, visualSource) {
      if (disposed) return;
      currentBottleConfig = { ...config };
      currentBottleVisual = visualSource;
      attachBottlePackToRig();
      bottlePacker.sync(solved, currentBottleConfig, visualSource);
      cachedBounds = centerRigAndMeasure();
    },
    setFoldProgress(progress) {
      if (disposed) return;
      const clamped = Math.max(0, Math.min(1, progress));
      currentParams = { ...currentParams, foldProgress: clamped };
      rig.setFoldProgress(clamped);
      bottlePacker.setFoldProgress(clamped);
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
      materials.updateFoldProgress(next);
      cachedBounds = centerRigAndMeasure();
      foldCallback?.(next);
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      foldPlaying = false;
      bottlePacker.group.removeFromParent();
      bottlePacker.dispose();
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
