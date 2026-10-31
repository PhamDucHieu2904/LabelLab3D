import * as THREE from 'three';

const corner = new THREE.Vector3();
const finiteVector = (value: THREE.Vector3) => Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);

/**
 * Keep precision around the product instead of reserving micrometres at the eye.
 * The old radius-based near plane made View 2's depth steps larger than the
 * actual print/glass gap. Camera-space bounds follow orbit, pan and transitions;
 * half the nearest depth leaves a generous guard band without moving the view.
 * Call immediately before rendering each preview/capture camera. The far plane
 * only expands, preserving the studio ground's deliberately long fade range.
 */
export function updateMockupProductDepthRange(
  view: THREE.PerspectiveCamera,
  bounds: THREE.Box3,
  productMatrixWorld: THREE.Matrix4,
  radius: number,
): void {
  if (bounds.isEmpty() || !finiteVector(bounds.min) || !finiteVector(bounds.max)
    || !productMatrixWorld.elements.every(Number.isFinite)) return;

  view.updateWorldMatrix(true, false);
  if (!view.matrixWorldInverse.elements.every(Number.isFinite)) return;

  let nearest = Infinity;
  let farthest = -Infinity;
  for (let index = 0; index < 8; index++) {
    corner.set(
      index & 1 ? bounds.max.x : bounds.min.x,
      index & 2 ? bounds.max.y : bounds.min.y,
      index & 4 ? bounds.max.z : bounds.min.z,
    ).applyMatrix4(productMatrixWorld).applyMatrix4(view.matrixWorldInverse);
    const depth = -corner.z;
    if (!Number.isFinite(depth)) return;
    nearest = Math.min(nearest, depth);
    farthest = Math.max(farthest, depth);
  }

  const safeRadius = Number.isFinite(radius) && radius > 0 ? radius : 0;
  const minimumNear = Math.max(0.00001, safeRadius * 0.001);
  // A bounds corner behind the eye means the camera intersects/straddles the
  // product volume. Fall back to a small positive plane rather than clipping it.
  const near = Math.max(minimumNear, nearest > 0 ? nearest * 0.5 : minimumNear);
  const margin = Math.max(safeRadius * 0.5, minimumNear * 2);
  const retainedFar = Number.isFinite(view.far) && view.far > 0 ? view.far : 0;
  const far = Math.max(retainedFar, farthest + margin, near * 2);
  if (!Number.isFinite(near) || !Number.isFinite(far)) return;
  if (view.near === near && view.far === far) return;

  view.near = near;
  view.far = far;
  view.updateProjectionMatrix();
}
