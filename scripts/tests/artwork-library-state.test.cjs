const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');

Module._extensions['.ts'] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText,
  filename,
);

function load(file) {
  const mod = new Module(file, module);
  mod.filename = file;
  mod.paths = module.paths;
  mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, file);
  return mod.exports;
}

const { getArtworkEditorInitial } = load(path.resolve(__dirname, '../../lib/labellab/artwork-editor-state.ts'));

const first = { id: 'first', name: 'First' };
const second = { id: 'second', name: 'Second' };

test('editor opener restores the selected saved artwork', () => {
  assert.equal(getArtworkEditorInitial([first, second], 'second'), second);
});

test('editor opener stays blank when no saved artwork is selected', () => {
  assert.equal(getArtworkEditorInitial([first, second]), undefined);
  assert.equal(getArtworkEditorInitial([first, second], 'missing'), undefined);
});
