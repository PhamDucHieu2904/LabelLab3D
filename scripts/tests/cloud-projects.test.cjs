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

function createSqliteD1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(fs.readFileSync(path.resolve(ROOT, 'db/schema.sql'), 'utf8'));
  const wrapStmt = (sql) => ({
    _params: [],
    bind(...values) {
      this._params = values;
      return this;
    },
    async first(column) {
      const row = sqlite.prepare(sql).get(...this._params);
      if (!row) return null;
      return column ? row[column] : row;
    },
    async all() {
      const results = sqlite.prepare(sql).all(...this._params);
      return { success: true, results };
    },
    async run() {
      const info = sqlite.prepare(sql).run(...this._params);
      return { success: true, meta: { changes: Number(info.changes ?? 0) } };
    },
  });
  return {
    sqlite,
    prepare: wrapStmt,
    async batch(statements) {
      const out = [];
      for (const stmt of statements) {
        out.push(await stmt.run());
      }
      return out;
    },
  };
}

function createMockR2() {
  const objects = new Map();
  let deletedCount = 0;
  return {
    objects,
    get deletedCount() {
      return deletedCount;
    },
    async put(key, value, options) {
      const copy = new Uint8Array(value.byteLength);
      copy.set(value instanceof Uint8Array ? value : new Uint8Array(value));
      objects.set(key, { bytes: copy, contentType: options?.httpMetadata?.contentType ?? 'image/webp' });
    },
    async get(key) {
      const entry = objects.get(key);
      if (!entry) return null;
      return {
        httpMetadata: { contentType: entry.contentType },
        async arrayBuffer() {
          return entry.bytes.buffer.slice(entry.bytes.byteOffset, entry.bytes.byteOffset + entry.bytes.byteLength);
        },
      };
    },
    async delete(keyOrKeys) {
      const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
      for (const k of keys) {
        if (objects.delete(k)) deletedCount += 1;
      }
    },
  };
}

/** Build a valid WebP VP8X binary header with arbitrary width × height for dimension enforcement tests. */
function makeWebpVp8x(width, height, seedByte = 1) {
  const bytes = new Uint8Array(40);
  // RIFF....WEBPVP8X
  bytes.set([0x52, 0x49, 0x46, 0x46, 32, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58], 0);
  // Chunk size = 10
  bytes[16] = 10;
  // Canvas width - 1 (24-bit LE at 24..26) & height - 1 (24-bit LE at 27..29)
  const w = Math.max(1, width) - 1;
  const h = Math.max(1, height) - 1;
  bytes[24] = w & 0xff;
  bytes[25] = (w >> 8) & 0xff;
  bytes[26] = (w >> 16) & 0xff;
  bytes[27] = h & 0xff;
  bytes[28] = (h >> 8) & 0xff;
  bytes[29] = (h >> 16) & 0xff;
  bytes[35] = seedByte;
  return bytes;
}

function seedUser(db, id, email, balance) {
  const now = new Date().toISOString();
  db.sqlite
    .prepare('INSERT INTO users (id,email,name,role,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
    .run(id, email, id, 'user', 'active', now, now);
  db.sqlite
    .prepare('INSERT INTO wallets (user_id,balance,updated_at) VALUES (?,?,?)')
    .run(id, balance, now);
}

test('computeCloudImageSize keeps <= 2048px native and scales > 2048px proportionally to exact 2048px', () => {
  const load = createLoader();
  const packager = load(path.resolve(ROOT, 'lib/labellab/share-packager.ts'));

  assert.deepEqual(packager.computeCloudImageSize(1200, 800), { width: 1200, height: 800 });
  assert.deepEqual(packager.computeCloudImageSize(2048, 2048), { width: 2048, height: 2048 });
  assert.deepEqual(packager.computeCloudImageSize(4096, 2048), { width: 2048, height: 1024 });
  assert.deepEqual(packager.computeCloudImageSize(3000, 6000), { width: 1024, height: 2048 });
  assert.deepEqual(packager.computeCloudImageSize(10000, 4000), { width: 2048, height: 819 });
});

test('putShareAsset parses WebP/PNG dimensions and rejects images exceeding 2048px on cloud upload', async () => {
  const load = createLoader();
  const assetsMod = load(path.resolve(ROOT, 'lib/server/share-assets.ts'));
  const db = createSqliteD1();
  const r2 = createMockR2();
  const env = { DB: db, SHARE_BUCKET: r2 };

  const ok2048 = makeWebpVp8x(2048, 1200, 7);
  assert.deepEqual(assetsMod.inspectImageDimensions(ok2048, 'image/webp'), { width: 2048, height: 1200 });
  const saved = await assetsMod.putShareAsset(env, { bytes: ok2048, maxEdge: 2048 });
  assert.equal(saved.mimeType, 'image/webp');
  assert.equal(r2.objects.size, 1);

  const tooBig = makeWebpVp8x(4096, 2048, 9);
  assert.deepEqual(assetsMod.inspectImageDimensions(tooBig, 'image/webp'), { width: 4096, height: 2048 });
  await assert.rejects(
    () => assetsMod.putShareAsset(env, { bytes: tooBig, maxEdge: 2048 }),
    /IMAGE_TOO_LARGE/,
  );
  assert.equal(r2.objects.size, 1);
});

test('Cloud Projects 30-day TTL, owner isolation, zero-reupload Share 3D, 10-coin manual extend, and auto-renew/auto-delete sweep', async () => {
  const load = createLoader();
  const cloudMod = load(path.resolve(ROOT, 'lib/server/cloud-projects.ts'));
  const sharesMod = load(path.resolve(ROOT, 'lib/server/shares.ts'));
  const assetsMod = load(path.resolve(ROOT, 'lib/server/share-assets.ts'));
  const walletMod = load(path.resolve(ROOT, 'lib/server/wallet.ts'));
  const contractsMod = load(path.resolve(ROOT, 'lib/projects/contracts.ts'));

  const db = createSqliteD1();
  const r2 = createMockR2();
  const env = { DB: db, SHARE_BUCKET: r2 };

  seedUser(db, 'user_a', 'a@hypermockup.com', 25);
  seedUser(db, 'user_b', 'b@hypermockup.com', 100);

  const labelBytes = makeWebpVp8x(2048, 1024, 11);
  const labelHash = await assetsMod.sha256Hex(labelBytes);
  const thumbBytes = makeWebpVp8x(480, 480, 22);
  const thumbHash = await assetsMod.sha256Hex(thumbBytes);

  // 1. Save a Cloud Project for User A (starts with 30-day TTL)
  const { project } = await cloudMod.saveCloudProjectItems(env, 'user_a', {
    name: 'Vinut Basil 290ml Line',
    autoRenew: false,
    items: [
      {
        name: 'Basil Strawberry',
        kind: 'beverage',
        subtitle: 'Glass - 290 mL',
        sortOrder: 0,
        thumbnailHash: thumbHash,
        payload: {
          kind: 'beverage',
          settings: { modelId: 'glass-290-basil' },
          labelHash,
        },
      },
    ],
    assets: [
      { expectedHash: labelHash, bytes: labelBytes },
      { expectedHash: thumbHash, bytes: thumbBytes },
    ],
  });

  assert.equal(project.name, 'Vinut Basil 290ml Line');
  assert.equal(project.itemCount, 1);
  assert.equal(project.autoRenew, false);
  assert.equal(contractsMod.daysRemainingFromIso(project.expiresAt), 30);
  assert.equal(r2.objects.size, 2);

  // 2. Strict owner isolation: User B cannot access, patch, extend, or steal User A's asset hash
  assert.equal(await cloudMod.isAssetAuthorizedForUserCloudProject(env, 'user_a', project.id, labelHash), true);
  assert.equal(await cloudMod.isAssetAuthorizedForUserCloudProject(env, 'user_b', project.id, labelHash), false);
  await assert.rejects(() => cloudMod.updateCloudProject(env, 'user_b', project.id, { autoRenew: true }), /NOT_FOUND/);
  await assert.rejects(() => cloudMod.extendCloudProject(env, 'user_b', project.id), /NOT_FOUND/);
  await assert.rejects(
    () =>
      sharesMod.createSharedProject(env, 'user_b', {
        title: 'Stolen hash attempt',
        items: [
          {
            name: 'Stolen',
            kind: 'beverage',
            subtitle: '',
            sortOrder: 0,
            payload: { kind: 'beverage', settings: { modelId: 'glass-290-basil' }, labelHash },
          },
        ],
        assets: [],
      }),
    /INVALID_INPUT/,
  );

  // 3. User A shares their Cloud Project with 0 re-uploaded bytes (reuses R2 assets!)
  const shared = await sharesMod.createSharedProject(env, 'user_a', {
    localProjectId: project.id,
    title: 'Client Review v1',
    items: [
      {
        name: 'Basil Strawberry',
        kind: 'beverage',
        subtitle: 'Glass - 290 mL',
        sortOrder: 0,
        thumbnailHash: thumbHash,
        payload: { kind: 'beverage', settings: { modelId: 'glass-290-basil' }, labelHash },
      },
    ],
    assets: [],
  });
  assert.equal(shared.itemCount, 1);
  assert.equal(r2.objects.size, 2); // Still 2 R2 objects, ref_count = 2!

  // 4. Manual extend (+30 days for 10 coins): balance 25 -> 15, TTL 30d -> 60d
  const extRes = await cloudMod.extendCloudProject(env, 'user_a', project.id);
  assert.equal(extRes.chargedCoins, 10);
  assert.equal(extRes.project.renewalCount, 1);
  assert.equal(await walletMod.getCoinBalance(env, 'user_a'), 15);
  assert.ok(contractsMod.daysRemainingFromIso(extRes.project.expiresAt) >= 59);

  // 5. Enable Auto-Renew and fast-forward past expiresAt -> auto-deducts 10 coins (balance 15 -> 5) and extends +30d!
  await cloudMod.updateCloudProject(env, 'user_a', project.id, { autoRenew: true });
  const pastFirstExpiryMs = Date.parse(extRes.project.expiresAt) + 60_000;
  const sweep1 = await cloudMod.sweepExpiredCloudProjects(env, { userId: 'user_a', nowMs: pastFirstExpiryMs });
  assert.deepEqual(sweep1.renewedIds, [project.id]);
  assert.deepEqual(sweep1.deletedIds, []);
  assert.equal(await walletMod.getCoinBalance(env, 'user_a'), 5);

  const afterAutoRenew = await cloudMod.listUserCloudProjects(env, 'user_a', { nowMs: pastFirstExpiryMs });
  assert.equal(afterAutoRenew.length, 1);
  assert.equal(afterAutoRenew[0].renewalCount, 2);

  // 6. Fast-forward past second expiry with only 5 coins (< 10 needed) -> auto-deletes cloud project,
  //    but keeps R2 objects alive because active Share 3D still references them!
  const pastSecondExpiryMs = Date.parse(afterAutoRenew[0].expiresAt) + 60_000;
  const sweep2 = await cloudMod.sweepExpiredCloudProjects(env, { userId: 'user_a', nowMs: pastSecondExpiryMs });
  assert.deepEqual(sweep2.renewedIds, []);
  assert.deepEqual(sweep2.deletedIds, [project.id]);
  assert.equal((await cloudMod.listUserCloudProjects(env, 'user_a', { nowMs: pastSecondExpiryMs })).length, 0);
  assert.equal(r2.objects.size, 2); // Still held by active 3D share link!

  // 7. Once Share 3D is also deleted, ref_count reaches 0 and R2 objects are freed (DeleteObject = $0)!
  await sharesMod.deleteSharedProject(env, 'user_a', shared.id);
  assert.equal(r2.objects.size, 0);
  assert.equal(r2.deletedCount, 2);
});
