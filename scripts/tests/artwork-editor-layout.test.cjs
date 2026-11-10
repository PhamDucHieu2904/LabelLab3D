const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

Module._extensions['.ts'] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText,
  filename,
);

const filename = path.resolve(__dirname, '../../lib/labellab/artwork-editor-layout.ts');
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = module.paths;
loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const layout = loaded.exports;

test('artwork chooser grows by 50 percent and keeps a 70/30 desktop split', () => {
  assert.equal(layout.ARTWORK_EDITOR_WIDTH, 1440);
  assert.equal(layout.ARTWORK_EDITOR_PREVIEW_RATIO, 0.7);
  assert.equal(layout.ARTWORK_EDITOR_SAVED_RATIO, 0.3);
  assert.equal(layout.ARTWORK_EDITOR_PREVIEW_RATIO + layout.ARTWORK_EDITOR_SAVED_RATIO, 1);
});

test('artwork chooser uses the same physical scale on PC and laptop Studio surfaces', () => {
  const pc = layout.getArtworkEditorViewport(1920, 960);
  const laptop = layout.getArtworkEditorViewport(1366, 768);
  assert.equal(pc.scale, 1);
  assert.ok(Math.abs(laptop.scale - 1366 / 1920) < 1e-12);
  assert.ok(Math.abs(laptop.width * laptop.scale - 1366) < 1e-8);
  assert.ok(Math.abs(laptop.height * laptop.scale - 768) < 1e-8);
});

test('scaled pointer movement is normalized by the rendered frame size', () => {
  assert.deepEqual(layout.normalizeArtworkPointerDelta(72, 48, 720, 480), { x: 0.1, y: 0.1 });
});

test('invalid viewport dimensions fall back to a stable unscaled editor', () => {
  assert.equal(layout.getArtworkEditorScale(0, 768), 1);
  assert.equal(layout.getArtworkEditorScale(1366, 0), 1);
});
