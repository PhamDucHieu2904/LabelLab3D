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

function createSqliteD1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO users (id, email, name, role, status, created_at, updated_at)
    VALUES
      ('usr_legacy', 'legacy@hypermockup.com', 'Legacy', 'user', 'active', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
      ('usr_new', 'new@hypermockup.com', 'Newbie', 'user', 'active', '2026-11-27T00:00:00Z', '2026-11-27T00:00:00Z');
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
  });

  return {
    DB: {
      prepare(query) {
        return wrap(query, []);
      },
    },
  };
}

test('new accounts get studioTourPending=true while legacy accounts stay false, and completing/skipping clears pending state', async () => {
  const load = createLoader();
  const onboarding = load(path.resolve(ROOT, 'lib/server/onboarding.ts'));
  const env = createSqliteD1();

  // Legacy user has no onboarding row -> should NOT auto-trigger tour
  assert.equal(await onboarding.isStudioTourPending(env, 'usr_legacy'), false);

  // Newly created user gets marked pending -> auto-triggers Studio tour
  await onboarding.markNewUserOnboardingPending(env, 'usr_new');
  assert.equal(await onboarding.isStudioTourPending(env, 'usr_new'), true);

  // Completing tour clears pending state permanently
  await onboarding.setStudioTourStatus(env, 'usr_new', 'completed');
  assert.equal(await onboarding.isStudioTourPending(env, 'usr_new'), false);

  // Calling markNewUserOnboardingPending again must never re-arm a finished user
  await onboarding.markNewUserOnboardingPending(env, 'usr_new');
  assert.equal(await onboarding.isStudioTourPending(env, 'usr_new'), false);
});

test('all 7 User Guide WebP screenshots exist and are lightweight (< 100 KB each)', () => {
  const guideDir = path.resolve(ROOT, 'public/guide');
  const expected = [
    'home-dashboard.webp',
    'studio-models.webp',
    'studio-artwork.webp',
    'studio-scene.webp',
    'studio-packaging.webp',
    'studio-export.webp',
    'studio-share.webp',
  ];
  for (const file of expected) {
    const full = path.join(guideDir, file);
    assert.ok(fs.existsSync(full), `Missing guide screenshot ${file}`);
    const stat = fs.statSync(full);
    assert.ok(stat.size > 5_000 && stat.size < 100_000, `${file} unexpected size: ${stat.size} bytes`);
  }
});
