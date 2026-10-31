const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'lib/labellab/source-catalog.json'), 'utf8').replace(/^\uFEFF/, ''));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/models/cans/assets.manifest.json'), 'utf8'));
const displays = ['basil-glass290-strawberry-3d', 'juice30-can330-mango-3d', 'aloe-pet500-mango-3d'];
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
if (strawberry.liquidColor.toLowerCase() !== '#f14e78') throw new Error('Strawberry liquid color mismatch');
console.log(`Verified ${urls.size} runtime assets, 3 published displays, and ${cans.length} optimized cans.`);
