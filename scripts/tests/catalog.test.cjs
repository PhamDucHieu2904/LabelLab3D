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

const { LAB_MODELS, publishedCatalog } = loadSource(path.join(root, 'lib/labellab/catalog'));
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
