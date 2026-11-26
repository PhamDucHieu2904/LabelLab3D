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

test('resolveMarketAccess enforces Vietnam FX rules (VND only in VN, USD outside VN, preview toggle for Admin)', () => {
  const load = createLoader();
  const policies = load(path.resolve(ROOT, 'lib/legal/policies.ts'));

  const vnVisitor = policies.resolveMarketAccess('VN', false);
  assert.equal(vnVisitor.country, 'VN');
  assert.equal(vnVisitor.region, 'vietnam');
  assert.equal(vnVisitor.allowVietnamCheckout, true);
  assert.equal(vnVisitor.allowInternationalCheckout, false);
  assert.equal(vnVisitor.allowRegionSwitch, false);

  const unknownVisitor = policies.resolveMarketAccess(null, false);
  assert.equal(unknownVisitor.region, 'vietnam');
  assert.equal(unknownVisitor.allowInternationalCheckout, false);

  const usVisitor = policies.resolveMarketAccess('US', false);
  assert.equal(usVisitor.country, 'US');
  assert.equal(usVisitor.region, 'international');
  assert.equal(usVisitor.allowVietnamCheckout, false);
  assert.equal(usVisitor.allowInternationalCheckout, true);
  assert.equal(usVisitor.allowRegionSwitch, false);

  const adminInVn = policies.resolveMarketAccess('VN', true);
  assert.equal(adminInVn.allowRegionSwitch, true);
  assert.equal(adminInVn.allowInternationalCheckout, true);
  assert.equal(adminInVn.allowVietnamCheckout, true);
});

test('MOIT URL validation, legal operator settings sanitization, and order receipt validation', () => {
  const load = createLoader();
  const policies = load(path.resolve(ROOT, 'lib/legal/policies.ts'));
  const siteConfig = load(path.resolve(ROOT, 'lib/server/site-config.ts'));

  assert.equal(policies.isValidMoitUrl('http://online.gov.vn/Home/WebDetails/12345'), true);
  assert.equal(policies.isValidMoitUrl('https://online.gov.vn/Home/WebDetails/12345'), true);
  assert.equal(policies.isValidMoitUrl('https://fake-online.gov.vn.evil.com/x'), false);
  assert.equal(policies.isValidMoitUrl('javascript:alert(1)'), false);

  const sanitized = siteConfig.sanitizeSiteSettings({
    ownerName: '  Nguyễn Văn A  ',
    ownerTaxId: '0123456789-001!',
    ownerPhone: '+84 901 234 567',
    ownerAddress: 'Quận 1, TP. Hồ Chí Minh',
    moitStatusUrl: 'https://evil.example/fake',
    contact: 'hypermockup@gmail.com',
  });
  assert.equal(sanitized.ownerName, 'Nguyễn Văn A');
  assert.equal(sanitized.ownerTaxId, '0123456789-001');
  assert.equal(sanitized.ownerPhone, '+84 901 234 567');
  assert.equal(sanitized.moitStatusUrl, '');

  const withValidMoit = siteConfig.sanitizeSiteSettings({
    moitStatusUrl: 'http://online.gov.vn/Home/WebDetails/99999',
  });
  assert.equal(withValidMoit.moitStatusUrl, 'http://online.gov.vn/Home/WebDetails/99999');

  assert.equal(policies.sanitizeOrderReceipt({}), null);
  assert.equal(policies.sanitizeOrderReceipt({ email: 'not-an-email' }), null);
  assert.deepEqual(
    policies.sanitizeOrderReceipt({
      buyerName: 'Công ty ABC',
      taxCode: '0312345678',
      address: 'TP.HCM',
      email: 'Billing@ABC.vn',
    }),
    { buyerName: 'Công ty ABC', taxCode: '0312345678', address: 'TP.HCM', email: 'billing@abc.vn' },
  );
});

test('buildLegalDocuments produces complete bilingual Vietnamese and English policies for all 4 legal slugs', () => {
  const load = createLoader();
  const policies = load(path.resolve(ROOT, 'lib/legal/policies.ts'));

  const op = {
    siteName: 'HyperMockup',
    domain: 'hypermockup.com',
    contactEmail: 'hypermockup@gmail.com',
    ownerName: 'Nguyễn Minh Quân',
    ownerTaxId: '8123456789',
    ownerAddress: 'TP. Hồ Chí Minh, Việt Nam',
    ownerPhone: '0909123456',
    moitStatusUrl: '',
    retentionDays: 90,
  };

  for (const locale of ['vi', 'en']) {
    const docs = policies.buildLegalDocuments(op, locale);
    for (const slug of policies.LEGAL_SLUGS) {
      assert.ok(docs[slug], `Missing ${slug} for ${locale}`);
      assert.ok(docs[slug].sections.length >= 3, `${slug} (${locale}) should have detailed sections`);
      const fullText = docs[slug].sections.flatMap((s) => s.paragraphs).join(' ');
      assert.ok(fullText.includes('Nguyễn Minh Quân'), `${slug} (${locale}) must inject owner name`);
      assert.ok(fullText.includes('8123456789'), `${slug} (${locale}) must inject personal tax ID`);
    }
  }
});

test('register API rejects requests without explicit legal consent (Law 91/2025/QH15)', async () => {
  const load = createLoader({
    'next/headers': { headers: async () => new Headers({ 'cf-connecting-ip': '1.2.3.4' }) },
    '@/lib/server/http': {
      assertSameOrigin: async () => undefined,
      env: async () => ({}),
      json: (data, init) => Response.json(data, init),
      errorResponse: (err) => Response.json({ error: err instanceof Error ? err.message : 'ERROR' }, { status: 400 }),
      sessionCookie: async () => undefined,
    },
  });
  const { POST } = load(path.resolve(ROOT, 'app/api/account/register/route.ts'));

  const res = await POST(new Request('https://hypermockup.com/api/account/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Test User',
      email: 'user@example.com',
      password: 'Password1234',
      verificationCode: '123456',
      acceptedTerms: false,
      acceptedPrivacy: false,
    }),
  }));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, 'CONSENT_REQUIRED');
});

test('payment orders API blocks non-admin Vietnam visitors from creating international USD Polar orders', async () => {
  const load = createLoader({
    'next/headers': { headers: async () => new Headers({ 'cf-ipcountry': 'VN', 'cf-connecting-ip': '1.2.3.4' }) },
    '@/lib/server/http': {
      assertSameOrigin: async () => undefined,
      sessionUser: async () => ({ id: 'usr_vn', email: 'vn@example.com', name: 'VN User', role: 'user', status: 'active' }),
      env: async () => ({}),
      json: (data, init) => Response.json(data, init),
      errorResponse: (err) => Response.json(
        { error: err instanceof Error ? err.message : 'ERROR' },
        { status: err instanceof Error && err.message === 'REGION_RESTRICTED' ? 403 : 400 },
      ),
    },
  });
  const { POST } = load(path.resolve(ROOT, 'app/api/payments/orders/route.ts'));

  const res = await POST(new Request('https://hypermockup.com/api/payments/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ packageId: 'intl-starter', coins: 620, region: 'international' }),
  }));
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.error, 'REGION_RESTRICTED');
});

test('maskTaxId hides middle digits of personal CCCD/MST by default and extractOperatorInfo enforces masking', () => {
  const load = createLoader();
  const policies = load(path.resolve(ROOT, 'lib/legal/policies.ts'));
  const legal = load(path.resolve(ROOT, 'lib/server/legal.ts'));
  const siteConfig = load(path.resolve(ROOT, 'lib/server/site-config.ts'));

  assert.equal(policies.maskTaxId('079123456789', true), '079•••••6789');
  assert.equal(policies.maskTaxId('079123456789', false), '079123456789');
  assert.equal(policies.maskTaxId('0312345678', true), '031•••••5678');
  assert.equal(policies.maskTaxId('', true), '');

  const settings = siteConfig.sanitizeSiteSettings({
    ownerName: 'Nguyễn Minh Quân',
    ownerTaxId: '079123456789',
  });
  assert.equal(settings.maskOwnerTaxId, true);
  assert.equal(legal.extractOperatorInfo(settings).ownerTaxId, '079•••••6789');

  const unmasked = siteConfig.sanitizeSiteSettings({
    ownerTaxId: '079123456789',
    maskOwnerTaxId: false,
  });
  assert.equal(legal.extractOperatorInfo(unmasked).ownerTaxId, '079123456789');
});

test('computeAnnualTaxSummary combines SePay VND and Polar USD into Vietnam calendar year 1B VND threshold tracker', () => {
  const load = createLoader();
  const policies = load(path.resolve(ROOT, 'lib/legal/policies.ts'));

  const orders = [
    // Paid 2026 VN orders
    { currency: 'VND', amount: 300_000_000, status: 'paid', createdAt: '2026-03-10T10:00:00.000Z' },
    // Paid 2026 Polar USD ($10,000 = 1,000,000 cents -> 255M VND at 25,500)
    { currency: 'USD', amount: 1_000_000, status: 'paid', createdAt: '2026-06-15T12:00:00.000Z' },
    // Ignored: refunded / pending / prior year
    { currency: 'VND', amount: 500_000_000, status: 'refunded', createdAt: '2026-07-01T00:00:00.000Z' },
    { currency: 'VND', amount: 500_000_000, status: 'pending', createdAt: '2026-07-02T00:00:00.000Z' },
    { currency: 'VND', amount: 900_000_000, status: 'paid', createdAt: '2025-12-31T16:59:59.000Z' }, // 23:59:59 VN time in 2025
  ];

  const safe = policies.computeAnnualTaxSummary(orders, { year: 2026, usdToVndRate: 25_500 });
  assert.equal(safe.sepayVnd, 300_000_000);
  assert.equal(safe.polarUsd, 10_000);
  assert.equal(safe.polarVndEstimated, 255_000_000);
  assert.equal(safe.totalEstimatedVnd, 555_000_000);
  assert.equal(safe.remainingToThresholdVnd, 445_000_000);
  assert.equal(safe.percentOfThreshold, 55.5);
  assert.equal(safe.level, 'safe');
  assert.equal(safe.paidOrderCount, 2);

  const warning = policies.computeAnnualTaxSummary(
    [...orders, { currency: 'VND', amount: 300_000_000, status: 'paid', createdAt: '2026-09-01T00:00:00.000Z' }],
    { year: 2026, usdToVndRate: 25_500 },
  );
  assert.equal(warning.totalEstimatedVnd, 855_000_000);
  assert.equal(warning.level, 'warning');

  const exceeded = policies.computeAnnualTaxSummary(
    [...orders, { currency: 'VND', amount: 500_000_000, status: 'paid', createdAt: '2026-10-01T00:00:00.000Z' }],
    { year: 2026, usdToVndRate: 25_500 },
  );
  assert.equal(exceeded.totalEstimatedVnd, 1_055_000_000);
  assert.equal(exceeded.remainingToThresholdVnd, 0);
  assert.equal(exceeded.level, 'exceeded');
});

test('admin legal API loads year summary, merges profile safely, and persists setup/monthly checklists', async () => {
  const savedConfigs = new Map();
  const auditLogs = [];
  const mockOrders = [
    {
      id: 'pay_1', orderCode: 'LL20260001', userId: 'u1', userName: 'An', userEmail: 'an@example.com',
      provider: 'sepay', coins: 1850, amount: 100_000, currency: 'VND', status: 'paid',
      providerOrderId: 'FT123', createdAt: '2026-11-10T08:00:00.000Z',
      receiptBuyerName: 'An', receiptTaxCode: '', receiptAddress: '', receiptEmail: 'an@example.com',
    },
  ];
  const db = {
    prepare: (sql) => {
      let params = [];
      const stmt = {
        bind: (...args) => { params = args; return stmt; },
        first: async () => {
          if (sql.includes('FROM site_config')) {
            const val = savedConfigs.get(params[0]);
            return val ? { valueJson: val } : null;
          }
          if (sql.includes('COUNT(*) AS total FROM legal_consents')) return { total: 4 };
          return null;
        },
        all: async () => ({ success: true, results: sql.includes('FROM payment_orders') ? mockOrders : [] }),
        run: async () => {
          if (sql.includes('INSERT INTO site_config')) savedConfigs.set(params[0], params[1]);
          if (sql.includes('INSERT INTO audit_events')) auditLogs.push(params[2]);
          return { success: true, meta: { changes: 1 } };
        },
      };
      return stmt;
    },
    batch: async () => [],
  };

  const load = createLoader({
    '@/lib/server/admin': {
      requireAdmin: async () => ({ env: { DB: db }, user: { id: 'adm_1', email: 'admin@hypermockup.com', name: 'Admin', role: 'admin', status: 'active' } }),
    },
    '@/lib/server/http': {
      assertSameOrigin: async () => undefined,
      json: (data, init) => Response.json(data, init),
      errorResponse: (err) => Response.json({ error: err instanceof Error ? err.message : 'ERROR' }, { status: 400 }),
    },
  });

  const { GET, PUT } = load(path.resolve(ROOT, 'app/api/admin/legal/route.ts'));

  // Save profile
  const putProfile = await PUT(new Request('https://hypermockup.com/api/admin/legal', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'save_profile',
      profile: {
        ownerName: 'Trần Văn B',
        ownerTaxId: '079098765432',
        maskOwnerTaxId: true,
        ownerAddress: 'TP.HCM',
        ownerPhone: '0909123456',
        contact: 'hypermockup@gmail.com',
        usdToVndRate: 25500,
      },
    }),
  }));
  assert.equal(putProfile.status, 200);

  // Save checklist with invalid step filtered out
  const putChecklist = await PUT(new Request('https://hypermockup.com/api/admin/legal', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'save_checklist',
      checklist: {
        completedSteps: { bank_account: '2026-11-26T00:00:00.000Z', unknown_step: '2026-11-26' },
        monthlyLogs: {
          '2026-11': { sepayStatementSaved: true, csvExported: true, polarSettled: true, note: 'OK', updatedAt: '2026-11-26' },
          'bad-month': { sepayStatementSaved: true },
        },
      },
    }),
  }));
  assert.equal(putChecklist.status, 200);
  const chkBody = await putChecklist.json();
  assert.deepEqual(Object.keys(chkBody.checklist.completedSteps), ['bank_account']);
  assert.deepEqual(Object.keys(chkBody.checklist.monthlyLogs), ['2026-11']);

  // GET returns profile, checklist, taxSummary, and consentCount
  const getRes = await GET(new Request('https://hypermockup.com/api/admin/legal?year=2026'));
  assert.equal(getRes.status, 200);
  const data = await getRes.json();
  assert.equal(data.profile.ownerName, 'Trần Văn B');
  assert.equal(data.profile.maskOwnerTaxId, true);
  assert.equal(data.consentCount, 4);
  assert.equal(data.taxSummary.sepayVnd, 100_000);
  assert.equal(data.taxSummary.level, 'safe');
  assert.ok(auditLogs.includes('admin_legal_profile_update'));
  assert.ok(auditLogs.includes('admin_legal_checklist_update'));
});
