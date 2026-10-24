const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function loadTs(filename) {
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = module.paths;
  loaded.require = name => name.startsWith('.')
    ? loadTs(path.resolve(path.dirname(filename), `${name}.ts`)) : require(name);
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, filename);
  return loaded.exports;
}
const { mockupCaptureSize, centeredMockupCrop, createMockupTiles, flipMockupPixels,
  createMockupCaptureGate, encodeMockupCanvasPng } = loadTs(path.resolve(__dirname, '../../lib/mockup/capture.ts'));

test('requested export resolutions remain exact, including odd 8129', () => {
  for (const size of [1024, 2048, 4096, 8129]) {
    assert.deepEqual(mockupCaptureSize(size, 1), { width: size, height: size, longEdge: size });
    const portrait = mockupCaptureSize(size, 4 / 5);
    assert.equal(portrait.height, size);
    assert.equal(portrait.width, Math.round(size * 4 / 5));
  }
  for (const size of [0, -1, 8193, NaN, Infinity, 1.5]) assert.throws(() => mockupCaptureSize(size, 1));
  assert.throws(() => mockupCaptureSize(4096, 1, 2048));
  assert.throws(() => mockupCaptureSize(4096, 1, 8192, 4096));
});

test('center crop keeps viewport center and composes tile projections with the same rays', () => {
  for (const [width, height, aspect] of [[1919, 887, 1], [800, 1201, 16 / 9], [1920, 1080, 4 / 5]]) {
    const crop = centeredMockupCrop(width, height, aspect);
    assert.ok(Math.abs(crop.width / crop.height - aspect) < 1e-12);
    assert.equal(crop.x + crop.width / 2, width / 2);
    assert.equal(crop.y + crop.height / 2, height / 2);
    for (const tile of createMockupTiles(8129, 8129)) {
      // A tile's core origin maps to exactly the same preview coordinate as the full output.
      const fromTile = crop.x + ((tile.renderX + tile.cropX) / 8129) * crop.width;
      const fromFull = crop.x + (tile.x / 8129) * crop.width;
      assert.equal(fromTile, fromFull);
    }
  }
  assert.throws(() => centeredMockupCrop(1920, 0, 1));
  assert.throws(() => centeredMockupCrop(1920, 1080, NaN));
});

test('8129 tile cores cover every pixel exactly once and guards stay within GPU bounds', () => {
  for (const [width, height] of [[8129, 8129], [6503, 8129], [4096, 2304], [1, 1]]) {
    const tiles = createMockupTiles(width, height);
    let area = 0;
    const rows = new Map();
    for (const tile of tiles) {
      area += tile.width * tile.height;
      assert.ok(tile.renderWidth <= 1536 && tile.renderHeight <= 1536);
      assert.ok(tile.renderX >= 0 && tile.renderY >= 0);
      assert.ok(tile.renderX + tile.renderWidth <= width);
      assert.ok(tile.renderY + tile.renderHeight <= height);
      assert.equal(tile.renderX + tile.cropX, tile.x);
      assert.equal(tile.renderY + tile.cropY, tile.y);
      assert.ok(tile.cropX + tile.width <= tile.renderWidth);
      assert.ok(tile.cropY + tile.height <= tile.renderHeight);
      assert.equal(tile.cropX, Math.min(64, tile.x));
      assert.equal(tile.cropY, Math.min(64, tile.y));
      if (!rows.has(tile.y)) rows.set(tile.y, []);
      rows.get(tile.y).push(tile);
    }
    assert.equal(area, width * height);
    let nextY = 0;
    for (const [y, row] of rows) {
      assert.equal(y, nextY);
      let nextX = 0;
      for (const tile of row) { assert.equal(tile.x, nextX); nextX += tile.width; }
      assert.equal(nextX, width);
      nextY += row[0].height;
    }
    assert.equal(nextY, height);
  }
  for (const args of [[0, 1], [1, 8193], [1.5, 2], [20, 20, 128, 64], [20, 20, 512, -1]]) {
    assert.throws(() => createMockupTiles(...args));
  }
});

test('WebGL rows flip without changing alpha or mutating source', () => {
  const pixels = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual([...flipMockupPixels(pixels, 1, 2)], [5, 6, 7, 8, 1, 2, 3, 4]);
  assert.deepEqual([...pixels], [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.throws(() => flipMockupPixels(pixels, 2, 2));
});

test('capture gate restores on failure and rejects concurrent capture', async () => {
  const gate = createMockupCaptureGate();
  let finish;
  let restored = false;
  const current = gate.run(() => new Promise(resolve => { finish = resolve; }), () => { restored = true; });
  await assert.rejects(gate.run(async () => 2, () => {}), /already running/);
  finish(1);
  assert.equal(await current, 1);
  assert.equal(restored, true);
  await assert.rejects(gate.run(async () => { throw Error('capture failure'); }, () => {}), /capture failure/);
  assert.equal(gate.busy, false);
});

test('aborted encoder rejects before touching canvas or DOM', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(encodeMockupCanvasPng(null, controller.signal), { name: 'AbortError' });
});
