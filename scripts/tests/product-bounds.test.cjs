const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const THREE = require('three');
const { parseGlb } = require('../lib/bottle-compression.cjs');
const { readAccessor, decodeDracoPrimitives } = require('../lib/draco-bottle-compression.cjs');

const root = path.resolve(__dirname, '../..');
function loadSource(relative) {
  const filename = path.join(root, relative), loaded = new Module(filename, module);
  loaded.filename = filename; loaded.paths = module.paths;
  const nativeRequire = loaded.require.bind(loaded);
  loaded.require = name => name.startsWith('.') ? loadSource(path.join(path.dirname(relative), `${name}.ts`)) : nativeRequire(name);
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, filename);
  return loaded.exports;
}
const { measureProductBounds } = loadSource('lib/viewer/framing.ts');
const { mockupShowcaseBounds, fitMockupCamera } = loadSource('lib/mockup/camera.ts');

async function sceneFromAsset(id) {
  const bytes = fs.readFileSync(path.join(root, 'public/models/bottles', `${id}.glb`));
  const { document: d, binary } = parseGlb(bytes);
  const decoded = d.extensionsRequired?.includes('KHR_draco_mesh_compression') ? await decodeDracoPrimitives(bytes) : null;
  const nodes = d.nodes.map(node => {
    const object = new THREE.Group();
    if (node.matrix) { object.matrix.fromArray(node.matrix); object.matrix.decompose(object.position, object.quaternion, object.scale); }
    else { object.position.fromArray(node.translation ?? [0,0,0]); object.quaternion.fromArray(node.rotation ?? [0,0,0,1]); object.scale.fromArray(node.scale ?? [1,1,1]); }
    if (node.mesh !== undefined) for (const [pi, primitive] of d.meshes[node.mesh].primitives.entries()) {
      const positions = decoded ? decoded.find(p => p.mi === node.mesh && p.pi === pi).attributes.POSITION : readAccessor(d, binary, primitive.attributes.POSITION);
      const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3));
      object.add(new THREE.Mesh(geometry));
    }
    return object;
  });
  for (const [i, node] of d.nodes.entries()) for (const child of node.children ?? []) nodes[i].add(nodes[child]);
  const scene = new THREE.Group();
  for (const i of d.scenes[d.scene ?? 0].nodes) scene.add(nodes[i]);
  scene.updateMatrixWorld(true);
  return scene;
}

test('product bounds use actual rotated vertices without changing the authored transform', () => {
  assert.equal(typeof measureProductBounds, 'function');
  const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-1,-1,0, 1,1,0, 0,0,.1], 3));
  const mesh = new THREE.Mesh(geometry); mesh.rotation.z = Math.PI / 4; mesh.updateMatrixWorld(true);
  const matrix = mesh.matrixWorld.toArray();
  const bounds = measureProductBounds(mesh);
  assert.ok(bounds.getSize(new THREE.Vector3()).x < 1e-6, 'empty corners of a rotated box must not enlarge framing');
  assert.deepEqual(mesh.matrixWorld.toArray(), matrix);
});

test('320 ml full label retains index 0 physical height and animated camera scale', async () => {
  assert.equal(typeof measureProductBounds, 'function');
  const models = await Promise.all(['pet-320-nata','pet-320-full-nata'].map(sceneFromAsset));
  const bounds = models.map(model => measureProductBounds(model));
  const heights = bounds.map(box => box.getSize(new THREE.Vector3()).y);
  assert.ok(Math.abs(heights[0] - heights[1]) < .000002, '320 ml heights match within compression precision');
  assert.ok(bounds[1].getSize(new THREE.Vector3()).x < .065, 'rotated Nata islands cannot inflate the bottle to 108 mm');
  const pose = new THREE.Quaternion().setFromEuler(new THREE.Euler(.1,.2,-.1));
  for (const aspect of [1,4/5,9/16,16/9]) {
    const distances = bounds.map(box => fitMockupCamera(mockupShowcaseBounds(box,pose), new THREE.Vector3(0,0,1), aspect, 27));
    assert.ok(Math.abs(distances[1]/distances[0]-1) < .02, `same animated size at aspect ${aspect}`);
  }
});
