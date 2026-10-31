const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const modules = new Map();
// Load the actual facade and resolver, including their local imports and aliases.
// A snapshot-only test would miss an adapter overriding the published web model.
function loadSource(filename) {
  const resolved = [filename, `${filename}.ts`, `${filename}.json`].find(
    candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
  );
  if (!resolved) throw new Error(`Cannot resolve ${filename}`);
  if (resolved.endsWith('.json')) return require(resolved);
  if (modules.has(resolved)) return modules.get(resolved).exports;
  const loaded = new Module(resolved, module);
  loaded.filename = resolved;
  loaded.paths = module.paths;
  modules.set(resolved, loaded);
  const nativeRequire = loaded.require.bind(loaded);
  loaded.require = request => {
    if (request.startsWith('@/')) return loadSource(path.join(root, request.slice(2)));
    if (request.startsWith('.')) return loadSource(path.resolve(path.dirname(resolved), request));
    return nativeRequire(request);
  };
  loaded._compile(ts.transpileModule(fs.readFileSync(resolved, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, resolved);
  return loaded.exports;
}

const { LAB_MODELS, LAB_MODEL_FAMILIES, getDefaultFamilyVariant, getOrderedFamilyVariants, getLabModelFamily, filterLabModelFamilies, publishedCatalog } = loadSource(path.join(root, 'lib/labellab/catalog'));
const { resolveDisplay3D } = loadSource(path.join(root, 'lib/catalog/resolve'));
const { isBasilHighAsset } = loadSource(path.join(root, 'lib/viewer/basil-presentation'));
const scenes = [
  ['basil-strawberry', 'basil-glass290-strawberry-3d', '/models/bottles/glass-290-basil-web.glb'],
  ['can-mango', 'juice30-can330-mango-3d', '/models/cans/can-330.glb'],
  ['pet-aloe', 'aloe-pet500-mango-3d', '/models/bottles/pet-500-short-label.glb'],
];

for (const [id, displayId, webUrl] of scenes) {
  test(`${id} uses the published Vinut web asset and appearance without overrides`, () => {
    const model = LAB_MODELS.find(item => item.id === id);
    const display = publishedCatalog.displays3d.find(item => item.id === displayId);
    const sourceModel = publishedCatalog.models3d.find(item => item.id === display.modelId);
    const published = resolveDisplay3D(publishedCatalog, display);
    assert.ok(model);
    assert.ok(published);
    assert.equal(model.asset.src, webUrl);
    assert.deepEqual(model.asset, published.asset);
    assert.deepEqual(model.appearance, published.appearance);
    assert.equal(model.frontYaw, sourceModel.mockupFrontYaw ?? 0);
    assert.equal(isBasilHighAsset(model.asset), false, 'Web scenes must not activate the High optics/HDRI pipeline');
    assert.equal(fs.existsSync(path.join(root, 'public', webUrl)), true);
  });
}

test('290 ml family keeps the Label Lab PC order and selects index 0', () => {
  const family = LAB_MODEL_FAMILIES.find(item => item.id === 'glass-290-rotate-cap');
  assert.ok(family);
  assert.equal(family.name, '290 ml Bottle');
  assert.deepEqual(getOrderedFamilyVariants(family).map(item => [item.label, item.order]), [
    ['Basil', 0],
    ['Chia', 1],
    ['Milk', 3],
  ]);
  assert.equal(getDefaultFamilyVariant(family).modelId, 'basil-strawberry');
  assert.equal(family.variants.find(item => item.label === 'Basil').available, true);
  assert.equal(family.variants.find(item => item.label === 'Chia').available, false);
  assert.equal(family.variants.find(item => item.label === 'Milk').available, false);
});

test('model library families do not duplicate a model card for each variant', () => {
  const modelIds = LAB_MODEL_FAMILIES.flatMap(family =>
    family.variants.filter(variant => variant.available).map(variant => variant.modelId),
  );
  assert.deepEqual([...new Set(modelIds)].sort(), LAB_MODELS.map(model => model.id).sort());
  assert.equal(new Set(modelIds).size, modelIds.length, 'each active child belongs to one packaging family');
  assert.equal(LAB_MODEL_FAMILIES.length, 8);
  for (const family of LAB_MODEL_FAMILIES) {
    const first = getDefaultFamilyVariant(family);
    assert.equal(first.available, true, `${family.name} must have a usable index 0`);
    assert.ok(LAB_MODELS.some(model => model.id === first.modelId));
    assert.ok(family.variants.filter(variant => !variant.available).every(variant => !variant.modelId),
      'unavailable children must not alias another product GLB');
  }
});

test('default means sorted list index zero, even with source order gaps and ties', () => {
  const original = LAB_MODEL_FAMILIES[0];
  const family = { ...original, variants: [
    { id: 'milk', label: 'Milk', order: 2, available: false },
    { id: 'chia', label: 'Chia', order: 2, available: false },
    { id: 'basil', label: 'Basil', order: 1, modelId: 'basil-strawberry', available: true },
  ] };
  assert.equal(getDefaultFamilyVariant(family).modelId, 'basil-strawberry');
  assert.deepEqual(getOrderedFamilyVariants(family).map(item => item.id), ['basil', 'chia', 'milk']);
  assert.deepEqual(family.variants.map(item => item.id), ['milk', 'chia', 'basil'], 'sorting must not mutate catalog data');
  assert.equal(getDefaultFamilyVariant({ ...original, variants: [] }), undefined);
});

test('searches match variant names while preserving one packaging card and category filters', () => {
  for (const query of [' Chia ', 'MILK', 'strawberry', '290 ml']) {
    assert.deepEqual(filterLabModelFamilies(query).map(item => item.id), ['glass-290-rotate-cap']);
  }
  assert.equal(filterLabModelFamilies('Chia', 'can').length, 0);
  assert.deepEqual(filterLabModelFamilies('', 'pet').map(item => item.id), ['pet-500-short-label']);
  assert.equal(getLabModelFamily(undefined), undefined);
  assert.equal(getLabModelFamily('not-a-web-model'), undefined);
});
