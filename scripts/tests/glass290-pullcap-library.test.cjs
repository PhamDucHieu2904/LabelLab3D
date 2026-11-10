const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('../lib/load-ts-source.cjs').createSourceLoader();
const catalog = load(path.resolve(__dirname, '../../lib/labellab/catalog'));
const { parsePreferences } = load(path.resolve(__dirname, '../../lib/labellab/preferences'));

test('pull-cap family exposes Basil, Chia and Milk with persistent matching drink defaults', () => {
  const family = catalog.getLabModelFamily('glass-290-pullcap-basil');
  assert.deepEqual(catalog.getOrderedFamilyVariants(family).map(v => v.modelId), [
    'glass-290-pullcap-basil', 'glass-290-pullcap-chia', 'glass-290-pullcap-milk',
  ]);
  for (const [kind, type] of [['basil', 'basil-seed'], ['chia', 'chia'], ['milk', 'milk']]) {
    const id = `glass-290-pullcap-${kind}`;
    const model = catalog.LAB_MODELS.find(m => m.id === id); assert.ok(model, id);
    assert.equal(model.asset.volumeMl, 290);
    // Catalog posters are public-root URLs (leading slash); join against the
    // repository's public folder without letting path.resolve discard it.
    assert.ok(require('node:fs').statSync(path.join(__dirname, '../../public', model.poster.split('?')[0].replace(/^[/\\]+/, ''))).size > 0);
    const defaults = catalog.getModelMaterialDefaults(id), restored = parsePreferences({ modelId: id });
    assert.equal(defaults.liquidType, type); assert.equal(restored.modelId, id);
    for (const [key, value] of Object.entries(defaults)) assert.equal(restored[key], value, `${id}: ${key}`);
    assert.equal(defaults.capColor, '#c0c0c0'); assert.equal(defaults.liquidCustomized, false);
    assert.equal(Boolean(model.asset.materialSlots.inclusions), kind !== 'milk');
  }
});

test('300 ml glass also defaults to Milk when selected from the library', () => {
  const defaults = catalog.getModelMaterialDefaults('glass-300-milk');
  const restored = parsePreferences({ modelId: 'glass-300-milk' });
  assert.equal(defaults.liquidType, 'milk');
  for (const [key, value] of Object.entries(defaults)) assert.equal(restored[key], value, key);
});
