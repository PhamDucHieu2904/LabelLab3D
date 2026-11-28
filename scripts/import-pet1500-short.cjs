const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { parseGlb, writeGlb, hash } = require('./lib/bottle-compression.cjs');
const { compressDraco } = require('./lib/draco-bottle-compression.cjs');

const DEFAULT_SOURCE = 'D:/3D model/Model Bottle Can/Ai edit/Pet 1500ml model short label - Aloe Vera Pulp web.glb';
const MODEL_ID = 'pet-1500-short-label';
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

function adaptPet1500Short(input, sourceName) {
  const { document: sourceDoc, binary } = parseGlb(input);
  const d = structuredClone(sourceDoc);
  assert.ok(!d.skins?.length && !d.animations?.length, 'Static bottle adapter expects no skins/animations');
  for (const name of Object.values(MATERIAL_SLOTS).flat()) {
    assert.ok(d.materials.some((m) => m.name === name), `Missing material ${name}`);
  }

  // Match pet-1500-juice.glb exact 0.1x metre root scale so both index 0 (Aloe short label)
  // and index 1 (Juice full label) share identical physical bounds and camera framing.
  const rootIdx = d.nodes.length;
  d.nodes.push({
    name: `${MODEL_ID}_Web_Metres`,
    scale: [0.1, 0.1, 0.1],
    children: d.scenes[d.scene ?? 0].nodes,
  });
  d.scenes[d.scene ?? 0].nodes = [rootIdx];

  // Strip unused TEXCOORD_0 on untextured parts (AloeVeraPulp, Water, PlasticCap) while keeping
  // 100% of triangles, normals, and Label/Body/Ring UVs intact.
  delete d.images;
  delete d.textures;
  delete d.samplers;
  for (const mesh of d.meshes) {
    for (const prim of mesh.primitives) {
      const matName = d.materials[prim.material]?.name;
      if (matName === 'AloeVeraPulp' || matName === 'Water' || matName === 'PlasticCap') {
        delete prim.attributes.TEXCOORD_0;
      }
      if (matName !== 'Label') {
        delete prim.attributes.TEXCOORD_1;
      }
    }
  }

  // Apply the calibrated aloe-pet-v1 optical material profile matching PET 500 mL Aloe.
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
      sourceName,
      sourceSha256: hash(input),
      units: 'metres',
      geometry: 'all triangles retained',
    },
  };

  return compactGlbBuffers(d, binary);
}

async function importPet1500Short(source = DEFAULT_SOURCE) {
  const input = fs.readFileSync(source);
  const adapted = adaptPet1500Short(input, path.basename(source));
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
    `${MODEL_ID}: ${input.length} -> ${bytes.length} bytes (${(bytes.length / 1048576).toFixed(3)} MB); ` +
      `${compression.triangles} triangles; max error ${(compression.maxPositionErrorMeters * 1000).toFixed(6)} mm, ` +
      `${compression.maxUvErrorAt4096px.toFixed(4)} px at 4K, ${compression.maxNormalAngleDegrees.toFixed(4)} deg.`,
  );
  return manifest;
}

if (require.main === module) {
  importPet1500Short(process.argv[2] || DEFAULT_SOURCE).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { importPet1500Short, adaptPet1500Short, MATERIAL_SLOTS, SIZE_BUDGET_BYTES };
