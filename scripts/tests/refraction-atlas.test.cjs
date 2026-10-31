const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const THREE = require('three');

const filename = path.resolve(__dirname, '../../lib/mockup/refraction-atlas.ts');
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = module.paths;
loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const { projectedRefractionRect } = loaded.exports;

const width = 4573, height = 8129;
const bounds = new THREE.Box3(
  new THREE.Vector3(-0.034081012, -0.090180606, -0.034081012),
  new THREE.Vector3(0.034081012, 0.090180621, 0.034081012),
);

function camera() {
  const virtualWidth = height * 16 / 9;
  const view = new THREE.PerspectiveCamera(32, 16 / 9, 0.001, 50);
  view.position.set(0.07, 0.025, 0.8);
  view.lookAt(0, 0.01, 0);
  view.zoom = 1.1;
  view.setViewOffset(virtualWidth, height, (virtualWidth - width) / 2, 0, width, height);
  view.updateMatrixWorld();
  return view;
}

function assertBounded(rect) {
  for (const value of Object.values(rect)) assert.ok(Number.isSafeInteger(value), 'Atlas uses integer export pixels');
  assert.ok(rect.x >= 0 && rect.y >= 0 && rect.width > 0 && rect.height > 0);
  assert.ok(rect.x + rect.width <= width && rect.y + rect.height <= height,
    'The atlas never allocates beyond the requested export extent');
}

function assertContains(rect, x, y) {
  assert.ok(x >= rect.x - 1e-8 && x <= rect.x + rect.width + 1e-8
    && y >= rect.y - 1e-8 && y <= rect.y + rect.height + 1e-8,
  `Visible product pixel (${x}, ${y}) must lie in atlas ${JSON.stringify(rect)}`);
}

test('cropped optical atlas contains projected product samples under rotation, scale and Story camera crop', () => {
  const view = camera();
  const transforms = [
    { rotation: [0, 0, 0], position: [0, 0, 0], scale: [1, 1, 1] },
    { rotation: [0.35, 0.7, 0.2], position: [0.01, 0.02, -0.03], scale: [0.9, 1.1, 0.8] },
    { rotation: [-0.7, 1.3, -0.4], position: [-0.03, -0.01, -0.02], scale: [1.2, 0.8, 1] },
    { rotation: [1.2, -0.5, 0.8], position: [0.04, 0.02, -0.1], scale: [0.7, 1.2, 1] },
  ];
  let totalVisible = 0;
  for (const transform of transforms) {
    const world = new THREE.Matrix4().compose(
      new THREE.Vector3(...transform.position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...transform.rotation)),
      new THREE.Vector3(...transform.scale),
    );
    const rect = projectedRefractionRect(bounds, world, view, width, height);
    assertBounded(rect);
    assert.ok(rect.width * rect.height < width * height / 2,
      'An ordinary bottle keeps a bounded atlas instead of always allocating the full 8K output');
    let visible = 0;
    // Sample the solid, not only the eight vertices used by the implementation.
    // The real camera's project() provides an independent projection oracle.
    for (let ix = 0; ix <= 8; ix++) for (let iy = 0; iy <= 8; iy++) for (let iz = 0; iz <= 8; iz++) {
      const projected = new THREE.Vector3(
        THREE.MathUtils.lerp(bounds.min.x, bounds.max.x, ix / 8),
        THREE.MathUtils.lerp(bounds.min.y, bounds.max.y, iy / 8),
        THREE.MathUtils.lerp(bounds.min.z, bounds.max.z, iz / 8),
      ).applyMatrix4(world).project(view);
      if (Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1 || Math.abs(projected.z) > 1) continue;
      assertContains(rect, (projected.x + 1) * width / 2, (1 - projected.y) * height / 2);
      visible++;
    }
    assert.ok(visible > 500, 'Each transform must actually exercise visible product pixels');
    totalVisible += visible;
  }
  assert.ok(totalVisible > 2500);
});

test('atlas includes independently ray-cast visible faces of a rotated product', () => {
  const view = camera();
  const world = new THREE.Matrix4().compose(
    new THREE.Vector3(-0.014, 0.009, -0.025),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0.57, 0.93, -0.24)),
    new THREE.Vector3(1.25, 0.87, 0.73),
  );
  const inverseWorld = world.clone().invert();
  const rect = projectedRefractionRect(bounds, world, view, width, height);
  const raycaster = new THREE.Raycaster();
  const intersection = new THREE.Vector3();
  let visibleRays = 0;
  // Ray-box intersections detect coverage independently of projecting the box
  // corners. A small missed face would make its ray pixels fall outside rect.
  for (let row = 0; row < 80; row++) for (let column = 0; column < 80; column++) {
    const u = (column + 0.5) / 80, v = (row + 0.5) / 80;
    raycaster.setFromCamera(new THREE.Vector2(u * 2 - 1, 1 - v * 2), view);
    const localRay = raycaster.ray.clone().applyMatrix4(inverseWorld);
    if (!localRay.intersectBox(bounds, intersection)) continue;
    const hit = intersection.clone().applyMatrix4(world).project(view);
    if (Math.abs(hit.z) > 1) continue;
    assertContains(rect, u * width, v * height);
    visibleRays++;
  }
  assert.ok(visibleRays > 100, 'The ray oracle must sample a substantial product area');
});

test('partly offscreen products clamp optical storage to each output edge without dropping visible points', () => {
  const view = new THREE.PerspectiveCamera(30, width / height, 0.001, 20);
  view.position.set(0, 0, 1);
  view.lookAt(0, 0, 0);
  view.updateMatrixWorld();
  const edgeBounds = new THREE.Box3(new THREE.Vector3(-0.04, -0.05, -0.04), new THREE.Vector3(0.04, 0.05, 0.04));
  const positions = [[-0.16, 0, 0], [0.16, 0, 0], [0, 0.28, 0], [0, -0.28, 0]];
  positions.forEach((position, edge) => {
    const world = new THREE.Matrix4().makeTranslation(...position);
    const rect = projectedRefractionRect(edgeBounds, world, view, width, height);
    assertBounded(rect);
    if (edge === 0) assert.equal(rect.x, 0);
    if (edge === 1) assert.equal(rect.x + rect.width, width);
    if (edge === 2) assert.equal(rect.y, 0);
    if (edge === 3) assert.equal(rect.y + rect.height, height);
    assert.ok(rect.width < width || rect.height < height, 'Clipping one edge should not force a full-frame atlas');
    let visible = 0;
    for (let ix = 0; ix <= 10; ix++) for (let iy = 0; iy <= 10; iy++) for (let iz = 0; iz <= 10; iz++) {
      const projected = new THREE.Vector3(
        THREE.MathUtils.lerp(edgeBounds.min.x, edgeBounds.max.x, ix / 10),
        THREE.MathUtils.lerp(edgeBounds.min.y, edgeBounds.max.y, iy / 10),
        THREE.MathUtils.lerp(edgeBounds.min.z, edgeBounds.max.z, iz / 10),
      ).applyMatrix4(world).project(view);
      if (Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1 || Math.abs(projected.z) > 1) continue;
      assertContains(rect, (projected.x + 1) * width / 2, (1 - projected.y) * height / 2);
      visible++;
    }
    assert.ok(visible > 100, 'Exercise visible geometry at each clipped edge');
  });
});

test('camera inside product and near-plane intersection safely reserve the full optical image', () => {
  const view = camera();
  const world = new THREE.Matrix4().compose(view.position.clone(),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, 0.6, 0.2)), new THREE.Vector3(1, 1, 1));
  assert.ok(bounds.containsPoint(view.position.clone().applyMatrix4(world.clone().invert())),
    'Independently establish that the camera lies inside the transformed box');
  assert.deepEqual(projectedRefractionRect(bounds, world, view, width, height),
    { x: 0, y: 0, width, height });

  const closeView = new THREE.PerspectiveCamera(30, width / height, 0.01, 20);
  closeView.lookAt(0, 0, -1);
  closeView.updateMatrixWorld();
  const nearBounds = new THREE.Box3(new THREE.Vector3(-0.01, -0.01, -0.02), new THREE.Vector3(0.01, 0.01, -0.005));
  assert.equal(nearBounds.containsPoint(closeView.position), false, 'Near-plane case is distinct from an eye inside the product');
  assert.deepEqual(projectedRefractionRect(nearBounds, new THREE.Matrix4(), closeView, width, height),
    { x: 0, y: 0, width, height });
});
