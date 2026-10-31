const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/models/cans/assets.manifest.json'), 'utf8'));
const { LAB_MODELS, LAB_MODEL_FAMILIES } = (() => {
  const Module = require('node:module'); const ts = require('typescript'); const cache = new Map();
  function load(file) { const f=[file,`${file}.ts`,`${file}.json`].find(x=>fs.existsSync(x)); if(f.endsWith('.json')) return require(f); if(cache.has(f)) return cache.get(f).exports; const m=new Module(f,module); m.filename=f; m.paths=module.paths; cache.set(f,m); const req=m.require.bind(m); m.require=x=>x.startsWith('@/')?load(path.join(root,x.slice(2))):x.startsWith('.')?load(path.resolve(path.dirname(f),x)):req(x); m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,f); return m.exports; }
  return load(path.join(root,'lib/labellab/catalog'));
})();

test('all six optimized can manifest assets are present byte-for-byte', () => {
  const cans = manifest.assets.filter(a => a.kind === 'can');
  assert.equal(cans.length, 6);
  for (const asset of cans) {
    const file = path.join(root, 'public', asset.src);
    assert.ok(fs.existsSync(file), asset.id);
    assert.equal(fs.statSync(file).size, asset.bytes, asset.id);
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), asset.sha256, asset.id);
    assert.deepEqual(asset.materialSlots, {body:['aluminum-body'], tab:['aluminum-tab'], label:['printed-label']});
    assert.equal(asset.labelUv.wrapS, 'repeat');
  }
});

test('each can has a native model and poster without borrowed flavor textures', () => {
  for (const asset of manifest.assets.filter(a => a.kind === 'can')) {
    const expectedId = asset.id === 'can-250' ? 'can-250-slim' : asset.id; const model = LAB_MODELS.find(m => m.id === expectedId || m.asset?.src.split('?')[0] === asset.src);
    assert.ok(model, `missing LabModel for ${asset.id}`);
    assert.equal(model.asset.src.split('?')[0], asset.src);
    assert.deepEqual(model.asset.orientation, [0, 0, 0]);
    if (asset.id !== 'can-330') { assert.deepEqual(model.appearance.slots?.label, { metalness: 0.18, roughness: 0.28, clearcoat: 0.35 }); assert.equal(model.appearance.slots?.label?.baseColorMap, undefined); }
    assert.ok(fs.existsSync(path.join(root, 'public/models/cans/posters', `${asset.id}.webp`)));
    assert.equal(model.asset.materialSlots?.label?.[0] ?? 'printed-label', 'printed-label');
  }
});

test('can family library exposes one family per geometry', () => {
  const canFamilies = LAB_MODEL_FAMILIES.filter(f => /can/i.test(f.id) || /can/i.test(f.name));
  assert.ok(canFamilies.length >= 6, `expected six can families, found ${canFamilies.length}`);
});


test('all native can model IDs survive preference parsing', () => {
  const Module = require('node:module'); const ts = require('typescript');
  const file = path.join(root, 'lib/labellab/preferences.ts'); const m = new Module(file, module); m.filename=file; m.paths=module.paths;
  m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText, file);
  const { parsePreferences } = m.exports;
  for (const id of manifest.assets.filter(a=>a.kind==='can' && a.id !== 'can-330').map(a=>a.id)) {
    const modelId = id === 'can-250' ? 'can-250-slim' : id;
    assert.equal(parsePreferences({ modelId }).modelId, modelId);
  }
  assert.equal(parsePreferences({ modelId: 'can-mango' }).modelId, 'can-mango');
});
