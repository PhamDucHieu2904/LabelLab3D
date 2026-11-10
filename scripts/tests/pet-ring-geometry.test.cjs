const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const THREE = require('three');
const load = require('../lib/load-ts-source.cjs').createSourceLoader();
const { parseGlb } = require('../lib/bottle-compression.cjs');
const { decodeDracoPrimitives } = require('../lib/draco-bottle-compression.cjs');
const { preparePetRingGeometry } = load(path.resolve(__dirname, '../../lib/viewer/pet-ring-geometry.ts'));

function meshFromPrimitive(part, materialName = 'Body') {
  const geometry = new THREE.BufferGeometry();
  for (const [name, values] of Object.entries(part.attributes)) {
    const itemSize = name === 'TEXCOORD_0' ? 2 : 3;
    geometry.setAttribute(name.toLowerCase() === 'texcoord_0' ? 'uv' : name.toLowerCase(), new THREE.BufferAttribute(values, itemSize));
  }
  geometry.setIndex(new THREE.BufferAttribute(part.indices, 1));
  const material = new THREE.MeshStandardMaterial(); material.name = materialName;
  return new THREE.Mesh(geometry, material);
}

async function shortBottleBody() {
  const root = path.resolve(__dirname, '../..');
  const bytes = fs.readFileSync(path.join(root, 'public/models/bottles/pet-1000-short-juice.glb'));
  const { document } = parseGlb(bytes);
  const bodyNode = document.nodes.find(node => node.name === 'Body');
  const part = (await decodeDracoPrimitives(bytes)).find(item => item.mi === bodyNode.mesh && item.pi === 0);
  assert.ok(part, 'decoded Body primitive exists');
  const mesh = meshFromPrimitive(part);
  mesh.position.fromArray(bodyNode.translation ?? [0, 0, 0]);
  mesh.scale.fromArray(bodyNode.scale ?? [1, 1, 1]);
  const scene = new THREE.Group(); scene.add(mesh);
  return { scene, mesh, sourceIndices: Array.from(part.indices), sourceAttributes: Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([name, attribute]) => [name, attribute])) };
}

function triangleMultiset(index) {
  const result = [];
  for (let i = 0; i < index.length; i += 3) result.push(Array.from(index.slice(i, i + 3)).join(','));
  return result.sort();
}

test('PET 1L short collar is partitioned into a separate Ring group without changing geometry', async () => {
  const { scene, mesh, sourceIndices, sourceAttributes } = await shortBottleBody();
  scene.scale.setScalar(.1); scene.position.set(.3, .2, -.1); scene.rotation.set(.1, -.2, .3); scene.updateMatrixWorld(true);
  const sourceMatrix = mesh.matrixWorld.toArray();
  const originalGeometry = mesh.geometry;
  const result = preparePetRingGeometry(scene, { id: 'pet-1000-short-juice', packaging: 'pet' });
  assert.deepEqual(result, { prepared: true, ringTriangles: 1344, bodyTriangles: 19624 });
  assert.equal(mesh.userData.petRingGeometryPrepared, true);
  assert.equal(mesh.geometry.attributes.position, sourceAttributes.position, 'position attribute is reused');
  assert.equal(mesh.geometry.attributes.normal, sourceAttributes.normal, 'normal attribute is reused');
  assert.equal(mesh.geometry.attributes.uv, sourceAttributes.uv, 'UV attribute is reused');
  assert.notEqual(mesh.geometry, originalGeometry, 'only the index/groups wrapper is cloned');
  assert.equal(mesh.geometry.groups.length, 2);
  assert.equal(mesh.geometry.groups[0].count, 19624 * 3);
  assert.equal(mesh.geometry.groups[1].count, 1344 * 3);
  assert.equal(mesh.material.length, 2);
  assert.equal(mesh.material[0].name, 'Body');
  assert.ok(mesh.material[1] instanceof THREE.MeshPhysicalMaterial);
  assert.ok('PHYSICAL' in mesh.material[1].defines);
  assert.equal(mesh.material[1].name, 'Ring');
  assert.equal(mesh.material[1].userData.juiceRing, true);
  assert.equal(mesh.material[1].userData.bottleProfile, 'juice-pet-v1');
  assert.deepEqual(triangleMultiset(mesh.geometry.index.array), triangleMultiset(sourceIndices));
  scene.updateMatrixWorld(true);
  assert.deepEqual(mesh.matrixWorld.toArray(), sourceMatrix, 'inherited transform is unchanged');
});

test('PET 1L short collar preparation is idempotent and leaves other models untouched', async () => {
  const { scene, mesh } = await shortBottleBody();
  const first = preparePetRingGeometry(scene, { id: 'pet-1000-short-juice', packaging: 'pet' });
  const geometry = mesh.geometry, material = mesh.material;
  const second = preparePetRingGeometry(scene, { id: 'pet-1000-short-juice', packaging: 'pet' });
  assert.deepEqual(first, { prepared: true, ringTriangles: 1344, bodyTriangles: 19624 });
  assert.deepEqual(second, { prepared: false, ringTriangles: 1344, bodyTriangles: 19624 });
  assert.equal(mesh.geometry, geometry);
  assert.equal(mesh.material, material);
  const pooled = scene.clone(true), pooledMesh = pooled.children[0];
  assert.deepEqual(preparePetRingGeometry(pooled, { id: 'pet-1000-short-juice', packaging: 'pet' }), { prepared: false, ringTriangles: 1344, bodyTriangles: 19624 });
  assert.equal(pooledMesh.geometry, geometry, 'prepared pooled clone keeps shared geometry');

  const other = await shortBottleBody();
  const otherGeometry = other.mesh.geometry, otherMaterial = other.mesh.material;
  assert.deepEqual(preparePetRingGeometry(other.scene, { id: 'pet-1000-juice', packaging: 'pet' }), { prepared: false, ringTriangles: 0, bodyTriangles: 0 });
  assert.equal(other.mesh.geometry, otherGeometry);
  assert.equal(other.mesh.material, otherMaterial);
  assert.equal(other.mesh.userData.petRingGeometryPrepared, undefined);
});
