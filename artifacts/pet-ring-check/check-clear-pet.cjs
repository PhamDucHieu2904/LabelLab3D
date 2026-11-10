/* eslint-disable @typescript-eslint/no-require-imports */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const sharp = require('sharp');
const { chromium } = require('C:/Users/thietke06.VINUT/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = path.resolve(__dirname, '../..');
const port = 3092;
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  let file = pathname === '/' ? path.join(__dirname, 'harness.html') : path.join(base,
    /^\/(lib|node_modules|artifacts)\//.test(pathname) ? pathname : path.join('/public', pathname));
  if (!fs.existsSync(file) && fs.existsSync(file + '.ts')) file += '.ts';
  try {
    let data = fs.readFileSync(file), ext = path.extname(file);
    if (ext === '.ts') {
      data = ts.transpileModule(data.toString(), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
      ext = '.js';
    }
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png' })[ext] || 'application/octet-stream');
    res.end(data);
  } catch (error) { res.statusCode = 404; res.end(String(error)); }
});

const pngBytes = png => Buffer.from(png.split(',')[1], 'base64');
async function pixels(png, roll = 0) {
  let raster = sharp(pngBytes(png)).ensureAlpha();
  if (roll) raster = raster.rotate(90);
  const { data, info } = await raster.raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}
function ringRegion(image) {
  // Camera targets the flange center. After undoing roll, the same physical
  // crop stays centered even though the rectangular framebuffer trades axes.
  return { left: Math.max(15, Math.floor(image.width / 2 - 485)), right: Math.min(image.width - 15, Math.ceil(image.width / 2 + 485)),
    top: Math.floor(image.height / 2 - 20), bottom: Math.floor(image.height / 2 + 180) };
}
function darkCoverage(image) {
  const region = ringRegion(image); let dark = 0, coveredColumns = 0, area = 0;
  for (let x = region.left; x < region.right; x++) {
    let columnDark = 0;
    for (let y = region.top; y < region.bottom; y++) {
      const i = (y * image.width + x) * 4;
      // The matte's darkest grid line is above 80 in at least one channel.
      // This detects near-black opaque replacement, not muted transmitted hue.
      if (image.data[i + 3] > 245 && Math.max(image.data[i], image.data[i + 1], image.data[i + 2]) < 80) { dark++; columnDark++; }
      area++;
    }
    if (columnDark >= 5) coveredColumns++;
  }
  return { dark, area, fraction: dark / area, coveredColumns, region };
}
function response(a, b, mask) {
  const region = ringRegion(a); let changed = 0;
  for (let y = region.top; y < region.bottom; y++) for (let x = region.left; x < region.right; x++) {
    const i = (y * a.width + x) * 4;
    if(mask.data[i+3]<10)continue;
    if (Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2])) > 15) changed++;
  }
  return changed;
}
(async () => {
  let browser; const errors = [], failures = [], report = {};
  try {
    await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
    browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForFunction(() => window.ready, {}, { timeout: 45000 });
    const captures = {};
    for (const [name, options] of Object.entries({
      upright: { matte: true }, sideways: { matte: true, roll: Math.PI / 2 },
      ringMask: { transparent: true, ringOnly: true },
      capBlue: { matte: true, capColor: '#1844ff' },
      liquidRed: { matte: true, liquidColor: '#ee4422' },
      transparent: { transparent: true },
    })) {
      const value = await page.evaluate(o => window.debug.experiment(o), { id: 'pet-350-juice', above: true, ...options });
      fs.writeFileSync(path.join(__dirname, `clear-pet-${name}.png`), pngBytes(value.png));
      captures[name] = await pixels(value.png, options.roll);
      report[name] = { glError: value.glError, alpha: value.alpha, materials: value.materials };
      if (value.glError) failures.push(`${name}: WebGL ${value.glError}`);
      if (value.materials.some(m => m.metalness !== 0)) failures.push(`${name}: clear PET gained metallic response`);
      if (name === 'upright' || name === 'sideways') {
        report[name].darkCoverage = darkCoverage(captures[name]);
        const coverage = report[name].darkCoverage;
        // Narrow real reflection contours are allowed. A dark replacement
        // covering several percent of the collar crop and most columns is not.
        if (coverage.fraction > .02 && coverage.coveredColumns > (coverage.region.right - coverage.region.left) * .5)
          failures.push(`${name}: broad opaque black collar (${coverage.dark} pixels, ${(coverage.fraction * 100).toFixed(2)}% of crop)`);
      }
      console.log(name, report[name].darkCoverage || value.alpha);
    }
    report.capResponsePixels = response(captures.upright, captures.capBlue, captures.ringMask);
    report.liquidResponsePixels = response(captures.upright, captures.liquidRed, captures.ringMask);
    if (report.capResponsePixels < 200) failures.push('Ring no longer responds to the adjacent cap finish');
    if (report.liquidResponsePixels < 200) failures.push('Ring no longer transmits changing liquid radiance');
    if (report.transparent.alpha.clear < 10000 || report.transparent.alpha.partial < 100)
      failures.push('Transparent output lost clear canvas or optical partial coverage');
    if (errors.length) failures.push(...errors);
    fs.writeFileSync(path.join(__dirname, 'clear-pet-report.json'), JSON.stringify({ report, errors, failures }, null, 2));
    console.log({ capResponsePixels: report.capResponsePixels, liquidResponsePixels: report.liquidResponsePixels, failures });
    if (failures.length) throw new Error(failures.join('\n'));
  } finally { await browser?.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

