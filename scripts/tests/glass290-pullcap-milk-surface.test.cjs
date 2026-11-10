const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const THREE = require('three');
const { parseGlb } = require('../lib/bottle-compression.cjs');
const { decodeDracoPrimitives } = require('../lib/draco-bottle-compression.cjs');
const load = require('../lib/load-ts-source.cjs').createSourceLoader();

test('pull-cap Milk shows its outward top and near wall rather than the far bottom', async () => {
  const bytes = fs.readFileSync(path.resolve(__dirname, '../../public/models/bottles/glass-290-pullcap-milk.glb'));
  const { document } = parseGlb(bytes);
  const node = document.nodes.find(node => node.name === 'Water');
  const decoded = (await decodeDracoPrimitives(bytes)).find(part => part.mi === node.mesh);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(decoded.attributes.POSITION, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(decoded.attributes.NORMAL, 3));
  geometry.setIndex(new THREE.BufferAttribute(decoded.indices, 1));
  const material = new THREE.MeshPhysicalMaterial(); material.name = 'Water';
  material.userData = { bottleProfile: 'glass-290-v1', bottleLiquidKind: 'milk' };
  const water = new THREE.Mesh(geometry, material); water.name = 'Water';
  water.position.fromArray(node.translation); water.scale.fromArray(node.scale);
  const root = new THREE.Group(); root.scale.setScalar(.1); root.add(water);
  const { createBasilWebBottleMaterialContext } = load(path.resolve(__dirname, '../../lib/viewer/basil-web-materials'));
  const context = createBasilWebBottleMaterialContext(root, { packaging: 'glass', materialSlots: { liquid: ['Water'] } });
  context.configure(material, water, 'liquid', '#fff5e4'); root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(water), center = bounds.getCenter(new THREE.Vector3());
  const fromTop = () => new THREE.Raycaster(new THREE.Vector3(center.x, bounds.max.y + .1, center.z), new THREE.Vector3(0, -1, 0)).intersectObject(water)[0];
  try {
    const top = fromTop();
    assert.ok(top && Math.abs(top.point.y - bounds.max.y) < .00001, 'opaque Milk must hit the authored upward top surface');
    const front = new THREE.Raycaster(new THREE.Vector3(center.x, center.y, bounds.max.z + .1), new THREE.Vector3(0, 0, -1)).intersectObject(water)[0];
    assert.ok(front && front.point.z > center.z, 'Milk must shade the nearest outward side');
    material.side = THREE.BackSide;
    assert.ok(fromTop().point.y < bounds.max.y - .05, 'the old BackSide path incorrectly reveals the far bottom');
  } finally { context.dispose?.(); geometry.dispose(); material.dispose(); }
});

test('pull-cap Milk uses a stable cream reservoir shader instead of dark PBR underside shading', () => {
  const { createBasilWebBottleMaterialContext } = load(path.resolve(__dirname, '../../lib/viewer/basil-web-materials'));
  const root = new THREE.Group();
  const water = new THREE.Mesh(new THREE.SphereGeometry(.02, 12, 8), new THREE.MeshPhysicalMaterial());
  water.name = 'Water';
  water.material.name = 'Water';
  water.material.userData = { bottleProfile: 'glass-290-v1', bottleLiquidKind: 'milk' };
  root.add(water);
  const context = createBasilWebBottleMaterialContext(root, {
    packaging: 'glass', materialSlots: { liquid: ['Water'] },
  });
  try {
    context.configure(water.material, water, 'liquid', '#fff5e4');
    const shader = {
      uniforms: {},
      vertexShader: THREE.ShaderLib.physical.vertexShader,
      fragmentShader: THREE.ShaderLib.physical.fragmentShader,
    };
    water.material.onBeforeCompile(shader, {});
    assert.match(shader.fragmentShader, /gl_FragColor\s*=\s*vec4\s*\(\s*diffuse\s*,\s*1\.0\s*\)/,
      'Milk should use a stable cream reservoir output like the Unity reference');
    assert.equal(water.material.side, THREE.FrontSide);
  } finally {
    context.dispose?.(); water.geometry.dispose(); water.material.dispose();
  }
});
