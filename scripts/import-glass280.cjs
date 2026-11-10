const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { writeCompressedBottle } = require('./lib/bottle-compression.cjs');

const source = process.argv[2];
const variant = process.argv[3] ?? 'standard';
if (!source || !['standard', 'short'].includes(variant)) throw new Error('Usage: node scripts/import-glass280.cjs <source.glb> [standard|short]');
const short = variant === 'short';
const id = short ? 'glass-280-short-latte' : 'glass-280-latte';
const glassMaterials = short ? ['Body', 'Neck', 'GlassBase'] : ['Glass Refraction', 'Body'];
const input = fs.readFileSync(source);
if (input.readUInt32LE(0) !== 0x46546c67 || input.readUInt32LE(4) !== 2) throw new Error('Expected glTF 2 GLB');
const jsonLength = input.readUInt32LE(12);
const document = JSON.parse(input.subarray(20, 20 + jsonLength).toString('utf8'));
const binaryChunks = input.subarray(20 + jsonLength);
// The supplied water crosses the label by ~0.01 mm around the rounded heel.
// Inset only its horizontal transform; keep the authored fill height and buffers.
const liquidInsetXZ = .992;
for (const node of document.nodes) {
  if (node.mesh === undefined || !document.meshes[node.mesh].primitives.some(p => document.materials[p.material]?.name === 'Water')) continue;
  const scale = node.scale ?? [1, 1, 1];
  node.scale = [scale[0] * liquidInsetXZ, scale[1], scale[2] * liquidInsetXZ];
}
for (const name of [...glassMaterials, 'Cap', 'White layer', 'Label', 'Water']) {
  if (!document.materials.some(m => m.name === name)) throw new Error(`Missing ${name}`);
}
const root = document.nodes.length;
document.nodes.push({ name: short ? 'Glass_280ml_Short_Web_Metres' : 'Glass_280ml_Web_Metres', scale: [.1, .1, .1], children: document.scenes[document.scene ?? 0].nodes });
document.scenes[document.scene ?? 0].nodes = [root];
const linear = value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
for (const material of document.materials) {
  material.extras = { ...material.extras, bottleProfile: 'glass-280-v1' };
  material.doubleSided = ['Cap', 'White layer', 'Label'].includes(material.name);
  material.pbrMetallicRoughness = { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: .28 };
  if (glassMaterials.includes(material.name)) {
    material.pbrMetallicRoughness.roughnessFactor = .042;
    material.extensions = {
      KHR_materials_transmission: { transmissionFactor: 1 },
      KHR_materials_volume: { thicknessFactor: .002 },
      KHR_materials_ior: { ior: 1.52 },
    };
  } else if (material.name === 'Cap') {
    material.pbrMetallicRoughness.metallicFactor = 1;
    material.pbrMetallicRoughness.baseColorFactor = [linear(192 / 255), linear(192 / 255), linear(192 / 255), 1];
  } else if (material.name === 'Water') {
    material.pbrMetallicRoughness.baseColorFactor = [184, 140, 105].map(v => linear(v / 255)).concat(1); // Latte #B88C69.
    material.pbrMetallicRoughness.roughnessFactor = .12;
  } else if (material.name === 'Label') {
    // Preserve an opaque white print surface before and after custom artwork.
    material.alphaMode = 'OPAQUE';
  }
}
document.extensionsUsed = [...new Set([...(document.extensionsUsed ?? []), 'KHR_materials_transmission', 'KHR_materials_volume', 'KHR_materials_ior'])];
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
document.asset.extras = { ...document.asset.extras, labellabImport: {
  sourceName: path.basename(source), sourceSha256: hash(input), units: 'metres', geometry: 'unchanged', defaultLiquid: 'Milk coffee / Latte',
} };
const json = Buffer.from(JSON.stringify(document));
const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20); json.copy(padded);
const header = Buffer.alloc(20);
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
header.writeUInt32LE(20 + padded.length + binaryChunks.length, 8);
header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
const output = path.resolve(__dirname, `../public/models/bottles/${id}.glb`);
const bytes = Buffer.concat([header, padded, binaryChunks]);
writeCompressedBottle(output, bytes, {
  id, src: `/models/bottles/${id}.glb`, sourceName: path.basename(source),
  sourceBytes: input.length, sourceSha256: hash(input), bytes: bytes.length, sha256: hash(bytes),
  binarySha256: hash(binaryChunks), units: 'metres', sourceToMetres: .1,
  defaultLiquid: 'coffee', defaultPreset: 'latte', volumeMl: 280, blankLabel: 'white', liquidInsetXZ,
}).catch(error => { console.error(error); process.exitCode = 1; });
