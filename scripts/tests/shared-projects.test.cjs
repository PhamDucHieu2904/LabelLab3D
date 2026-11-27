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

/** Lightweight D1-compatible adapter backed by real in-memory SQLite (node:sqlite). */
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
    VALUES ('user_1', 'designer@hypermockup.com', 'Designer', 'user', 'active', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
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

  return {
    sqlite,
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

function createMockR2() {
  const objects = new Map();
  return {
    objects,
    bucket: {
      async put(key, value, options) {
        const bytes = value instanceof Uint8Array ? new Uint8Array(value) : new Uint8Array(value);
        objects.set(key, { bytes, contentType: options?.httpMetadata?.contentType });
      },
      async get(key) {
        const entry = objects.get(key);
        if (!entry) return null;
        return {
          httpMetadata: { contentType: entry.contentType },
          async arrayBuffer() {
            const copy = new Uint8Array(entry.bytes.byteLength);
            copy.set(entry.bytes);
            return copy.buffer;
          },
        };
      },
      async delete(keyOrKeys) {
        const list = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
        for (const k of list) objects.delete(k);
      },
    },
  };
}

// Valid minimal WebP (RIFF....WEBP) and PNG headers
const FAKE_WEBP_1 = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20, 0x01, 0x02,
]);
const FAKE_WEBP_2 = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x12, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20, 0x09, 0x08, 0x07,
]);

test('multi-item share lifecycle with R2 deduplication, re-sync GC, and strict asset authorization', async () => {
  const load = createLoader();
  const shares = load(path.resolve(ROOT, 'lib/server/shares.ts'));
  const shareAssets = load(path.resolve(ROOT, 'lib/server/share-assets.ts'));
  const prefs = load(path.resolve(ROOT, 'lib/labellab/preferences.ts'));

  const { DB } = createSqliteD1();
  const r2 = createMockR2();
  const env = { DB, SHARE_BUCKET: r2.bucket, SHARE_UNLOCK_SECRET: 'test-secret-key' };

  const hash1 = await shareAssets.sha256Hex(FAKE_WEBP_1);
  const hash2 = await shareAssets.sha256Hex(FAKE_WEBP_2);

  const created = await shares.createSharedProject(env, 'user_1', {
    localProjectId: 'grp-summer',
    title: 'Vinut Basil 290ml Line',
    brandName: 'Vinut',
    description: 'Inspect Strawberry bottle + 6-pack tray.',
    items: [
      {
        id: 'item_strawberry',
        name: 'Strawberry',
        kind: 'beverage',
        subtitle: 'Glass 290 mL',
        sortOrder: 0,
        thumbnailHash: hash1,
        payload: {
          kind: 'beverage',
          settings: prefs.DEFAULT_PREFERENCES,
          labelHash: hash1,
        },
      },
      {
        id: 'item_tray',
        name: '6-Pack Tray',
        kind: 'packaging',
        subtitle: 'FEFCO 0421 · 220×150×190 mm',
        sortOrder: 1,
        payload: {
          kind: 'packaging',
          settings: prefs.DEFAULT_PREFERENCES,
          packagingParams: { templateId: 'fefco-0421-tray', lengthMm: 220, widthMm: 150, heightMm: 190 },
          bottlePack: { enabled: true, modelId: 'basil-strawberry', cols: 3, rows: 2 },
          packedBottle: { modelId: 'basil-strawberry', name: 'Strawberry', labelHash: hash1 },
          packagingArtwork: {
            mode: 'panel',
            panelOverlays: {
              'outside:front-wall': {
                panelId: 'front-wall',
                surface: 'outside',
                imageHash: hash2,
                imageScale: 1,
                imageOffsetX: 0,
                imageOffsetY: 0,
                imageRotationDeg: 0,
              },
            },
          },
        },
      },
    ],
    assets: [
      { expectedHash: hash1, bytes: FAKE_WEBP_1 },
      { expectedHash: hash2, bytes: FAKE_WEBP_2 },
    ],
  });

  assert.equal(created.itemCount, 2);
  assert.equal(created.status, 'active');
  assert.equal(r2.objects.size, 2, 'Two unique assets stored in R2');

  // Public view returns both objects and increments view_count
  const pub = await shares.getPublicSharedProject(env, created.token);
  assert.equal(pub.state, 'ready');
  assert.equal(pub.items.length, 2);
  assert.equal(pub.items[0].name, 'Strawberry');
  assert.equal(pub.items[1].name, '6-Pack Tray');

  // Authorized asset reads succeed for referenced hashes, reject unrelated hashes
  assert.deepEqual(await shares.authorizeShareAssetRead(env, created.token, hash1), {
    allowed: true,
    isProtected: false,
  });
  assert.deepEqual(
    await shares.authorizeShareAssetRead(env, created.token, '0'.repeat(64)),
    { allowed: false, isProtected: false },
  );
  const fetched = await shareAssets.getShareAsset(env, hash1);
  assert.equal(fetched.mimeType, 'image/webp');
  assert.deepEqual(fetched.bytes, FAKE_WEBP_1);

  // Re-sync removing the tray keeps the exact same token URL and garbage-collects hash2 from R2!
  const updated = await shares.updateSharedProject(env, 'user_1', created.id, {
    title: 'Vinut Basil 290ml (Bottle Only)',
    items: [
      {
        id: 'item_strawberry',
        name: 'Strawberry',
        kind: 'beverage',
        subtitle: 'Glass 290 mL',
        sortOrder: 0,
        payload: { kind: 'beverage', settings: prefs.DEFAULT_PREFERENCES, labelHash: hash1 },
      },
    ],
    assets: [],
  });
  assert.equal(updated.token, created.token, 'Re-sync preserves the share URL token');
  assert.equal(updated.itemCount, 1);
  assert.equal(r2.objects.size, 1, 'Orphaned tray artwork hash2 was garbage-collected from R2');
  assert.equal(await shareAssets.getShareAsset(env, hash2), null);

  // Deleting the share cleans up the remaining asset from R2
  await shares.deleteSharedProject(env, 'user_1', created.id);
  assert.equal(r2.objects.size, 0, 'Deleting share removes all unreferenced R2 objects');
  assert.equal((await shares.getPublicSharedProject(env, created.token)).state, 'not_found');
});

test('passcode protection locks items & assets, unlocks via signed cookie, and invalidates old cookies on passcode change', async () => {
  const load = createLoader();
  const shares = load(path.resolve(ROOT, 'lib/server/shares.ts'));
  const shareAssets = load(path.resolve(ROOT, 'lib/server/share-assets.ts'));
  const prefs = load(path.resolve(ROOT, 'lib/labellab/preferences.ts'));

  // Test D1 fallback path (no SHARE_BUCKET binding)
  const { DB } = createSqliteD1();
  const env = { DB, SHARE_UNLOCK_SECRET: 'passcode-test-secret' };
  const hash1 = await shareAssets.sha256Hex(FAKE_WEBP_1);

  const created = await shares.createSharedProject(env, 'user_1', {
    title: 'Confidential Q4 Launch',
    passcode: 'secret2026',
    items: [
      {
        name: 'Secret Flavor',
        kind: 'beverage',
        subtitle: 'Glass 290 mL',
        sortOrder: 0,
        payload: { kind: 'beverage', settings: prefs.DEFAULT_PREFERENCES, labelHash: hash1 },
      },
    ],
    assets: [{ expectedHash: hash1, bytes: FAKE_WEBP_1 }],
  });

  assert.equal(created.hasPasscode, true);

  // Locked without cookie -> never leaks items or allows asset downloads
  const locked = await shares.getPublicSharedProject(env, created.token, null);
  assert.equal(locked.state, 'locked');
  assert.equal('items' in locked, false);
  assert.deepEqual(await shares.authorizeShareAssetRead(env, created.token, hash1, null), {
    allowed: false,
    isProtected: true,
  });

  // Verify wrong vs right passcode
  const row = await shares.readShareByToken(env, created.token);
  assert.equal(await shares.verifySharePasscode('wrongpass', row.passcodeHash), false);
  assert.equal(await shares.verifySharePasscode('secret2026', row.passcodeHash), true);

  // Sign unlock cookie -> grants full access & asset read from D1 fallback
  const cookie = await shares.signShareUnlockCookie(env, created.token, row.passcodeHash);
  const unlocked = await shares.getPublicSharedProject(env, created.token, cookie);
  assert.equal(unlocked.state, 'ready');
  assert.equal(unlocked.items.length, 1);
  assert.deepEqual(await shares.authorizeShareAssetRead(env, created.token, hash1, cookie), {
    allowed: true,
    isProtected: true,
  });
  const storedFromD1 = await shareAssets.getShareAsset(env, hash1);
  assert.deepEqual(storedFromD1.bytes, FAKE_WEBP_1);

  // Rotating passcode automatically invalidates the old unlock cookie
  await shares.updateSharedProject(env, 'user_1', created.id, { passcode: 'newpass999' });
  const relocked = await shares.getPublicSharedProject(env, created.token, cookie);
  assert.equal(relocked.state, 'locked');

  // Pausing returns paused state even with no passcode
  await shares.updateSharedProject(env, 'user_1', created.id, { passcode: null, status: 'paused' });
  assert.equal((await shares.getPublicSharedProject(env, created.token)).state, 'paused');
});

test('share asset store rejects disguised HTML/SVG payloads and shareCost sanitizes cleanly', async () => {
  const load = createLoader();
  const shareAssets = load(path.resolve(ROOT, 'lib/server/share-assets.ts'));
  const siteConfig = load(path.resolve(ROOT, 'lib/server/site-config.ts'));

  const svgBytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  assert.equal(shareAssets.detectSafeImageMime(svgBytes), null);

  const { DB } = createSqliteD1();
  await assert.rejects(
    () => shareAssets.putShareAsset({ DB }, { bytes: svgBytes }),
    /INVALID_INPUT/,
  );

  assert.equal(siteConfig.DEFAULT_SITE_SETTINGS.shareCost, 20);
  assert.equal(siteConfig.sanitizeSiteSettings({ shareCost: 0 }).shareCost, 0);
  assert.equal(siteConfig.sanitizeSiteSettings({ shareCost: 35 }).shareCost, 35);
  assert.equal(siteConfig.sanitizeSiteSettings({ shareCost: -5 }).shareCost, 20);
});

test('SharedProjectViewer registers downloaded share blobs via createLocalArtwork so beverage labels pass texture validation', () => {
  const viewerSrc = fs.readFileSync(path.resolve(ROOT, 'components/share/SharedProjectViewer.tsx'), 'utf8');
  assert.ok(
    viewerSrc.includes('createLocalArtwork(blob)'),
    'SharedProjectViewer must register fetched share asset blobs with createLocalArtwork',
  );
  assert.ok(
    viewerSrc.includes('releaseLocalArtwork('),
    'SharedProjectViewer must release registered artwork URLs via releaseLocalArtwork',
  );
  assert.equal(
    viewerSrc.includes('URL.createObjectURL('),
    false,
    'SharedProjectViewer must not bypass createLocalArtwork with raw URL.createObjectURL',
  );

  // Verify end-to-end that resolveMaterialOverride accepts a createLocalArtwork URL and rejects an unregistered blob URL.
  const load = createLoader();
  const localArtwork = load(path.resolve(ROOT, 'lib/labellab/local-artwork.ts'));
  const viewerConfig = load(path.resolve(ROOT, 'lib/viewer-config.ts'));

  const registeredUrl = localArtwork.createLocalArtwork(new Blob([FAKE_WEBP_1], { type: 'image/webp' }));
  try {
    assert.equal(
      viewerConfig.resolveMaterialOverride({ baseColorMap: registeredUrl }).baseColorMap,
      registeredUrl,
    );
    assert.equal(
      viewerConfig.resolveMaterialOverride({ baseColorMap: 'blob:https://hypermockup.com/unregistered-id' }).baseColorMap,
      '',
    );
  } finally {
    localArtwork.releaseLocalArtwork(registeredUrl);
  }
});

test('sweepExpiredSharedProjects and pruneOrphanShareAssets garbage-collect expired, revoked, and orphaned assets', async () => {
  const load = createLoader();
  const shares = load(path.resolve(ROOT, 'lib/server/shares.ts'));
  const shareAssets = load(path.resolve(ROOT, 'lib/server/share-assets.ts'));
  const prefs = load(path.resolve(ROOT, 'lib/labellab/preferences.ts'));

  const { DB, sqlite } = createSqliteD1();
  const r2 = createMockR2();
  const env = { DB, SHARE_BUCKET: r2.bucket, SHARE_UNLOCK_SECRET: 'gc-secret' };

  const hash1 = await shareAssets.sha256Hex(FAKE_WEBP_1);
  const hash2 = await shareAssets.sha256Hex(FAKE_WEBP_2);

  const soonIso = new Date(Date.now() + 2 * 3_600_000).toISOString();
  const expiring = await shares.createSharedProject(env, 'user_1', {
    title: 'Short-lived Share',
    expiresAt: soonIso,
    items: [
      {
        name: 'Bottle 1',
        kind: 'beverage',
        subtitle: '',
        sortOrder: 0,
        payload: { kind: 'beverage', settings: prefs.DEFAULT_PREFERENCES, labelHash: hash1 },
      },
    ],
    assets: [{ expectedHash: hash1, bytes: FAKE_WEBP_1 }],
  });

  const revocable = await shares.createSharedProject(env, 'user_1', {
    title: 'Revocable Share',
    items: [
      {
        name: 'Bottle 2',
        kind: 'beverage',
        subtitle: '',
        sortOrder: 0,
        payload: { kind: 'beverage', settings: prefs.DEFAULT_PREFERENCES, labelHash: hash2 },
      },
    ],
    assets: [{ expectedHash: hash2, bytes: FAKE_WEBP_2 }],
  });
  assert.equal(r2.objects.size, 2);

  // Revoking immediately releases its heavy asset even before the sweep removes the row
  await shares.updateSharedProject(env, 'user_1', revocable.id, { status: 'revoked' });
  assert.equal(r2.objects.size, 1);
  assert.equal(await shareAssets.getShareAsset(env, hash2), null);

  // Fast-forward past expiring.expiresAt and sweep -> both revoked & expired rows and R2 objects are removed
  const swept = await shares.sweepExpiredSharedProjects(env, { nowMs: Date.parse(soonIso) + 60_000 });
  assert.equal(swept.deletedIds.includes(expiring.id), true);
  assert.equal(swept.deletedIds.includes(revocable.id), true);
  assert.equal(r2.objects.size, 0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS c FROM shared_projects').get().c, 0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS c FROM shared_assets').get().c, 0);

  // Simulate a historical orphan asset (e.g. from pre-fix ref_count leak)
  await shareAssets.putShareAsset(env, { bytes: FAKE_WEBP_1 });
  assert.equal(r2.objects.size, 1);
  // Fresh orphan inside grace window (minAgeMs = 10 min) is spared so in-flight uploads stay safe
  assert.equal(await shareAssets.pruneOrphanShareAssets(env, { nowMs: Date.now() }), 0);
  assert.equal(r2.objects.size, 1);
  // Once older than grace window, orphan is pruned from both R2 and D1
  assert.equal(await shareAssets.pruneOrphanShareAssets(env, { nowMs: Date.now() + 15 * 60_000 }), 1);
  assert.equal(r2.objects.size, 0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS c FROM shared_assets').get().c, 0);
});

test('SharedProjectViewer renders desktop right-side rounded panel while keeping mobile bottom bar', () => {
  const viewerCss = fs.readFileSync(
    path.resolve(ROOT, 'components/share/SharedProjectViewer.module.css'),
    'utf8',
  );
  const viewerTsx = fs.readFileSync(
    path.resolve(ROOT, 'components/share/SharedProjectViewer.tsx'),
    'utf8',
  );
  assert.ok(viewerTsx.includes('styles.viewerBody'), 'Uses split viewerBody workspace container');
  assert.ok(viewerTsx.includes('styles.panelHead'), 'Renders desktop panel header with controls');
  assert.ok(viewerTsx.includes('styles.panelReopenBtn'), 'Provides reopen button when desktop panel is collapsed');
  assert.ok(viewerCss.includes('border-radius: 20px'), 'Desktop right panel uses rounded corners');
  assert.ok(viewerCss.includes('@media (max-width: 900px)'), 'Preserves mobile bottom-bar layout below 900px');
  assert.ok(viewerCss.includes('overscroll-behavior: none'), 'Prevents mobile pull-to-refresh inside share viewer');
  assert.ok(viewerCss.includes('touch-action: none'), 'Locks touch gestures on the 3D share viewport');
  assert.ok(viewerTsx.includes('overscrollBehavior = "none"'), 'Locks root overscroll while 3D share viewer is mounted');

  const runtimeSrc = fs.readFileSync(path.resolve(ROOT, 'lib/mockup/runtime.ts'), 'utf8');
  assert.ok(
    runtimeSrc.includes("canvas.style.touchAction = fullTouchViewport ? 'none' : 'pan-y pinch-zoom'"),
    'Full 3D viewports use touch-action: none so mobile pinch-zoom and 1-finger orbit work natively',
  );
  assert.ok(
    runtimeSrc.includes('activeShowcasePinchDistance'),
    'Showcase spin mode supports 2-finger pinch zoom on mobile touch screens',
  );
});

test('share link expiry enforces a strict 30-day maximum and never allows infinite links', async () => {
  const load = createLoader();
  const contracts = load(path.resolve(ROOT, 'lib/share/contracts.ts'));
  const shares = load(path.resolve(ROOT, 'lib/server/shares.ts'));
  const shareAssets = load(path.resolve(ROOT, 'lib/server/share-assets.ts'));
  const prefs = load(path.resolve(ROOT, 'lib/labellab/preferences.ts'));

  assert.equal(contracts.SHARE_LIMITS.maxExpiryDays, 30);
  const baseMs = Date.UTC(2026, 5, 1, 0, 0, 0);
  assert.equal(Date.parse(contracts.computeExpiryIso('1d', baseMs)) - baseMs, 1 * 86_400_000);
  assert.equal(Date.parse(contracts.computeExpiryIso('7d', baseMs)) - baseMs, 7 * 86_400_000);
  assert.equal(Date.parse(contracts.computeExpiryIso('14d', baseMs)) - baseMs, 14 * 86_400_000);
  assert.equal(Date.parse(contracts.computeExpiryIso('30d', baseMs)) - baseMs, 30 * 86_400_000);

  const { DB } = createSqliteD1();
  const env = { DB, SHARE_UNLOCK_SECRET: 'expiry-secret' };
  const hash1 = await shareAssets.sha256Hex(FAKE_WEBP_1);
  const baseInput = {
    title: 'Expiry Check',
    items: [
      {
        name: 'Can',
        kind: 'beverage',
        subtitle: '330 mL',
        sortOrder: 0,
        payload: { kind: 'beverage', settings: prefs.DEFAULT_PREFERENCES, labelHash: hash1 },
      },
    ],
    assets: [{ expectedHash: hash1, bytes: FAKE_WEBP_1 }],
  };

  // Passing null defaults to <= 30 days instead of infinite
  const created = await shares.createSharedProject(env, 'user_1', { ...baseInput, expiresAt: null });
  assert.ok(created.expiresAt, 'Share link must always have an expiration timestamp');
  const deltaDays = (Date.parse(created.expiresAt) - Date.now()) / 86_400_000;
  assert.ok(deltaDays > 29.9 && deltaDays <= 30.01, `Expected ~30 days, got ${deltaDays}`);

  // Rejects anything beyond 30 days (e.g. 90 days)
  const ninetyDaysIso = new Date(Date.now() + 90 * 86_400_000).toISOString();
  await assert.rejects(
    () => shares.createSharedProject(env, 'user_1', { ...baseInput, expiresAt: ninetyDaysIso }),
    /INVALID_INPUT/,
  );
  await assert.rejects(
    () => shares.updateSharedProject(env, 'user_1', created.id, { expiresAt: ninetyDaysIso }),
    /INVALID_INPUT/,
  );
});
