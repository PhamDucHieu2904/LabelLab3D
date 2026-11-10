/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('C:/Users/thietke06.VINUT/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  try {
    await page.goto('http://127.0.0.1:3005/studio?model=can-mango#workspace');
    await page.waitForFunction(() => document.querySelector('.viewer-host')?.dataset.viewerReady === 'true', {}, { timeout: 60000 });
    const properties = page.locator('[data-tool-section="materials"]');
    if (!await properties.isVisible()) await page.getByRole('button', { name: 'Properties', exact: true }).last().click();
    const slider = properties.getByRole('slider', { name: 'Artwork offset slider', exact: true });
    assert.equal(await slider.count(), 1, 'Artwork offset must be available without entering the Label tab');
    for (const viewport of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(350);
      const upload = await properties.getByRole('button', { name: 'Add your artwork', exact: true }).boundingBox();
      const offset = await slider.boundingBox();
      const tabs = await properties.getByRole('group', { name: 'Edit properties for' }).boundingBox();
      await page.screenshot({ path: path.join(__dirname, `layout-${viewport.width}.png`) });
      assert.ok(offset.y >= upload.y + upload.height && offset.y + offset.height <= tabs.y, 'offset belongs between upload and part tabs');
      assert.ok(offset.x >= 0 && offset.x + offset.width <= viewport.width, 'control stays inside viewport');
    }
    await slider.focus();
    await slider.press('Home');
    assert.equal(await slider.inputValue(), '-100');
    await slider.press('End');
    assert.equal(await slider.inputValue(), '100');
    await slider.press('ArrowLeft');
    assert.equal(await slider.inputValue(), '99.9');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('labellab.scene.preferences.v1'))?.preferences.labelOffset === 99.9);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('.viewer-host')?.dataset.viewerReady === 'true', {}, { timeout: 60000 });
    if (!await properties.isVisible()) await page.getByRole('button', { name: 'Properties', exact: true }).last().click();
    assert.equal(await slider.inputValue(), '99.9', 'offset persists on reload');
    await properties.getByRole('button', { name: 'Label', exact: true }).click();
    assert.equal(await slider.count(), 1);
    assert.equal(await properties.getByRole('slider', { name: 'Label position slider', exact: true }).count(), 0);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.getByRole('button', { name: /Scene 2/ }).click();
    await page.getByRole('button', { name: 'View 1', exact: true }).last().click();
    await page.waitForFunction(() => document.querySelector('.viewer-host')?.dataset.cameraPresetState === 'settled', {}, { timeout: 15000 });
    const captures = {};
    for (const value of ['0', '25', '100']) {
      await properties.getByRole('spinbutton', { name: 'Artwork offset', exact: true }).fill(value);
      await slider.focus();
      await page.waitForTimeout(450);
      captures[value] = await page.screenshot({ path: path.join(__dirname, `offset-${value}.png`) });
    }
    const sharp = require('sharp');
    const pixels = {};
    for (const value of ['0', '25', '100']) pixels[value] = await sharp(captures[value]).extract({ left: 420, top: 180, width: 1000, height: 730 }).removeAlpha().raw().toBuffer();
    const changedPixels = (a, b) => {
      let changed = 0;
      for (let i = 0; i < a.length; i += 3) if (Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])) > 8) changed++;
      return changed;
    };
    const moved = changedPixels(pixels['0'], pixels['25']), fullTurn = changedPixels(pixels['0'], pixels['100']);
    console.log({ movedPixels: moved, fullTurnDifference: fullTurn });
    assert.ok(moved > 5000, 'artwork visibly moves on the model');
    assert.ok(fullTurn < 100, 'one full wrap restores the same artwork position without rotating the bottle');
    assert.deepEqual(errors, []);
    console.log('PASS: offset placement at PC/laptop sizes, keyboard sweep, fractional input, persistence, live label movement and full wrap.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
