const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../../lib/labellab/preferences.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = module.paths;
loaded._compile(compiled, filename);
const { DEFAULT_PREFERENCES: defaults, parsePreferences, loadPreferences, savePreferences, PREFERENCES_KEY } = loaded.exports;
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
  assert.equal(sanitized.labelOffset, -50);
  assert.equal(sanitized.roughness, 1);
  assert.equal(sanitized.metalness, 0);
  const invalid = parsePreferences({ labelOffset: Infinity, roughness: '0.8', metalness: NaN, resolution: '1024', grid: 'false' });
  assert.equal(invalid.labelOffset, defaults.labelOffset);
  assert.equal(invalid.roughness, defaults.roughness);
  assert.equal(invalid.metalness, defaults.metalness);
  assert.equal(invalid.resolution, defaults.resolution);
  assert.equal(invalid.grid, true);
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

