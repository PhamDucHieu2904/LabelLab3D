const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { parseGlb, writeGlb, hash } = require('./lib/bottle-compression.cjs');
const { compressDraco } = require('./lib/draco-bottle-compression.cjs');

const DEFAULT_FULL_SOURCE = 'D:/3D model/Model Bottle Can/Blender Model 1/Pet 1500ml model full label web.glb';
const DEFAULT_PULP_SOURCE = 'D:/3D model/Model Bottle Can/Ai edit/Pet 1500ml model short label - Aloe Vera Pulp web.glb';
const MODEL_ID = 'pet-1500-juice';
const SIZE_BUDGET_BYTES = 1_000_000;
const MATERIAL_SLOTS = {
  inclusions: ['AloeVeraPulp'],
  body: ['PlasticBody'],
  ring: ['Ring'],
  cap: ['PlasticCap'],
  label: ['Label'],
  liquid: ['Water'],
};

/** Remove unreferenced accessors and bufferViews so dropped unused channels do not bloat the binary. */
function compactGlbBuffers(document, binary) {
  const d = structuredClone(document);
  const usedAccessors = new Set();
  for (const mesh of d.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      if (prim.indices !== undefined) usedAccessors.add(prim.indices);
      for (const ai of Object.values(prim.attributes ?? {})) usedAccessors.add(ai);
    }
  }
  const accRemap = new Map();
  const nextAccessors = [];
  for (const [oldIdx, acc] of (d.accessors ?? []).entries()) {
    if (!usedAccessors.has(oldIdx)) continue;
    accRemap.set(oldIdx, nextAccessors.length);
    nextAccessors.push(acc);
  }
  for (const mesh of d.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      if (prim.indices !== undefined) prim.indices = accRemap.get(prim.indices);
      for (const [semantic, ai] of Object.entries(prim.attributes ?? {})) {
        prim.attributes[semantic] = accRemap.get(ai);
      }
    }
  }
  d.accessors = nextAccessors;

  const usedViews = new Set();
  for (const acc of d.accessors) if (acc.bufferView !== undefined) usedViews.add(acc.bufferView);
  for (const img of d.images ?? []) if (img.bufferView !== undefined) usedViews.add(img.bufferView);
  const viewRemap = new Map();
  const nextViews = [];
  const chunks = [];
  let offset = 0;
  for (const [oldIdx, view] of (d.bufferViews ?? []).entries()) {
    if (!usedViews.has(oldIdx)) continue;
    const raw = binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    const padded = Buffer.alloc(Math.ceil(raw.length / 4) * 4);
    raw.copy(padded);
    viewRemap.set(oldIdx, nextViews.length);
    nextViews.push({ ...view, buffer: 0, byteOffset: offset, byteLength: raw.length });
    chunks.push(padded);
    offset += padded.length;
  }
  for (const acc of d.accessors) if (acc.bufferView !== undefined) acc.bufferView = viewRemap.get(acc.bufferView);
  for (const img of d.images ?? []) if (img.bufferView !== undefined) img.bufferView = viewRemap.get(img.bufferView);
  d.bufferViews = nextViews;
  d.buffers = [{ byteLength: offset }];
  return writeGlb(d, Buffer.concat(chunks));
}

function assertMatchedTransform(nodeA, nodeB, label) {
  assert.ok(nodeA && nodeB, `Missing ${label} node when matching full/short 1.5L sources`);
  assert.deepEqual(nodeA.translation ?? null, nodeB.translation ?? null, `${label} translation mismatch`);
  assert.deepEqual(nodeA.rotation ?? null, nodeB.rotation ?? null, `${label} rotation mismatch`);
  assert.deepEqual(nodeA.scale ?? null, nodeB.scale ?? null, `${label} scale mismatch`);
}

function adaptPet1500Full(fullInput, pulpInput, fullSourceName, pulpSourceName) {
  const full = parseGlb(fullInput);
  const pulp = parseGlb(pulpInput);
  const d = structuredClone(full.document);
  const pd = pulp.document;

  assert.ok(!d.skins?.length && !d.animations?.length, 'Static bottle adapter expects no skins/animations');
  assert.ok(!pd.skins?.length && !pd.animations?.length, 'Pulp source expects no skins/animations');

  // Verify the full-label and short-label 1.5L bottles share identical Body, Cap, and Water geometry/transforms
  // so transplanting AloeVeraPulp preserves exact containment with zero clipping or deformation.
  for (const part of ['Body', 'Cap', 'Water']) {
    assertMatchedTransform(
      d.nodes.find((n) => n.name === part),
      pd.nodes.find((n) => n.name === part),
      part,
    );
  }
  const fullWaterNode = d.nodes.find((n) => n.name === 'Water');
  const pulpWaterNode = pd.nodes.find((n) => n.name === 'Water');
  const fullWaterPos = d.accessors[d.meshes[fullWaterNode.mesh].primitives[0].attributes.POSITION];
  const pulpWaterPos = pd.accessors[pd.meshes[pulpWaterNode.mesh].primitives[0].attributes.POSITION];
  assert.equal(fullWaterPos.count, pulpWaterPos.count, 'Water vertex count must match between full & short 1.5L');
  assert.deepEqual(fullWaterPos.min, pulpWaterPos.min, 'Water min bounds must match between full & short 1.5L');
  assert.deepEqual(fullWaterPos.max, pulpWaterPos.max, 'Water max bounds must match between full & short 1.5L');

  // Transplant AloeVeraPulp node, mesh, material, accessors, and raw binary chunks cleanly.
  const pulpNodeIdx = pd.nodes.findIndex((n) => n.name === 'AloeVeraPulp');
  assert.ok(pulpNodeIdx >= 0, 'Missing AloeVeraPulp node in short-label source');
  const pulpNode = structuredClone(pd.nodes[pulpNodeIdx]);
  assert.ok(pulpNode.mesh !== undefined, 'AloeVeraPulp node must have a mesh');
  const pulpMesh = structuredClone(pd.meshes[pulpNode.mesh]);

  const binChunks = [full.binary];
  let binOffset = Math.ceil(full.binary.length / 4) * 4;
  if (binOffset > full.binary.length) binChunks.push(Buffer.alloc(binOffset - full.binary.length));

  const copyPulpAccessor = (srcAccIdx) => {
    const srcAcc = structuredClone(pd.accessors[srcAccIdx]);
    const srcView = structuredClone(pd.bufferViews[srcAcc.bufferView]);
    const raw = pulp.binary.subarray(srcView.byteOffset ?? 0, (srcView.byteOffset ?? 0) + srcView.byteLength);
    const padded = Buffer.alloc(Math.ceil(raw.length / 4) * 4);
    raw.copy(padded);
    const newViewIdx = d.bufferViews.length;
    d.bufferViews.push({ ...srcView, buffer: 0, byteOffset: binOffset, byteLength: raw.length });
    binChunks.push(padded);
    binOffset += padded.length;
    const newAccIdx = d.accessors.length;
    d.accessors.push({ ...srcAcc, bufferView: newViewIdx });
    return newAccIdx;
  };

  // Place AloeVeraPulp at materials[0] & scene nodes[0] to match pet-1500-short-label.glb structure.
  const pulpMatIdx = d.materials.length;
  d.materials.push({ name: 'AloeVeraPulp' });
  for (const prim of pulpMesh.primitives) {
    prim.material = pulpMatIdx;
    if (prim.indices !== undefined) prim.indices = copyPulpAccessor(prim.indices);
    const nextAttrs = {};
    for (const [semantic, accIdx] of Object.entries(prim.attributes)) {
      if (semantic === 'TEXCOORD_0' || semantic === 'TEXCOORD_1') continue;
      nextAttrs[semantic] = copyPulpAccessor(accIdx);
    }
    prim.attributes = nextAttrs;
  }
  const newMeshIdx = d.meshes.length;
  d.meshes.push(pulpMesh);
  pulpNode.mesh = newMeshIdx;
  const newNodeIdx = d.nodes.length;
  d.nodes.push(pulpNode);
  d.scenes[d.scene ?? 0].nodes.unshift(newNodeIdx);
  d.buffers = [{ byteLength: binOffset }];

  for (const name of Object.values(MATERIAL_SLOTS).flat()) {
    assert.ok(d.materials.some((m) => m.name === name), `Missing material ${name}`);
  }

  // Wrap under the exact 0.1x metre root scale so index 0 (1.5L 1) and index 1 (1.5L 2)
  // share identical physical footprint and camera framing.
  const rootIdx = d.nodes.length;
  d.nodes.push({
    name: `${MODEL_ID}_Web_Metres`,
    scale: [0.1, 0.1, 0.1],
    children: d.scenes[d.scene ?? 0].nodes,
  });
  d.scenes[d.scene ?? 0].nodes = [rootIdx];

  // Drop unused TEXCOORD channels on untextured parts (AloeVeraPulp, PlasticBody, Ring, Water, PlasticCap).
  // Retain 100% of triangles, normals, and Label TEXCOORD_0 for artwork printing without any shape change.
  delete d.images;
  delete d.textures;
  delete d.samplers;
  for (const mesh of d.meshes) {
    for (const prim of mesh.primitives) {
      const matName = d.materials[prim.material]?.name;
      if (matName !== 'Label') {
        delete prim.attributes.TEXCOORD_0;
        delete prim.attributes.TEXCOORD_1;
      }
    }
  }

  // Apply the calibrated aloe-pet-v1 optical material profile matching PET 1.5L 1 & PET 500 mL Aloe.
  for (const m of d.materials) {
    delete m.normalTexture;
    delete m.extensions;
    delete m.alphaMode;
    delete m.alphaCutoff;
    m.doubleSided = true;

    if (m.name === 'AloeVeraPulp') {
      m.pbrMetallicRoughness = { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.18 };
      m.extensions = {
        KHR_materials_specular: { specularFactor: 0.5600000023841858 },
        KHR_materials_ior: { ior: 1.3700000047683716 },
      };
      m.extras = { ...m.extras, materialSlot: 'inclusions', bottleProfile: 'aloe-pet-v1' };
    } else if (m.name === 'PlasticBody') {
      m.alphaMode = 'BLEND';
      m.pbrMetallicRoughness = { baseColorFactor: [1, 1, 1, 0.025], metallicFactor: 0, roughnessFactor: 0.066 };
      m.extensions = { KHR_materials_ior: { ior: 1.561 } };
      m.extras = { ...m.extras, materialSlot: 'body', bottleProfile: 'aloe-pet-v1', aloeSurface: 'glossy' };
    } else if (m.name === 'Ring') {
      m.alphaMode = 'BLEND';
      m.pbrMetallicRoughness = { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.085 };
      m.extensions = { KHR_materials_ior: { ior: 1.47 } };
      m.extras = { ...m.extras, materialSlot: 'ring', bottleProfile: 'aloe-pet-v1', aloeRing: true };
    } else if (m.name === 'PlasticCap') {
      m.pbrMetallicRoughness = {
        baseColorFactor: [0.9215818562772946, 0.9130986517934192, 0.846873231509858, 1],
        metallicFactor: 0,
        roughnessFactor: 0.29,
      };
      m.extras = { ...m.extras, materialSlot: 'cap', bottleProfile: 'aloe-pet-v1' };
    } else if (m.name === 'Label') {
      m.pbrMetallicRoughness = { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.24 };
      m.extras = { ...m.extras, materialSlot: 'label', bottleProfile: 'aloe-pet-v1' };
    } else if (m.name === 'Water') {
      m.pbrMetallicRoughness = {
        baseColorFactor: [0.8069522576692516, 0.06847816984440017, 0.04518620438567554, 1],
        metallicFactor: 0,
        roughnessFactor: 0.11,
      };
      m.extras = { ...m.extras, materialSlot: 'liquid', bottleProfile: 'aloe-pet-v1' };
    }
  }

  d.extensionsUsed = ['KHR_materials_specular', 'KHR_materials_ior'];
  delete d.extensionsRequired;
  d.asset.extras = {
    ...d.asset.extras,
    labellabImport: {
      sourceName: fullSourceName,
      sourceSha256: hash(fullInput),
      pulpSourceName,
      pulpSourceSha256: hash(pulpInput),
      units: 'metres',
      geometry: 'all triangles retained with transplanted AloeVeraPulp',
    },
  };

  return compactGlbBuffers(d, Buffer.concat(binChunks));
}

async function importPet1500Full(fullSource = DEFAULT_FULL_SOURCE, pulpSource = DEFAULT_PULP_SOURCE) {
  const fullInput = fs.readFileSync(fullSource);
  const pulpInput = fs.readFileSync(pulpSource);
  const adapted = adaptPet1500Full(fullInput, pulpInput, path.basename(fullSource), path.basename(pulpSource));
  const { bytes, compression } = await compressDraco(adapted);
  assert.ok(
    bytes.length <= SIZE_BUDGET_BYTES,
    `${MODEL_ID}: ${bytes.length} bytes exceeds ${SIZE_BUDGET_BYTES} byte budget`,
  );

  const manifest = {
    id: MODEL_ID,
    src: `/models/bottles/${MODEL_ID}.glb`,
    sourceName: path.basename(fullSource),
    sourceBytes: fullInput.length,
    sourceSha256: hash(fullInput),
    pulpSourceName: path.basename(pulpSource),
    pulpSourceSha256: hash(pulpInput),
    bytes: bytes.length,
    sha256: hash(bytes),
    binarySha256: hash(parseGlb(bytes).binaryChunk),
    sourceToMetres: 0.1,
    units: 'metres',
    volumeMl: 1500,
    packaging: 'pet',
    defaultLiquid: 'aloe',
    materialSlots: MATERIAL_SLOTS,
    compression,
  };

  const output = path.resolve(__dirname, `../public/models/bottles/${MODEL_ID}.glb`);
  fs.writeFileSync(output, bytes);
  fs.writeFileSync(output.replace(/\.glb$/, '.manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(
    `${MODEL_ID}: ${fullInput.length} -> ${bytes.length} bytes (${(bytes.length / 1048576).toFixed(3)} MB); ` +
      `${compression.triangles} triangles; max error ${(compression.maxPositionErrorMeters * 1000).toFixed(6)} mm, ` +
      `${compression.maxUvErrorAt4096px.toFixed(4)} px at 4K, ${compression.maxNormalAngleDegrees.toFixed(4)} deg.`,
  );
  return manifest;
}

if (require.main === module) {
  importPet1500Full(process.argv[2] || DEFAULT_FULL_SOURCE, process.argv[3] || DEFAULT_PULP_SOURCE).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { importPet1500Full, adaptPet1500Full, MATERIAL_SLOTS, SIZE_BUDGET_BYTES };
