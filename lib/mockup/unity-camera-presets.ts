/**
 * Source: D:/UnityHubData/Unity_3D_Mockup_Project/Assets/System/Scene/Master_Scene.unity:19204
 * Actual View 1–4 UI bindings: lines 17132, 33657, 3916, 24438 respectively.
 * ProductCameraOrbit.cs:313 uses saved positions to derive radius from target + offset;
 * the final orbit position is reconstructed from pitch/yaw, rather than copied verbatim.
 */
export const UNITY_CAMERA_PRESETS = [
  { id: 'view-1', label: 'View 1', position: [0, 1, -5], rotation: [0, 0, 0], fieldOfView: 27 },
  { id: 'view-2', label: 'View 2', position: [0, 1, -19.999998], rotation: [0, 0, 0], fieldOfView: 10 },
  { id: 'view-3', label: 'View 3', position: [0.03945524, -0.50026906, -3.3437643], rotation: [-25, 0, 0], fieldOfView: 39.18977 },
  { id: 'view-4', label: 'View 4', position: [1.2723889, 2.6819835, -3.1030798], rotation: [26.63438, 337.70438, 0], fieldOfView: 37.982372 },
] as const;

export type UnityCameraPresetId = typeof UNITY_CAMERA_PRESETS[number]['id'];

/** Master_Scene.unity:19185,19203; ProductCameraOrbit.cs:263–272. */
export const UNITY_CAMERA_TARGET_OFFSET = [0, 1, 0] as const;
export const UNITY_CAMERA_SMOOTH_TIME = 0.15;

/** Vinut export-basil-290.py:25 and can converter:147 export Unity units at scale .1;
 * the PET asset manifest likewise records exportScale .1. */
export const UNITY_CAMERA_METRES_PER_UNIT = 0.1;

/** Reflect Unity's camera Z axis into Three's positive-Z front convention.
 * Asset-specific focus origins belong to the runtime; these absolute destinations
 * never depend on the current camera or the preceding selected view.
 */
export function unityCameraDestination(id: UnityCameraPresetId) {
  const preset = UNITY_CAMERA_PRESETS.find((entry) => entry.id === id);
  if (!preset) throw new Error(`Unknown Unity camera preset: ${id}`);
  const normalize = (degrees: number) => {
    const wrapped = ((degrees % 360) + 360) % 360;
    return wrapped > 180 ? wrapped - 360 : wrapped;
  };
  return {
    yawDegrees: -normalize(preset.rotation[1]) || 0,
    pitchDegrees: normalize(preset.rotation[0]),
    distanceMetres: Math.hypot(...preset.position.map((value, axis) => value - UNITY_CAMERA_TARGET_OFFSET[axis])) * UNITY_CAMERA_METRES_PER_UNIT,
    fieldOfView: preset.fieldOfView,
  };
}

/** Unity Mathf.SmoothDamp with unlimited maxSpeed; preserves the damped velocity. */
export function unitySmoothDamp(current: number, target: number, velocity: number, smoothTime: number, dt: number) {
  if (dt <= 0) return { value: current, velocity };
  const omega = 2 / Math.max(0.0001, smoothTime);
  const x = omega * dt;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temp = (velocity + omega * change) * dt;
  const nextVelocity = (velocity - omega * temp) * decay;
  const output = target + (change + temp) * decay;
  // Unity clamps crossing the target and clears residual velocity.
  if ((target - current > 0) === (output > target)) return { value: target, velocity: 0 };
  return { value: output, velocity: nextVelocity };
}

/** Unity Mathf.SmoothDampAngle: DeltaAngle chooses the shortest signed arc in degrees. */
export function unitySmoothDampAngle(current: number, target: number, velocity: number, smoothTime: number, dt: number) {
  let delta = ((target - current) % 360 + 360) % 360;
  if (delta > 180) delta -= 360;
  return unitySmoothDamp(current, current + delta, velocity, smoothTime, dt);
}
