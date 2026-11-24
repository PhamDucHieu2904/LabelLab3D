import * as THREE from 'three';
import type { ProceduralSubject } from '../mockup/contracts';
import type {
  PackagingArtworkState,
  PackagingParams,
  PackagingPartGroup,
  SolvedDieline,
} from './types';
import { solvePackagingTemplate } from './templates/registry';
import { createPackagingMaterialSet } from './materials/corrugated-materials';
import { buildPackagingRig, type BuiltPackagingRig } from './kinematics/rig-builder';
import { createDimensionOverlay3D } from './geometry/dimension-overlay';
import { createPackagingTextureComposer } from './artwork-composer';

export interface PackagingSubjectController extends ProceduralSubject {
  getSolved(): SolvedDieline;
  /** Rebuild geometry & materials when structural/dimension/material params change. */
  syncParams(params: PackagingParams, options?: { interactive?: boolean }): SolvedDieline;
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
  callbacks?: { onNeedsRender?: () => void },
): PackagingSubjectController {
  const root = new THREE.Group();
  root.name = 'packaging-subject-root';

  let currentParams = { ...initialParams };
  let currentArtwork = initialArtwork;
  let solved = solvePackagingTemplate(currentParams);
  let lastGeoSig = geometrySignature(solved.params);
  let currentHighlight: PackagingPartGroup | null = null;
  let foldPlaying = false;
  let foldDirection: 1 | -1 = -1;
  let foldCallback: ((progress: number) => void) | undefined;
  let disposed = false;
  let artworkRevision = 0;

  const materials = createPackagingMaterialSet(solved.params, solved.material);
  const composer = createPackagingTextureComposer();
  const dimensionsOverlay = createDimensionOverlay3D();
  root.add(dimensionsOverlay.group);

  let rig: BuiltPackagingRig = buildPackagingRig(solved, materials, { creaseSegments: 4 });
  root.add(rig.root);

  const centerRigAndMeasure = (): THREE.Box3 => {
    // Keep the box horizontally centered on X/Z and resting with its lowest point at y = 0.
    rig.root.position.set(0, 0, 0);
    rig.root.updateMatrixWorld(true);
    const raw = rig.measureBounds();
    const center = raw.getCenter(new THREE.Vector3());
    rig.root.position.set(-center.x, -raw.min.y, -center.z);
    rig.root.updateMatrixWorld(true);

    const grounded = raw.clone().translate(new THREE.Vector3(-center.x, -raw.min.y, -center.z));
    const displayDims = currentParams.dimensionMode === 'inner' ? solved.innerMm : solved.outerMm;
    dimensionsOverlay.update(grounded, displayDims, {
      visible: currentParams.showDimensions,
      highlight: currentHighlight,
      modeLabel: currentParams.dimensionMode,
    });
    return grounded;
  };

  let cachedBounds = centerRigAndMeasure();

  const rebakeTextures = async (artworkState: PackagingArtworkState) => {
    const rev = ++artworkRevision;
    const [outsideMap, insideMap] = await Promise.all([
      composer.compose(solved, artworkState, 'outside'),
      composer.compose(solved, artworkState, 'inside'),
    ]);
    if (disposed || rev !== artworkRevision) return;
    materials.sync(solved.params, solved.material, { outsideMap, insideMap });
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
      const size = cachedBounds.getSize(new THREE.Vector3());
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

      currentParams = { ...nextParams };
      solved = solvePackagingTemplate(currentParams);
      const nextSig = geometrySignature(solved.params);
      const geoChanged = nextSig !== lastGeoSig;

      if (geoChanged) {
        lastGeoSig = nextSig;
        rig.root.removeFromParent();
        rig.dispose();
        rig = buildPackagingRig(solved, materials, {
          creaseSegments: options?.interactive ? 2 : 4,
        });
        root.add(rig.root);
        rig.setHighlightGroup(currentHighlight);
      } else {
        rig.setFoldProgress(solved.params.foldProgress);
        rig.setCreaseLinesVisible(solved.params.showCreaseLines);
      }

      materials.sync(solved.params, solved.material);
      if (
        prevShowLabels !== solved.params.showFaceLabels ||
        prevShowCreases !== solved.params.showCreaseLines ||
        prevOutsideColor !== solved.params.outsideColor ||
        prevInsideColor !== solved.params.insideColor ||
        geoChanged
      ) {
        void rebakeTextures(currentArtwork);
      }

      cachedBounds = centerRigAndMeasure();
      return solved;
    },
    setFoldProgress(progress) {
      if (disposed) return;
      const clamped = Math.max(0, Math.min(1, progress));
      currentParams = { ...currentParams, foldProgress: clamped };
      rig.setFoldProgress(clamped);
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
      dimensionsOverlay.update(cachedBounds, displayDims, {
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
      dimensionsOverlay.update(cachedBounds, displayDims, {
        visible,
        highlight: currentHighlight,
        modeLabel: currentParams.dimensionMode,
      });
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
      cachedBounds = centerRigAndMeasure();
      foldCallback?.(next);
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      foldPlaying = false;
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
