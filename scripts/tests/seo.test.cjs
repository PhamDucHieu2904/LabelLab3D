const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const sharp = require('sharp');

const root = path.resolve(__dirname, '../..');
const modules = new Map();

function loadSource(filename) {
  const resolved = [filename, `${filename}.ts`, `${filename}.json`].find(
    (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
  );
  if (!resolved) throw new Error(`Cannot resolve ${filename}`);
  if (resolved.endsWith('.json')) return require(resolved);
  if (modules.has(resolved)) return modules.get(resolved).exports;
  const loaded = new Module(resolved, module);
  loaded.filename = resolved;
  loaded.paths = module.paths;
  modules.set(resolved, loaded);
  const nativeRequire = loaded.require.bind(loaded);
  loaded.require = (request) => {
    if (request.startsWith('@/')) return loadSource(path.join(root, request.slice(2)));
    if (request.startsWith('.')) return loadSource(path.resolve(path.dirname(resolved), request));
    return nativeRequire(request);
  };
  loaded._compile(
    ts.transpileModule(fs.readFileSync(resolved, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText,
    resolved,
  );
  return loaded.exports;
}

const seo = loadSource(path.join(root, 'lib/seo/site'));
const robotsMod = loadSource(path.join(root, 'app/robots'));
const sitemapMod = loadSource(path.join(root, 'app/sitemap'));
const manifestMod = loadSource(path.join(root, 'app/manifest'));
const botShield = loadSource(path.join(root, 'lib/server/bot-shield'));

test('SEO raster assets (favicons, apple-touch-icon, OG 1200x630 banner) exist with exact dimensions', async () => {
  const expectations = [
    ['public/branding/icon-48.png', 48, 48, 'png'],
    ['public/branding/icon-192.png', 192, 192, 'png'],
    ['public/branding/icon-512.png', 512, 512, 'png'],
    ['public/branding/apple-touch-icon.png', 180, 180, 'png'],
    ['public/branding/og-hypermockup.jpg', 1200, 630, 'jpeg'],
  ];

  for (const [relPath, width, height, format] of expectations) {
    const absPath = path.join(root, relPath);
    assert.ok(fs.existsSync(absPath), `Missing ${relPath}`);
    const meta = await sharp(absPath).metadata();
    assert.equal(meta.width, width, `${relPath} width`);
    assert.equal(meta.height, height, `${relPath} height`);
    assert.equal(meta.format, format, `${relPath} format`);
  }
});

test('robots.ts allows public pages including /studio, blocks private routes and AI scrapers', () => {
  const config = robotsMod.default();
  assert.equal(config.sitemap, 'https://hypermockup.com/sitemap.xml');
  assert.equal(config.host, 'https://hypermockup.com');

  const rules = Array.isArray(config.rules) ? config.rules : [config.rules];
  const wildcard = rules.find((rule) => rule.userAgent === '*');
  assert.ok(wildcard, 'wildcard rule exists');

  const allowList = Array.isArray(wildcard.allow) ? wildcard.allow : [wildcard.allow];
  const disallowList = Array.isArray(wildcard.disallow) ? wildcard.disallow : [wildcard.disallow];
  assert.ok(allowList.includes('/'), 'root allowed');
  assert.ok(allowList.includes('/studio'), '/studio allowed');
  assert.ok(!disallowList.includes('/studio'), '/studio not disallowed');
  for (const blocked of ['/admin', '/api/', '/payment/', '/s/']) {
    assert.ok(disallowList.includes(blocked), `${blocked} disallowed`);
  }

  const gptRule = rules.find((rule) => rule.userAgent === 'GPTBot');
  assert.ok(gptRule && gptRule.disallow === '/', 'GPTBot blocked');
});

test('sitemap.ts lists all indexable pages with canonical https://hypermockup.com URLs and bilingual alternates', () => {
  const entries = sitemapMod.default();
  const urls = entries.map((entry) => entry.url);

  for (const expected of [
    'https://hypermockup.com',
    'https://hypermockup.com/studio',
    'https://hypermockup.com/about',
    'https://hypermockup.com/contact',
    'https://hypermockup.com/legal/terms',
    'https://hypermockup.com/legal/privacy',
    'https://hypermockup.com/legal/refund',
    'https://hypermockup.com/legal/complaints',
  ]) {
    assert.ok(urls.includes(expected), `sitemap includes ${expected}`);
  }

  assert.ok(!urls.some((u) => u.includes('/admin') || u.includes('/payment') || u.includes('/s/')));

  const aboutEntry = entries.find((entry) => entry.url === 'https://hypermockup.com/about');
  assert.equal(aboutEntry?.alternates?.languages?.vi, 'https://hypermockup.com/about?lang=vi');
  assert.equal(aboutEntry?.alternates?.languages?.en, 'https://hypermockup.com/about?lang=en');
});

test('manifest.ts emits valid Web App Manifest with 192 and 512 PNG icons', () => {
  const manifest = manifestMod.default();
  assert.equal(manifest.short_name, 'HyperMockup');
  assert.equal(manifest.start_url, '/');
  assert.ok(Array.isArray(manifest.icons));
  assert.ok(manifest.icons.some((icon) => icon.src === '/branding/icon-192.png' && icon.sizes === '192x192'));
  assert.ok(manifest.icons.some((icon) => icon.src === '/branding/icon-512.png' && icon.sizes === '512x512'));
});

test('Root metadata, bilingual page metadata, and JSON-LD builders emit valid SEO structures', () => {
  const prevVerify = process.env.GOOGLE_SITE_VERIFICATION;
  process.env.GOOGLE_SITE_VERIFICATION = 'test-gsc-token-123';
  try {
    const viMeta = seo.buildRootMetadata('vi');
    assert.equal(viMeta.metadataBase?.toString(), 'https://hypermockup.com/');
    assert.equal(viMeta.openGraph?.images?.[0]?.url, '/branding/og-hypermockup.jpg');
    assert.equal(viMeta.openGraph?.images?.[0]?.width, 1200);
    assert.equal(viMeta.openGraph?.images?.[0]?.height, 630);
    assert.equal(viMeta.twitter?.card, 'summary_large_image');
    assert.equal(viMeta.verification?.google, 'test-gsc-token-123');

    const enMeta = seo.buildRootMetadata('en');
    assert.equal(enMeta.openGraph?.locale, 'en_US');
    assert.ok(String(enMeta.description).includes('3D packaging mockups'));
  } finally {
    if (prevVerify === undefined) delete process.env.GOOGLE_SITE_VERIFICATION;
    else process.env.GOOGLE_SITE_VERIFICATION = prevVerify;
  }

  const aboutVi = seo.buildPageMetadata({
    title: 'Giới thiệu',
    description: 'Mô tả',
    path: '/about',
    locale: 'vi',
    explicitLang: 'vi',
    includeHreflang: true,
  });
  assert.equal(aboutVi.alternates?.canonical, '/about?lang=vi');
  assert.equal(aboutVi.alternates?.languages?.en, '/about?lang=en');
  assert.equal(aboutVi.alternates?.languages?.['x-default'], '/about');

  const graph = seo.buildRootJsonLd('vi');
  assert.equal(graph['@context'], 'https://schema.org');
  const types = graph['@graph'].map((item) => item['@type']);
  assert.deepEqual(types, ['Organization', 'WebSite', 'SoftwareApplication']);

  const faqSchema = seo.buildFaqJsonLd([{ q: 'Q1?', a: 'A1.' }]);
  assert.equal(faqSchema['@type'], 'FAQPage');
  assert.equal(faqSchema.mainEntity.length, 1);

  const safeJson = seo.serializeJsonLd({ text: '</script><script>alert(1)</script>' });
  assert.ok(!safeJson.includes('</script>'), 'JSON-LD escapes angle brackets');
});

test('Bot Shield allows Googlebot and social link previews on /studio and /manifest.webmanifest while blocking private routes', () => {
  botShield.resetBotShieldStateForTests();
  const googleUA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
  const fbUA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';

  for (const publicPath of ['/', '/studio', '/about', '/contact', '/legal/terms', '/manifest.webmanifest']) {
    const g = botShield.evaluateIncomingRequest({ pathname: publicPath, method: 'GET', userAgent: googleUA, ip: '66.249.66.1' });
    assert.equal(g.allowed, true, `Googlebot allowed on ${publicPath}`);

    const f = botShield.evaluateIncomingRequest({ pathname: publicPath, method: 'GET', userAgent: fbUA, ip: '173.252.87.10' });
    assert.equal(f.allowed, true, `Facebook preview allowed on ${publicPath}`);
  }

  for (const privatePath of ['/admin', '/api/account/me', '/s/QNb8a9setnGaI1c4']) {
    const g = botShield.evaluateIncomingRequest({ pathname: privatePath, method: 'GET', userAgent: googleUA, ip: '66.249.66.1' });
    assert.equal(g.allowed, false, `Googlebot blocked on ${privatePath}`);
    assert.equal(g.status, 403);
  }

  const gptStudio = botShield.evaluateIncomingRequest({
    pathname: '/studio',
    method: 'GET',
    userAgent: 'GPTBot/1.0',
    ip: '203.0.113.55',
  });
  assert.equal(gptStudio.allowed, false);
  assert.equal(gptStudio.status, 403);
});
