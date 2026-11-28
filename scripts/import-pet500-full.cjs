const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { parseGlb, writeGlb, hash } = require('./lib/bottle-compression.cjs');
const { compressDraco } = require('./lib/draco-bottle-compression.cjs');

const DEFAULT_SOURCE = 'D:/3D model/Model Bottle Can/Blender Model 1/500 ml Bottle Model Long Label_web.glb';
const MODEL_ID = 'pet-500-full-label';
const SIZE_BUDGET_BYTES = 1_200_000;
const MATERIAL_SLOTS = {
  inclusions: ['Aloe Pulp - Clear'],
  body: ['Body Bottle - Rough_NormalMap', 'Body Bottle - z Glossy'],
  ring: ['Ring'],
  cap: ['PlasticCap'],
  label: ['Label'],
  liquid: ['Aloe Vera Water'],
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

function adaptPet500Full(input, sourceName) {
  const { document: sourceDoc, binary } = parseGlb(input);
  const d = structuredClone(sourceDoc);
  assert.ok(!d.skins?.length && !d.animations?.length, 'Static bottle adapter expects no skins/animations');
  for (const name of Object.values(MATERIAL_SLOTS).flat()) {
    assert.ok(d.materials.some((m) => m.name === name), `Missing material ${name}`);
  }

  // Match pet-500-short-label.glb exact metre scale (0.1x) and centered pivot so
  // switching between index 0 (Short label) and index 1 (Full label) has zero framing jump.
  const rootIdx = d.nodes.length;
  d.nodes.push({
    name: 'PET 500 ml full label',
    scale: [0.1, 0.1, 0.1],
    translation: [0.0000042870640754699705, -0.10481757521629334, 0.000003477931022644043],
    children: d.scenes[d.scene ?? 0].nodes,
  });
  d.scenes[d.scene ?? 0].nodes = [rootIdx];

  // Drop the unused 1.26 MB raw PNG normal texture (aloe-bottle-materials.ts explicitly
  // sets material.normalMap = null for clean glossy PET). Also strip unused TEXCOORD_1
  // and unused UVs on Water/Cap so attributes match pet-500-short-label.glb 1-to-1 while
  // retaining 100% of triangles, normals, and Label/Body/Ring UVs.
  delete d.images;
  delete d.textures;
  delete d.samplers;
  for (const mesh of d.meshes) {
    for (const prim of mesh.primitives) {
      const matName = d.materials[prim.material]?.name;
      if (matName !== 'Label') {
        delete prim.attributes.TEXCOORD_1;
        if (matName === 'Aloe Vera Water' || matName === 'PlasticCap') {
          delete prim.attributes.TEXCOORD_0;
        }
      }
    }
  }

  // Apply the exact aloe-pet-v1 material contract from pet-500-short-label.glb.
  for (const m of d.materials) {
    delete m.normalTexture;
    delete m.extensions;
    delete m.alphaMode;
    delete m.alphaCutoff;
    m.doubleSided = true;

    if (m.name === 'Aloe Pulp - Clear') {
      m.pbrMetallicRoughness = { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.18 };
      m.extensions = {
        KHR_materials_specular: { specularFactor: 0.5600000023841858 },
        KHR_materials_ior: { ior: 1.3700000047683716 },
      };
      m.extras = { ...m.extras, materialSlot: 'inclusions', bottleProfile: 'aloe-pet-v1' };
    } else if (m.name === 'Body Bottle - Rough_NormalMap') {
      m.alphaMode = 'BLEND';
      m.pbrMetallicRoughness = { baseColorFactor: [1, 1, 1, 0.04], metallicFactor: 0, roughnessFactor: 0.55 };
      m.extras = { ...m.extras, materialSlot: 'body', bottleProfile: 'aloe-pet-v1', aloeSurface: 'frosted' };
    } else if (m.name === 'Body Bottle - z Glossy') {
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
    } else if (m.name === 'Aloe Vera Water') {
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
      sourceName,
      sourceSha256: hash(input),
      units: 'metres',
      geometry: 'all triangles retained',
    },
  };

  return compactGlbBuffers(d, binary);
}

async function importPet500Full(source = DEFAULT_SOURCE) {
  const input = fs.readFileSync(source);
  const adapted = adaptPet500Full(input, path.basename(source));
  const { bytes, compression } = await compressDraco(adapted);
  assert.ok(
    bytes.length <= SIZE_BUDGET_BYTES,
    `${MODEL_ID}: ${bytes.length} bytes exceeds ${SIZE_BUDGET_BYTES} byte budget`,
  );

  const manifest = {
    id: MODEL_ID,
    src: `/models/bottles/${MODEL_ID}.glb`,
    sourceName: path.basename(source),
    sourceBytes: input.length,
    sourceSha256: hash(input),
    bytes: bytes.length,
    sha256: hash(bytes),
    binarySha256: hash(parseGlb(bytes).binaryChunk),
    sourceToMetres: 0.1,
    units: 'metres',
    volumeMl: 500,
    packaging: 'pet',
    defaultLiquid: 'aloe',
    materialSlots: MATERIAL_SLOTS,
    compression,
  };

  const output = path.resolve(__dirname, `../public/models/bottles/${MODEL_ID}.glb`);
  fs.writeFileSync(output, bytes);
  fs.writeFileSync(output.replace(/\.glb$/, '.manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(
    `${MODEL_ID}: ${input.length} -> ${bytes.length} bytes (${(bytes.length / 1048576).toFixed(3)} MB); ` +
      `${compression.triangles} triangles; max error ${(compression.maxPositionErrorMeters * 1000).toFixed(6)} mm, ` +
      `${compression.maxUvErrorAt4096px.toFixed(4)} px at 4K, ${compression.maxNormalAngleDegrees.toFixed(4)} deg.`,
  );
  return manifest;
}

if (require.main === module) {
  importPet500Full(process.argv[2] || DEFAULT_SOURCE).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { importPet500Full, adaptPet500Full, MATERIAL_SLOTS, SIZE_BUDGET_BYTES };
