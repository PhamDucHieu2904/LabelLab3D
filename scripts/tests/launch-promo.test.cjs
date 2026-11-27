const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '../..');

function createLoader() {
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

function createPromoDb() {
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

  function insertUser({ id, email, createdAt, verified = true, status = 'active' }) {
    sqlite
      .prepare(
        `INSERT INTO users (id, email, name, role, status, email_verified_at, created_at, updated_at)
         VALUES (?, ?, ?, 'user', ?, ?, ?, ?)`,
      )
      .run(id, email, id, status, verified ? createdAt : null, createdAt, createdAt);
    sqlite
      .prepare(`INSERT INTO wallets (user_id, balance, updated_at) VALUES (?, 0, ?)`)
      .run(id, createdAt);
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

test('canonicalizeEmailForPromo catches Gmail dot and +alias multi-account tricks', () => {
  const load = createLoader();
  const promo = load(path.resolve(ROOT, 'lib/server/launch-promo.ts'));

  assert.equal(
    promo.canonicalizeEmailForPromo('D.e.s.i.g.n.e.r+farm2@googlemail.com'),
    'designer@gmail.com',
  );
  assert.equal(
    promo.canonicalizeEmailForPromo('designer+1@gmail.com'),
    'designer@gmail.com',
  );
  assert.equal(
    promo.canonicalizeEmailForPromo('hello.world+test@company.vn'),
    'hello.world@company.vn',
  );
});

test('launch promo grants +100 coins once per account, blocks parallel race bursts, Gmail alias farming, IP farming, and out-of-window accounts', async () => {
  const load = createLoader();
  const promo = load(path.resolve(ROOT, 'lib/server/launch-promo.ts'));
  const db = createPromoDb();
  const env = { DB: db.DB };

  const insideWindow = Date.parse('2026-11-28T05:00:00.000Z'); // 28/11/2026 12:00 GMT+7
  const beforeWindow = Date.parse('2026-11-26T16:59:59.000Z'); // 26/11/2026 23:59:59 GMT+7
  const afterWindow = Date.parse('2026-12-04T17:00:00.000Z'); // 05/12/2026 00:00:00 GMT+7

  // 1. Pre-event user registered 1 second before 27/11/2026 00:00 GMT+7 -> rejected
  db.insertUser({
    id: 'usr_old',
    email: 'old@example.com',
    createdAt: new Date(beforeWindow).toISOString(),
  });
  const oldStatus = await promo.getLaunchPromoStatus(env, 'usr_old', insideWindow);
  assert.equal(oldStatus.eligible, false);
  assert.equal(oldStatus.reason, 'NOT_ELIGIBLE_REGISTRATION_DATE');
  await assert.rejects(
    () => promo.claimLaunchPromo(env, 'usr_old', { nowMs: insideWindow, ip: '203.0.113.10' }),
    /NOT_ELIGIBLE_REGISTRATION_DATE/,
  );

  // 2. Unverified account -> rejected
  db.insertUser({
    id: 'usr_unverified',
    email: 'unverified@example.com',
    createdAt: new Date(insideWindow).toISOString(),
    verified: false,
  });
  await assert.rejects(
    () => promo.claimLaunchPromo(env, 'usr_unverified', { nowMs: insideWindow, ip: '203.0.113.11' }),
    /EMAIL_NOT_VERIFIED/,
  );

  // 3. Eligible new user -> 10 parallel Promise.all race requests -> EXACTLY ONE succeeds & balance === 100
  db.insertUser({
    id: 'usr_legit',
    email: 'designer@gmail.com',
    createdAt: new Date(insideWindow).toISOString(),
  });
  const burst = await Promise.allSettled(
    Array.from({ length: 10 }, () =>
      promo.claimLaunchPromo(env, 'usr_legit', { nowMs: insideWindow, ip: '203.0.113.20' }),
    ),
  );
  const fulfilled = burst.filter((r) => r.status === 'fulfilled');
  const rejected = burst.filter((r) => r.status === 'rejected');
  assert.equal(fulfilled.length, 1, 'Exactly one concurrent request may succeed');
  assert.equal(rejected.length, 9, 'All other 9 concurrent requests must be rejected');
  assert.equal(fulfilled[0].value.coins, 100);
  assert.equal(fulfilled[0].value.balance, 100);
  const walletBalance = db.sqlite.prepare("SELECT balance FROM wallets WHERE user_id='usr_legit'").get().balance;
  assert.equal(walletBalance, 100, 'Wallet balance must be strictly 100');
  const ledgerCount = db.sqlite.prepare("SELECT COUNT(*) AS c FROM coin_ledger WHERE user_id='usr_legit'").get().c;
  assert.equal(ledgerCount, 1, 'Exactly one coin_ledger row written');

  // 4. Subsequent sequential claim -> rejected with PROMO_ALREADY_CLAIMED
  await assert.rejects(
    () => promo.claimLaunchPromo(env, 'usr_legit', { nowMs: insideWindow + 60_000, ip: '203.0.113.20' }),
    /PROMO_ALREADY_CLAIMED/,
  );

  // 5. Gmail dot + alias clone account -> rejected with PROMO_ALREADY_CLAIMED_EMAIL
  db.insertUser({
    id: 'usr_alias',
    email: 'd.e.s.i.g.n.e.r+bonus2@googlemail.com',
    createdAt: new Date(insideWindow).toISOString(),
  });
  await assert.rejects(
    () => promo.claimLaunchPromo(env, 'usr_alias', { nowMs: insideWindow, ip: '203.0.113.21' }),
    /PROMO_ALREADY_CLAIMED_EMAIL/,
  );
  assert.equal(db.sqlite.prepare("SELECT balance FROM wallets WHERE user_id='usr_alias'").get().balance, 0);

  // 6. Claiming after 04/12/2026 23:59:59.999 GMT+7 -> rejected with PROMO_EXPIRED
  db.insertUser({
    id: 'usr_late_claim',
    email: 'late@example.com',
    createdAt: new Date(insideWindow).toISOString(),
  });
  await assert.rejects(
    () => promo.claimLaunchPromo(env, 'usr_late_claim', { nowMs: afterWindow, ip: '203.0.113.22' }),
    /PROMO_EXPIRED/,
  );

  // 7. IP farming cap: max 3 distinct accounts per IP, 4th from same IP blocked with PROMO_IP_LIMIT
  for (let i = 1; i <= 4; i += 1) {
    db.insertUser({
      id: `usr_ip_${i}`,
      email: `farm${i}@example.com`,
      createdAt: new Date(insideWindow).toISOString(),
    });
  }
  await promo.claimLaunchPromo(env, 'usr_ip_1', { nowMs: insideWindow, ip: '198.51.100.77' });
  await promo.claimLaunchPromo(env, 'usr_ip_2', { nowMs: insideWindow, ip: '198.51.100.77' });
  await promo.claimLaunchPromo(env, 'usr_ip_3', { nowMs: insideWindow, ip: '198.51.100.77' });
  await assert.rejects(
    () => promo.claimLaunchPromo(env, 'usr_ip_4', { nowMs: insideWindow, ip: '198.51.100.77' }),
    /PROMO_IP_LIMIT/,
  );
});

test('launch promo announcement is pinned first inside active window and auto-hides after Dec 4, 2026', () => {
  const load = createLoader();
  const siteConfig = load(path.resolve(ROOT, 'lib/server/site-config.ts'));
  const launchConst = load(path.resolve(ROOT, 'lib/promotions/launch-event.ts'));

  const initial = siteConfig.createInitialProductionManagement();
  const activeNov27 = siteConfig.extractLiveAnnouncements(initial, '2026-11-27');
  assert.equal(activeNov27[0].id, launchConst.LAUNCH_PROMO_ANNOUNCEMENT_ID);

  const activeDec04 = siteConfig.extractLiveAnnouncements(initial, '2026-12-04');
  assert.equal(activeDec04[0].id, launchConst.LAUNCH_PROMO_ANNOUNCEMENT_ID);

  const afterDec05 = siteConfig.extractLiveAnnouncements(initial, '2026-12-05');
  assert.equal(
    afterDec05.some((a) => a.id === launchConst.LAUNCH_PROMO_ANNOUNCEMENT_ID),
    false,
    'Launch promo announcement automatically expires after 2026-12-04',
  );
});
