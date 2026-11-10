const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const { MeshoptEncoder } = require('meshoptimizer');
const THREE = require('three');

const extension = 'EXT_meshopt_compression';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const precision = { POSITION: 20, NORMAL: 14, TEXCOORD_0: 18 };

function parseGlb(bytes) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
  const end = 20 + bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(end + 4), 0x004e4942);
  return { document: JSON.parse(bytes.subarray(20, end)), binary: bytes.subarray(end + 8), binaryChunk: bytes.subarray(end) };
}

function writeGlb(document, binary) {
  const json = Buffer.from(JSON.stringify(document));
  const paddedJson = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20);
  json.copy(paddedJson);
  const paddedBin = Buffer.alloc(Math.ceil(binary.length / 4) * 4);
  binary.copy(paddedBin);
  const header = Buffer.alloc(20), binHeader = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + paddedJson.length + paddedBin.length, 8);
  header.writeUInt32LE(paddedJson.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  binHeader.writeUInt32LE(paddedBin.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, paddedJson, binHeader, paddedBin]);
}

// Ignore storage layout only; everything controlling the rendered scene stays in this digest.
function sceneHash(document) {
  const copy = structuredClone(document);
  delete copy.buffers;
  // Bounds are recomputed from decoded positions; all other accessor metadata is retained.
  for (const accessor of copy.accessors) { delete accessor.min; delete accessor.max; }
  for (const key of ['extensionsUsed', 'extensionsRequired']) {
    if (copy[key]) {
      copy[key] = copy[key].filter(name => name !== extension);
      if (!copy[key].length) delete copy[key];
    }
  }
  for (const view of copy.bufferViews) {
    delete view.buffer; delete view.byteOffset;
    if (view.extensions) {
      delete view.extensions[extension];
      if (!Object.keys(view.extensions).length) delete view.extensions;
    }
  }
  return hash(JSON.stringify(copy));
}

async function decoder() {
  // Validate with the decoder actually shipped in the Three.js runtime.
  const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
  await MeshoptDecoder.ready;
  return MeshoptDecoder;
}

async function decodeViews(bytes) {
  const { document, binary } = parseGlb(bytes);
  const decode = await decoder();
  return document.bufferViews.map(view => {
    const ext = view.extensions?.[extension];
    if (!ext) return Buffer.from(binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength));
    assert.equal(ext.buffer, 0);
    const result = Buffer.alloc(view.byteLength);
    decode.decodeGltfBuffer(result, ext.count, ext.byteStride,
      binary.subarray(ext.byteOffset ?? 0, (ext.byteOffset ?? 0) + ext.byteLength), ext.mode, ext.filter);
    return result;
  });
}

function accessorData(document, views, index) {
  const accessor = document.accessors[index];
  const Type = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array }[accessor.componentType];
  assert.ok(Type, 'Unsupported bottle component type');
  return new Type(Uint8Array.from(views[accessor.bufferView]).buffer);
}

function worldMatrices(document) {
  const result = new Map();
  function visit(index, parent) {
    const node = document.nodes[index], matrix = new THREE.Matrix4();
    if (node.matrix) matrix.fromArray(node.matrix);
    else matrix.compose(new THREE.Vector3().fromArray(node.translation ?? [0, 0, 0]),
      new THREE.Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]),
      new THREE.Vector3().fromArray(node.scale ?? [1, 1, 1]));
    matrix.premultiply(parent); result.set(index, matrix);
    for (const child of node.children ?? []) visit(child, matrix);
  }
  for (const node of document.scenes[document.scene ?? 0].nodes) visit(node, new THREE.Matrix4());
  return result;
}

async function compareGeometry(input, output) {
  const source = parseGlb(input), packed = parseGlb(output);
  assert.equal(sceneHash(source.document), sceneHash(packed.document), 'Scene/material/accessor metadata changed');
  const sourceViews = source.document.bufferViews.map(v => source.binary.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength));
  const decoded = await decodeViews(output), matrices = worldMatrices(source.document);
  let maxPositionErrorMeters = 0, maxNormalAngleDegrees = 0, maxUvError = 0, triangles = 0, vertices = 0;
  const transformed = new Set();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), delta = new THREE.Vector3();
  for (const [nodeIndex, node] of source.document.nodes.entries()) {
    if (node.mesh === undefined || !matrices.has(nodeIndex)) continue;
    const matrix = matrices.get(nodeIndex), normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix), e = matrix.elements;
    for (const primitive of source.document.meshes[node.mesh].primitives) {
      assert.equal(primitive.mode ?? 4, 4);
      const indices = accessorData(source.document, sourceViews, primitive.indices);
      const newIndices = accessorData(packed.document, decoded, primitive.indices);
      transformed.add(source.document.accessors[primitive.indices].bufferView);
      // Triangle codec may rotate corners cyclically; vertex identity, winding and face order stay intact.
      for (let i = 0; i < indices.length; i += 3) {
        let same = false;
        for (let rotation = 0; rotation < 3; rotation++) {
          if ([0, 1, 2].every(corner => indices[i + corner] === newIndices[i + (corner + rotation) % 3])) same = true;
        }
        assert.ok(same, `Changed triangle ${i / 3}`);
      }
      for (const [semantic, index] of Object.entries(primitive.attributes)) {
        assert.ok(precision[semantic], `Unsupported bottle attribute ${semantic}`);
        transformed.add(source.document.accessors[index].bufferView);
        const before = accessorData(source.document, sourceViews, index), after = accessorData(packed.document, decoded, index);
        assert.equal(before.length, after.length);
        if (semantic === 'POSITION') for (let i = 0; i < before.length; i += 3) {
          const x = after[i] - before[i], y = after[i + 1] - before[i + 1], z = after[i + 2] - before[i + 2];
          delta.set(e[0] * x + e[4] * y + e[8] * z, e[1] * x + e[5] * y + e[9] * z, e[2] * x + e[6] * y + e[10] * z);
          maxPositionErrorMeters = Math.max(maxPositionErrorMeters, delta.length());
        }
        if (semantic === 'NORMAL') for (let i = 0; i < before.length; i += 3) {
          a.fromArray(before, i).applyMatrix3(normalMatrix).normalize();
          b.fromArray(after, i).applyMatrix3(normalMatrix).normalize();
          maxNormalAngleDegrees = Math.max(maxNormalAngleDegrees, a.angleTo(b) * 180 / Math.PI);
        }
        if (semantic === 'TEXCOORD_0') for (let i = 0; i < before.length; i++) maxUvError = Math.max(maxUvError, Math.abs(before[i] - after[i]));
      }
    }
  }
  for (const mesh of source.document.meshes) for (const primitive of mesh.primitives) {
    triangles += source.document.accessors[primitive.indices].count / 3;
    vertices += source.document.accessors[primitive.attributes.POSITION].count;
  }
  sourceViews.forEach((view, index) => {
    if (!transformed.has(index)) assert.deepEqual(decoded[index], view, `Non-mesh view ${index} changed`);
  });
  assert.ok(maxPositionErrorMeters < 0.0000005, `Position error exceeded 0.5 micrometres: ${maxPositionErrorMeters}`);
  assert.ok(maxNormalAngleDegrees < .05, `Normal error exceeded 0.05 degrees: ${maxNormalAngleDegrees}`);
  assert.ok(maxUvError < .00001, `UV error exceeded 0.041 pixels at 4096px: ${maxUvError}`);
  return { triangles, vertices, topologyPreserved: true, maxPositionErrorMeters, maxNormalAngleDegrees,
    maxUvError, maxUvErrorAt4096px: maxUvError * 4096,
    sourceBufferViews: sourceViews.map((view, index) => ({ index, bytes: view.length, sha256: hash(view) })),
    decodedBufferViews: decoded.map((view, index) => ({ index, bytes: view.length, sha256: hash(view) })),
  };
}

async function compressGlb(input) {
  const { document, binary, binaryChunk } = parseGlb(input);
  assert.equal(document.buffers.length, 1, 'Expected one embedded source buffer');
  assert.equal(document.buffers[0].uri, undefined);
  assert.ok(!document.extensionsUsed?.includes(extension), 'Input is already compressed');
  await MeshoptEncoder.ready;
  const packed = structuredClone(document), chunks = [];
  let offset = 0;
  const componentBytes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
  for (const [index, view] of document.bufferViews.entries()) {
    assert.equal(view.buffer, 0);
    const accessors = document.accessors.filter(a => a.bufferView === index);
    assert.equal(accessors.length, 1, `View ${index} must have one tightly packed accessor`);
    const accessor = accessors[0];
    assert.ok(!accessor.sparse);
    assert.equal(accessor.byteOffset ?? 0, 0);
    const stride = componentBytes[accessor.componentType] * components[accessor.type];
    assert.equal(view.byteStride ?? stride, stride);
    assert.equal(view.byteLength, accessor.count * stride);
    const source = binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    assert.equal(source.length, view.byteLength);
    let semantic;
    for (const mesh of document.meshes) for (const primitive of mesh.primitives) {
      for (const [name, ai] of Object.entries(primitive.attributes)) if (document.accessors[ai] === accessor) semantic = name;
    }
    let data = source, filter = 'NONE';
    if (semantic) {
      assert.equal(accessor.componentType, 5126);
      assert.ok(precision[semantic]);
      data = MeshoptEncoder.encodeFilterExp(new Float32Array(Uint8Array.from(source).buffer),
        accessor.count, stride, precision[semantic], 'SharedComponent');
      filter = 'EXPONENTIAL';
    }
    // Preserve every face/vertex/UV seam. Only numeric storage precision changes, never mesh density.
    const mode = view.target === 34963 ? 'TRIANGLES' : 'ATTRIBUTES';
    const compressed = Buffer.from(MeshoptEncoder.encodeGltfBuffer(data, accessor.count, stride, mode));
    packed.bufferViews[index] = { ...view, buffer: 1, extensions: {
      ...view.extensions, [extension]: { buffer: 0, byteOffset: offset, byteLength: compressed.length,
        byteStride: stride, count: accessor.count, mode, filter },
    } };
    const padded = Buffer.alloc(Math.ceil(compressed.length / 4) * 4);
    compressed.copy(padded); chunks.push(padded); offset += padded.length;
  }
  packed.buffers = [{ byteLength: offset }, {
    byteLength: document.buffers[0].byteLength, extensions: { [extension]: { fallback: true } },
  }];
  packed.extensionsUsed = [...new Set([...(packed.extensionsUsed ?? []), extension])];
  packed.extensionsRequired = [...new Set([...(packed.extensionsRequired ?? []), extension])];
  const binaryOutput = Buffer.concat(chunks);
  const decoded = await decodeViews(writeGlb(packed, binaryOutput));
  for (const accessor of packed.accessors) {
    if (!accessor.min && !accessor.max) continue;
    const count = components[accessor.type];
    const values = new ({ 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array }[accessor.componentType])(Uint8Array.from(decoded[accessor.bufferView]).buffer);
    const min = Array(count).fill(Infinity), max = Array(count).fill(-Infinity);
    for (let i = 0; i < values.length; i++) {
      min[i % count] = Math.min(min[i % count], values[i]); max[i % count] = Math.max(max[i % count], values[i]);
    }
    if (accessor.min) accessor.min = min;
    if (accessor.max) accessor.max = max;
  }
  const bytes = writeGlb(packed, binaryOutput);
  const validation = await compareGeometry(input, bytes);
  return { bytes, compression: {
    extension, encoder: 'meshoptimizer 0.25.0', lossless: false, filter: 'EXPONENTIAL',
    precisionBits: precision, simplification: false,
    uncompressedBytes: input.length, savedPercent: Number(((1 - bytes.length / input.length) * 100).toFixed(2)),
    sourceBinarySha256: hash(binaryChunk), sceneSha256: sceneHash(document),
    ...validation,
  } };
}

async function writeCompressedBottle(output, input, manifest) {
  const { bytes, compression } = await compressGlb(input);
  assert.ok(bytes.length < 1000000, 'Bottle exceeded the 1 MB download budget');
  const final = { ...manifest, bytes: bytes.length, sha256: hash(bytes),
    binarySha256: hash(parseGlb(bytes).binaryChunk), compression };
  fs.writeFileSync(output, bytes);
  fs.writeFileSync(output.replace(/\.glb$/, '.manifest.json'), JSON.stringify(final, null, 2) + '\n');
  console.log(`${manifest.id}: ${input.length} -> ${bytes.length} bytes (-${compression.savedPercent}%), all ${compression.triangles} triangles retained.`);
  return final;
}

module.exports = { parseGlb, writeGlb, sceneHash, decodeViews, compareGeometry, compressGlb, writeCompressedBottle, hash };
