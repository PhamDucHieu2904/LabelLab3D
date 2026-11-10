const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');
Module._extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
function load(file) { const m = new Module(file, module); m.filename = file; m.paths = module.paths; m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, file); return m.exports; }
const store = load(path.resolve(__dirname, '../../lib/labellab/artwork-store.ts'));
const base = { id: 'a', name: 'A', source: new Blob(['x'], { type: 'image/png' }), preview: new Blob(['x'], { type: 'image/png' }), width: 100, height: 50, transform: { x: 0, y: 0, width: 1, height: 1 }, dieline: { width: 3, height: 2 }, createdAt: 1, updatedAt: 1 };
test('saveArtwork rejects malformed transform and dieline before opening storage', async () => {
  await assert.rejects(store.saveArtwork({ ...base, transform: { ...base.transform, width: NaN } }), /Invalid artwork record/);
  await assert.rejects(store.saveArtwork({ ...base, dieline: { width: 0, height: 2 } }), /Invalid artwork record/);
});
test('saveArtwork accepts a valid record shape then reports unavailable browser storage', async () => {
  await assert.rejects(store.saveArtwork(base), /unavailable/i);
});

