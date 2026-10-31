const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const filename = path.resolve(__dirname, '../../lib/labellab/desktop-viewport.ts');
const loaded = new Module(filename, module);
loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, filename);
const { fitDesktopViewport, fitStudioWorkspace } = loaded.exports;

test('desktop and laptop use one uniform scale and fill both viewport edges', () => {
  for (const [width, height] of [[1920,1080], [1366,768], [1440,900], [1108,552], [1024,768], [2560,1440]]) {
    const fit = fitDesktopViewport(width, height);
    assert.equal(fit.desktop, true);
    assert.ok(fit.width >= 1920 - 1e-8);
    assert.ok(fit.height >= 1080 - 1e-8);
    assert.ok(Math.abs(fit.width * fit.scale - width) < 1e-8);
    assert.ok(Math.abs(fit.height * fit.scale - height) < 1e-8);
    assert.ok(Math.abs(fit.width / fit.height - width / height) < 1e-8);
  }
  assert.equal(fitDesktopViewport(1920,1080).scale, 1);
  assert.equal(fitDesktopViewport(2560,1440).scale, 4 / 3);
});

test('mobile switches composition without shrinking its touch controls', () => {
  for (const [width, height] of [[390,844], [844,390], [860,900]]) {
    assert.deepEqual(fitDesktopViewport(width, height), { desktop:false, scale:1, width, height });
  }
  assert.equal(fitDesktopViewport(861,900).desktop, true);
});

test('unmeasurable viewports are ignored rather than generating invalid CSS', () => {
  for (const [width, height] of [[0,720], [1280,0], [-1,720], [NaN,720], [1280,Infinity]]) {
    assert.equal(fitDesktopViewport(width, height), null);
  }
});

test('Studio restores the old 278px panel and 68px rail at the supplied PC size', () => {
  const page = fitDesktopViewport(1920, 960);
  const workspace = fitStudioWorkspace(1920, 960);
  const totalScale = page.scale * workspace.relativeScale;
  assert.equal(page.scale, 8 / 9); // Home and both shared headers stay unchanged.
  assert.equal(278 * totalScale, 278);
  assert.equal(68 * totalScale, 68);
  assert.equal(workspace.width * totalScale, 1920);
  assert.ok(Math.abs(workspace.height * totalScale + 64 * page.scale - 960) < 1e-8);
  assert.equal(fitStudioWorkspace(1920, 1080).relativeScale, 1);
});

test('the entire Studio workspace scales together beneath the unchanged header', () => {
  for (const [width, height] of [[1366,768], [1440,900], [1108,552], [1920,960], [2560,1280]]) {
    const page = fitDesktopViewport(width, height);
    const workspace = fitStudioWorkspace(width, height);
    const scale = page.scale * workspace.relativeScale;
    assert.ok(workspace.width >= 1920 - 1e-8);
    assert.ok(workspace.height >= 896 - 1e-8);
    assert.ok(Math.abs(workspace.width * scale - width) < 1e-8);
    assert.ok(Math.abs(workspace.height * scale + 64 * page.scale - height) < 1e-8);
  }
  assert.equal(fitStudioWorkspace(390,844).relativeScale, 1);
  assert.equal(fitStudioWorkspace(0,960), null);
});
