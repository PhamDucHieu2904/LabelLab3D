const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '../..');

function createLoader(overrides = {}) {
  const cache = new Map();
  function load(filename) {
    const resolved = [filename, `${filename}.ts`, `${filename}.json`].find(
      (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
    );
    if (!resolved) throw new Error(`Cannot resolve ${filename}`);
    if (resolved.endsWith('.json')) return require(resolved);
    if (cache.has(resolved)) return cache.get(resolved).exports;
    const loaded = new Module(resolved, module);
    loaded.filename = resolved;
    loaded.paths = module.paths;
    cache.set(resolved, loaded);
    loaded.require = (specifier) => {
      if (Object.prototype.hasOwnProperty.call(overrides, specifier)) return overrides[specifier];
      if (specifier.startsWith('@/')) return load(path.resolve(ROOT, specifier.slice(2)));
      if (specifier.startsWith('.')) return load(path.resolve(path.dirname(resolved), specifier));
      return require(specifier);
    };
    const out = ts.transpileModule(fs.readFileSync(resolved, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText;
    loaded._compile(out, resolved);
    return loaded.exports;
  }
  return load;
}

test('normalizeUiLocale accepts only vi/en variants and rejects unsupported languages', () => {
  const load = createLoader();
  const localeMod = load(path.resolve(ROOT, 'lib/i18n/locale.ts'));

  assert.equal(localeMod.normalizeUiLocale('vi'), 'vi');
  assert.equal(localeMod.normalizeUiLocale('VI-VN'), 'vi');
  assert.equal(localeMod.normalizeUiLocale('en'), 'en');
  assert.equal(localeMod.normalizeUiLocale(' en-US '), 'en');
  assert.equal(localeMod.normalizeUiLocale('fr'), null);
  assert.equal(localeMod.normalizeUiLocale('ja'), null);
  assert.equal(localeMod.normalizeUiLocale(''), null);
  assert.equal(localeMod.normalizeUiLocale(null), null);
});

test('resolveInitialLocale prioritizes query > cookie > Geo-IP country header', () => {
  const load = createLoader();
  const localeMod = load(path.resolve(ROOT, 'lib/i18n/locale.ts'));

  // Geo-IP defaults
  assert.equal(localeMod.resolveInitialLocale({ countryHeader: 'VN' }), 'vi');
  assert.equal(localeMod.resolveInitialLocale({ countryHeader: '' }), 'vi');
  assert.equal(localeMod.resolveInitialLocale({ countryHeader: null }), 'vi');
  assert.equal(localeMod.resolveInitialLocale({ countryHeader: 'US' }), 'en');
  assert.equal(localeMod.resolveInitialLocale({ countryHeader: 'SG' }), 'en');
  assert.equal(localeMod.resolveInitialLocale({ countryHeader: 'DE' }), 'en');

  // Manual cookie overrides Geo-IP
  assert.equal(localeMod.resolveInitialLocale({ cookieLocale: 'en', countryHeader: 'VN' }), 'en');
  assert.equal(localeMod.resolveInitialLocale({ cookieLocale: 'vi', countryHeader: 'US' }), 'vi');

  // Explicit query parameter overrides both cookie and Geo-IP
  assert.equal(localeMod.resolveInitialLocale({ queryLang: 'vi', cookieLocale: 'en', countryHeader: 'US' }), 'vi');
  assert.equal(localeMod.resolveInitialLocale({ queryLang: 'en', cookieLocale: 'vi', countryHeader: 'VN' }), 'en');

  // Invalid values gracefully fall back
  assert.equal(localeMod.resolveInitialLocale({ queryLang: 'de', cookieLocale: 'fr', countryHeader: 'JP' }), 'en');
  assert.equal(localeMod.resolveInitialLocale({ queryLang: 'de', cookieLocale: 'fr', countryHeader: 'VN' }), 'vi');
});

test('UI language selection stays strictly independent from Geo-IP payment currency lock', () => {
  const load = createLoader();
  const localeMod = load(path.resolve(ROOT, 'lib/i18n/locale.ts'));
  const policies = load(path.resolve(ROOT, 'lib/legal/policies.ts'));

  // Visitor in Vietnam switching UI to English still pays in VND only
  const vnEnLocale = localeMod.resolveInitialLocale({ cookieLocale: 'en', countryHeader: 'VN' });
  const vnMarket = policies.resolveMarketAccess('VN', false);
  assert.equal(vnEnLocale, 'en');
  assert.equal(vnMarket.region, 'vietnam');
  assert.equal(vnMarket.allowVietnamCheckout, true);
  assert.equal(vnMarket.allowInternationalCheckout, false);

  // Visitor outside Vietnam switching UI to Vietnamese still pays in USD only
  const usViLocale = localeMod.resolveInitialLocale({ cookieLocale: 'vi', countryHeader: 'US' });
  const usMarket = policies.resolveMarketAccess('US', false);
  assert.equal(usViLocale, 'vi');
  assert.equal(usMarket.region, 'international');
  assert.equal(usMarket.allowVietnamCheckout, false);
  assert.equal(usMarket.allowInternationalCheckout, true);
});

test('UI_MESSAGES maintains full VI and EN key parity with non-empty values', () => {
  const load = createLoader();
  const messagesMod = load(path.resolve(ROOT, 'lib/i18n/messages.ts'));
  const vi = messagesMod.UI_MESSAGES.vi;
  const en = messagesMod.UI_MESSAGES.en;

  function assertParity(left, right, keyPath) {
    assert.equal(typeof left, typeof right, `Type mismatch at ${keyPath}`);
    if (Array.isArray(left)) {
      assert.ok(Array.isArray(right), `Expected array at ${keyPath}`);
      assert.equal(left.length, right.length, `Array length mismatch at ${keyPath}`);
      assert.ok(left.length > 0, `Empty array at ${keyPath}`);
      return;
    }
    if (typeof left === 'string') {
      assert.ok(left.trim().length > 0, `Empty vi string at ${keyPath}`);
      assert.ok(right.trim().length > 0, `Empty en string at ${keyPath}`);
      return;
    }
    if (typeof left === 'function') {
      assert.equal(typeof right, 'function', `Expected function at ${keyPath}`);
      assert.equal(left.length, right.length, `Arity mismatch at ${keyPath}`);
      return;
    }
    if (left && typeof left === 'object') {
      const leftKeys = Object.keys(left).sort();
      const rightKeys = Object.keys(right).sort();
      assert.deepEqual(leftKeys, rightKeys, `Key mismatch at ${keyPath}`);
      for (const key of leftKeys) {
        assertParity(left[key], right[key], `${keyPath}.${key}`);
      }
    }
  }

  assertParity(vi, en, 'UI_MESSAGES');

  // Spot-check template functions in both locales
  for (const loc of ['vi', 'en']) {
    const m = messagesMod.getUiMessages(loc);
    assert.ok(m.home.showModelDemo('Bottle').includes('Bottle'));
    assert.ok(m.home.checkinStreakDesc(5).includes('5'));
    assert.ok(m.pricing.checkoutTitle('1,850').includes('1,850'));
    assert.ok(m.pricing.badgePopular(10).includes('10%'));
    assert.ok(m.auth.resendIn(30).includes('30'));
    assert.ok(m.profile.minutesAgo(12).includes('12'));
    assert.ok(m.footer.ownerSummaryNamed('Nguyen Van A', '079****123').includes('Nguyen Van A'));
    assert.ok(m.paymentResult.sepayCredited(330).includes('330'));
    assert.ok(m.studio.projectsModal.countSummary(2, 5).includes('2'));
    assert.ok(m.studio.projectsModal.cloudQuota(3, 30).includes('3/30'));
    assert.ok(m.studio.projectsModal.extendBtn(30, 10).includes('10'));
    assert.ok(m.studio.saveDialog.autoRenewCheckbox(10).includes('10'));
    assert.ok(m.studio.shareDialog.createLinkPaid(10).includes('10'));
    assert.ok(m.studio.render.renderingPct(75).includes('75%'));
    assert.ok(m.studio.viewport.viewLabel(2).includes('2'));
  }
});
