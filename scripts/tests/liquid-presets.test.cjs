const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const loadSource = require('../lib/load-ts-source.cjs').createSourceLoader();
const load = name => loadSource(path.resolve(__dirname, `../../lib/labellab/${name}`));
const { LIQUID_TYPES, getLiquidType, getLiquidPresetSettings } = load('liquid-presets');
const { LIQUID_TYPE_IDS, parsePreferences } = load('preferences');

test('drink library exposes unique, persistable types and at least 100 named colors', () => {
  assert.ok(LIQUID_TYPES.length >= 20);
  assert.deepEqual(LIQUID_TYPES.map(item => item.id), [...LIQUID_TYPE_IDS]);
  assert.equal(new Set(LIQUID_TYPES.map(item => item.id)).size, LIQUID_TYPES.length);
  assert.ok(LIQUID_TYPES.reduce((sum, item) => sum + item.presets.length, 0) >= 100);
  for (const type of LIQUID_TYPES) {
    assert.ok(type.name && type.description);
    assert.ok(type.presets.length >= 4);
    assert.equal(new Set(type.presets.map(item => item.id)).size, type.presets.length);
    for (const preset of type.presets) {
      assert.match(preset.color, /^#[\da-f]{6}$/i);
      const chosen = getLiquidPresetSettings(type.id, preset.id);
      assert.equal(chosen.liquidType, type.id);
      assert.equal(chosen.liquidColor, preset.color);
      assert.equal(chosen.liquidCustomized, true);
      const parsed = parsePreferences(chosen);
      for (const [key, value] of Object.entries(chosen)) assert.equal(parsed[key], value);
    }
  }
});

test('type-specific advanced controls and physical looks distinguish clear and creamy drinks', () => {
  const water = getLiquidType('water'), milk = getLiquidType('milk'), oil = getLiquidType('oil');
  assert.ok(water.settings.liquidClarity > milk.settings.liquidClarity);
  assert.ok(milk.settings.liquidTurbidity > water.settings.liquidTurbidity);
  assert.ok(milk.settings.liquidScattering > water.settings.liquidScattering);
  assert.ok(oil.settings.liquidIor > water.settings.liquidIor);
  assert.ok(water.controls.includes('ior'));
  assert.ok(milk.controls.includes('scattering'));
  assert.ok(milk.controls.includes('roughness'));
});

test('Chia and Basil seed share optics while explicit preset switching stays customized', () => {
  assert.deepEqual(getLiquidType('chia').settings, getLiquidType('basil-seed').settings);
  assert.equal(getLiquidPresetSettings('chia').liquidCustomized, true);
  assert.equal(getLiquidPresetSettings('chia').liquidType, 'chia');
});

test('Glass290 native defaults preserve explicitly saved colors, customized optics and switched types', () => {
  for (const modelId of ['glass-290-chia', 'glass-290-milk']) {
    const saved = { modelId, liquidColor: '#123456', liquidCustomized: true,
      liquidType: 'tea', liquidClarity: .41, liquidDensity: .73, liquidTurbidity: .37 };
    const restored = parsePreferences(saved);
    for (const [key, value] of Object.entries(saved)) assert.equal(restored[key], value, `${modelId}: ${key}`);
    assert.equal(restored.liquidIor, getLiquidType('tea').settings.liquidIor);
  }
});

test('missing identifiers fall back safely and returned settings cannot mutate presets', () => {
  assert.equal(getLiquidType('missing').id, 'water');
  assert.equal(getLiquidType(null).id, 'water');
  assert.equal(getLiquidPresetSettings('water', 'missing').liquidColor, getLiquidType('water').presets[0].color);
  const chosen = getLiquidPresetSettings('milk');
  chosen.liquidDensity = 0;
  assert.notEqual(getLiquidPresetSettings('milk').liquidDensity, 0);
});

test('legacy native models infer matching optics and a first slider edit retains the remaining look', () => {
  for (const [modelId, typeId] of [['pet-nata-watermelon', 'nata-de-coco'], ['pet-aloe', 'aloe'],
    ['basil-strawberry', 'basil-seed'], ['glass-290-chia', 'chia'], ['glass-290-milk', 'milk'], ['can-320', 'fruit-juice']]) {
    const restored = parsePreferences({ modelId, liquidColor: '#123456' });
    const optics = getLiquidType(typeId).settings;
    assert.equal(restored.liquidType, typeId);
    assert.equal(restored.liquidCustomized, false);
    for (const [key, value] of Object.entries(optics)) assert.equal(restored[key], value, `${modelId}: ${key}`);
    const edited = parsePreferences({ ...restored, liquidCustomized: true, liquidBrightness: 1.2 });
    for (const [key, value] of Object.entries(optics)) {
      if (key !== 'liquidBrightness') assert.equal(edited[key], value, `first edit preserves ${modelId}: ${key}`);
    }
    assert.equal(edited.liquidColor, '#123456');
  }
});

test('partially saved drink optics use selected drink defaults and retain existing numeric edits', () => {
  for (const type of LIQUID_TYPES) {
    const restored = parsePreferences({ liquidType: type.id, liquidTurbidity: .37 });
    for (const [key, value] of Object.entries(type.settings)) {
      assert.equal(restored[key], key === 'liquidTurbidity' ? .37 : value, `${type.id}: ${key}`);
    }
  }
});
