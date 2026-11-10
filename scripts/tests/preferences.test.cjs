const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const loadSource = require('../lib/load-ts-source.cjs').createSourceLoader();
const { DEFAULT_PREFERENCES: defaults, parsePreferences, loadPreferences, savePreferences, PREFERENCES_KEY,
  LIQUID_TYPE_IDS, MATERIAL_PREFERENCE_KEYS, pickMaterialPreferences } = loadSource(path.resolve(__dirname, '../../lib/labellab/preferences'));
const memory = () => {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

test('round trip preserves selected scene, controls and versioned allowlisted schema', () => {
  const storage = memory();
  const chosen = { ...defaults, modelId: 'can-mango', sceneMode: 'studio', motion: 'off', background: '#123ABC',
    labelOffset: -12, roughness: .8, metalness: .7, frame: 'portrait', resolution: 1024, grid: false, highlight: false,
    maliciousUrl: 'javascript:alert(1)' };
  assert.equal(savePreferences(chosen, storage), true);
  const envelope = JSON.parse(storage.values.get(PREFERENCES_KEY));
  assert.equal(envelope.version, 1);
  assert.equal(Object.hasOwn(envelope.preferences, 'maliciousUrl'), false);
  assert.deepEqual(loadPreferences(storage), parsePreferences(chosen));
  assert.equal(loadPreferences(storage).grid, false);
});

test('malformed JSON and unsupported schemas do not prevent editor startup', () => {
  const storage = memory();
  for (const raw of ['{bad json', 'null', '[]', 'true', '{"version":2,"preferences":{"sceneMode":"studio"}}', '{"sceneMode":"studio"}']) {
    storage.setItem(PREFERENCES_KEY, raw);
    assert.deepEqual(loadPreferences(storage), defaults);
  }
});

test('style and scene persist independently for every combination', () => {
  const storage = memory();
  for (const sceneMode of ['website', 'studio']) {
    for (const style of ['pink', 'white']) {
      const chosen = { ...defaults, sceneMode, style, motion: 'off', background: '#123ABC' };
      assert.equal(savePreferences(chosen, storage), true);
      const restored = loadPreferences(storage);
      assert.equal(restored.style, style);
      assert.equal(restored.sceneMode, sceneMode);
      assert.equal(restored.motion, 'off');
      assert.equal(restored.background, '#123ABC');
      assert.equal(JSON.parse(storage.values.get(PREFERENCES_KEY)).preferences.style, style);
    }
  }
});

test('legacy and invalid styles default to pink without changing the selected scene', () => {
  const storage = memory();
  assert.equal(defaults.style, 'pink');
  for (const sceneMode of ['website', 'studio']) {
    const legacy = { ...defaults, sceneMode, motion: 'off' };
    delete legacy.style;
    storage.setItem(PREFERENCES_KEY, JSON.stringify({ version: 1, preferences: legacy }));
    assert.equal(loadPreferences(storage).style, 'pink');
    assert.equal(loadPreferences(storage).sceneMode, sceneMode);
    assert.equal(loadPreferences(storage).motion, 'off');
    for (const style of ['studio', 'website', 'WHITE', '', null, 1, true, {}]) {
      const restored = parsePreferences({ ...legacy, style });
      assert.equal(restored.style, 'pink');
      assert.equal(restored.sceneMode, sceneMode);
      assert.equal(restored.motion, 'off');
    }
  }
});

test('high-resolution transparent story exports persist while legacy records remain opaque', () => {
  const storage = memory();
  for (const resolution of [4096, 8129]) {
    assert.equal(savePreferences({ ...defaults, frame: 'story', resolution, transparent: true }, storage), true);
    const restored = loadPreferences(storage);
    assert.equal(restored.frame, 'story');
    assert.equal(restored.resolution, resolution);
    assert.equal(restored.transparent, true);
  }
  const legacy = { ...defaults, resolution: 1024 };
  delete legacy.transparent;
  storage.setItem(PREFERENCES_KEY, JSON.stringify({ version: 1, preferences: legacy }));
  assert.equal(loadPreferences(storage).transparent, false);
  assert.equal(loadPreferences(storage).resolution, 1024);
  for (const transparent of ['false', 'true', 1, null]) {
    assert.equal(parsePreferences({ transparent }).transparent, false);
  }
});

test('bounds clamp finite numeric values and reject coercion or nonfinite data', () => {
  const sanitized = parsePreferences({ labelOffset: -1000, roughness: 2, metalness: -1 });
  assert.equal(sanitized.labelOffset, -100);
  assert.equal(sanitized.roughness, 1);
  assert.equal(sanitized.metalness, 0);
  const invalid = parsePreferences({ labelOffset: Infinity, roughness: '0.8', metalness: NaN, resolution: '1024', grid: 'false' });
  assert.equal(invalid.labelOffset, defaults.labelOffset);
  assert.equal(invalid.roughness, defaults.roughness);
  assert.equal(invalid.metalness, defaults.metalness);
  assert.equal(invalid.resolution, defaults.resolution);
  assert.equal(invalid.grid, true);
});

test('artwork offset restores the full Unity sweep including fine positioning', () => {
  const storage = memory();
  for (const labelOffset of [-100, -75.5, 0, 75.5, 100]) {
    savePreferences({ ...defaults, labelOffset }, storage);
    assert.equal(loadPreferences(storage).labelOffset, labelOffset);
  }
  assert.equal(parsePreferences({ labelOffset: 500 }).labelOffset, 100);
});

test('unknown models, modes, colors and hostile object values are ignored', () => {
  assert.deepEqual(parsePreferences({ modelId: '../../secret', sceneMode: 'other', motion: 'rotate', frame: 'wide',
    background: 'url(https://evil.test)', capColor: '#fff', liquidColor: { toString() { throw Error('called'); } } }), defaults);
  const accessor = {};
  Object.defineProperty(accessor, 'background', { get() { throw Error('getter must not run'); } });
  assert.deepEqual(parsePreferences(accessor), defaults);
  assert.deepEqual(parsePreferences(Object.create({ sceneMode: 'studio' })), defaults);
  const proxy = new Proxy({}, { getPrototypeOf() { throw Error('hostile proxy'); } });
  assert.deepEqual(parsePreferences(proxy), defaults);
  for (const value of [null, [], 'studio', 4, true]) assert.deepEqual(parsePreferences(value), defaults);
});

test('blocked or quota-exhausted storage fails safely and defaults cannot be mutated', () => {
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('quota'); } };
  assert.deepEqual(loadPreferences(blocked), defaults);
  assert.equal(savePreferences(defaults, blocked), false);
  const first = parsePreferences(null);
  first.background = '#000000';
  assert.equal(parsePreferences(null).background, '#d53660');
  assert.equal(Object.isFrozen(defaults), true);
});

test('expanded properties survive save/restore and material snapshots exclude scene options', () => {
  const storage = memory();
  const chosen = { ...defaults, liquidType: 'milk', liquidCustomized: true, capMetalness: .35, capRoughness: .66,
    bodyMetalness: .24, bodyRoughness: .72, liquidClarity: .04, liquidDensity: .85, liquidTurbidity: .9,
    liquidBrightness: 1.4, liquidScattering: .8, liquidRoughness: .31, liquidIor: 1.38 };
  assert.equal(savePreferences(chosen, storage), true);
  assert.deepEqual(loadPreferences(storage), chosen);
  const snapshot = pickMaterialPreferences(chosen);
  assert.deepEqual(Object.keys(snapshot), [...MATERIAL_PREFERENCE_KEYS]);
  for (const key of MATERIAL_PREFERENCE_KEYS) assert.equal(snapshot[key], chosen[key]);
  assert.equal(Object.hasOwn(snapshot, 'modelId'), false);
  assert.equal(Object.hasOwn(snapshot, 'resolution'), false);
  assert.equal(Object.hasOwn(snapshot, 'sceneMode'), false);
});

test('optics reject coercion and clamp extreme values before renderer use', () => {
  const fields = ['capMetalness', 'capRoughness', 'bodyMetalness', 'bodyRoughness', 'liquidClarity',
    'liquidDensity', 'liquidTurbidity', 'liquidScattering', 'liquidRoughness'];
  for (const key of fields) {
    assert.equal(parsePreferences({ [key]: 100 })[key], 1);
    assert.equal(parsePreferences({ [key]: -100 })[key], 0);
    for (const value of ['0.5', null, true, NaN, Infinity]) {
      assert.equal(parsePreferences({ [key]: value })[key], defaults[key]);
    }
  }
  assert.equal(parsePreferences({ liquidBrightness: 10 }).liquidBrightness, 2);
  assert.equal(parsePreferences({ liquidBrightness: -1 }).liquidBrightness, 0);
  assert.equal(parsePreferences({ liquidIor: 0 }).liquidIor, 1);
  assert.equal(parsePreferences({ liquidIor: 5 }).liquidIor, 1.6);
  assert.equal(parsePreferences({ liquidCustomized: 'true' }).liquidCustomized, false);
  assert.equal(parsePreferences({ liquidType: '__proto__' }).liquidType, defaults.liquidType);
  for (const liquidType of LIQUID_TYPE_IDS) assert.equal(parsePreferences({ liquidType }).liquidType, liquidType);
});

test('legacy saved projects retain native optics and user label/color choices', () => {
  const legacy = { modelId: 'pet-nata-watermelon', liquidColor: '#FF4430', labelOffset: 3, roughness: .15 };
  const restored = parsePreferences(legacy);
  assert.equal(restored.modelId, legacy.modelId);
  assert.equal(restored.liquidColor, legacy.liquidColor);
  assert.equal(restored.labelOffset, legacy.labelOffset);
  assert.equal(restored.roughness, legacy.roughness);
  assert.equal(restored.liquidCustomized, false);
  assert.equal(restored.liquidType, 'nata-de-coco');
  assert.equal(restored.capMetalness, 0);
  assert.equal(restored.capRoughness, .29);
  assert.equal(restored.bodyMetalness, 0);
  assert.equal(restored.bodyRoughness, .075);
  const oldCan = parsePreferences({ modelId: 'can-320' });
  assert.equal(oldCan.bodyMetalness, 1);
  assert.equal(oldCan.bodyRoughness, .22);
});

