const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const THREE = require('three');
const load = require('../lib/load-ts-source.cjs').createSourceLoader();

test('485 ml Glass Milk uses the clear Base and hollow Neck paths with a FrontSide reservoir', () => {
  const { basilWebMaterialRole, createBasilWebBottleMaterialContext } = load(path.resolve(__dirname, '../../lib/viewer/basil-web-materials'));
  const root = new THREE.Group();
  const asset = { id: 'glass-485-milk', packaging: 'glass', materialSlots: {
    body: ['Body', 'Neck', 'GlassBase'], cap: ['Cap'], label: ['Label'], liquid: ['Water'],
  } };
  const meshes = {};
  for (const name of ['Body', 'Neck', 'GlassBase', 'Cap', 'Label', 'Water']) {
    const material = new THREE.MeshPhysicalMaterial();
    material.name = name;
    material.userData = { bottleProfile: 'glass-300-v1', ...(name === 'Water' ? { bottleLiquidKind: 'milk' } : {}),
      ...(name === 'Neck' ? { basilWebNeckWallMetres: .001 } : {}) };
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .12, 16), material);
    mesh.name = name; root.add(mesh); meshes[name] = mesh;
  }
  const context = createBasilWebBottleMaterialContext(root, asset);
  try {
    for (const mesh of Object.values(meshes)) {
      const role = basilWebMaterialRole(asset, mesh, mesh.material);
      assert.ok(role, mesh.name);
      context.configure(mesh.material, mesh, role, '#fff5e4');
    }
    assert.equal(meshes.GlassBase.material.customProgramCacheKey(), 'glass-300-base-clear-v2');
    assert.equal(meshes.Neck.material.customProgramCacheKey(), 'pullcap-hollow-glass-neck-v1');
    assert.equal(meshes.Water.material.customProgramCacheKey(), 'basil-web-milk-reservoir-v2');
    assert.equal(meshes.Water.material.side, THREE.FrontSide);
    assert.equal(meshes.Water.material.transmission, 0);
  } finally {
    context.dispose?.();
    root.traverse(node => { if (node instanceof THREE.Mesh) { node.geometry.dispose(); node.material.dispose(); } });
  }
});

test('485 ml Glass Milk keeps the library model and persisted Milk defaults', () => {
  const catalog = load(path.resolve(__dirname, '../../lib/labellab/catalog'));
  const { parsePreferences } = load(path.resolve(__dirname, '../../lib/labellab/preferences'));
  const model = catalog.LAB_MODELS.find(item => item.id === 'glass-485-milk');
  assert.ok(model);
  assert.equal(model.asset.volumeMl, 485);
  assert.equal(model.asset.cameraFraming, 'bounds');
  assert.equal(model.appearance.slots.liquid.color, '#fff5e4');
  assert.equal(catalog.getLabModelFamily('glass-485-milk').id, 'glass-485-milk');
  const defaults = catalog.getModelMaterialDefaults('glass-485-milk');
  assert.equal(defaults.liquidType, 'milk');
  assert.equal(parsePreferences({ modelId: 'glass-485-milk' }).modelId, 'glass-485-milk');
  assert.equal(parsePreferences({ modelId: 'glass-485-milk' }).liquidType, 'milk');
});
