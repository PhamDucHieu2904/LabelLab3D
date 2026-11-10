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

const { LAB_MODELS, LAB_MODEL_FAMILIES, getDefaultFamilyVariant, getOrderedFamilyVariants, getLabModelFamily, filterLabModelFamilies, publishedCatalog } = loadSource(path.join(root, 'lib/labellab/catalog'));
const { resolveDisplay3D } = loadSource(path.join(root, 'lib/catalog/resolve'));
const { isBasilHighAsset } = loadSource(path.join(root, 'lib/viewer/basil-presentation'));
const scenes = [
  ['basil-strawberry', 'basil-glass290-strawberry-3d', '/models/bottles/glass-290-basil-web.glb'],
  ['can-mango', 'juice30-can330-mango-3d', '/models/cans/can-330.glb'],
  ['pet-aloe', 'aloe-pet500-mango-3d', '/models/bottles/pet-500-short-label.glb'],
  ['pet-nata-watermelon', 'cojo-pet320-watermelon-3d', '/models/bottles/pet-320-nata.glb'],
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

test('290 ml family keeps the Label Lab PC order and selects index 0', () => {
  const family = LAB_MODEL_FAMILIES.find(item => item.id === 'glass-290-rotate-cap');
  assert.ok(family);
  assert.equal(family.name, '290 ml Bottle');
  assert.deepEqual(getOrderedFamilyVariants(family).map(item => [item.label, item.order]), [
    ['Basil', 0],
    ['Chia', 1],
    ['Milk', 3],
  ]);
  assert.equal(getDefaultFamilyVariant(family).modelId, 'basil-strawberry');
  assert.equal(family.variants.find(item => item.label === 'Basil').available, true);
  assert.equal(family.variants.find(item => item.label === 'Chia').modelId, 'glass-290-chia');
  assert.equal(family.variants.find(item => item.label === 'Milk').modelId, 'glass-290-milk');
});

for (const [kind, color] of [['chia', '#f14e78'], ['milk', '#fff5e4']]) {
  test(`Glass290 ${kind}: own geometry, family selection and persisted/reset native defaults agree`, () => {
    const {parsePreferences}=loadSource(path.join(root,'lib/labellab/preferences'));
    const {getModelMaterialDefaults}=loadSource(path.join(root,'lib/labellab/catalog'));
    const id=`glass-290-${kind}`, model=LAB_MODELS.find(m=>m.id===id);
    assert.ok(model);
    assert.equal(getLabModelFamily(id).id,'glass-290-rotate-cap');
    assert.equal(model.asset.volumeMl,290);
    assert.equal(model.asset.cameraFraming,'bounds','new bottles keep both cap and base inside every export ratio');
    assert.equal(model.appearance.slots.liquid.color,color);
    const defaults=getModelMaterialDefaults(id), parsed=parsePreferences({modelId:id});
    assert.equal(parsed.modelId,id);
    for(const key of ['liquidType','liquidColor','liquidCustomized','capColor','capRoughness','bodyRoughness','roughness','liquidClarity','liquidTurbidity']) assert.equal(parsed[key],defaults[key],key);
    assert.equal(defaults.liquidType,kind); assert.equal(defaults.liquidCustomized,false);
    assert.equal(defaults.capColor,'#d8c738');
    assert.equal(model.asset.materialSlots.inclusions?.length??0,kind==='chia'?1:0);
    assert.equal(model.appearance.slots.label.baseColorMap,undefined);
  });
}

test('Glass290 Chia shares Basil seed optical defaults while retaining its own type and geometry', () => {
  const basil = LAB_MODELS.find(m => m.id === 'basil-strawberry');
  const chia = LAB_MODELS.find(m => m.id === 'glass-290-chia');
  assert.equal(chia.appearance.slots.liquid.color, basil.appearance.slots.liquid.color);
  assert.equal(chia.appearance.slots.liquid.transmission ?? 0, 0);
  assert.equal(chia.appearance.slots.liquid.roughness, 1);
  const { parsePreferences } = loadSource(path.join(root, 'lib/labellab/preferences'));
  const chiaDefaults = parsePreferences({ modelId: chia.id }), basilDefaults = parsePreferences({ modelId: basil.id });
  for (const key of ['liquidClarity', 'liquidDensity', 'liquidTurbidity', 'liquidBrightness', 'liquidScattering', 'liquidRoughness', 'liquidIor']) assert.equal(chiaDefaults[key], basilDefaults[key], key);
  assert.equal(chia.appearance.slots.inclusions.color, '#302a24');
  assert.notDeepEqual(chia.asset.materialSlots.inclusions, basil.asset.materialSlots.inclusions);
});

test('320 ml bottle keeps existing Nata media and persistent selection alongside full label', () => {
  const { parsePreferences } = loadSource(path.join(root, 'lib/labellab/preferences'));
  const family = getLabModelFamily('pet-nata-watermelon');
  assert.equal(family.id, 'pet-320-nata');
  assert.equal(family.variants.length, 2);
  assert.deepEqual(getOrderedFamilyVariants(family).map(v=>[v.label,v.order,v.modelId]), [
    ['Nata de coco',0,'pet-nata-watermelon'],['Full label',1,'pet-320-full-nata'],
  ]);
  assert.equal(getDefaultFamilyVariant(family).modelId, 'pet-nata-watermelon');
  assert.equal(LAB_MODELS.find(item => item.id === 'pet-320-full-nata').asset.cameraFraming, undefined,
    'full-label index 1 uses the same camera framing as index 0');
  assert.equal(parsePreferences({ modelId: 'pet-nata-watermelon' }).modelId, 'pet-nata-watermelon');
  const model = LAB_MODELS.find(item => item.id === 'pet-nata-watermelon');
  assert.equal(model.appearance.slots.liquid.color, '#ff4430');
  assert.equal(model.appearance.slots.label.textureOffsetX, 0.03);
  const crypto = require('node:crypto');
  for (const url of [model.asset.src, model.poster, model.appearance.slots.label.baseColorMap]) {
    const media = publishedCatalog.media.find(item => item.url === url);
    const bytes = fs.readFileSync(path.join(root, 'public', url));
    assert.equal(bytes.length, media.bytes, url);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), media.sha256, url);
  }
});

test('model library families do not duplicate a model card for each variant', () => {
  const modelIds = LAB_MODEL_FAMILIES.flatMap(family =>
    family.variants.filter(variant => variant.available).map(variant => variant.modelId),
  );
  assert.deepEqual([...new Set(modelIds)].sort(), LAB_MODELS.map(model => model.id).sort());
  assert.equal(new Set(modelIds).size, modelIds.length, 'each active child belongs to one packaging family');
  assert.equal(LAB_MODEL_FAMILIES.length, 22);
  const glass280 = getLabModelFamily('glass-280-latte');
  assert.equal(getLabModelFamily('glass-280-short-latte'), glass280, 'both label types share one card');
  assert.deepEqual(getOrderedFamilyVariants(glass280).map(({ label, order, modelId }) => ({ label, order, modelId })), [
    { label: 'Full label', order: 0, modelId: 'glass-280-latte' },
    { label: 'Short label', order: 1, modelId: 'glass-280-short-latte' },
  ]);
  assert.equal(getDefaultFamilyVariant(glass280).modelId, 'glass-280-latte');
  assert.equal(glass280.poster, LAB_MODELS.find(model => model.id === 'glass-280-latte').poster);
  for (const family of LAB_MODEL_FAMILIES) {
    const first = getDefaultFamilyVariant(family);
    assert.equal(first.available, true, `${family.name} must have a usable index 0`);
    assert.ok(LAB_MODELS.some(model => model.id === first.modelId));
    assert.ok(family.variants.filter(variant => !variant.available).every(variant => !variant.modelId),
      'unavailable children must not alias another product GLB');
  }
});

test('default means sorted list index zero, even with source order gaps and ties', () => {
  const original = LAB_MODEL_FAMILIES[0];
  const family = { ...original, variants: [
    { id: 'milk', label: 'Milk', order: 2, available: false },
    { id: 'chia', label: 'Chia', order: 2, available: false },
    { id: 'basil', label: 'Basil', order: 1, modelId: 'basil-strawberry', available: true },
  ] };
  assert.equal(getDefaultFamilyVariant(family).modelId, 'basil-strawberry');
  assert.deepEqual(getOrderedFamilyVariants(family).map(item => item.id), ['basil', 'chia', 'milk']);
  assert.deepEqual(family.variants.map(item => item.id), ['milk', 'chia', 'basil'], 'sorting must not mutate catalog data');
  assert.equal(getDefaultFamilyVariant({ ...original, variants: [] }), undefined);
});

test('searches match variant names while preserving one packaging card and category filters', () => {
  assert.deepEqual(filterLabModelFamilies(' Chia ').map(item => item.id), ['glass-290-rotate-cap', 'glass-290-pull-cap']);
  assert.deepEqual(filterLabModelFamilies('strawberry').map(item => item.id), ['glass-290-rotate-cap']);
  assert.deepEqual(filterLabModelFamilies('290 ml').map(item => item.id), ['glass-290-rotate-cap', 'glass-290-pull-cap']);
  assert.deepEqual(filterLabModelFamilies('MILK').map(item => item.id), ['glass-300-milk', 'glass-485-milk', 'glass-290-rotate-cap', 'glass-290-pull-cap', 'glass-280-latte']);
  assert.deepEqual(filterLabModelFamilies('Latte').map(item => item.id), ['glass-280-latte']);
  for (const query of ['full label', 'short label']) {
    assert.deepEqual(filterLabModelFamilies(query, 'glass').map(item => item.id), ['glass-280-latte']);
  }
  assert.equal(filterLabModelFamilies('Chia', 'can').length, 0);
  assert.deepEqual(filterLabModelFamilies('', 'pet').map(item => item.id), ['pet-320-nata', 'pet-500-short-label', 'pet-350-juice', 'pet-330-energy', 'pet-1000-juice', 'pet-1500-juice', 'pet-325-juice']);
  assert.equal(getLabModelFamily(undefined), undefined);
  assert.equal(getLabModelFamily('not-a-web-model'), undefined);
});

for (const [id,volume,type,color] of [['pet-320-full-nata',320,'nata-de-coco','#ff4430'],['pet-1000-juice',1000,'fruit-juice','#E8B64F']]) {
  test(`${id}: semantic parts, material defaults and saved projects use the new Draco model`, () => {
    const {parsePreferences}=loadSource(path.join(root,'lib/labellab/preferences'));
    const {getModelMaterialDefaults}=loadSource(path.join(root,'lib/labellab/catalog'));
    const model=LAB_MODELS.find(m=>m.id===id);
    assert.ok(model,'model must be registered');
    assert.equal(model.asset.volumeMl,volume);
    assert.equal(model.category,'pet');
    assert.equal(model.asset.cameraFraming, id === 'pet-1000-juice' ? 'bounds' : undefined,
      'full-label 320 uses the shared index-0 framing path');
    assert.equal(parsePreferences({modelId:id}).modelId,id);
    const defaults=getModelMaterialDefaults(id), restored=parsePreferences({modelId:id});
    assert.equal(defaults.liquidType,type); assert.equal(defaults.liquidColor.toLowerCase(),color.toLowerCase());
    assert.equal(defaults.capColor,'#ffffff');
    assert.equal(restored.liquidType,type); assert.equal(restored.liquidColor.toLowerCase(),color.toLowerCase());
    assert.equal(restored.capColor,defaults.capColor); assert.equal(restored.liquidCustomized,defaults.liquidCustomized);
    const bytes=fs.readFileSync(path.join(root,'public',model.asset.src.split('?')[0]));
    const d=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
    for(const role of ['body','cap','label','liquid',...(volume===320?['inclusions']:[])]) {
      assert.ok(model.asset.materialSlots[role].length>0);
      for(const name of model.asset.materialSlots[role]) assert.ok(d.materials.some(m=>m.name===name));
    }
    assert.ok(d.extensionsRequired.includes('KHR_draco_mesh_compression'));
    assert.equal(model.appearance.slots.label.baseColorMap,undefined,'new artwork starts blank');
    assert.ok(model.asset.src.includes('?v='),'new GLBs are versioned');
    assert.ok(fs.existsSync(path.join(root,'public',model.poster.split('?')[0])),'own real poster exists');
    if(volume===1000) assert.equal(getDefaultFamilyVariant(getLabModelFamily(id)).modelId,id);
    else assert.equal(getLabModelFamily(id),getLabModelFamily('pet-nata-watermelon'));
  });
}

test('350 ml PET uses the supplied geometry/UVs with editable Juice and persistent selection', () => {
  const { parsePreferences } = loadSource(path.join(root, 'lib/labellab/preferences'));
  const { getModelMaterialDefaults } = loadSource(path.join(root, 'lib/labellab/catalog'));
  const model = LAB_MODELS.find(item => item.id === 'pet-350-juice');
  const family = getLabModelFamily(model.id);
  assert.equal(model.category, 'pet');
  assert.equal(model.asset.volumeMl, 350);
  assert.equal(getDefaultFamilyVariant(family).label, 'Juice');
  const defaults = getModelMaterialDefaults(model.id);
  assert.equal(defaults.liquidType, 'fruit-juice');
  assert.equal(defaults.liquidColor, '#E8B64F');
  assert.equal(defaults.liquidCustomized, true);
  const restored = parsePreferences({ modelId: model.id });
  assert.equal(restored.modelId, model.id);
  assert.equal(restored.liquidColor, defaults.liquidColor);
  assert.equal(restored.capColor, defaults.capColor);
  assert.equal(restored.liquidType, defaults.liquidType);
  assert.equal(restored.liquidCustomized, true);
  const glb = fs.readFileSync(path.join(root, 'public', model.asset.src.split('?')[0]));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/models/bottles/pet-350-juice.manifest.json')));
  const jsonLength = glb.readUInt32LE(12);
  const data = JSON.parse(glb.subarray(20, 20 + jsonLength).toString());
  const crypto = require('node:crypto');
  assert.equal(crypto.createHash('sha256').update(glb.subarray(20 + jsonLength)).digest('hex'), manifest.binarySha256, 'Published compressed buffer matches manifest');
  assert.equal(glb.length, manifest.bytes);
  assert.equal(crypto.createHash('sha256').update(glb).digest('hex'), manifest.sha256);
  assert.deepEqual(data.nodes.at(-1).scale, [0.1, 0.1, 0.1]);
  for (const names of Object.values(model.asset.materialSlots)) {
    for (const name of names) assert.ok(data.materials.some(material => material.name === name), `Missing ${name}`);
  }
  assert.ok(data.materials.every(material => material.extras.bottleProfile === 'juice-pet-v1'));
  for (const mesh of data.meshes) for (const primitive of mesh.primitives) {
    assert.ok(Number.isInteger(primitive.attributes.POSITION));
    assert.ok(Number.isInteger(primitive.attributes.NORMAL));
    assert.ok(Number.isInteger(primitive.attributes.TEXCOORD_0));
  }
  assert.equal(fs.existsSync(path.join(root, 'public', model.poster.split('?')[0])), true);
  assert.match(manifest.sourceName, /^Pet 350ml bottle model web\.glb$/);
  assert.ok(model.asset.src.endsWith(`?v=${manifest.sha256.slice(0, 12)}`));
});

test('330 ml PET preserves supplied web buffers and defaults to persistent sparkling Energy drink', () => {
  const { parsePreferences, pickMaterialPreferences } = loadSource(path.join(root, 'lib/labellab/preferences'));
  const { getModelMaterialDefaults } = loadSource(path.join(root, 'lib/labellab/catalog'));
  const model = LAB_MODELS.find(item => item.id === 'pet-330-energy');
  assert.equal(model.asset.volumeMl, 330); assert.equal(model.asset.sparkling, true);
  assert.equal(getDefaultFamilyVariant(getLabModelFamily(model.id)).label, 'Energy drink');
  const defaults = getModelMaterialDefaults(model.id);
  assert.equal(defaults.liquidType, 'energy'); assert.equal(defaults.liquidColor, '#FFD600');
  assert.equal(defaults.liquidCustomized, true); assert.equal(defaults.liquidSparkling, .516);
  const restored = parsePreferences({ modelId: model.id });
  for (const key of ['liquidType', 'liquidColor', 'liquidCustomized', 'liquidSparkling', 'capColor']) assert.equal(restored[key], defaults[key]);
  assert.equal(pickMaterialPreferences({ ...restored, liquidSparkling: .77 }).liquidSparkling, .77);
  assert.equal(parsePreferences({ ...restored, liquidSparkling: 2 }).liquidSparkling, 1);
  assert.equal(parsePreferences({ ...restored, liquidSparkling: '1' }).liquidSparkling, .516);
  const glb = fs.readFileSync(path.join(root, 'public', model.asset.src.split('?')[0]));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/models/bottles/pet-330-energy.manifest.json')));
  const end = 20 + glb.readUInt32LE(12), data = JSON.parse(glb.subarray(20, end));
  const hash = value => require('node:crypto').createHash('sha256').update(value).digest('hex');
  assert.equal(glb.length, manifest.bytes); assert.equal(hash(glb), manifest.sha256);
  assert.equal(hash(glb.subarray(end)), manifest.binarySha256);
  assert.deepEqual(data.nodes.at(-1).scale, [.1, .1, .1]);
  assert.ok(data.materials.every(m => m.extras.bottleProfile === 'energy-pet-v1'));
  for (const name of Object.values(model.asset.materialSlots).flat()) assert.ok(data.materials.some(m => m.name === name), `Missing ${name}`);
  for (const mesh of data.meshes) for (const p of mesh.primitives) {
    assert.ok(Number.isInteger(p.attributes.NORMAL)); assert.ok(Number.isInteger(p.attributes.TEXCOORD_0));
  }
  assert.ok(fs.statSync(path.join(root, 'public', model.poster.split('?')[0])).size > 0);
  assert.ok(model.asset.src.endsWith(`?v=${manifest.sha256.slice(0, 12)}`));
});

for (const modelId of ['glass-280-latte', 'glass-280-short-latte']) {
test(`${modelId} preserves supplied geometry/UVs and restores Milk coffee / Latte defaults`, () => {
  const { parsePreferences } = loadSource(path.join(root, 'lib/labellab/preferences'));
  const { getModelMaterialDefaults } = loadSource(path.join(root, 'lib/labellab/catalog'));
  const model = LAB_MODELS.find(item => item.id === modelId);
  assert.equal(model.category, 'glass'); assert.equal(model.asset.volumeMl, 280);
  const family = getLabModelFamily(model.id);
  assert.equal(family.id, 'glass-280-latte');
  assert.equal(family.variants.find(variant => variant.modelId === modelId).label, modelId.includes('short') ? 'Short label' : 'Full label');
  const defaults = getModelMaterialDefaults(model.id), restored = parsePreferences({ modelId: model.id });
  assert.equal(defaults.liquidType, 'coffee'); assert.equal(defaults.liquidColor, '#B88C69');
  assert.equal(defaults.liquidCustomized, true); assert.equal(defaults.liquidSparkling, 0);
  for (const key of ['liquidType', 'liquidColor', 'liquidCustomized', 'liquidSparkling', 'capColor', 'capMetalness', 'capRoughness', 'bodyRoughness']) assert.equal(restored[key], defaults[key], key);
  assert.equal(parsePreferences({ ...restored, liquidColor: '#92654D', capRoughness: .7 }).capRoughness, .7);
  const glb = fs.readFileSync(path.join(root, 'public', model.asset.src.split('?')[0]));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, `public/models/bottles/${modelId}.manifest.json`)));
  const end = 20 + glb.readUInt32LE(12), data = JSON.parse(glb.subarray(20, end));
  const hash = value => require('node:crypto').createHash('sha256').update(value).digest('hex');
  assert.equal(glb.length, manifest.bytes); assert.equal(hash(glb), manifest.sha256);
  assert.equal(hash(glb.subarray(end)), manifest.binarySha256);
  assert.deepEqual(data.nodes.at(-1).scale, [.1, .1, .1]);
  assert.ok(data.materials.every(m => m.extras.bottleProfile === 'glass-280-v1'));
  for (const name of model.asset.materialSlots.body) {
    assert.equal(data.materials.find(m => m.name === name).extensions.KHR_materials_transmission.transmissionFactor, 1);
  }
  if (modelId === 'glass-280-short-latte') {
    const original = LAB_MODELS.find(item => item.id === 'glass-280-latte');
    assert.notEqual(model.asset.src, original.asset.src);
    assert.notEqual(model.poster, original.poster);
    const originalManifest = JSON.parse(fs.readFileSync(path.join(root, 'public/models/bottles/glass-280-latte.manifest.json')));
    assert.notEqual(manifest.binarySha256, originalManifest.binarySha256, 'Short bottle keeps its own supplied geometry');
    assert.match(manifest.sourceName, /Short Web\.glb$/);
  }
  assert.equal(data.materials.find(m => m.name === 'Label').pbrMetallicRoughness.baseColorFactor[3], 1);
  assert.equal(manifest.blankLabel, 'white');
  assert.equal(manifest.liquidInsetXZ, .992);
  for (const name of ['Cap', 'White layer', 'Label']) assert.equal(data.materials.find(m => m.name === name).doubleSided, true, `${name} is closed from underside views`);
  assert.ok(model.asset.src.endsWith(`?v=${manifest.sha256.slice(0, 12)}`), 'changed material assets invalidate browser caches');
  assert.equal(data.materials.find(m => m.name === 'White layer').pbrMetallicRoughness.metallicFactor, 0);
  for (const name of Object.values(model.asset.materialSlots).flat()) assert.ok(data.materials.some(m => m.name === name), `Missing ${name}`);
  for (const mesh of data.meshes) for (const p of mesh.primitives) {
    assert.ok(Number.isInteger(p.attributes.NORMAL)); assert.ok(Number.isInteger(p.attributes.TEXCOORD_0));
  }
  assert.ok(fs.statSync(path.join(root, 'public', model.poster.split('?')[0])).size > 0);
});
}


for(const [id,volume,category,liquid] of [['pet-1500-juice',1500,'pet',true],['pet-325-juice',325,'pet',true],['pet-1000-short-juice',1000,'pet',true],['pp-2000',2000,'pp',false],['pp-1250',1250,'pp',false],['pp-1000',1000,'pp',false],['pp-1000-2',1000,'pp',false],['pp-500',500,'pp',false],['pp-500-2',500,'pp',false]]) {
 test(`${id}: batch library persists accurate packaging and supported Properties`,()=>{
  const {parsePreferences,pickMaterialPreferences}=loadSource(path.join(root,'lib/labellab/preferences'));
  const {getModelMaterialDefaults}=loadSource(path.join(root,'lib/labellab/catalog'));
  const m=LAB_MODELS.find(m=>m.id===id);assert.ok(m,'batch model registered');
  assert.equal(m.asset.volumeMl,volume);assert.equal(m.category,category);assert.equal(m.asset.packaging,category);assert.equal(m.asset.cameraFraming,'bounds');
  assert.equal(Boolean(m.asset.materialSlots.liquid?.length),liquid);assert.equal(Boolean(m.appearance.slots.liquid),liquid);
  const defaults=getModelMaterialDefaults(id),restored=parsePreferences({modelId:id});assert.equal(restored.modelId,id);
  for(const [k,v] of Object.entries(defaults))assert.equal(restored[k],v,k);
  const edited=parsePreferences({...restored,bodyRoughness:.62,capColor:'#2768c7',liquidColor:'#123456'});assert.equal(pickMaterialPreferences(edited).bodyRoughness,.62);assert.equal(edited.capColor,'#2768c7');
  assert.equal(m.appearance.slots.label.baseColorMap,undefined);assert.ok(fs.existsSync(path.join(root,'public',m.poster.split('?')[0])),'own poster exists');
  if(id==='pet-1000-short-juice'){
   const f=getLabModelFamily(id);assert.equal(f,getLabModelFamily('pet-1000-juice'));
   assert.deepEqual(getOrderedFamilyVariants(f).map(v=>[v.label,v.order,v.modelId]),[['Full label',0,'pet-1000-juice'],['Short label',1,id]]);
  }
  if(category==='pp')assert.ok(filterLabModelFamilies('', 'pp').some(f=>f.variants.some(v=>v.modelId===id)));
  if(id.startsWith('pp-500') || id.startsWith('pp-1000-2')) {
   const family=getLabModelFamily(id); assert.equal(family.id,id.startsWith('pp-500')?'pp-500':'pp-1000');
   assert.equal(family.variants.find(v=>v.modelId===id).label,id.endsWith('-2')?'Variant 2':'Standard');
  }
 });
}
test('PET ring materials are exposed through an independent semantic slot', () => {
  const namedRings = [
    ['pet-aloe', 'Ring'], ['pet-nata-watermelon', 'pet-ring'],
    ['pet-320-full-nata', 'Ring'], ['pet-350-juice', 'Ring'],
    ['pet-330-energy', 'Ring'], ['pet-1000-juice', 'Ring'],
    ['pet-1500-juice', 'Ring'], ['pet-325-juice', 'Ring'],
    ['pet-1000-short-juice', 'Ring'],
  ];
  for (const [id, name] of namedRings) {
    const model = LAB_MODELS.find(model => model.id === id);
    const slots = model.asset.materialSlots;
    assert.deepEqual(slots.ring, [name], `${model.id} must declare its prepared ring`);
    assert.ok(!slots.body?.some(name => /ring/i.test(name)), `${model.id} body slot must exclude Ring`);
    assert.ok(!(model.appearance.requiredSlots ?? []).includes('ring'), `${model.id} required slots preserve legacy behavior`);
  }
});
