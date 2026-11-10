const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { parseGlb, writeGlb, hash } = require('./lib/bottle-compression.cjs');
const { compressDraco } = require('./lib/draco-bottle-compression.cjs');

const source = process.argv[2] ?? 'D:/3D model/Model Bottle Can/Ai edit/485ml bottle - Original Label UV preserved - Quads.glb';
const output = 'public/models/bottles/glass-485-milk.glb';
const sourceToMetres = .1;
const slots = { body: ['Body', 'Neck', 'GlassBase'], cap: ['Cap'], label: ['Label'], liquid: ['Water'] };

const linear = value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
const srgb = hex => hex.match(/../g).map(value => linear(parseInt(value, 16) / 255)).concat(1);

function primitiveFor(document, meshIndex, materialName) {
  const mesh = document.meshes[meshIndex];
  const material = document.materials.findIndex(entry => entry.name === materialName);
  const primitive = mesh.primitives.find(entry => entry.material === material);
  assert.ok(primitive, `Missing ${materialName} primitive in mesh ${meshIndex}`);
  return primitive;
}

function adapt(input) {
  const { document: d, binary } = parseGlb(input);
  assert.equal(d.nodes.length, 5, '485 ml source layout changed');
  assert.equal(d.meshes.length, 5, '485 ml source mesh layout changed');
  assert.equal(d.nodes.find(node => node.name === 'Body')?.mesh, 0, 'Missing Body node');
  assert.equal(d.nodes.find(node => node.name === 'Water')?.mesh, 4, 'Missing Water node');

  const bodyNode = d.nodes.find(node => node.name === 'Body');
  const capNode = d.nodes.find(node => node.name === 'cap');
  const labelNode = d.nodes.find(node => node.name === 'Label');
  const waterNode = d.nodes.find(node => node.name === 'Water');
  assert.ok(bodyNode && capNode && labelNode && waterNode);
  const bodyMesh = d.meshes[bodyNode.mesh];
  const bodyPrimitive = primitiveFor(d, bodyNode.mesh, 'Body');
  const neckPrimitive = primitiveFor(d, bodyNode.mesh, 'Neck');
  const basePrimitive = primitiveFor(d, bodyNode.mesh, 'GlassBase');

  // The source has one Body mesh with three material primitives. Give each
  // calibrated optical layer its own node/mesh while reusing the exact source
  // accessors and index buffers.
  bodyMesh.primitives = [bodyPrimitive];
  const neckMeshIndex = d.meshes.length;
  d.meshes.push({ name: 'Neck', primitives: [neckPrimitive] });
  const baseMeshIndex = d.meshes.length;
  d.meshes.push({ name: 'GlassBase', primitives: [basePrimitive] });
  const bodyIndex = d.nodes.indexOf(bodyNode);
  const neckIndex = d.nodes.length;
  d.nodes.push({ name: 'Neck', mesh: neckMeshIndex, scale: bodyNode.scale, translation: bodyNode.translation });
  const baseIndex = d.nodes.length;
  d.nodes.push({ name: 'GlassBase', mesh: baseMeshIndex, scale: bodyNode.scale, translation: bodyNode.translation });
  assert.equal(bodyIndex, 0);
  bodyNode.name = 'Body';
  capNode.name = 'Cap';
  labelNode.name = 'Label';
  waterNode.name = 'Water';

  const rename = { SilverCap: 'Cap', PaperLabel: 'Label', Milk: 'Water' };
  for (const material of d.materials) {
    if (rename[material.name]) material.name = rename[material.name];
    material.alphaMode = 'OPAQUE';
    material.doubleSided = material.name === 'Cap' || material.name === 'Label';
    material.pbrMetallicRoughness = { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: .28 };
    material.extras = { ...(material.extras ?? {}), bottleProfile: 'glass-300-v1' };
    if (['Body', 'Neck', 'GlassBase'].includes(material.name)) {
      material.pbrMetallicRoughness.roughnessFactor = .042;
      material.extensions = {
        KHR_materials_transmission: { transmissionFactor: 1 },
        KHR_materials_volume: { thicknessFactor: .002 },
        KHR_materials_ior: { ior: 1.52 },
      };
      if (material.name === 'Neck') material.extras.basilWebNeckWallMetres = .001;
    } else if (material.name === 'Cap') {
      material.pbrMetallicRoughness.baseColorFactor = srgb('c0c0c0');
      material.pbrMetallicRoughness.metallicFactor = 1;
      material.pbrMetallicRoughness.roughnessFactor = .388;
      delete material.extensions;
    } else if (material.name === 'Water') {
      material.extras.bottleLiquidKind = 'milk';
      material.pbrMetallicRoughness.baseColorFactor = srgb('fff5e4');
      material.pbrMetallicRoughness.roughnessFactor = .12;
      material.extensions = {
        KHR_materials_transmission: { transmissionFactor: 0 },
        KHR_materials_volume: { thicknessFactor: .035 },
        KHR_materials_ior: { ior: 1.333 },
      };
    } else if (material.name === 'Label') {
      delete material.extensions;
    }
  }
  d.extensionsUsed = [...new Set([...(d.extensionsUsed ?? []), 'KHR_materials_transmission', 'KHR_materials_volume', 'KHR_materials_ior'])];
  d.extensionsRequired = [...new Set([...(d.extensionsRequired ?? []), 'KHR_materials_transmission', 'KHR_materials_volume', 'KHR_materials_ior'])];
  const root = d.nodes.length;
  d.nodes.push({ name: 'Glass_485_Milk_Metres', scale: [sourceToMetres, sourceToMetres, sourceToMetres], children: [bodyIndex, 1, 2, 3, 4, neckIndex, baseIndex] });
  d.scenes[d.scene ?? 0].nodes = [root];
  d.asset.extras = {
    ...(d.asset.extras ?? {}),
    labellabImport: {
      sourceName: path.basename(source), sourceSha256: hash(input), units: 'metres', sourceToMetres,
      geometry: { sourcePartsRetained: ['Body', 'Neck', 'GlassBase', 'Cap', 'Label', 'Water'], triangles: 74602 },
      defaultLiquid: 'milk', neckOptics: 'pullcap-hollow-glass-neck-v1', baseOptics: 'glass-300-base-clear-v2',
    },
  };
  return writeGlb(d, binary);
}

async function main() {
  const input = fs.readFileSync(source);
  const adapted = adapt(input);
  const { bytes, compression } = await compressDraco(adapted, { positionBits: 18, normalBits: 14, uvBits: 16 });
  assert.ok(bytes.length < 1_500_000, `${bytes.length} bytes exceeds the 1.5 MB 485 ml budget`);
  const manifest = {
    id: 'glass-485-milk', src: '/models/bottles/glass-485-milk.glb', sourceName: path.basename(source),
    sourceBytes: input.length, sourceSha256: hash(input), bytes: bytes.length, sha256: hash(bytes),
    binarySha256: hash(parseGlb(bytes).binaryChunk), sourceToMetres, units: 'metres', volumeMl: 485,
    packaging: 'glass', defaultLiquid: 'milk', blankLabel: 'white',
    neckOptics: { tracer: 'pullcap-hollow-glass-neck-v1', wallThicknessMetres: .001, geometrySource: 'authored Neck', innerShellAdded: false },
    baseOptics: { profile: 'glass-300-base-clear-v2', geometrySource: 'authored GlassBase' },
    geometry: { sourcePartsRetained: ['Body', 'Neck', 'GlassBase', 'Cap', 'Label', 'Water'], triangles: compression.triangles },
    materialSlots: slots, compression,
  };
  const target = path.resolve(__dirname, '..', output);
  fs.writeFileSync(target, bytes);
  fs.writeFileSync(target.replace(/\.glb$/, '.manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ id: manifest.id, sourceBytes: input.length, bytes: bytes.length, triangles: compression.triangles, savedPercent: compression.savedPercent, maxPositionErrorMeters: compression.maxPositionErrorMeters, maxUvErrorAt4096px: compression.maxUvErrorAt4096px }));
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { adapt, slots };
