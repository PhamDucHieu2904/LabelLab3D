const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseGlb, hash } = require('../lib/bottle-compression.cjs');
const { decodeDracoPrimitives } = require('../lib/draco-bottle-compression.cjs');

const root = path.resolve(__dirname, '../..');
const file = path.join(root, 'public/models/bottles/glass-485-milk.glb');
const manifestFile = file.replace(/\.glb$/, '.manifest.json');

test('485 ml Glass Milk publishes Draco geometry with preserved UVs and semantic parts', async () => {
  assert.ok(fs.existsSync(file), 'compressed 485 ml asset must exist');
  const bytes = fs.readFileSync(file);
  const manifest = JSON.parse(fs.readFileSync(manifestFile));
  const { document } = parseGlb(bytes);
  assert.equal(hash(bytes), manifest.sha256);
  assert.equal(manifest.volumeMl, 485);
  assert.equal(manifest.defaultLiquid, 'milk');
  assert.equal(manifest.compression.extension, 'KHR_draco_mesh_compression');
  assert.equal(manifest.compression.simplification, false);
  assert.equal(manifest.compression.triangles, 74602);
  assert.equal(manifest.compression.topologyPreserved, true);
  assert.ok(manifest.compression.maxPositionErrorMeters <= 1e-5);
  assert.ok(manifest.compression.maxUvErrorAt4096px <= .5);
  assert.deepEqual(manifest.materialSlots, {
    body: ['Body', 'Neck', 'GlassBase'], cap: ['Cap'], label: ['Label'], liquid: ['Water'],
  });
  assert.deepEqual(document.nodes.find(node => node.name === 'Glass_485_Milk_Metres').scale, [.1, .1, .1]);
  assert.equal(document.materials.find(material => material.name === 'Water').extras.bottleLiquidKind, 'milk');
  assert.equal(document.materials.find(material => material.name === 'Neck').extras.basilWebNeckWallMetres, .001);
  assert.equal(document.materials.find(material => material.name === 'GlassBase').extras.bottleProfile, 'glass-300-v1');
  assert.equal(document.materials.find(material => material.name === 'Neck').extras.bottleProfile, 'glass-300-v1');
  assert.equal(document.meshes.length, 7);
  assert.ok(document.meshes.every(mesh => mesh.primitives.every(primitive =>
    Object.keys(primitive.attributes).sort().join(',') === 'NORMAL,POSITION,TEXCOORD_0')));
  const decoded = await decodeDracoPrimitives(bytes);
  assert.equal(decoded.reduce((sum, primitive) => sum + primitive.indices.length / 3, 0), 74602);
});
