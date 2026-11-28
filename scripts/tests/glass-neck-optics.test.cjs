const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const THREE = require('three');
const load = require('../lib/load-ts-source.cjs').createSourceLoader();

test('Neck optics binds actual shell, current cap finish, label UV and scene backdrop across pooled draws', () => {
  const { createGlassNeckMaterialContext } = load(path.resolve(__dirname, '../../lib/viewer/glass-neck-material.ts'));
  const { setBottleBackdrop } = load(path.resolve(__dirname, '../../lib/viewer/bottle-backdrop.ts'));
  const root = new THREE.Group(), source = new THREE.MeshPhysicalMaterial();
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(.015, .018, .025, 16, 1, true), source);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(.016, .016, .002, 16), new THREE.MeshStandardMaterial());
  cap.position.y = .013; root.add(neck, cap);
  const context = createGlassNeckMaterialContext(root, (_mesh, material) => material === source ? 1 : 3);
  const currentCap = new THREE.MeshStandardMaterial({ color: '#c0c0c0', roughness: .55, metalness: 1 });
  const label = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
  label.map.offset.set(.2, .1); label.map.updateMatrix();
  context.registerOpaque(currentCap, 3); context.registerOpaque(label, 4);
  const material = source.clone(); material.roughness = .042; context.configure(material, neck);
  assert.equal(material.transmission, 1, 'bind Three opaque reservoir while whole-shell trace owns shading');
  assert.equal(material.side, THREE.FrontSide, 'trace once from visible front interfaces');
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
  material.onBeforeCompile(shader, {});
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(); camera.position.set(0, 0, .15); camera.updateMatrixWorld();
  const texture = new THREE.Texture(), region = new THREE.Vector4(.25, .5, .5, .25);
  setBottleBackdrop(scene, texture, region);
  material.onBeforeRender({}, scene, camera, neck.geometry, neck, null);
  assert.equal(shader.uniforms.bottleBackdrop.value, texture);
  assert.deepEqual(shader.uniforms.bottleBackdropRegion.value.toArray(), [.25, .5, .5, .25]);
  assert.equal(shader.uniforms.glassNeckCapRoughness.value, .55);
  assert.equal(shader.uniforms.glassNeckRoughness.value, .15, 'app Neck finish is softer than the body .042 baseline');
  assert.equal(shader.uniforms.glassNeckLabelMap.value, label.map);
  assert.equal(shader.uniforms.glassNeckLabelBackColor.value.getHexString(), 'c8cbd2');
  assert.match(shader.fragmentShader, /rearLabel=step\(0\.0,dot\(direction,hit\.geometric\)\)/);
  assert.match(shader.fragmentShader, /glassNeckLabelBackColor/);
  assert.doesNotMatch(shader.fragmentShader, /glassNeckLabelBackShadow/);
  currentCap.color.set('#cc2222'); currentCap.roughness = .2;
  material.onBeforeRender({}, scene, camera, neck.geometry, neck, null);
  assert.equal(shader.uniforms.glassNeckCapColor.value.getHexString(), 'cc2222');
  assert.equal(shader.uniforms.glassNeckCapRoughness.value, .2);
  setBottleBackdrop(scene, null);
  material.onBeforeRender({}, scene, camera, neck.geometry, neck, null);
  assert.equal(shader.uniforms.bottleBackdropEnabled.value, 0, 'transparent output must never bake the white backdrop fallback');
  context.dispose(); root.traverse(n => { if (n instanceof THREE.Mesh) { n.geometry.dispose(); n.material.dispose(); } });
  material.dispose(); currentCap.dispose(); label.map.dispose(); label.dispose();
});

test('Low-tier simplifiedOptics bypasses heavy BVH neck raytracing on Basil 290 mL and uses lightweight physical shell', () => {
  const { createBasilWebBottleMaterialContext } = load(path.resolve(__dirname, '../../lib/viewer/basil-web-materials.ts'));
  const asset = {
    id: 'basil-strawberry',
    packaging: 'glass',
    materialSlots: { body: ['basil-web-neck', 'basil-web-outer'], liquid: ['Water'], cap: ['Cap'], label: ['Label'] },
  };
  const root = new THREE.Group();
  const waterMat = new THREE.MeshStandardMaterial({ name: 'Water' });
  waterMat.userData.basilProfile = 'basil-web-v1';
  const water = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 12), waterMat);
  water.userData.basilProfile = 'basil-web-v1';
  const neckMat = new THREE.MeshPhysicalMaterial({ name: 'basil-web-neck' });
  neckMat.userData.basilProfile = 'basil-web-v1';
  neckMat.userData.basilWebNeckWallMetres = 0.0013;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.018, 0.025, 12, 1, true), neckMat);
  neck.userData.basilProfile = 'basil-web-v1';
  root.add(water, neck);

  const lowCtx = createBasilWebBottleMaterialContext(root, asset, { simplifiedOptics: true });
  assert.ok(lowCtx, 'context created in simplifiedOptics mode');
  assert.equal(lowCtx.dispose, undefined, 'no BVH Float32 DataTextures allocated in simplifiedOptics mode');
  const lowNeck = neckMat.clone();
  lowCtx.configure(lowNeck, neck, 'body');
  assert.equal(lowNeck.customProgramCacheKey(), 'basil-web-polished-shell-v1', 'neck shares lightweight calibrated transmission shell on low tier');
  const lowShader = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
  lowNeck.onBeforeCompile(lowShader, {});
  assert.doesNotMatch(lowShader.fragmentShader, /glassNeckTrace/, 'BVH raytrace loop is completely excluded on low tier');

  const fullCtx = createBasilWebBottleMaterialContext(root, asset, { simplifiedOptics: false });
  assert.ok(fullCtx && typeof fullCtx.dispose === 'function', 'full mode builds BVH context');
  const fullNeck = neckMat.clone();
  fullCtx.configure(fullNeck, neck, 'body');
  assert.equal(fullNeck.customProgramCacheKey(), 'pullcap-hollow-glass-neck-v1', 'full mode retains BVH neck raytracer');

  fullCtx.dispose();
  lowNeck.dispose();
  fullNeck.dispose();
  root.traverse(n => { if (n instanceof THREE.Mesh) { n.geometry.dispose(); n.material.dispose(); } });
});


