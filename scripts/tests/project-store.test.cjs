const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '../..');

function createLoader() {
  const cache = new Map();
  function load(filename) {
    const resolved = [filename, `${filename}.ts`, `${filename}.json`].find(
      (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
    );
    if (!resolved) throw new Error(`Cannot resolve ${filename}`);
    if (resolved.endsWith('.json')) return require(resolved);
    if (cache.has(resolved)) return cache.get(resolved).exports;
    const loaded = new Module(resolved, module);
    loaded.filename = resolved;
    loaded.paths = module.paths;
    cache.set(resolved, loaded);
    loaded.require = (specifier) => {
      if (specifier.startsWith('@/')) return load(path.resolve(ROOT, specifier.slice(2)));
      if (specifier.startsWith('.')) return load(path.resolve(path.dirname(resolved), specifier));
      return require(specifier);
    };
    const out = ts.transpileModule(fs.readFileSync(resolved, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText;
    loaded._compile(out, resolved);
    return loaded.exports;
  }
  return load;
}

// Minimal valid 1x1 PNG binary
const SAMPLE_PNG_A = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
]);

const SAMPLE_PNG_B = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x02,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x72, 0xb6, 0x0d, 0x24,
]);

test('groupCustomProjects migrates legacy single-item records and orders multi-SKU projects cleanly', () => {
  const load = createLoader();
  const store = load(path.resolve(ROOT, 'lib/labellab/project-store.ts'));
  const prefs = load(path.resolve(ROOT, 'lib/labellab/preferences.ts'));

  // Legacy v1 item without groupId
  const legacyItem = store.parseCustomProjectRecord({
    id: 'legacy-1',
    name: 'Basil study 01',
    kind: 'beverage',
    createdAt: 1000,
    updatedAt: 2000,
    settings: prefs.DEFAULT_PREFERENCES,
  });
  assert.ok(legacyItem);
  assert.equal(store.resolveItemGroupId(legacyItem), 'grp_legacy-1');

  // Multi-item project with 2 flavors + 1 packaging tray
  const boxBlob = new Blob([SAMPLE_PNG_B], { type: 'image/png' });
  const labelBlob = new Blob([SAMPLE_PNG_A], { type: 'image/png' });
  const strawberry = store.parseCustomProjectRecord({
    id: 'sku-strawberry',
    name: 'Strawberry',
    kind: 'beverage',
    groupId: 'grp-summer',
    groupName: 'Summer Line',
    sortOrder: 0,
    createdAt: 3000,
    updatedAt: 3100,
    settings: { ...prefs.DEFAULT_PREFERENCES, liquidColor: '#d53660' },
    artworkBlob: labelBlob,
  });
  const mango = store.parseCustomProjectRecord({
    id: 'sku-mango',
    name: 'Mango',
    kind: 'beverage',
    groupId: 'grp-summer',
    groupName: 'Summer Line',
    sortOrder: 1,
    createdAt: 3200,
    updatedAt: 3500,
    settings: { ...prefs.DEFAULT_PREFERENCES, liquidColor: '#ffb52e' },
  });
  const tray = store.parseCustomProjectRecord({
    id: 'sku-tray',
    name: '6-Pack Tray',
    kind: 'packaging',
    groupId: 'grp-summer',
    groupName: 'Summer Line',
    sortOrder: 2,
    createdAt: 3400,
    updatedAt: 5000,
    settings: prefs.DEFAULT_PREFERENCES,
    packagingParams: { templateId: 'fefco-0421-tray', lengthMm: 220, widthMm: 150, heightMm: 190 },
    bottlePack: { enabled: true, modelId: 'basil-strawberry', cols: 3, rows: 2 },
    packagingArtwork: {
      mode: 'panel',
      panelOverlays: {
        'outside:front-wall': {
          panelId: 'front-wall',
          surface: 'outside',
          imageBlob: boxBlob,
          imageScale: 1,
          imageOffsetX: 0,
          imageOffsetY: 0,
          imageRotationDeg: 0,
        },
      },
    },
    packedBottle: {
      modelId: 'basil-strawberry',
      name: 'Strawberry',
      settings: prefs.DEFAULT_PREFERENCES,
      labelBlob,
    },
  });

  assert.ok(tray.packagingArtwork.panelOverlays['outside:front-wall'].imageBlob instanceof Blob);
  assert.ok(tray.packedBottle.labelBlob instanceof Blob);

  const grouped = store.groupCustomProjects(
    [legacyItem, tray, mango, strawberry],
    [{ id: 'grp-summer', name: 'Summer Beverage Line', createdAt: 3000, updatedAt: 4000 }],
  );

  assert.equal(grouped.length, 2);
  // Most recently updated group first
  assert.equal(grouped[0].group.id, 'grp-summer');
  assert.equal(grouped[0].group.name, 'Summer Beverage Line');
  assert.deepEqual(
    grouped[0].items.map((i) => i.id),
    ['sku-strawberry', 'sku-mango', 'sku-tray'],
  );
  // Legacy record transparently forms a 1-item group
  assert.equal(grouped[1].group.id, 'grp_legacy-1');
  assert.equal(grouped[1].items.length, 1);
});

test('packageProjectsForShare deduplicates identical label blobs shared between a bottle and its 6-pack tray', async () => {
  const load = createLoader();
  const store = load(path.resolve(ROOT, 'lib/labellab/project-store.ts'));
  const prefs = load(path.resolve(ROOT, 'lib/labellab/preferences.ts'));
  const packager = load(path.resolve(ROOT, 'lib/labellab/share-packager.ts'));

  // Two distinct Blob instances with identical bytes should still dedup via SHA-256!
  const bottleLabel = new Blob([SAMPLE_PNG_A], { type: 'image/png' });
  const trayPackedLabel = new Blob([SAMPLE_PNG_A], { type: 'image/png' });
  const boxFaceArt = new Blob([SAMPLE_PNG_B], { type: 'image/png' });

  const bottle = store.parseCustomProjectRecord({
    id: 'b1',
    name: 'Strawberry 290ml',
    kind: 'beverage',
    createdAt: 1000,
    updatedAt: 1000,
    settings: prefs.DEFAULT_PREFERENCES,
    artworkBlob: bottleLabel,
  });
  const tray = store.parseCustomProjectRecord({
    id: 'p1',
    name: '6-Pack Tray',
    kind: 'packaging',
    createdAt: 2000,
    updatedAt: 2000,
    settings: prefs.DEFAULT_PREFERENCES,
    packagingParams: { templateId: 'fefco-0421-tray', lengthMm: 220, widthMm: 150, heightMm: 190 },
    bottlePack: { enabled: true, modelId: 'basil-strawberry', cols: 3, rows: 2 },
    packagingArtwork: {
      mode: 'panel',
      panelOverlays: {
        'outside:front-wall': {
          panelId: 'front-wall',
          surface: 'outside',
          imageBlob: boxFaceArt,
          imageScale: 1,
          imageOffsetX: 0,
          imageOffsetY: 0,
          imageRotationDeg: 0,
        },
      },
    },
    packedBottle: {
      modelId: 'basil-strawberry',
      name: 'Strawberry 290ml',
      settings: prefs.DEFAULT_PREFERENCES,
      labelBlob: trayPackedLabel,
    },
  });

  const packaged = await packager.packageProjectsForShare([bottle, tray], {
    optimizeBlob: async (blob) => blob,
  });

  assert.equal(packaged.items.length, 2);
  // Only 2 unique images stored (shared label + box face) despite 3 blob references
  assert.equal(packaged.assets.size, 2);
  assert.equal(packaged.deduplicatedCount, 1);
  assert.equal(
    packaged.items[0].payload.labelHash,
    packaged.items[1].payload.packedBottle.labelHash,
    'Bottle and packed tray should point to the exact same deduplicated SHA-256 asset hash',
  );
  assert.ok(packaged.items[1].payload.packagingArtwork.panelOverlays['outside:front-wall'].imageHash);
});
