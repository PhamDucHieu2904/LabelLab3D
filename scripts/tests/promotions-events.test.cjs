const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');

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

function createFullPromoDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'active',
      email_verified_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE wallets (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
      updated_at TEXT NOT NULL
    );
    CREATE TABLE coin_ledger (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      amount INTEGER NOT NULL CHECK (amount <> 0),
      kind TEXT NOT NULL,
      reference TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      balance INTEGER NOT NULL CHECK (balance >= 0),
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE TABLE payment_orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      provider TEXT NOT NULL CHECK (provider IN ('sepay','polar')),
      order_code TEXT NOT NULL UNIQUE,
      package_coins INTEGER NOT NULL CHECK (package_coins > 0),
      amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
      currency TEXT NOT NULL CHECK (currency IN ('VND','USD')),
      status TEXT NOT NULL CHECK (status IN ('pending','paid','expired','cancelled','refunded')),
      provider_order_id TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE audit_events (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      ip_hash TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE TABLE auth_rate_limits (
      scope TEXT PRIMARY KEY,
      failures INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE legal_consents (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      consent_type TEXT NOT NULL,
      policy_version TEXT NOT NULL,
      accepted_at TEXT NOT NULL,
      ip_hash TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );
  `);

  const wrap = (query, bound = []) => ({
    bind(...values) {
      return wrap(query, values);
    },
    async first(col) {
      const row = sqlite.prepare(query).get(...bound);
      if (!row) return null;
      return col ? row[col] : { ...row };
    },
    async all() {
      const rows = sqlite.prepare(query).all(...bound);
      return { success: true, results: rows.map((r) => ({ ...r })) };
    },
    async run() {
      const info = sqlite.prepare(query).run(...bound);
      return { success: true, meta: { changes: Number(info.changes ?? 0) } };
    },
    _execSync() {
      const info = sqlite.prepare(query).run(...bound);
      return { success: true, meta: { changes: Number(info.changes ?? 0) } };
    },
  });

  function insertUser({ id, email, name = id, role = 'user', status = 'active', balance = 0 }) {
    const now = new Date().toISOString();
    sqlite
      .prepare(
        `INSERT INTO users (id, email, name, role, status, email_verified_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, email, name, role, status, now, now, now);
    sqlite
      .prepare(`INSERT INTO wallets (user_id, balance, updated_at) VALUES (?, ?, ?)`)
      .run(id, balance, now);
  }

  return {
    sqlite,
    insertUser,
    DB: {
      prepare(query) {
        return wrap(query, []);
      },
      async batch(statements) {
        sqlite.exec('BEGIN');
        try {
          const results = statements.map((st) => st._execSync());
          sqlite.exec('COMMIT');
          return results;
        } catch (err) {
          sqlite.exec('ROLLBACK');
          throw err;
        }
      },
    },
  };
}

test('top-up multiplier config sanitizes bounds and computes exact coins when enabled/disabled', () => {
  const load = createLoader();
  const helper = load(path.resolve(ROOT, 'lib/promotions/topup-multiplier.ts'));

  assert.deepEqual(helper.sanitizeTopupMultiplier(null), helper.DEFAULT_TOPUP_MULTIPLIER);
  assert.deepEqual(
    helper.sanitizeTopupMultiplier({ enabled: true, multiplier: 3, label: '  Flash x3  ' }),
    { enabled: true, multiplier: 3, label: 'Flash x3', updatedAt: null },
  );
  // Out-of-range multipliers fall back safely to 2
  assert.equal(helper.sanitizeTopupMultiplier({ enabled: true, multiplier: 99 }).multiplier, 2);
  assert.equal(helper.sanitizeTopupMultiplier({ enabled: true, multiplier: 1 }).multiplier, 2);

  assert.deepEqual(helper.resolveTopupCoins(330, { enabled: false, multiplier: 3 }), {
    baseCoins: 330,
    coins: 330,
    multiplier: 1,
    bonusApplied: false,
  });
  assert.deepEqual(helper.resolveTopupCoins(330, { enabled: true, multiplier: 2 }), {
    baseCoins: 330,
    coins: 660,
    multiplier: 2,
    bonusApplied: true,
  });
  assert.deepEqual(helper.resolveTopupCoins(870, { enabled: true, multiplier: 3 }), {
    baseCoins: 870,
    coins: 2610,
    multiplier: 3,
    bonusApplied: true,
  });
});

test('payment order API authoritatively applies live x2 / x3 top-up multiplier on SePay and reverts to 1x when disabled', async () => {
  const db = createFullPromoDb();
  db.insertUser({ id: 'usr_buyer', email: 'buyer@example.com', name: 'Buyer' });
  const runtimeEnv = {
    DB: db.DB,
    SEPAY_BANK_CODE: 'MBBank',
    SEPAY_BANK_ACCOUNT: '35555678967899',
    SEPAY_BANK_OWNER: 'TEST OWNER',
    SEPAY_WEBHOOK_API_KEY: 'whk_test_123',
  };

  const load = createLoader({
    'next/headers': {
      headers: async () => new Headers({ 'cf-ipcountry': 'VN', 'cf-connecting-ip': '203.0.113.5' }),
    },
    '@/lib/server/http': {
      assertSameOrigin: async () => undefined,
      sessionUser: async () => ({ id: 'usr_buyer', email: 'buyer@example.com', name: 'Buyer', role: 'user', status: 'active' }),
      env: async () => runtimeEnv,
      json: (data, init) => Response.json(data, init),
      errorResponse: (err) => Response.json({ error: err instanceof Error ? err.message : 'ERROR' }, { status: 400 }),
    },
  });

  const siteConfig = load(path.resolve(ROOT, 'lib/server/site-config.ts'));
  const { POST } = load(path.resolve(ROOT, 'app/api/payments/orders/route.ts'));

  const createVnOrder = async () =>
    POST(
      new Request('https://hypermockup.com/api/payments/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId: 'vn-starter', coins: 330, region: 'vietnam' }),
      }),
    );

  // 1. Default OFF -> 1x (330 coins)
  const r1 = await createVnOrder();
  assert.equal(r1.status, 201);
  const b1 = await r1.json();
  assert.equal(b1.order.coins, 330);
  assert.equal(b1.order.multiplier, 1);

  // 2. Turn ON x2 -> 660 coins persisted into payment_orders.package_coins
  await siteConfig.saveLiveTopupMultiplier(runtimeEnv, { enabled: true, multiplier: 2, label: 'Sự kiện x2 cuối tuần' }, null);
  const r2 = await createVnOrder();
  assert.equal(r2.status, 201);
  const b2 = await r2.json();
  assert.equal(b2.order.coins, 660);
  assert.equal(b2.order.baseCoins, 330);
  assert.equal(b2.order.multiplier, 2);
  const dbRow2 = db.sqlite.prepare('SELECT package_coins FROM payment_orders WHERE id = ?').get(b2.order.id);
  assert.equal(dbRow2.package_coins, 660);

  // 3. Switch to x3 -> 990 coins persisted
  await siteConfig.saveLiveTopupMultiplier(runtimeEnv, { enabled: true, multiplier: 3, label: 'Siêu sale x3' }, null);
  const r3 = await createVnOrder();
  assert.equal(r3.status, 201);
  const b3 = await r3.json();
  assert.equal(b3.order.coins, 990);
  assert.equal(b3.order.multiplier, 3);

  // 4. Turn OFF -> immediately back to 330 coins
  await siteConfig.saveLiveTopupMultiplier(runtimeEnv, { enabled: false, multiplier: 3, label: '' }, null);
  const r4 = await createVnOrder();
  assert.equal(r4.status, 201);
  const b4 = await r4.json();
  assert.equal(b4.order.coins, 330);
  assert.equal(b4.order.multiplier, 1);
});

test('mass coin gift event credits all active users, sends admin bell notifications, skips locked users, and blocks duplicate replays', async () => {
  const db = createFullPromoDb();
  db.insertUser({ id: 'usr_admin', email: 'admin@example.com', name: 'Admin', role: 'admin', status: 'active', balance: 50 });
  db.insertUser({ id: 'usr_1', email: 'u1@example.com', name: 'User 1', status: 'active', balance: 20 });
  db.insertUser({ id: 'usr_2', email: 'u2@example.com', name: 'User 2', status: 'active', balance: 100 });
  db.insertUser({ id: 'usr_locked', email: 'locked@example.com', name: 'Locked', status: 'locked', balance: 10 });

  const load = createLoader();
  const promoSvc = load(path.resolve(ROOT, 'lib/server/promotions.ts'));
  const env = { DB: db.DB };

  const idempotencyKey = 'evtgift_holiday2026_1234567890';
  const result = await promoSvc.executeMassCoinGiftEvent(env, {
    actorUserId: 'usr_admin',
    coins: 50,
    title: 'Quà tặng lễ 30/4',
    body: 'Chúc mừng dịp lễ, HyperMockup tặng bạn +50 Coin dùng thử Studio!',
    idempotencyKey,
  });

  assert.equal(result.replayed, false);
  assert.equal(result.coinsPerUser, 50);
  assert.equal(result.recipientCount, 3);
  assert.equal(result.totalCoinsDistributed, 150);

  // Active users got +50 coins, locked user stayed at 10
  assert.equal(db.sqlite.prepare("SELECT balance FROM wallets WHERE user_id='usr_admin'").get().balance, 100);
  assert.equal(db.sqlite.prepare("SELECT balance FROM wallets WHERE user_id='usr_1'").get().balance, 70);
  assert.equal(db.sqlite.prepare("SELECT balance FROM wallets WHERE user_id='usr_2'").get().balance, 150);
  assert.equal(db.sqlite.prepare("SELECT balance FROM wallets WHERE user_id='usr_locked'").get().balance, 10);

  // Every active user received an admin_message notification with the event body
  const notifs = db.sqlite.prepare("SELECT user_id, kind, title, body FROM user_notifications ORDER BY user_id").all();
  assert.equal(notifs.length, 3);
  assert.ok(notifs.every((n) => n.kind === 'admin_message' && n.title === 'Quà tặng lễ 30/4'));
  assert.ok(notifs.every((n) => n.body.includes('+50 Coin')));
  assert.equal(notifs.some((n) => n.user_id === 'usr_locked'), false);

  // Ledger entries recorded with kind='event_gift'
  const ledgers = db.sqlite.prepare("SELECT user_id, amount, kind FROM coin_ledger WHERE kind='event_gift'").all();
  assert.equal(ledgers.length, 3);

  // Exact replay with same idempotencyKey does NOT double-credit or double-notify
  const replayed = await promoSvc.executeMassCoinGiftEvent(env, {
    actorUserId: 'usr_admin',
    coins: 50,
    title: 'Quà tặng lễ 30/4',
    body: 'Chúc mừng dịp lễ, HyperMockup tặng bạn +50 Coin dùng thử Studio!',
    idempotencyKey,
  });
  assert.equal(replayed.replayed, true);
  assert.equal(db.sqlite.prepare("SELECT balance FROM wallets WHERE user_id='usr_1'").get().balance, 70);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS c FROM user_notifications").get().c, 3);

  // Conflicting payload with same idempotencyKey fails closed
  await assert.rejects(
    () =>
      promoSvc.executeMassCoinGiftEvent(env, {
        actorUserId: 'usr_admin',
        coins: 99,
        title: 'Quà tặng lễ 30/4',
        body: 'Chúc mừng dịp lễ, HyperMockup tặng bạn +50 Coin dùng thử Studio!',
        idempotencyKey,
      }),
    /IDEMPOTENCY_CONFLICT/,
  );

  // Listed history reflects the completed event
  const history = await promoSvc.listCoinGiftEvents(env, 10);
  assert.equal(history.length, 1);
  assert.equal(history[0].recipientCount, 3);
  assert.equal(history[0].totalCoinsDistributed, 150);
  assert.equal(history[0].actorName, 'Admin');
});
