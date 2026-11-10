const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');

function load(file) {
  const mod = new Module(file, module);
  mod.filename = file;
  mod.paths = module.paths;
  mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, file);
  return mod.exports;
}

const { artworkEditAnimation } = load(path.resolve(__dirname, '../../lib/labellab/artwork-edit-motion.ts'));

test('pausing artwork editing keeps showcase mode but stops playback', () => {
  assert.deepEqual(artworkEditAnimation({ sceneMode: 'website', motion: 'showcase' }, true), {
    mode: 'showcase', playing: false, speed: 1,
  });
});

test('closing artwork editing resumes only the previously animated website scene', () => {
  assert.deepEqual(artworkEditAnimation({ sceneMode: 'website', motion: 'showcase' }, false), {
    mode: 'showcase', playing: true, speed: 1,
  });
  assert.deepEqual(artworkEditAnimation({ sceneMode: 'website', motion: 'off' }, false), {
    mode: 'off', playing: false, speed: 1,
  });
  assert.deepEqual(artworkEditAnimation({ sceneMode: 'studio', motion: 'showcase' }, false), {
    mode: 'off', playing: false, speed: 1,
  });
});
