const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'lib/labellab/source-catalog.json'), 'utf8').replace(/^\uFEFF/, ''));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/models/cans/assets.manifest.json'), 'utf8'));
const displays = ['basil-glass290-strawberry-3d', 'juice30-can330-mango-3d', 'aloe-pet500-mango-3d', 'cojo-pet320-watermelon-3d'];
const urls = new Set(['/environments/studio-softbox.exr', '/decoders/draco/draco_wasm_wrapper.js', '/decoders/draco/draco_decoder.wasm']);
for (const id of displays) {
  const display = catalog.displays3d.find(item => item.id === id);
  if (!display) throw new Error(`Missing display ${id}`);
  const model = catalog.models3d.find(item => item.id === display.modelId);
  const label = catalog.labels.find(item => item.id === display.labelId);
  for (const mediaId of [model.mediaId, model.posterId, label.mediaId]) {
    const media = catalog.media.find(item => item.id === mediaId);
    if (!media?.url) throw new Error(`Missing media ${mediaId}`);
    urls.add(media.url);
  }
}
for (const url of urls) if (!fs.existsSync(path.join(root, 'public', url))) throw new Error(`Missing public asset ${url}`);
const cans = manifest.assets.filter(item => item.kind === 'can');
if (cans.length !== 6) throw new Error(`Expected 6 can assets, found ${cans.length}`);
for (const asset of cans) {
  const file = path.join(root, 'public', asset.src);
  if (!fs.existsSync(file)) throw new Error(`Missing can GLB ${asset.id}: ${asset.src}`);
  const stat = fs.statSync(file);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (stat.size !== asset.bytes || hash !== asset.sha256) throw new Error(`Can asset mismatch ${asset.id}: ${stat.size}/${hash}`);
  const poster = path.join(root, 'public/models/cans/posters', `${asset.id}.webp`);
  if (!fs.existsSync(poster) || fs.statSync(poster).size === 0) throw new Error(`Missing can poster ${asset.id}`);
}
const strawberry = catalog.displays3d.find(item => item.id === displays[0]);
const pet350 = JSON.parse(fs.readFileSync(path.join(root, 'public/models/bottles/pet-350-juice.manifest.json'), 'utf8'));
const pet350Bytes = fs.readFileSync(path.join(root, 'public', pet350.src));
if (pet350Bytes.length !== pet350.bytes || crypto.createHash('sha256').update(pet350Bytes).digest('hex') !== pet350.sha256) throw new Error('350 ml PET asset mismatch');
if (!fs.existsSync(path.join(root, 'public/models/bottles/pet-350-juice-poster.webp'))) throw new Error('Missing 350 ml PET poster');
const pet330 = JSON.parse(fs.readFileSync(path.join(root, 'public/models/bottles/pet-330-energy.manifest.json'), 'utf8'));
const pet330Bytes = fs.readFileSync(path.join(root, 'public', pet330.src));
if (pet330Bytes.length !== pet330.bytes || crypto.createHash('sha256').update(pet330Bytes).digest('hex') !== pet330.sha256) throw new Error('330 ml PET asset mismatch');
if (!fs.existsSync(path.join(root, 'public/models/bottles/pet-330-energy-poster.webp'))) throw new Error('Missing 330 ml PET poster');
for (const id of ['glass-280-latte', 'glass-280-short-latte', 'glass-290-chia', 'glass-290-milk']) {
const glass280 = JSON.parse(fs.readFileSync(path.join(root, `public/models/bottles/${id}.manifest.json`), 'utf8'));
const glass280Bytes = fs.readFileSync(path.join(root, 'public', glass280.src));
if (glass280Bytes.length !== glass280.bytes || crypto.createHash('sha256').update(glass280Bytes).digest('hex') !== glass280.sha256) throw new Error(`${id} glass asset mismatch`);
if (!fs.existsSync(path.join(root, `public/models/bottles/${id}-poster.webp`))) throw new Error(`Missing ${id} glass poster`);
}
const glass290PosterHashes = ['basil', 'chia', 'milk'].map(kind => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, `public/models/bottles/glass-290-${kind}-poster.webp`))).digest('hex'));
if (new Set(glass290PosterHashes).size !== 3) throw new Error('Glass290 posters must be unique renders');
if (strawberry.liquidColor.toLowerCase() !== '#f14e78') throw new Error('Strawberry liquid color mismatch');
for (const id of ['pet-320-full-nata', 'pet-1000-juice', 'pet-1500-juice', 'pet-325-juice', 'pet-1000-short-juice', 'pp-2000', 'pp-1250', 'pp-1000', 'pp-1000-2', 'pp-500', 'pp-500-2', 'glass-290-chia', 'glass-290-milk', 'glass-290-pullcap-basil', 'glass-290-pullcap-chia', 'glass-290-pullcap-milk']) {
  const manifest=JSON.parse(fs.readFileSync(path.join(root,`public/models/bottles/${id}.manifest.json`)));
  const bytes=fs.readFileSync(path.join(root,'public',manifest.src));
  if(bytes.length!==manifest.bytes||crypto.createHash('sha256').update(bytes).digest('hex')!==manifest.sha256) throw new Error(`${id} Draco asset mismatch`);
  if(!fs.existsSync(path.join(root,`public/models/bottles/${id}-poster.webp`)))throw new Error(`Missing ${id} poster`);
}
{
  const id = 'glass-485-milk';
  const manifest = JSON.parse(fs.readFileSync(path.join(root, `public/models/bottles/${id}.manifest.json`)));
  const bytes = fs.readFileSync(path.join(root, 'public', manifest.src));
  if (bytes.length !== manifest.bytes || crypto.createHash('sha256').update(bytes).digest('hex') !== manifest.sha256) throw new Error(`${id} Draco asset mismatch`);
  if (manifest.compression?.triangles !== 74602 || manifest.defaultLiquid !== 'milk') throw new Error(`${id} geometry/liquid metadata mismatch`);
  if (!fs.existsSync(path.join(root, `public/models/bottles/${id}-poster.webp`))) throw new Error(`Missing ${id} poster`);
}
{
  const id = 'glass-300-milk';
  const manifest = JSON.parse(fs.readFileSync(path.join(root, `public/models/bottles/${id}.manifest.json`)));
  const bytes = fs.readFileSync(path.join(root, 'public', manifest.src));
  if (bytes.length !== manifest.bytes || crypto.createHash('sha256').update(bytes).digest('hex') !== manifest.sha256) throw new Error(`${id} Draco asset mismatch`);
  if (manifest.compression?.triangles !== 254068 || manifest.geometry?.beadIslands !== 400) throw new Error(`${id} geometry retention metadata mismatch`);
  if (!fs.existsSync(path.join(root, `public/models/bottles/${id}-poster.webp`))) throw new Error(`Missing ${id} poster`);
}
console.log(`Verified ${urls.size} runtime assets, ${displays.length} published displays, ${cans.length} optimized cans, supplied bottles and all Draco imports.`);
