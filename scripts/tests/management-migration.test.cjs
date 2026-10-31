const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const modules = new Map();
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
const { createManagementData, migrateManagementData, BUILTIN_MARKER_KEY } = loadSource(path.join(root, 'lib/admin/management-data'));
const legacyIds = ['basil-strawberry', 'can-mango', 'pet-aloe'];
const related = (key, id) => key === 'models' ? id : `${({ materials: 'mat', displays: 'display', assets: 'asset' })[key]}-${id}`;
const tables = ['models', 'materials', 'displays', 'assets'];

test('legacy admin cache imports new cans once and preserves edits, deletions, custom records and releases', () => {
  const initial = createManagementData();
  const saved = structuredClone(initial);
  delete saved[BUILTIN_MARKER_KEY];
  for (const key of tables) saved[key] = saved[key].filter(row => legacyIds.some(id => row.id === related(key, id)));
  saved.models[0].name = 'Edited bottle';
  saved.models[0].status = 'Lưu trữ';
  saved.models.push({ id: 'custom', name: 'Custom', status: 'Đang tắt', updated: '', values: {} });
  for (const key of tables) saved[key] = saved[key].filter(row => row.id !== related(key, 'can-mango'));
  const releases = JSON.stringify(saved.releases);
  const migrated = migrateManagementData(initial, saved);
  assert.equal(migrated.models.find(row => row.id === 'basil-strawberry').name, 'Edited bottle');
  assert.equal(migrated.models.find(row => row.id === 'basil-strawberry').status, 'Lưu trữ');
  assert.ok(migrated.models.some(row => row.id === 'custom'));
  assert.equal(JSON.stringify(migrated.releases), releases);
  for (const key of tables) {
    assert.equal(migrated[key].some(row => row.id === related(key, 'can-mango')), false);
    for (const id of ['can-180', 'can-250-short', 'can-250-slim', 'can-320', 'can-500']) {
      assert.equal(migrated[key].filter(row => row.id === related(key, id)).length, 1);
    }
    migrated[key] = migrated[key].filter(row => row.id !== related(key, 'can-180'));
  }
  const again = migrateManagementData(initial, migrated);
  for (const key of tables) assert.equal(again[key].some(row => row.id === related(key, 'can-180')), false);
});

test('a fresh admin cache records known built-ins before the first deletion', () => {
  const initial = createManagementData();
  assert.equal(initial[BUILTIN_MARKER_KEY].length, initial.models.length);
  const saved = structuredClone(initial);
  for (const key of tables) saved[key] = saved[key].filter(row => row.id !== related(key, 'can-500'));
  const restored = migrateManagementData(initial, saved);
  for (const key of tables) assert.equal(restored[key].some(row => row.id === related(key, 'can-500')), false);
});
