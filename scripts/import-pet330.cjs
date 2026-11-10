const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { writeCompressedBottle } = require('./lib/bottle-compression.cjs');

const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/import-pet330.cjs <source.glb>');
const input = fs.readFileSync(source);
if (input.readUInt32LE(0) !== 0x46546c67 || input.readUInt32LE(4) !== 2) throw new Error('Expected glTF 2 GLB');
const jsonLength = input.readUInt32LE(12);
const document = JSON.parse(input.subarray(20, 20 + jsonLength).toString('utf8'));
const binaryChunks = input.subarray(20 + jsonLength);
const required = ['Plastic Body', 'ThinRefraction', 'Ring', 'Cap', 'Lable', 'Water'];
for (const name of required) if (!document.materials.some(m => m.name === name)) throw new Error(`Missing ${name}`);
const root = document.nodes.length;
document.nodes.push({ name: 'PET_330ml_Web_Metres', scale: [.1, .1, .1], children: document.scenes[document.scene ?? 0].nodes });
document.scenes[document.scene ?? 0].nodes = [root];
for (const material of document.materials) {
  material.extras = { ...material.extras, bottleProfile: 'energy-pet-v1', ...(material.name === 'Ring' ? { energyRing: true } : {}) };
  material.doubleSided = false;
  material.pbrMetallicRoughness = { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: .28 };
  if (['Plastic Body', 'ThinRefraction', 'Ring', 'Water'].includes(material.name)) {
    const liquid = material.name === 'Water';
    material.pbrMetallicRoughness.roughnessFactor = liquid ? .05 : material.name === 'Ring' ? .19 : .075;
    material.extensions = {
      KHR_materials_transmission: { transmissionFactor: liquid ? 1 : .96 },
      KHR_materials_volume: { thicknessFactor: liquid ? .02 : .0008 },
      KHR_materials_ior: { ior: liquid ? 1.35 : 1.47 },
    };
    if (liquid) material.pbrMetallicRoughness.baseColorFactor = [1, .6703185, 0, 1]; // App Orange energy preset, linear RGB.
  } else if (material.name === 'Cap') material.pbrMetallicRoughness.roughnessFactor = .29;
}
document.extensionsUsed = [...new Set([...(document.extensionsUsed ?? []), 'KHR_materials_transmission', 'KHR_materials_volume', 'KHR_materials_ior'])];
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
document.asset.extras = { ...document.asset.extras, labellabImport: {
  sourceName: path.basename(source), sourceSha256: hash(input), units: 'metres', geometry: 'unchanged', defaultLiquid: 'Energy drink',
} };
const json = Buffer.from(JSON.stringify(document));
const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20); json.copy(padded);
const header = Buffer.alloc(20);
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
header.writeUInt32LE(20 + padded.length + binaryChunks.length, 8);
header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
const output = path.resolve(__dirname, '../public/models/bottles/pet-330-energy.glb');
const bytes = Buffer.concat([header, padded, binaryChunks]);
writeCompressedBottle(output, bytes, {
  id: 'pet-330-energy', src: '/models/bottles/pet-330-energy.glb', sourceName: path.basename(source),
  sourceBytes: input.length, sourceSha256: hash(input), bytes: bytes.length, sha256: hash(bytes),
  binarySha256: hash(binaryChunks), units: 'metres', sourceToMetres: .1, defaultLiquid: 'energy', volumeMl: 330,
  sparklingReference: 'Label Lab: EnergyDrinkBubbleParticleSystem.cs + EnergyDrinkBubbleParticle.shader',
}).catch(error => { console.error(error); process.exitCode = 1; });
