const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const THREE = require('three');
const filename = path.resolve(__dirname, '../../lib/viewer/energy-bubbles.ts');
const loaded = new Module(filename, module);
loaded.filename = filename; loaded.paths = module.paths;
loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const { createEnergyDrinkBubbles, energyBubbleCount } = loaded.exports;

// Decode the published GLB using the same loader/decoder as the viewer.
// This exercises real water triangles, node scales and label bounds without DOM/GPU.
async function suppliedModel() {
  const bytes = fs.readFileSync(path.resolve(__dirname, '../../public/models/bottles/pet-330-energy.glb'));
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const { MeshoptDecoder } = await import('three/addons/libs/meshopt_decoder.module.js');
  const imported = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), '');
  const content = new THREE.ObjectLoader().parse(imported.scene.toJSON());
  content.updateMatrixWorld(true);
  content.position.sub(new THREE.Box3().setFromObject(content).getCenter(new THREE.Vector3()));
  content.updateMatrixWorld(true);
  return content;
}
const asset = { sparkling: true, materialSlots: { liquid: ['Water'], label: ['Lable'] } };
test('sparkling count follows app curve and safely turns off at zero/invalid input', () => {
  assert.equal(energyBubbleCount(.516), 135);
  assert.equal(energyBubbleCount(1), 300);
  for (const value of [0, .002, NaN, Infinity, -1]) assert.equal(energyBubbleCount(value), 0);
});
test('PET330 bubbles stay spherical, inside supplied water and outside print while rising', async () => {
  const content = await suppliedModel();
  assert.equal(createEnergyDrinkBubbles(content, {}), undefined);
  const effect = createEnergyDrinkBubbles(content, asset);
  effect.set({ liquid: { sparkling: .516, color: '#FFD600' } });
  assert.equal(effect.mesh.count, 135, 'default sparkling creates visible particles');
  const before = effect.snapshot();
  const matrix = new THREE.Matrix4(), scale = new THREE.Vector3();
  for (let i = 0; i < effect.mesh.count; i++) {
    effect.mesh.getMatrixAt(i, matrix); scale.setFromMatrixScale(matrix);
    assert.ok(Math.abs(scale.x - scale.y) < 1e-8 && Math.abs(scale.y - scale.z) < 1e-8);
  }
  for (let i = 0; i < 20; i++) effect.update(.05);
  const after = effect.snapshot();
  assert.ok(after.every(p => effect.contains(p.position, p.diameter)), 'no bubbles leak beyond water/label clearance');
  assert.ok(after.some((p, i) => p.position.y > before[i].position.y), 'particles rise');
  effect.set({ liquid: { sparkling: 1, color: '#54BDD5' } });
  assert.equal(effect.mesh.count, 300);
  effect.set({ liquid: { sparkling: 0 } });
  assert.equal(effect.mesh.count, 0); assert.equal(effect.animated, false);
  effect.dispose();
  content.traverse(node => { if (node.isMesh) { node.geometry.dispose(); node.material.dispose(); } });
});
