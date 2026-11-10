const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const THREE = require('three');
const cache = new Map();
function loadTs(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = new Module(filename, module);
  loaded.filename = filename; loaded.paths = module.paths;
  cache.set(filename, loaded);
  loaded.require = name => name.startsWith('.')
    ? loadTs(path.resolve(path.dirname(filename), `${name}.ts`)) : require(name);
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, filename);
  return loaded.exports;
}
const { configureLiveLiquidOptics, liquidOpticsUpdates, normalizeLiquidOptics } = loadTs(path.resolve(__dirname, '../../lib/viewer/liquid-adjustments.ts'));
const { createMaterialOverrides } = loadTs(path.resolve(__dirname, '../../lib/labellab/material-overrides.ts'));
const { createAppearanceHandle } = loadTs(path.resolve(__dirname, '../../lib/viewer/appearance.ts'));
const optics = { clarity: .8, density: .25, turbidity: .3, brightness: 1.2, scattering: .4, roughness: .27, ior: 1.4 };

test('artwork offset sweeps the full horizontal wrap without moving UV height or source artwork', async () => {
  const source = new THREE.Texture();
  source.offset.set(.125, .2);
  const material = new THREE.MeshStandardMaterial({ map: source }); material.name = 'Label';
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material), root = new THREE.Group(); root.add(mesh);
  const handle = createAppearanceHandle(root, { id: 'offset-fixture', packaging: 'can', materialSlots: { label: ['Label'] } }, { editable: true });
  const { resolveMaterialOverride } = loadTs(path.resolve(__dirname, '../../lib/viewer-config.ts'));
  try {
    await handle.apply({});
    const map = mesh.material.map;
    assert.notEqual(map, source);
    assert.equal(map.wrapS, THREE.RepeatWrapping);
    for (const offset of [-1, -.755, 0, .755, 1]) {
      assert.equal(resolveMaterialOverride({ textureOffsetX: offset }).textureOffsetX, offset);
      handle.setLiveOverrides({ label: { textureOffsetX: offset } });
      assert.equal(map.offset.x, offset);
      assert.equal(map.offset.y, .2);
      assert.equal(map.matrix.elements[6], offset, 'the shader transform updates live');
      assert.equal(mesh.material.map, map, 'sliding does not replace/reload the texture');
    }
    handle.setLiveOverrides({ label: { textureOffsetX: 5 } });
    assert.equal(map.offset.x, 1);
    handle.setLiveOverrides({ label: { textureOffsetX: -5 } });
    assert.equal(map.offset.x, -1);
    handle.setLiveOverrides({});
    assert.equal(map.offset.x, .125);
    assert.deepEqual(source.offset.toArray(), [.125, .2]);
    assert.equal(source.wrapS, THREE.ClampToEdgeWrapping);
    assert.deepEqual(mesh.rotation.toArray(), [0, 0, 0, 'XYZ']);
  } finally { handle.dispose(); source.dispose(); material.dispose(); mesh.geometry.dispose(); }
});

test('Glass290 uses the Basil web optical path while retaining Chia source seeds', async () => {
  const root=new THREE.Group(), meshes={};
  for(const name of ['Body','Neck','GlassBase','GoldenCap','PaperLabel','Water','Chia Seeds']) {
    const mat=new THREE.MeshPhysicalMaterial({color:'#ffffff'}); mat.name=name; mat.userData.bottleProfile='glass-290-v1';
    if(name==='Water') {mat.transmission=.92; mat.userData.bottleLiquidKind='chia';}
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(),mat);mesh.name=name;root.add(mesh);meshes[name]=mesh;
  }
  const asset={id:'glass-290-chia',packaging:'glass',materialSlots:{body:['Body','Neck','GlassBase'],cap:['GoldenCap'],label:['PaperLabel'],liquid:['Water'],inclusions:['Chia Seeds']}};
  const handle=createAppearanceHandle(root,asset,{editable:true});
  await handle.apply({slots:{body:{transmission:1},cap:{color:'#d8c738'},label:{color:'#ffffff'},liquid:{color:'#eee9d5'},inclusions:{color:'#302a24'}}});
  assert.equal(meshes.Water.material.transmission,0,'290 ml water must use the opaque Basil reservoir');
  assert.equal(meshes.Water.material.depthWrite,true);
  assert.equal(root.children.length,7,'no generated Basil instances or replacement geometry');
  assert.match(meshes.Water.material.customProgramCacheKey(),/^basil-web-back-water-v2/);
  assert.equal(meshes.Body.material.customProgramCacheKey(),'basil-web-polished-shell-v1');
  assert.equal(meshes['Chia Seeds'].renderOrder,1,'source seeds render inside the water layer');
  assert.equal(meshes['Chia Seeds'].material.customProgramCacheKey(),'basil-web-raw-seeds-v1');
  assert.notEqual(meshes['Chia Seeds'].onBeforeRender,THREE.Mesh.prototype.onBeforeRender,'source seeds participate in Basil capture ordering');
  for(const name of ['GoldenCap','PaperLabel']) {assert.equal(meshes[name].material.opacity,1);assert.equal(meshes[name].material.side,THREE.DoubleSide);assert.equal(meshes[name].material.depthWrite,true);}
  for(const name of ['Body','Neck','GlassBase']) assert.equal(meshes[name].material.ior,1.52);
  handle.setLiveOverrides({liquid:{color:'#ff0000',liquidOptics:optics}});
  assert.equal(meshes['Chia Seeds'].material.color.getHexString(),'302a24');
  handle.dispose(); root.traverse(n=>{if(n instanceof THREE.Mesh){n.geometry.dispose();n.material.dispose();}});
});

for (const kind of ['chia', 'milk']) test(`Glass290 ${kind}: pooled water/seeds stay in capture and solids stay in beauty`, async () => {
  const root = new THREE.Group();
  const names = ['Body', 'Neck', 'GoldenCap', 'PaperLabel', 'Water', ...(kind === 'chia' ? ['Chia Seeds'] : [])];
  for (const name of names) {
    const material = new THREE.MeshPhysicalMaterial(); material.name = name;
    material.userData = { bottleProfile: 'glass-290-v1', ...(name === 'Water' ? { bottleLiquidKind: kind } : {}) };
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(.034, .034, .14, 16), material); mesh.name = name; root.add(mesh);
  }
  const asset = { id: `glass-290-${kind}`, packaging: 'glass', materialSlots: {
    body: ['Body', 'Neck'], cap: ['GoldenCap'], label: ['PaperLabel'], liquid: ['Water'], inclusions: ['Chia Seeds'],
  } };
  const { createPooledAppearanceHandle } = loadTs(path.resolve(__dirname, '../../lib/viewer/pooled-appearance.ts'));
  const { renderBottleScene } = loadTs(path.resolve(__dirname, '../../lib/viewer/bottle-materials.ts'));
  const pool = createPooledAppearanceHandle(root, asset, { editable: true });
  await pool.apply({ slots: { liquid: { color: kind === 'milk' ? '#fff5e4' : '#f14e78' } } });
  const liquid = root.children.find(mesh => mesh.name === 'Water');
  assert.equal(liquid.material.transmission, 0);
  assert.equal(liquid.material.side, kind === 'milk' ? THREE.FrontSide : THREE.BackSide);
  if (kind === 'milk') {
    assert.equal(liquid.material.color.getHexString(), 'fff5e4');
    assert.match(liquid.material.customProgramCacheKey(), /^basil-web-milk-reservoir-v2/);
    pool.setLiveOverrides({ liquid: { color: '#b88c69' } });
    assert.equal(liquid.material.color.getHexString(), 'b88c69', 'milk pigment remains editable');
  }
  const beauty = {}, capture = {}; let target = beauty;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const layers = root.children.filter(mesh => ['Water', 'Chia Seeds', 'GoldenCap', 'PaperLabel'].includes(mesh.name));
  const renderer = { getRenderTarget: () => target, render: () => {
    for (const pass of [capture, beauty]) {
      target = pass;
      for (const mesh of layers) {
        const count = mesh.geometry.drawRange.count, captured = mesh.name === 'Water' || mesh.name === 'Chia Seeds';
        mesh.onBeforeRender(renderer, scene, camera, mesh.geometry, mesh.material, null);
        assert.equal(mesh.geometry.drawRange.count, (pass === capture) === captured ? count : 0, `${mesh.name} draws in its assigned pass`);
        mesh.onAfterRender(renderer, scene, camera, mesh.geometry, mesh.material, null);
        assert.equal(mesh.geometry.drawRange.count, count);
      }
    }
  } };
  renderBottleScene(renderer, scene, camera);
  const waterCount = liquid.geometry.drawRange.count; target = beauty;
  renderer.render = () => { liquid.onBeforeRender(renderer, scene, camera, liquid.geometry, liquid.material, null); throw new Error('draw aborted'); };
  assert.throws(() => renderBottleScene(renderer, scene, camera), /draw aborted/);
  assert.equal(liquid.geometry.drawRange.count, waterCount, 'aborted draw restores pooled geometry');
  pool.dispose(); root.children.forEach(mesh => { mesh.geometry.dispose(); mesh.material.dispose(); });
});

test('Glass280 preserves opaque white label, solid double-sided cap and fixed liner', async () => {
  const root = new THREE.Group(), materials = {}, meshes = {};
  for (const name of ['Body', 'Cap', 'White layer', 'Label', 'Water']) {
    const material = new THREE.MeshPhysicalMaterial({ color: '#ffffff' });
    material.name = name; material.userData.bottleProfile = 'glass-280-v1';
    if (name === 'Label') { material.opacity = 0; material.transparent = true; }
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material); mesh.name = `fixture-${name}`;
    materials[name] = material; meshes[name] = mesh; root.add(mesh);
  }
  const asset = { id: 'glass-280-latte', packaging: 'glass', materialSlots: { body: ['Body'], cap: ['Cap'], label: ['Label'], liquid: ['Water'] } };
  const appearance = { slots: { body: { transmission: 1, roughness: .042 }, cap: { color: '#c0c0c0', metalness: 1 },
    liquid: { color: '#B88C69' }, label: { roughness: .28 } } };
  const handle = createAppearanceHandle(root, asset, { editable: true });
  await handle.apply(appearance);
  assert.equal(meshes.Body.material.transmission, 1);
  assert.equal(meshes.Water.material.transmission, 0);
  assert.equal(meshes.Water.material.transparent, false);
  assert.equal(meshes.Label.material.opacity, 1); assert.equal(meshes.Label.material.depthWrite, true);
  for (const name of ['Label', 'Cap', 'White layer']) {
    assert.equal(meshes[name].material.transparent, name === 'Label', `${name} must use the correct opaque-cap or final-print queue`);
    assert.equal(meshes[name].material.side, THREE.DoubleSide, `${name} must be solid from below`);
  }
  handle.setLiveOverrides({ cap: { color: '#ff0000' }, liquid: { color: '#92654D' } });
  assert.equal(meshes.Cap.material.color.getHexString(), 'ff0000');
  assert.equal(meshes['White layer'].material, materials['White layer']);
  assert.equal(meshes['White layer'].material.color.getHexString(), 'ffffff');
  const artwork = new THREE.Texture(); materials.Label.map = artwork;
  await handle.apply(appearance);
  assert.equal(meshes.Label.material.opacity, 1, 'uploaded print stays opaque');
  assert.equal(meshes.Label.material.depthWrite, true);
  materials.Label.map = null;
  await handle.apply(appearance);
  assert.equal(meshes.Label.material.opacity, 1, 'removing artwork restores a white label');
  assert.equal(meshes.Label.material.color.getHexString(), 'ffffff');
  handle.dispose(); artwork.dispose();
  for (const name of Object.keys(meshes)) { meshes[name].geometry.dispose(); materials[name].dispose(); }
});

for (const id of ['glass-280-latte', 'glass-280-short-latte']) {
test(`${id}: real GLB keeps solid beauty layers, metric glass and water inside the label`, async () => {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const { MeshoptDecoder } = await import('three/addons/libs/meshopt_decoder.module.js');
  const bytes = fs.readFileSync(path.resolve(__dirname, `../../public/models/bottles/${id}.glb`));
  const imported = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), '');
  // Match the CommonJS Three instance used by the TypeScript test loader.
  const root = new THREE.ObjectLoader().parse(imported.scene.toJSON());
  const body = id.includes('short') ? ['Body', 'Neck', 'GlassBase'] : ['Body', 'Glass Refraction'];
  const asset = { id, packaging: 'glass', materialSlots: { body, cap: ['Cap'], label: ['Label'], liquid: ['Water'] } };
  const { createPooledAppearanceHandle } = loadTs(path.resolve(__dirname, '../../lib/viewer/pooled-appearance.ts'));
  const { renderBottleScene } = loadTs(path.resolve(__dirname, '../../lib/viewer/bottle-materials.ts'));
  const pool = createPooledAppearanceHandle(root, asset, { editable: true });
  await pool.apply({ slots: { body: { transmission: 1, roughness: .042 }, label: { color: '#ffffff' }, cap: { color: '#c0c0c0' } } });
  const meshes = []; root.traverse(node => { if (node instanceof THREE.Mesh) meshes.push(node); });
  const solids = meshes.filter(mesh => ['Cap', 'White layer', 'Label'].includes(mesh.material.name));
  assert.equal(solids.length, 3);
  for (const mesh of solids) {
    assert.equal(mesh.material.opacity, 1); assert.equal(mesh.material.transparent, mesh.material.name === 'Label');
    assert.equal(mesh.material.side, THREE.DoubleSide); assert.equal(mesh.material.depthWrite, true);
  }
  const beauty = {}, reservoir = {}; let target = beauty;
  const renderer = { getRenderTarget: () => target, getContextAttributes: () => ({ premultipliedAlpha: false }), render: () => {} };
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  renderer.render = () => {
    for (const layer of [reservoir, beauty]) {
      target = layer;
      for (const mesh of solids) {
        const original = mesh.geometry.drawRange.count;
        mesh.onBeforeRender(renderer, scene, camera, mesh.geometry, mesh.material, null);
        assert.equal(mesh.geometry.drawRange.count, layer === beauty ? original : 0, `${mesh.material.name} writes depth only in beauty`);
        mesh.onAfterRender(renderer, scene, camera, mesh.geometry, mesh.material, null);
        assert.equal(mesh.geometry.drawRange.count, original);
      }
    }
  };
  renderBottleScene(renderer, scene, camera);
  target = beauty;
  const cap = solids.find(mesh => mesh.material.name === 'Cap'), range = cap.geometry.drawRange.count;
  renderer.render = () => { target = reservoir; cap.onBeforeRender(renderer, scene, camera, cap.geometry, cap.material, null); throw new Error('capture draw failed'); };
  assert.throws(() => renderBottleScene(renderer, scene, camera), /capture draw failed/);
  assert.equal(cap.geometry.drawRange.count, range, 'failed capture restores shared source geometry');
  const neck = meshes.find(mesh => mesh.material.name === 'Neck' || mesh.material.name === 'Glass Refraction' && mesh.name !== 'Base');
  assert.equal(neck.material.ior, 1.52); assert.equal(neck.material.transmission, 1);
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
  neck.material.onBeforeCompile(shader, renderer);
  assert.match(shader.fragmentShader, /normalize\( refractionVector \) \* glass280WorldThickness/);
  assert.match(shader.fragmentShader, /transmittedLight\.a = aloeCapturedCoverage/);
  assert.doesNotMatch(shader.fragmentShader, /return normalize\( refractionVector \) \* thickness \* modelScale/);
  root.updateMatrixWorld(true);
  neck.material.onBeforeRender(renderer, scene, camera, neck.geometry, neck, null);
  assert.ok(Math.abs(shader.uniforms.glass280WorldThickness.value - .0025) < 1e-8, 'Blender scale must not shrink 2.5 mm neck glass');
  root.scale.setScalar(2); root.updateMatrixWorld(true);
  neck.material.onBeforeRender(renderer, scene, camera, neck.geometry, neck, null);
  assert.ok(Math.abs(shader.uniforms.glass280WorldThickness.value - .005) < 1e-8);
  root.scale.setScalar(1); root.updateMatrixWorld(true);
  const label = solids.find(mesh => mesh.material.name === 'Label'), water = meshes.find(mesh => mesh.material.name === 'Water');
  const side = water.material.side; water.material.side = THREE.DoubleSide;
  const ray = new THREE.Raycaster();
  for (const y of [.0105, .011, .0115, .012]) for (let i = 0; i < 32; i++) {
    const angle = i * Math.PI / 16;
    ray.set(new THREE.Vector3(0, y, 0), new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)));
    const print = ray.intersectObject(label)[0], liquid = ray.intersectObject(water)[0];
    assert.ok(print && liquid && print.distance - liquid.distance > .0001, 'coffee must not protrude through the heel of the label');
  }
  water.material.side = side;
  pool.dispose(); meshes.forEach(mesh => { mesh.geometry.dispose(); mesh.material.dispose(); });
});
}

test('liquid controls extend existing volume hooks and remain opt-in/resettable', () => {
  const material = new THREE.MeshPhysicalMaterial({ roughness: .13, ior: 1.335 });
  let authoredRenderCalls = 0;
  material.onBeforeCompile = function(shader) { assert.equal(this, material); shader.uniforms.nativeVolume = { value: 42 }; };
  material.onBeforeRender = () => { authoredRenderCalls++; };
  material.customProgramCacheKey = () => 'authored-volume';
  configureLiveLiquidOptics(material, 'liquid');
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
  material.onBeforeCompile(shader, {});
  assert.equal(shader.uniforms.nativeVolume.value, 42);
  assert.equal(shader.uniforms.labLiquidEnabled.value, 0);
  assert.match(material.customProgramCacheKey(), /^authored-volume:/);
  assert.match(shader.fragmentShader, /labRear \* labAbsorption/);
  assert.match(shader.fragmentShader, /labLiquidSurface\.z - 1\.0/);
  assert.equal(shader.fragmentShader.split('vec3 bottleBackdropAt(').length - 1, 1);
  liquidOpticsUpdates.get(material)(optics, '#f05c24');
  assert.equal(shader.uniforms.labLiquidEnabled.value, 1);
  assert.deepEqual(shader.uniforms.labLiquidOptics.value.toArray(), [.8, .25, .3, 1.2]);
  assert.equal(material.roughness, .27); assert.equal(material.ior, 1.4);
  material.onBeforeRender({}, new THREE.Scene(), {}, {}, {}, {});
  assert.equal(authoredRenderCalls, 1);
  liquidOpticsUpdates.get(material)(undefined, '#ffffff');
  assert.equal(shader.uniforms.labLiquidEnabled.value, 0);
  assert.equal(material.roughness, .13); assert.equal(material.ior, 1.335);
  material.dispose();
});

test('liquid optics clamp invalid numeric input without retaining NaNs', () => {
  assert.deepEqual(normalizeLiquidOptics({ clarity: -2, density: 5, turbidity: NaN,
    brightness: Infinity, scattering: .4, roughness: 9, ior: .2 }), {
    clarity: 0, density: 1, turbidity: .2, brightness: 1, scattering: .4, roughness: 1, ior: 1,
  });
});

test('semantic edits hide unsupported parts and map a can pull tab separately from its body', () => {
  const defaults = { capColor: '#c0c0c0', capMetalness: 1, capRoughness: .2, bodyMetalness: 1, bodyRoughness: .3 };
  const settings = { ...defaults, capColor: '#123456', capMetalness: .5, bodyRoughness: .6,
    labelOffset: 12, roughness: .2, metalness: .1, liquidColor: '#ff0000', liquidCustomized: true };
  const can = { asset: { materialSlots: { body: ['body'], tab: ['tab'], label: ['label'] } } };
  const result = createMaterialOverrides(settings, can, defaults);
  assert.equal(result.liquid, undefined); assert.equal(result.cap, undefined);
  assert.deepEqual(result.tab, { color: '#123456', metalness: .5 });
  assert.deepEqual(result.body, { roughness: .6 });
  assert.equal(result.label.textureOffsetX, .12);
  const liquidModel = { asset: { materialSlots: { liquid: ['water'] } } };
  const native = createMaterialOverrides({ ...settings, liquidCustomized: false }, liquidModel, defaults);
  assert.deepEqual(native, { liquid: { color: '#ff0000' } });
});

test('live finish and liquid edits are reversible and isolated from imported materials', async () => {
  const root = new THREE.Group();
  const originals = {};
  for (const slot of ['cap', 'body', 'liquid', 'label']) {
    const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .2, metalness: .1 });
    material.name = slot; originals[slot] = material;
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  }
  const handle = createAppearanceHandle(root, { id: 'test', packaging: 'can',
    materialSlots: { cap: ['cap'], body: ['body'], liquid: ['liquid'], label: ['label'] } }, { editable: true });
  await handle.apply({});
  handle.setLiveOverrides({ cap: { color: '#112233', metalness: .9 }, body: { roughness: .7 },
    liquid: { color: '#ff3300', liquidOptics: optics } });
  const materials = Object.fromEntries(root.children.map(mesh => [mesh.material.name, mesh.material]));
  assert.equal(materials.cap.color.getHexString(), '112233'); assert.equal(materials.cap.metalness, .9);
  assert.equal(materials.body.roughness, .7);
  assert.equal(materials.label.roughness, .2);
  assert.ok(materials.liquid instanceof THREE.MeshPhysicalMaterial);
  assert.equal(materials.liquid.roughness, .27); assert.equal(materials.liquid.ior, 1.4);
  assert.equal(originals.cap.color.getHexString(), 'ffffff'); assert.equal(originals.cap.metalness, .1);
  handle.setLiveOverrides({});
  assert.equal(materials.cap.color.getHexString(), 'ffffff'); assert.equal(materials.cap.metalness, .1);
  assert.equal(materials.body.roughness, .2); assert.equal(materials.liquid.roughness, .2);
  handle.dispose();
  root.children.forEach(mesh => { assert.equal(mesh.material, originals[mesh.material.name]); mesh.geometry.dispose(); mesh.material.dispose(); });
});
