const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseGlb, writeGlb, sceneHash, decodeViews, compareGeometry, compressGlb, hash } = require('../lib/bottle-compression.cjs');

const models = { 'glass-280-latte': 50204, 'glass-280-short-latte': 51164, 'pet-330-energy': 52036, 'pet-350-juice': 59556 };
for (const [id, triangles] of Object.entries(models)) {
  test(`${id}: runtime decoder reproduces validated geometry within the 1 MB budget`, async () => {
    const file = path.resolve(__dirname, `../../public/models/bottles/${id}.glb`);
    const bytes = fs.readFileSync(file), manifest = JSON.parse(fs.readFileSync(file.replace(/\.glb$/, '.manifest.json')));
    const { document, binaryChunk } = parseGlb(bytes), proof = manifest.compression;
    assert.ok(bytes.length < 1000000);
    assert.equal(hash(bytes), manifest.sha256); assert.equal(hash(binaryChunk), manifest.binarySha256);
    assert.equal(sceneHash(document), proof.sceneSha256);
    assert.equal(proof.simplification, false); assert.equal(proof.topologyPreserved, true);
    assert.equal(proof.lossless, false, 'Report precision reduction honestly');
    assert.ok(proof.maxPositionErrorMeters < 0.0000005);
    assert.ok(proof.maxNormalAngleDegrees < .05);
    assert.ok(proof.maxUvErrorAt4096px < .041);
    let faces = 0, vertices = 0;
    for (const mesh of document.meshes) for (const primitive of mesh.primitives) {
      faces += document.accessors[primitive.indices].count / 3;
      vertices += document.accessors[primitive.attributes.POSITION].count;
    }
    assert.equal(faces, triangles); assert.equal(faces, proof.triangles); assert.equal(vertices, proof.vertices);
    assert.ok(document.extensionsRequired.includes('EXT_meshopt_compression'));
    const views = await decodeViews(bytes);
    for (const expected of proof.decodedBufferViews) {
      assert.equal(views[expected.index].length, expected.bytes);
      assert.equal(hash(views[expected.index]), expected.sha256);
    }
    // Any non-mesh data, including Short's authored animation, stays byte-identical.
    for (const [i, view] of document.bufferViews.entries()) if (view.extensions.EXT_meshopt_compression.filter === 'NONE' && view.target !== 34963) {
      assert.equal(hash(views[i]), proof.sourceBufferViews[i].sha256);
    }
    // Bounds used for viewer framing must describe decoded positions exactly.
    for (const mesh of document.meshes) for (const p of mesh.primitives) {
      const accessor = document.accessors[p.attributes.POSITION];
      const values = new Float32Array(Uint8Array.from(views[accessor.bufferView]).buffer);
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < values.length; i++) {
        min[i % 3] = Math.min(min[i % 3], values[i]); max[i % 3] = Math.max(max[i % 3], values[i]);
      }
      assert.deepEqual(accessor.min, min); assert.deepEqual(accessor.max, max);
    }
  });
}

test('compression retains a UV seam and rejects changed winding or scene transforms', async () => {
  // Separate vertices at the same position deliberately carry different UVs/normals.
  const arrays = [new Float32Array([0, 0, 0, 1.0000001, 0, 0, 0, 1, 0, 0, 0, 0]),
    new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0]),
    new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), new Uint16Array([0, 1, 2, 3, 2, 1])];
  const views = [], chunks = []; let offset = 0;
  for (const [i, array] of arrays.entries()) {
    const bytes = Buffer.from(array.buffer);
    views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, target: i === 3 ? 34963 : 34962 });
    chunks.push(bytes); offset += bytes.length;
  }
  const document = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, scale: [.1, .1, .1] }], buffers: [{ byteLength: offset }], bufferViews: views,
    accessors: [
      { bufferView: 0, componentType: 5126, type: 'VEC3', count: 4, min: [0, 0, 0], max: [1.0000001192092896, 1, 0] },
      { bufferView: 1, componentType: 5126, type: 'VEC3', count: 4 },
      { bufferView: 2, componentType: 5126, type: 'VEC2', count: 4 },
      { bufferView: 3, componentType: 5123, type: 'SCALAR', count: 6 },
    ], meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3 }] }] };
  const raw = writeGlb(document, Buffer.concat(chunks));
  const packed = await compressGlb(raw);
  assert.equal(packed.compression.triangles, 2); assert.equal(packed.compression.vertices, 4);
  const decoded = await decodeViews(packed.bytes);
  assert.deepEqual(new Float32Array(Uint8Array.from(decoded[2]).buffer), arrays[2], 'UV seam survives');
  const mutated = structuredClone(document);
  mutated.nodes[0].scale = [1, 1, 1];
  await assert.rejects(compareGeometry(writeGlb(mutated, Buffer.concat(chunks)), packed.bytes), /metadata changed/);
  const reversed = Buffer.from(Buffer.concat(chunks));
  reversed.writeUInt16LE(2, views[3].byteOffset + 2); reversed.writeUInt16LE(1, views[3].byteOffset + 4);
  await assert.rejects(compareGeometry(writeGlb(document, reversed), packed.bytes), /Changed triangle/);
});
