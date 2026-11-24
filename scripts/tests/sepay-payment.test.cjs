const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '../..');

function createServerLoader(overrides = {}) {
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const loaded = new Module(filename, module);
    loaded.filename = filename;
    loaded.paths = module.paths;
    cache.set(filename, loaded);
    loaded.require = (specifier) => {
      if (Object.prototype.hasOwnProperty.call(overrides, specifier)) return overrides[specifier];
      if (specifier.startsWith('@/')) {
        const resolved = path.resolve(ROOT, `${specifier.slice(2)}.ts`);
        return load(resolved);
      }
      if (specifier.startsWith('.')) {
        const resolved = path.resolve(path.dirname(filename), `${specifier}.ts`);
        return load(resolved);
      }
      return require(specifier);
    };
    const source = fs.readFileSync(filename, 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    loaded._compile(compiled, filename);
    return loaded.exports;
  }
  return load;
}

function createMockPaymentDb(initialOrders = [], initialBalance = 0) {
  const orders = new Map(initialOrders.map((row) => [row.order_code, { ...row }]));
  const events = new Map();
  const wallets = new Map();
  const ledger = new Map();
  let lastChanges = 0;

  if (initialOrders[0]) wallets.set(initialOrders[0].user_id, { user_id: initialOrders[0].user_id, balance: initialBalance });

  const execute = (sql, params) => {
    const q = sql.replace(/\s+/g, ' ').trim();

    if (q.startsWith('SELECT id,user_id AS userId,order_code AS orderCode')) {
      const row = orders.get(params[0]);
      if (!row) return { first: null };
      return {
        first: {
          id: row.id, userId: row.user_id, orderCode: row.order_code, coins: row.package_coins,
          amount: row.amount_minor, currency: row.currency, status: row.status, expiresAt: row.expires_at,
        },
      };
    }

    if (q.startsWith('INSERT INTO payment_events')) {
      const [, provider, providerEventId, orderId, rawHash, sigValid, status, createdAt] = params;
      const key = `${provider}:${providerEventId}`;
      if (events.has(key)) throw new Error('UNIQUE constraint failed: payment_events.provider, payment_events.provider_event_id');
      events.set(key, {
        id: params[0], provider, provider_event_id: providerEventId, order_id: orderId,
        raw_payload_hash: rawHash, signature_valid: sigValid, processing_status: status, created_at: createdAt,
      });
      lastChanges = 1;
      return { meta: { changes: 1 } };
    }

    if (q.startsWith('SELECT processing_status AS status,raw_payload_hash AS rawHash FROM payment_events')) {
      const row = events.get(`${params[0]}:${params[1]}`);
      return { first: row ? { status: row.processing_status, rawHash: row.raw_payload_hash } : null };
    }

    if (q.startsWith('UPDATE payment_events SET processing_status=')) {
      const match = q.match(/processing_status='([^']+)'/);
      const row = events.get(`${params[0]}:${params[1]}`);
      if (row && match) { row.processing_status = match[1]; lastChanges = 1; }
      else lastChanges = 0;
      return { meta: { changes: lastChanges } };
    }

    if (q.startsWith('UPDATE payment_orders SET status=\'paid\'')) {
      const [providerOrderId, updatedAt, orderId] = params;
      const row = [...orders.values()].find((item) => item.id === orderId);
      if (row && (row.status === 'pending' || row.status === 'expired')) {
        row.status = 'paid';
        row.provider_order_id = row.provider_order_id ?? providerOrderId;
        row.updated_at = updatedAt;
        lastChanges = 1;
      } else {
        lastChanges = 0;
      }
      return { meta: { changes: lastChanges } };
    }

    if (q.startsWith('SELECT id,user_id AS userId,amount,kind,reference,balance,created_at AS createdAt FROM coin_ledger WHERE idempotency_key=?')) {
      return { first: ledger.get(params[0]) ?? null };
    }

    if (q.startsWith('SELECT balance FROM wallets WHERE user_id=?')) {
      const row = wallets.get(params[0]);
      return { first: row ? { balance: row.balance } : null };
    }

    if (q.startsWith('INSERT INTO wallets')) {
      if (!wallets.has(params[0])) {
        wallets.set(params[0], { user_id: params[0], balance: params[1] });
        lastChanges = 1;
      } else {
        lastChanges = 0;
      }
      return { meta: { changes: lastChanges } };
    }

    if (q.startsWith('UPDATE wallets SET balance=balance+?')) {
      const [delta, , userId, expectedBalance] = params;
      const row = wallets.get(userId);
      if (row && row.balance === expectedBalance && row.balance + delta >= 0) {
        row.balance += delta;
        lastChanges = 1;
      } else {
        lastChanges = 0;
      }
      return { meta: { changes: lastChanges } };
    }

    if (q.startsWith('INSERT INTO coin_ledger')) {
      if (lastChanges !== 1) return { meta: { changes: 0 } };
      const [id, userId, amount, kind, reference, idempotencyKey, balance, , createdAt] = params;
      if (ledger.has(idempotencyKey)) throw new Error('UNIQUE constraint failed: coin_ledger.idempotency_key');
      ledger.set(idempotencyKey, { id, userId, amount, kind, reference, balance, createdAt });
      lastChanges = 1;
      return { meta: { changes: 1 } };
    }

    throw new Error(`Unhandled mock SQL: ${q}`);
  };

  const makeStmt = (sql, params = []) => ({
    bind: (...values) => makeStmt(sql, values),
    first: async () => execute(sql, params).first ?? null,
    all: async () => ({ success: true, results: [] }),
    run: async () => ({ success: true, meta: execute(sql, params).meta ?? { changes: 0 } }),
    _exec: () => execute(sql, params),
  });

  return {
    orders,
    events,
    wallets,
    ledger,
    db: {
      prepare: (sql) => makeStmt(sql),
      batch: async (stmts) => stmts.map((stmt) => ({ success: true, meta: stmt._exec().meta ?? { changes: 0 } })),
    },
  };
}

test('SePay checkout signing follows official field order, HMAC-SHA256 base64, and environment guards', () => {
  const load = createServerLoader();
  const sepay = load(path.resolve(ROOT, 'lib/server/sepay.ts'));

  assert.equal(sepay.sepayCheckoutEndpoint('sandbox'), 'https://pay-sandbox.sepay.vn/v1/checkout/init');
  assert.equal(sepay.sepayCheckoutEndpoint('production'), 'https://pay.sepay.vn/v1/checkout/init');

  const sandboxConfig = {
    environment: 'sandbox',
    merchantId: 'SP-TEST-EXAMPLE1',
    secretKey: 'spsk_test_secret_123',
    ipnSecret: 'llipn_test_secret_123',
    publicUrl: 'https://www.labellab3d.workers.dev',
  };
  assert.doesNotThrow(() => sepay.assertSepayConfig(sandboxConfig));

  // Mismatched Live keys in Sandbox mode or Test keys in Production mode must fail closed.
  assert.throws(() => sepay.assertSepayConfig({ ...sandboxConfig, merchantId: 'SP-LIVE-EXAMPLE1' }), /PAYMENT_ENV_MISMATCH/);
  assert.throws(() => sepay.assertSepayConfig({ ...sandboxConfig, secretKey: 'spsk_live_secret_123' }), /PAYMENT_ENV_MISMATCH/);
  assert.throws(() => sepay.assertSepayConfig({ ...sandboxConfig, environment: 'production' }), /PAYMENT_ENV_MISMATCH/);
  assert.throws(() => sepay.assertSepayConfig({ ...sandboxConfig, publicUrl: 'http://localhost:3005' }), /PAYMENT_PUBLIC_URL_REQUIRED/);
  assert.throws(() => sepay.assertSepayConfig({ ...sandboxConfig, ipnSecret: '' }), /PAYMENT_NOT_CONFIGURED/);

  const fields = sepay.createSepayCheckout(sandboxConfig, {
    amount: 20000,
    orderCode: 'LLORDER001',
    description: 'Labellab3D nap 45 coins',
    customerId: 'usr_123',
    successUrl: 'https://www.labellab3d.workers.dev/payment/sepay/success?order=LLORDER001&id=pay_1',
    errorUrl: 'https://www.labellab3d.workers.dev/payment/sepay/error?order=LLORDER001&id=pay_1',
    cancelUrl: 'https://www.labellab3d.workers.dev/payment/sepay/cancel?order=LLORDER001&id=pay_1',
  });
  const expectedPayload = [
    'order_amount=20000',
    'merchant=SP-TEST-EXAMPLE1',
    'currency=VND',
    'operation=PURCHASE',
    'order_description=Labellab3D nap 45 coins',
    'order_invoice_number=LLORDER001',
    'customer_id=usr_123',
    'payment_method=BANK_TRANSFER',
    'success_url=https://www.labellab3d.workers.dev/payment/sepay/success?order=LLORDER001&id=pay_1',
    'error_url=https://www.labellab3d.workers.dev/payment/sepay/error?order=LLORDER001&id=pay_1',
    'cancel_url=https://www.labellab3d.workers.dev/payment/sepay/cancel?order=LLORDER001&id=pay_1',
  ].join(',');
  const expectedSig = crypto.createHmac('sha256', sandboxConfig.secretKey).update(expectedPayload).digest('base64');
  assert.equal(fields.signature, expectedSig);
  assert.equal(fields.payment_method, 'BANK_TRANSFER');
  assert.equal(fields.currency, 'VND');
});

test('SePay webhook enforces async x-secret-key auth, credits once, deduplicates retries, and honors late transfers', async () => {
  const mock = createMockPaymentDb([
    {
      id: 'pay_1',
      user_id: 'usr_1',
      order_code: 'LLORDER100',
      package_coins: 45,
      amount_minor: 20000,
      currency: 'VND',
      status: 'pending',
      provider_order_id: null,
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    },
    {
      id: 'pay_late',
      user_id: 'usr_1',
      order_code: 'LLORDERLATE',
      package_coins: 20,
      amount_minor: 10000,
      currency: 'VND',
      status: 'expired',
      provider_order_id: null,
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    },
  ], 5);

  const runtimeEnv = {
    DB: mock.db,
    SEPAY_ENV: 'sandbox',
    SEPAY_MERCHANT_ID: 'SP-TEST-EXAMPLE1',
    SEPAY_SECRET_KEY: 'spsk_test_secret_123',
    SEPAY_IPN_SECRET: 'llipn_test_expected_secret',
    SEPAY_PUBLIC_URL: 'https://www.labellab3d.workers.dev',
  };

  const load = createServerLoader({
    '@/lib/server/http': {
      env: async () => runtimeEnv,
      json: (data, init) => Response.json(data, init),
    },
  });
  const { POST } = load(path.resolve(ROOT, 'app/api/payments/webhook/sepay/route.ts'));

  const makePayload = (overrides = {}) => JSON.stringify({
    timestamp: 1795502000,
    notification_type: 'ORDER_PAID',
    order: {
      id: 'sp-order-uuid-1',
      order_status: 'CAPTURED',
      order_currency: 'VND',
      order_amount: '20000.00',
      order_invoice_number: 'LLORDER100',
      ...(overrides.order ?? {}),
    },
    transaction: {
      id: 'sp-tx-uuid-1',
      transaction_status: 'APPROVED',
      transaction_amount: '20000',
      transaction_currency: 'VND',
      payment_method: 'BANK_TRANSFER',
      ...(overrides.transaction ?? {}),
    },
  });

  // 1. Missing or wrong x-secret-key MUST be rejected with 401 (regression for missing await!).
  const unauthNoHeader = await POST(new Request('https://www.labellab3d.workers.dev/api/payments/webhook/sepay', {
    method: 'POST', body: makePayload(),
  }));
  assert.equal(unauthNoHeader.status, 401);

  const unauthWrongKey = await POST(new Request('https://www.labellab3d.workers.dev/api/payments/webhook/sepay', {
    method: 'POST', headers: { 'x-secret-key': 'wrong-secret' }, body: makePayload(),
  }));
  assert.equal(unauthWrongKey.status, 401);
  assert.equal(mock.wallets.get('usr_1').balance, 5, 'unauthorized requests must never credit coins');

  // 2. Amount mismatch is rejected without crediting coins.
  const wrongAmount = await POST(new Request('https://www.labellab3d.workers.dev/api/payments/webhook/sepay', {
    method: 'POST',
    headers: { 'x-secret-key': runtimeEnv.SEPAY_IPN_SECRET },
    body: makePayload({ order: { order_amount: '10000.00' }, transaction: { id: 'sp-tx-wrong-amt', transaction_amount: '10000' } }),
  }));
  assert.equal(wrongAmount.status, 400);
  assert.equal(mock.wallets.get('usr_1').balance, 5);

  // 3. Valid ORDER_PAID credits coins once and marks order paid + saves provider_order_id.
  const validRes = await POST(new Request('https://www.labellab3d.workers.dev/api/payments/webhook/sepay', {
    method: 'POST',
    headers: { 'x-secret-key': runtimeEnv.SEPAY_IPN_SECRET },
    body: makePayload(),
  }));
  assert.equal(validRes.status, 200);
  assert.deepEqual(await validRes.json(), { success: true });
  assert.equal(mock.wallets.get('usr_1').balance, 50);
  assert.equal(mock.orders.get('LLORDER100').status, 'paid');
  assert.equal(mock.orders.get('LLORDER100').provider_order_id, 'sp-order-uuid-1');

  // 4. Exact replay returns duplicate:true without double crediting.
  const replayRes = await POST(new Request('https://www.labellab3d.workers.dev/api/payments/webhook/sepay', {
    method: 'POST',
    headers: { 'x-secret-key': runtimeEnv.SEPAY_IPN_SECRET },
    body: makePayload(),
  }));
  assert.equal(replayRes.status, 200);
  assert.deepEqual(await replayRes.json(), { success: true, duplicate: true });
  assert.equal(mock.wallets.get('usr_1').balance, 50);

  // 5. Retry with a fresh transaction id on an already-paid order returns alreadyPaid:true (200), not 400.
  const alreadyPaidRes = await POST(new Request('https://www.labellab3d.workers.dev/api/payments/webhook/sepay', {
    method: 'POST',
    headers: { 'x-secret-key': runtimeEnv.SEPAY_IPN_SECRET },
    body: makePayload({ transaction: { id: 'sp-tx-retry-2' } }),
  }));
  assert.equal(alreadyPaidRes.status, 200);
  assert.deepEqual(await alreadyPaidRes.json(), { success: true, alreadyPaid: true });
  assert.equal(mock.wallets.get('usr_1').balance, 50);

  // 6. Genuine verified transfer arriving shortly after checkout expiry still credits the customer.
  const lateRes = await POST(new Request('https://www.labellab3d.workers.dev/api/payments/webhook/sepay', {
    method: 'POST',
    headers: { 'x-secret-key': runtimeEnv.SEPAY_IPN_SECRET },
    body: makePayload({
      order: { id: 'sp-order-late', order_invoice_number: 'LLORDERLATE', order_amount: '10000.00' },
      transaction: { id: 'sp-tx-late', transaction_amount: '10000' },
    }),
  }));
  assert.equal(lateRes.status, 200);
  assert.equal(mock.wallets.get('usr_1').balance, 70);
  assert.equal(mock.orders.get('LLORDERLATE').status, 'paid');
});
