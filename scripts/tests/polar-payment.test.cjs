const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '../..');

function createLoader(overrides = {}) {
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const loaded = new Module(filename, module);
    loaded.filename = filename;
    loaded.paths = module.paths;
    cache.set(filename, loaded);
    loaded.require = (specifier) => {
      if (Object.prototype.hasOwnProperty.call(overrides, specifier)) return overrides[specifier];
      if (specifier.startsWith('@/')) return load(path.resolve(ROOT, `${specifier.slice(2)}.ts`));
      if (specifier.startsWith('.')) return load(path.resolve(path.dirname(filename), `${specifier}.ts`));
      return require(specifier);
    };
    const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    loaded._compile(out, filename);
    return loaded.exports;
  }
  return load;
}

function createPolarMockDb(initialOrders = [], initialBalance = 0) {
  const orders = new Map(initialOrders.map((row) => [row.order_code, { ...row }]));
  const events = new Map();
  const wallets = new Map();
  const ledger = new Map();
  let lastChanges = 0;
  if (initialOrders[0]) wallets.set(initialOrders[0].user_id, { user_id: initialOrders[0].user_id, balance: initialBalance });

  const exec = (sql, params) => {
    const q = sql.replace(/\s+/g, ' ').trim();
    if (q.startsWith('SELECT id,user_id AS userId,order_code AS orderCode')) {
      let row = null;
      if (q.includes('WHERE order_code=?')) row = orders.get(params[0]) ?? null;
      else if (q.includes('WHERE id=?')) row = [...orders.values()].find((r) => r.id === params[0]) ?? null;
      else if (q.includes('WHERE provider_order_id=?')) row = [...orders.values()].find((r) => r.provider_order_id === params[0]) ?? null;
      return {
        first: row ? {
          id: row.id, userId: row.user_id, orderCode: row.order_code, coins: row.package_coins,
          amount: row.amount_minor, currency: row.currency, status: row.status, expiresAt: row.expires_at,
        } : null,
      };
    }
    if (q.startsWith('INSERT INTO payment_events')) {
      const key = `${params[1]}:${params[2]}`;
      if (events.has(key)) throw new Error('UNIQUE constraint failed');
      events.set(key, { status: params[6], rawHash: params[4] });
      return { meta: { changes: 1 } };
    }
    if (q.startsWith('SELECT processing_status AS status,raw_payload_hash AS rawHash FROM payment_events')) {
      const row = events.get(`polar:${params[0]}`);
      return { first: row ? { status: row.status, rawHash: row.rawHash } : null };
    }
    if (q.startsWith('UPDATE payment_events SET processing_status=')) {
      const m = q.match(/processing_status='([^']+)'/);
      const row = events.get(`polar:${params[0]}`);
      if (row && m) row.status = m[1];
      return { meta: { changes: row ? 1 : 0 } };
    }
    if (q.startsWith("UPDATE payment_orders SET status='paid'")) {
      const [providerOrderId, updatedAt, orderId] = params;
      const row = [...orders.values()].find((r) => r.id === orderId);
      if (row && (row.status === 'pending' || row.status === 'expired')) {
        row.status = 'paid';
        row.provider_order_id = providerOrderId;
        row.updated_at = updatedAt;
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 0 } };
    }
    if (q.startsWith("UPDATE payment_orders SET status='refunded'")) {
      const row = [...orders.values()].find((r) => r.id === params[1]);
      if (row) row.status = 'refunded';
      return { meta: { changes: row ? 1 : 0 } };
    }
    if (q.startsWith('SELECT id,user_id AS userId,amount,kind,reference,balance,created_at AS createdAt FROM coin_ledger')) {
      return { first: ledger.get(params[0]) ?? null };
    }
    if (q.startsWith('SELECT balance FROM wallets WHERE user_id=?')) {
      const row = wallets.get(params[0]);
      return { first: row ? { balance: row.balance } : null };
    }
    if (q.startsWith('INSERT INTO wallets')) {
      if (!wallets.has(params[0])) { wallets.set(params[0], { user_id: params[0], balance: params[1] }); lastChanges = 1; }
      else lastChanges = 0;
      return { meta: { changes: lastChanges } };
    }
    if (q.startsWith('UPDATE wallets SET balance=balance+?')) {
      const [delta, , userId, expected] = params;
      const row = wallets.get(userId);
      if (row && row.balance === expected && row.balance + delta >= 0) { row.balance += delta; lastChanges = 1; }
      else lastChanges = 0;
      return { meta: { changes: lastChanges } };
    }
    if (q.startsWith('INSERT INTO coin_ledger')) {
      if (lastChanges !== 1) return { meta: { changes: 0 } };
      ledger.set(params[5], { id: params[0], userId: params[1], amount: params[2], kind: params[3], reference: params[4], balance: params[6], createdAt: params[8] });
      return { meta: { changes: 1 } };
    }
    throw new Error(`Unhandled mock SQL: ${q}`);
  };

  const makeStmt = (sql, params = []) => ({
    bind: (...vals) => makeStmt(sql, vals),
    first: async () => exec(sql, params).first ?? null,
    all: async () => ({ success: true, results: [] }),
    run: async () => ({ success: true, meta: exec(sql, params).meta ?? { changes: 0 } }),
    _exec: () => exec(sql, params),
  });
  return {
    orders, events, wallets, ledger,
    db: {
      prepare: (sql) => makeStmt(sql),
      batch: async (stmts) => stmts.map((stmt) => ({ success: true, meta: stmt._exec().meta ?? { changes: 0 } })),
    },
  };
}

test('Polar checkout creation uses ad-hoc USD cents pricing and validates HTTPS polar.sh return URL', async () => {
  const load = createLoader();
  const polar = load(path.resolve(ROOT, 'lib/server/polar.ts'));

  assert.equal(polar.readPolarConfig({ POLAR_ACCESS_TOKEN: 'tok' }), null);
  const cfg = polar.readPolarConfig({
    POLAR_ENV: 'sandbox',
    POLAR_ACCESS_TOKEN: 'polar_oat_test',
    POLAR_WEBHOOK_SECRET: 'polar_whs_testsecret123',
    POLAR_PRODUCT_ID: 'prod_123',
    SEPAY_PUBLIC_URL: 'https://www.labellab3d.workers.dev',
  });
  assert.ok(cfg);
  assert.equal(polar.polarApiBase(cfg.environment), 'https://sandbox-api.polar.sh');

  let captured = null;
  const session = await polar.createPolarCheckoutSession(cfg, {
    orderId: 'pay_1',
    orderCode: 'LLPOLAR0001234',
    coins: 45,
    amountCents: 200,
    customerId: 'usr_1',
    customerEmail: 'buyer@example.com',
    embedOrigin: 'https://www.labellab3d.workers.dev',
    successUrl: 'https://www.labellab3d.workers.dev/payment/polar/success?id=pay_1',
    returnUrl: 'https://www.labellab3d.workers.dev/',
  }, async (url, init) => {
    captured = { url, init };
    return new Response(JSON.stringify({ id: 'chk_abc', url: 'https://sandbox.polar.sh/checkout/chk_abc' }), { status: 201 });
  });

  assert.equal(session.checkoutId, 'chk_abc');
  assert.equal(captured.url, 'https://sandbox-api.polar.sh/v1/checkouts/');
  const sentBody = JSON.parse(captured.init.body);
  assert.deepEqual(sentBody.products, ['prod_123']);
  assert.equal(sentBody.prices.prod_123[0].price_amount, 200);
  assert.equal(sentBody.prices.prod_123[0].price_currency, 'usd');
  assert.equal(sentBody.embed_origin, 'https://www.labellab3d.workers.dev');
  assert.equal(sentBody.metadata.order_code, 'LLPOLAR0001234');
});

test('Polar webhook verifies Standard Webhooks HMAC, handles MoR VAT cleanly, credits once, and deduplicates retries', async () => {
  const secret = 'polar_whs_test_secret_key_for_hmac_verification';
  const mock = createPolarMockDb([
    {
      id: 'pay_intl_1',
      user_id: 'usr_intl',
      order_code: 'LLINTL12345678',
      package_coins: 120,
      amount_minor: 500,
      currency: 'USD',
      status: 'pending',
      provider_order_id: 'chk_intl_1',
      expires_at: new Date(Date.now() + 20 * 60_000).toISOString(),
    },
  ], 10);

  const runtimeEnv = {
    DB: mock.db,
    POLAR_ENV: 'sandbox',
    POLAR_ACCESS_TOKEN: 'polar_oat_test',
    POLAR_WEBHOOK_SECRET: secret,
    POLAR_PRODUCT_ID: 'prod_123',
    SEPAY_PUBLIC_URL: 'https://www.labellab3d.workers.dev',
  };

  const load = createLoader({
    '@/lib/server/http': {
      env: async () => runtimeEnv,
      json: (data, init) => Response.json(data, init),
    },
  });
  const { POST } = load(path.resolve(ROOT, 'app/api/payments/webhook/polar/route.ts'));

  const signPolar = (id, tsSec, body, signingSecret = secret) => {
    const hmac = crypto.createHmac('sha256', Buffer.from(signingSecret, 'utf8')).update(`${id}.${tsSec}.${body}`).digest('base64');
    return `v1,${hmac}`;
  };

  const nowSec = Math.floor(Date.now() / 1000);
  // Customer paid $5.00 + $1.00 EU VAT = $6.00 total -> pre-tax subtotal_amount is 500 cents.
  const paidPayload = JSON.stringify({
    type: 'order.paid',
    data: {
      id: 'ord_polar_999',
      checkout_id: 'chk_intl_1',
      currency: 'usd',
      subtotal_amount: 500,
      tax_amount: 100,
      total_amount: 600,
      metadata: { order_code: 'LLINTL12345678', order_id: 'pay_intl_1' },
    },
  });

  // 1. Invalid signature -> 401.
  const badSig = await POST(new Request('https://www.labellab3d.workers.dev/api/payments/webhook/polar', {
    method: 'POST',
    headers: { 'webhook-id': 'msg_1', 'webhook-timestamp': String(nowSec), 'webhook-signature': 'v1,invalid' },
    body: paidPayload,
  }));
  assert.equal(badSig.status, 401);
  assert.equal(mock.wallets.get('usr_intl').balance, 10);

  // 2. Stale timestamp (>5 min) -> 401.
  const staleTs = nowSec - 600;
  const staleRes = await POST(new Request('https://www.labellab3d.workers.dev/api/payments/webhook/polar', {
    method: 'POST',
    headers: { 'webhook-id': 'msg_2', 'webhook-timestamp': String(staleTs), 'webhook-signature': signPolar('msg_2', staleTs, paidPayload) },
    body: paidPayload,
  }));
  assert.equal(staleRes.status, 401);

  // 3. Valid order.paid with EU VAT credits 120 coins once.
  const okRes = await POST(new Request('https://www.labellab3d.workers.dev/api/payments/webhook/polar', {
    method: 'POST',
    headers: { 'webhook-id': 'msg_ok', 'webhook-timestamp': String(nowSec), 'webhook-signature': signPolar('msg_ok', nowSec, paidPayload) },
    body: paidPayload,
  }));
  assert.equal(okRes.status, 202);
  assert.equal(mock.wallets.get('usr_intl').balance, 130);
  assert.equal(mock.orders.get('LLINTL12345678').status, 'paid');
  assert.equal(mock.orders.get('LLINTL12345678').provider_order_id, 'ord_polar_999');

  // 4. Replay with same webhook-id deduplicates cleanly without double credit.
  const dupRes = await POST(new Request('https://www.labellab3d.workers.dev/api/payments/webhook/polar', {
    method: 'POST',
    headers: { 'webhook-id': 'msg_ok', 'webhook-timestamp': String(nowSec), 'webhook-signature': signPolar('msg_ok', nowSec, paidPayload) },
    body: paidPayload,
  }));
  assert.equal(dupRes.status, 202);
  assert.equal(mock.wallets.get('usr_intl').balance, 130);
});
