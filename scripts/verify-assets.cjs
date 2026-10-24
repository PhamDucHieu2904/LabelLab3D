const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'lib/labellab/source-catalog.json'), 'utf8').replace(/^\uFEFF/, ''));
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
const strawberry = catalog.displays3d.find(item => item.id === displays[0]);
if (strawberry.liquidColor.toLowerCase() !== '#f14e78') throw new Error('Strawberry liquid color mismatch');
console.log(`Verified ${urls.size} runtime assets and 3 published display records; strawberry liquid #F14E78.`);
