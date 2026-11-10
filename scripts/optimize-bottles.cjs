const fs = require('node:fs');
const path = require('node:path');
const { writeCompressedBottle, parseGlb } = require('./lib/bottle-compression.cjs');
const ids = ['glass-280-latte', 'glass-280-short-latte', 'pet-330-energy', 'pet-350-juice'];
async function main() {
  for (const id of ids) {
    const file = path.resolve(__dirname, `../public/models/bottles/${id}.glb`);
    const bytes = fs.readFileSync(file);
    if (parseGlb(bytes).document.extensionsUsed?.includes('EXT_meshopt_compression')) {
      console.log(`${id}: already compressed; skipped.`); continue;
    }
    const manifest = JSON.parse(fs.readFileSync(file.replace(/\.glb$/, '.manifest.json')));
    await writeCompressedBottle(file, bytes, manifest);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
