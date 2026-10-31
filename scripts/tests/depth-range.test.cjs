const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const THREE = require('three');

const filename = path.resolve(__dirname, '../../lib/mockup/depth-range.ts');
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = module.paths;
loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const { updateMockupProductDepthRange: updateDepth } = loaded.exports;

// Actual optimized Basil bounds: metre scale and the smallest measured front
// print/glass separation from the shipping GLB, not an arbitrary centimetre gap.
const bounds = new THREE.Box3(
  new THREE.Vector3(-0.034081012, -0.090180606, -0.034081012),
  new THREE.Vector3(0.034081012, 0.090180621, 0.034081012),
);
const radius = bounds.getBoundingSphere(new THREE.Sphere()).radius;
const identity = new THREE.Matrix4();
const measuredMinimumGap = 0.0001430893;
const depthQuantum24 = (z, near, far) => z * z * (far - near) / (far * near * (2 ** 24 - 1));

function camera(distance = 2) {
  const result = new THREE.PerspectiveCamera(10, 16 / 9, radius * 0.005, 60);
  result.position.set(0, 0.00976864, distance);
  result.lookAt(0, 0.00976864, 0);
  result.updateMatrixWorld();
  return result;
}

function assertProductInsidePlanes(view, matrix) {
  const point = new THREE.Vector3();
  for (let index = 0; index < 8; index++) {
    point.set(index & 1 ? bounds.max.x : bounds.min.x,
      index & 2 ? bounds.max.y : bounds.min.y,
      index & 4 ? bounds.max.z : bounds.min.z)
      .applyMatrix4(matrix).applyMatrix4(view.matrixWorldInverse);
    const depth = -point.z;
    assert.ok(depth > view.near, `Product depth ${depth} must exceed near ${view.near}`);
    assert.ok(depth < view.far, `Product depth ${depth} must precede far ${view.far}`);
  }
}

test('View 2 resolves the measured Basil print/glass gap rather than quantizing it away', () => {
  const view = camera();
  const oldQuantum = depthQuantum24(2, view.near, view.far);
  assert.ok(oldQuantum > measuredMinimumGap, 'Previous camera cannot resolve the actual gap');
  updateDepth(view, bounds, identity, radius);
  const improvedQuantum = depthQuantum24(2, view.near, view.far);
  assert.ok(view.near > 0.9 && view.near < 1);
  assert.ok(improvedQuantum < measuredMinimumGap / 100, 'At least 100 depth steps separate the measured surfaces');
  assert.ok(oldQuantum / improvedQuantum > 1000);
  assertProductInsidePlanes(view, identity);
});

test('all product corners remain unclipped throughout rotated, panned and moving views', () => {
  const view = camera();
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3(1, 1, 1);
  for (let index = 0; index <= 100; index++) {
    const t = index / 100;
    const distance = THREE.MathUtils.lerp(0.35, 2, t);
    const yaw = t * Math.PI * 2;
    const elevation = Math.sin(t * Math.PI * 2) * 0.45;
    const target = new THREE.Vector3(Math.sin(t * 3) * 0.1, Math.cos(t * 4) * 0.1, 0);
    view.position.set(Math.sin(yaw) * Math.cos(elevation), Math.sin(elevation), Math.cos(yaw) * Math.cos(elevation))
      .multiplyScalar(distance).add(target);
    view.lookAt(target);
    view.fov = THREE.MathUtils.lerp(39.18977, 10, t);
    rotation.setFromEuler(new THREE.Euler(0.3 * Math.sin(t * 5), t * 7, 0.2));
    position.set(Math.sin(t * 2) * 0.015, 0.01, Math.cos(t * 3) * 0.015);
    matrix.compose(position, rotation, scale);
    updateDepth(view, bounds, matrix, radius);
    assertProductInsidePlanes(view, matrix);
    assert.ok(view.near > 0 && view.near < view.far);
    assert.equal(view.far, 60, 'Existing ground range is preserved during transitions');
  }
});

test('far plane never shrinks the studio range and expands for distant product bounds', () => {
  const view = camera();
  view.far = 30;
  updateDepth(view, bounds, identity, radius);
  assert.equal(view.far, 30);
  const distant = new THREE.Matrix4().makeTranslation(0, 0, -40);
  updateDepth(view, bounds, distant, radius);
  assert.ok(view.far > 42);
  assertProductInsidePlanes(view, distant);
});

test('a camera inside or crossing product bounds uses a positive near fallback', () => {
  const view = camera(0);
  view.position.set(0, 0, 0);
  view.quaternion.identity();
  updateDepth(view, bounds, identity, radius);
  assert.equal(view.near, Math.max(0.00001, radius * 0.001));
  assert.equal(view.far, 60);
  assert.ok(Number.isFinite(view.projectionMatrix.determinant()));
  updateDepth(view, bounds, identity, NaN);
  assert.equal(view.near, 0.00001);
});

test('invalid or empty inputs cannot poison a valid camera projection', () => {
  const view = camera();
  const originalNear = view.near;
  const originalFar = view.far;
  const projection = view.projectionMatrix.clone();
  const invalid = bounds.clone();
  invalid.min.x = NaN;
  const invalidMatrix = identity.clone();
  invalidMatrix.elements[12] = Infinity;
  for (const [box, matrix] of [[new THREE.Box3(), identity], [invalid, identity], [bounds, invalidMatrix]]) {
    updateDepth(view, box, matrix, radius);
    assert.equal(view.near, originalNear);
    assert.equal(view.far, originalFar);
    assert.ok(view.projectionMatrix.equals(projection));
  }
});

test('depth adjustment preserves camera extrinsics, lens and tiled-export view offset', () => {
  const view = camera();
  view.zoom = 1.2;
  view.setViewOffset(8129, 8129, 2048, 4096, 2048, 2048);
  const position = view.position.clone();
  const quaternion = view.quaternion.clone();
  const fov = view.fov;
  const aspect = view.aspect;
  const zoom = view.zoom;
  const offset = { ...view.view };
  updateDepth(view, bounds, identity, radius);
  assert.ok(view.position.equals(position));
  assert.ok(view.quaternion.equals(quaternion));
  assert.equal(view.fov, fov);
  assert.equal(view.aspect, aspect);
  assert.equal(view.zoom, zoom);
  assert.deepEqual(view.view, offset);
  const projection = view.projectionMatrix.clone();
  // An unchanged range must not unnecessarily rebuild the projection.
  view.projectionMatrix.elements[0] += 0.123;
  updateDepth(view, bounds, identity, radius);
  assert.equal(view.projectionMatrix.elements[0], projection.elements[0] + 0.123);
});
