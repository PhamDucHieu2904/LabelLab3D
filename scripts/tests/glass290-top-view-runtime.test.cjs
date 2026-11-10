const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const THREE = require('three');
const load = require('../lib/load-ts-source.cjs').createSourceLoader();

test('pull-cap neck trace includes the authored Water surface for top-down views', () => {
  const { buildGlassNeckTraceData } = load(path.resolve(__dirname, '../../lib/viewer/glass-neck-trace-data'));
  const root = new THREE.Group();
  const material = new THREE.MeshPhysicalMaterial(); material.name = 'Water';
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .2, 16), material); mesh.name = 'Water'; root.add(mesh);
  const data = buildGlassNeckTraceData(root, (_mesh, selected) => selected.name === 'Water' ? 5 : undefined);
  const values = data.triangles.image.data;
  let foundWater = false;
  for (let i = 0; i < values.length; i += 4) if (values[i + 3] === 5) { foundWater = true; break; }
  assert.equal(foundWater, true, 'Water triangles must be encoded as trace kind 5');
  data.dispose(); mesh.geometry.dispose(); material.dispose();
});

test('neck optics has a dedicated liquid surface branch', () => {
  const { GLASS_NECK_OPTICS_GLSL } = load(path.resolve(__dirname, '../../lib/viewer/glass-neck-optics'));
  assert.match(GLASS_NECK_OPTICS_GLSL, /glassNeckLiquidColor/);
  assert.match(GLASS_NECK_OPTICS_GLSL, /hit\.kind>4\.5/);
});
