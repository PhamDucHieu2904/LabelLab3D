const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../../lib/mockup/unity-camera-presets.ts');
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = module.paths;
loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const { UNITY_CAMERA_PRESETS: presets, UNITY_CAMERA_TARGET_OFFSET: offset,
  UNITY_CAMERA_SMOOTH_TIME: smoothTime, UNITY_CAMERA_METRES_PER_UNIT: metresPerUnit,
  unityCameraDestination: destination, unitySmoothDamp: damp, unitySmoothDampAngle: dampAngle } = loaded.exports;
const near = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

test('all four production Unity views retain exact positions, rotations, FOV and order', () => {
  assert.deepEqual(presets, [
    { id: 'view-1', label: 'View 1', position: [0, 1, -5], rotation: [0, 0, 0], fieldOfView: 27 },
    { id: 'view-2', label: 'View 2', position: [0, 1, -19.999998], rotation: [0, 0, 0], fieldOfView: 10 },
    { id: 'view-3', label: 'View 3', position: [.03945524, -.50026906, -3.3437643], rotation: [-25, 0, 0], fieldOfView: 39.18977 },
    { id: 'view-4', label: 'View 4', position: [1.2723889, 2.6819835, -3.1030798], rotation: [26.63438, 337.70438, 0], fieldOfView: 37.982372 },
  ]);
  assert.deepEqual(offset, [0, 1, 0]);
  assert.equal(smoothTime, .15);
  const radii = [5, 19.999998, 3.66512259853763, 3.75195232542786];
  presets.forEach((preset, i) => near(Math.hypot(...preset.position.map((v, j) => v - offset[j])), radii[i]));
});

test('absolute web destinations reflect Unity Z with exact exported scale, elevation and FOV', () => {
  assert.equal(metresPerUnit, .1);
  const expected = [
    { yawDegrees: 0, pitchDegrees: 0, distanceMetres: .5, fieldOfView: 27 },
    { yawDegrees: 0, pitchDegrees: 0, distanceMetres: 1.9999998, fieldOfView: 10 },
    { yawDegrees: 0, pitchDegrees: -25, distanceMetres: .366512259853763, fieldOfView: 39.18977 },
    { yawDegrees: 22.29562, pitchDegrees: 26.63438, distanceMetres: .375195232542786, fieldOfView: 37.982372 },
  ];
  const snapshots = presets.map((preset, index) => {
    const result = destination(preset.id);
    for (const key of Object.keys(expected[index])) near(result[key], expected[index][key]);
    return result;
  });
  // Selecting other views and mutating returned values cannot affect a destination.
  for (const preset of [...presets].reverse()) destination(preset.id).distanceMetres = 999;
  presets.forEach((preset, index) => assert.deepEqual(destination(preset.id), snapshots[index]));
  const low = destination('view-3');
  assert.ok(Math.sin(low.pitchDegrees * Math.PI / 180) * low.distanceMetres < 0);
  const angled = destination('view-4');
  assert.ok(Math.sin(angled.yawDegrees * Math.PI / 180) * angled.distanceMetres > 0);
  assert.throws(() => destination('front'));
});

test('Unity polynomial damping matches a known .15-second response', () => {
  const result = damp(0, 1, 0, .15, .15);
  near(result.value, 1 - 3 / 6.8);
  near(result.velocity, (80 / 3) / 6.8);
  assert.deepEqual(damp(2, 8, 3, .15, 0), { value: 2, velocity: 3 });
});

function simulate(step, current = 0, target = 1, velocity = 0, duration = .75) {
  for (let t = 0; t < duration - 1e-9; t += step) {
    const result = damp(current, target, velocity, smoothTime, Math.min(step, duration - t));
    assert.ok(result.value <= target);
    assert.ok(result.value >= current);
    ({ value: current, velocity } = result);
  }
  return current;
}

test('damping converges monotonically without overshoot and stays consistent across frame rates', () => {
  const values = [30, 60, 120].map(fps => simulate(1 / fps));
  values.forEach(value => near(value, 1, .001));
  assert.ok(Math.max(...values) - Math.min(...values) < .00005);
  assert.deepEqual(damp(0, 1, 1000, .15, .1), { value: 1, velocity: 0 });
  assert.deepEqual(damp(1, 0, -1000, .15, .1), { value: 0, velocity: 0 });
});

test('angle damping crosses 360 and negative boundaries by the shortest arc', () => {
  const forward = dampAngle(350, 10, 0, .15, 1 / 60);
  assert.ok(forward.value > 350 && forward.value < 370);
  const backward = dampAngle(10, 350, 0, .15, 1 / 60);
  assert.ok(backward.value < 10 && backward.value > -10);
  near(dampAngle(-350, -10, 0, .15, 1 / 60).value, backward.value - 360);
  let value = 350, velocity = 0;
  for (let i = 0; i < 120; i++) ({ value, velocity } = dampAngle(value, 10, velocity, .15, 1 / 60));
  near(value, 370, .00001);
});

const THREE = require('three');
const cameraFile = path.resolve(__dirname, '../../lib/mockup/camera.ts');
const cameraModule = new Module(cameraFile, module);
cameraModule.filename = cameraFile; cameraModule.paths = module.paths;
const nativeCameraRequire = cameraModule.require.bind(cameraModule);
cameraModule.require = name => name === './unity-camera-presets' ? loaded.exports : nativeCameraRequire(name);
cameraModule._compile(ts.transpileModule(fs.readFileSync(cameraFile, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, cameraFile);

test('new bottle bounds framing keeps the entire PET1L and PET320 Full in every authored view', () => {
  assert.equal(typeof cameraModule.exports.authoredMockupCameraFrame, 'function');
  for (const [height,width] of [[.264833,.076898],[.149808,.064294]]) {
    const bounds = new THREE.Box3(new THREE.Vector3(-width/2,-height/2,-width/2),new THREE.Vector3(width/2,height/2,width/2));
    for (const aspect of [1,4/5,9/16,16/9]) for (const preset of presets) {
      const frame = cameraModule.exports.authoredMockupCameraFrame(bounds, {src:'/new.glb',cameraFraming:'bounds'}, preset.id, aspect);
      assert.ok(frame.target.distanceTo(bounds.getCenter(new THREE.Vector3())) < 1e-12);
      const direction = cameraModule.exports.mockupCameraDirection(preset.id);
      const camera = new THREE.PerspectiveCamera(frame.fieldOfView,aspect,.0001,100);
      camera.position.copy(frame.target).addScaledVector(direction,frame.distanceMetres);
      camera.lookAt(frame.target); camera.updateMatrixWorld();
      for(const x of [bounds.min.x,bounds.max.x]) for(const y of [bounds.min.y,bounds.max.y]) for(const z of [bounds.min.z,bounds.max.z]) {
        const p = new THREE.Vector3(x,y,z).project(camera);
        assert.ok(Math.abs(p.x)<=.801 && Math.abs(p.y)<=.801, `${preset.id}: product clipped (${p.x},${p.y})`);
      }
    }
    const legacy = cameraModule.exports.authoredMockupCameraFrame(bounds, {src:'/legacy.glb'}, 'view-1',1);
    assert.equal(legacy.distanceMetres,destination('view-1').distanceMetres);
    near(legacy.target.y,bounds.min.y+.1);
  }
});
