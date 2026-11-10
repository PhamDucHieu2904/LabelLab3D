const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { writeCompressedBottle } = require('./lib/bottle-compression.cjs');

// Produce a web material/unit adaptation without changing the source or its UVs.
const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/import-pet350.cjs <source.glb>');
const input = fs.readFileSync(source);
if (input.readUInt32LE(0) !== 0x46546c67 || input.readUInt32LE(4) !== 2) throw new Error('Expected glTF 2 GLB');
const jsonLength = input.readUInt32LE(12);
const document = JSON.parse(input.subarray(20, 20 + jsonLength).toString('utf8'));
const binaryChunks = input.subarray(20 + jsonLength);
// The authored water almost coincides with the molded shell at its ridges.
// A 0.8% horizontal inset provides clearance while preserving the fill height.
const waterNode = document.nodes.find(node => node.name === 'Water');
if (!waterNode) throw new Error('Missing source Water node');
waterNode.scale = [...(waterNode.scale ?? [1, 1, 1])];
waterNode.scale[0] *= 0.992; waterNode.scale[2] *= 0.992;
const root = document.nodes.length;
document.nodes.push({ name: 'PET_350ml_Web_Metres', scale: [0.1, 0.1, 0.1], children: document.scenes[document.scene ?? 0].nodes });
document.scenes[document.scene ?? 0].nodes = [root];
const required = ['PlasticBody', 'Ring', 'PlasticCap', 'Label', 'Water'];
for (const name of required) if (!document.materials.some(material => material.name === name)) throw new Error(`Missing source material: ${name}`);
const physical = (material, transmission, thickness, ior) => {
  material.extensions = {
    KHR_materials_transmission: { transmissionFactor: transmission },
    KHR_materials_volume: { thicknessFactor: thickness },
    KHR_materials_ior: { ior },
  };
};
for (const material of document.materials) {
  material.extras = { ...material.extras, bottleProfile: 'juice-pet-v1', ...(material.name === 'Ring' ? { juiceRing: true } : {}) };
  material.pbrMetallicRoughness = { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.28 };
  material.doubleSided = false;
  if (material.name === 'PlasticBody') {
    material.pbrMetallicRoughness.roughnessFactor = 0.075;
    physical(material, 0.96, 0.0008, 1.46);
  } else if (material.name === 'Ring') {
    material.pbrMetallicRoughness.roughnessFactor = 0.19;
    physical(material, 0.7, 0.0009, 1.46);
  } else if (material.name === 'PlasticCap') {
    material.pbrMetallicRoughness.roughnessFactor = 0.29;
  } else if (material.name === 'Water') {
    material.pbrMetallicRoughness.baseColorFactor = [0.80695, 0.46778, 0.07819, 1]; // #E8B64F in linear RGB
    material.pbrMetallicRoughness.roughnessFactor = 0.12;
    physical(material, 0.35, 0.025, 1.35);
  }
}
document.extensionsUsed = [...new Set([...(document.extensionsUsed ?? []), 'KHR_materials_transmission', 'KHR_materials_volume', 'KHR_materials_ior'])];
document.asset.extras = { ...document.asset.extras, labellabImport: { sourceName: path.basename(source), sourceSha256: crypto.createHash('sha256').update(input).digest('hex'), units: 'metres', geometry: 'unchanged', defaultLiquid: 'Juice' } };
const json = Buffer.from(JSON.stringify(document));
const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20);
json.copy(padded);
const header = Buffer.alloc(20);
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
header.writeUInt32LE(20 + padded.length + binaryChunks.length, 8);
header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
const output = path.resolve(__dirname, '../public/models/bottles/pet-350-juice.glb');
const outputBytes = Buffer.concat([header, padded, binaryChunks]);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
writeCompressedBottle(output, outputBytes, {
  id: 'pet-350-juice', src: '/models/bottles/pet-350-juice.glb',
  sourceName: path.basename(source), sourceBytes: input.length, sourceSha256: hash(input),
  bytes: outputBytes.length, sha256: hash(outputBytes), binarySha256: hash(binaryChunks),
  units: 'metres', sourceToMetres: 0.1, liquidHorizontalInset: 0.992,
  defaultLiquid: 'fruit-juice', volumeMl: 350,
}).catch(error => { console.error(error); process.exitCode = 1; });
