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

test('live check-in config parses admin schedules, toggles, and day-cycle rewards cleanly', () => {
  const load = createLoader();
  const siteConfig = load(path.resolve(ROOT, 'lib/server/site-config.ts'));
  const rewards = load(path.resolve(ROOT, 'lib/server/rewards.ts'));

  assert.deepEqual(siteConfig.DEFAULT_CHECKIN_SCHEDULE, [10, 10, 10, 20, 10, 10, 30]);
  assert.equal(siteConfig.DEFAULT_CHECKIN_SCHEDULE.reduce((sum, n) => sum + n, 0), 100);

  const enabled = siteConfig.extractCheckInConfig({
    rewards: [{
      id: 'checkin',
      name: 'Điểm danh hằng ngày',
      status: 'Đang bật',
      updated: '24/11/2026',
      values: { reward: '50', limit: '1', schedule: '50, 60, 70, 80, 90, 100, 200', condition: 'Test' },
    }],
  });
  assert.equal(enabled.enabled, true);
  assert.deepEqual(enabled.schedule, [50, 60, 70, 80, 90, 100, 200]);
  assert.deepEqual(rewards.resolveCheckInReward(enabled, 0), { dayIndex: 0, coins: 50 });
  assert.deepEqual(rewards.resolveCheckInReward(enabled, 6), { dayIndex: 6, coins: 200 });
  assert.deepEqual(rewards.resolveCheckInReward(enabled, 7), { dayIndex: 0, coins: 50 });

  const disabled = siteConfig.extractCheckInConfig({
    rewards: [{
      id: 'checkin',
      name: 'Điểm danh hằng ngày',
      status: 'Đang tắt',
      updated: '24/11/2026',
      values: { reward: '50', limit: '1', schedule: '50' },
    }],
  });
  assert.equal(disabled.enabled, false);
});

test('strict consecutive daily check-in streak awards Day 4/7 bonuses and resets to Day 1 when a day is missed', () => {
  const load = createLoader();
  const siteConfig = load(path.resolve(ROOT, 'lib/server/site-config.ts'));
  const rewards = load(path.resolve(ROOT, 'lib/server/rewards.ts'));

  // Calendar day boundaries (month end, leap year, New Year)
  assert.equal(rewards.previousCalendarDay('2026-03-01'), '2026-02-28');
  assert.equal(rewards.previousCalendarDay('2024-03-01'), '2024-02-29');
  assert.equal(rewards.previousCalendarDay('2026-01-01'), '2025-12-31');

  const config = {
    enabled: true,
    reward: 10,
    dailyLimit: 1,
    schedule: [...siteConfig.DEFAULT_CHECKIN_SCHEDULE],
    condition: 'Strict consecutive 7-day cycle',
  };

  // Fresh user -> Day 1 (10 coins)
  const day1 = rewards.computeConsecutiveStreak([], '2026-11-25');
  assert.deepEqual(day1, { claimedToday: false, streakBeforeToday: 0, currentStreak: 0 });
  assert.deepEqual(rewards.resolveCheckInReward(config, day1.streakBeforeToday), { dayIndex: 0, coins: 10 });

  // 3 consecutive days before today -> Day 4 bonus (20 coins)
  const day4 = rewards.computeConsecutiveStreak(['2026-11-22', '2026-11-23', '2026-11-24'], '2026-11-25');
  assert.deepEqual(day4, { claimedToday: false, streakBeforeToday: 3, currentStreak: 3 });
  assert.deepEqual(rewards.resolveCheckInReward(config, day4.streakBeforeToday), { dayIndex: 3, coins: 20 });

  // 6 consecutive days before today -> Day 7 grand bonus (30 coins)
  const day7 = rewards.computeConsecutiveStreak(
    ['2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24'],
    '2026-11-25',
  );
  assert.deepEqual(day7, { claimedToday: false, streakBeforeToday: 6, currentStreak: 6 });
  assert.deepEqual(rewards.resolveCheckInReward(config, day7.streakBeforeToday), { dayIndex: 6, coins: 30 });

  // 7 consecutive days before today -> wraps cleanly to new Day 1 (10 coins) while preserving streak count
  const day8 = rewards.computeConsecutiveStreak(
    ['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24'],
    '2026-11-25',
  );
  assert.deepEqual(day8, { claimedToday: false, streakBeforeToday: 7, currentStreak: 7 });
  assert.deepEqual(rewards.resolveCheckInReward(config, day8.streakBeforeToday), { dayIndex: 0, coins: 10 });

  // Missed yesterday (2026-11-24 missing) -> STRICT RESET back to Day 1 (10 coins)!
  const missed = rewards.computeConsecutiveStreak(
    ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23'],
    '2026-11-25',
  );
  assert.deepEqual(missed, { claimedToday: false, streakBeforeToday: 0, currentStreak: 0 });
  assert.deepEqual(rewards.resolveCheckInReward(config, missed.streakBeforeToday), { dayIndex: 0, coins: 10 });

  // Claimed today after missing yesterday -> currentStreak is 1, dayIndex stays 0 for today's slot
  const missedThenClaimed = rewards.computeConsecutiveStreak(
    ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-25'],
    '2026-11-25',
  );
  assert.deepEqual(missedThenClaimed, { claimedToday: true, streakBeforeToday: 0, currentStreak: 1 });
  assert.deepEqual(rewards.resolveCheckInReward(config, missedThenClaimed.streakBeforeToday), { dayIndex: 0, coins: 10 });
});

test('regional coin catalog separates Vietnam (VND) and International (USD) tiers with exact bonus scale', () => {
  const load = createLoader();
  const packages = load(path.resolve(ROOT, 'lib/payments/packages.ts'));
  const siteConfig = load(path.resolve(ROOT, 'lib/server/site-config.ts'));

  const vnPacks = packages.getCoinPackagesByRegion(packages.COIN_PACKAGES, 'vietnam');
  const intlPacks = packages.getCoinPackagesByRegion(packages.COIN_PACKAGES, 'international');

  assert.deepEqual(
    vnPacks.map((p) => [p.vnd, p.coins, p.bonusPct]),
    [
      [20_000, 330, 0],
      [50_000, 870, 5],
      [100_000, 1_850, 10],
      [200_000, 4_000, 20],
    ],
  );
  assert.deepEqual(
    intlPacks.map((p) => [p.usd, p.coins, p.bonusPct]),
    [
      [5, 620, 0],
      [10, 1_310, 5],
      [20, 2_750, 10],
      [30, 4_500, 20],
    ],
  );

  // Sanitizer preserves regional packages (VN with usd=0, International with vnd=0) cleanly
  const roundTrip = siteConfig.sanitizeCoinPackages(siteConfig.defaultLiveCoinPackages());
  assert.equal(roundTrip.length, 8);
  assert.equal(roundTrip.filter((p) => p.region === 'vietnam').length, 4);
  assert.equal(roundTrip.filter((p) => p.region === 'international').length, 4);

  // Action pricing scales cleanly from 2K base (10 coins -> 5 / 10 / 15 / 30) and dieline defaults to 10
  assert.equal(packages.DEFAULT_RENDER_COIN_COST, 10);
  assert.equal(packages.DEFAULT_DIELINE_COIN_COST, 10);
  assert.equal(packages.WELCOME_BONUS_COINS, 20);
  assert.equal(packages.resolveRenderCoinCost(1024), 5);
  assert.equal(packages.resolveRenderCoinCost(2048), 10);
  assert.equal(packages.resolveRenderCoinCost(4096), 15);
  assert.equal(packages.resolveRenderCoinCost(8129), 30);
  assert.equal(packages.resolveRenderCoinCost(4096, 20), 30);
  assert.equal(packages.resolveRenderCoinCost(8129, 20), 60);
  assert.equal(packages.resolveRenderCoinCost(2048, 0), 0);
});

test('live coin packages and announcements sanitize admin edits safely', () => {
  const load = createLoader();
  const siteConfig = load(path.resolve(ROOT, 'lib/server/site-config.ts'));

  // Legacy dual-currency package rows remain backwards-compatible
  const sanitized = siteConfig.sanitizeCoinPackages([
    { id: 'p1', coins: 25, vnd: 12000, usd: 1, enabled: true },
    { id: 'bad', coins: -5, vnd: 1000, usd: 1, enabled: true },
    { id: 'dup', coins: 25, vnd: 15000, usd: 2, enabled: true },
  ]);
  assert.equal(sanitized.length, 1);
  assert.equal(sanitized[0].coins, 25);
  assert.equal(sanitized[0].vnd, 12000);

  // Regional deduplication allows VN and International to share coin counts without colliding
  const regionalDedup = siteConfig.sanitizeCoinPackages([
    { id: 'vn-1', region: 'vietnam', coins: 500, vnd: 30000, usd: 0, bonusPct: 5, enabled: true },
    { id: 'intl-1', region: 'international', coins: 500, vnd: 0, usd: 5, bonusPct: 0, enabled: true },
    { id: 'vn-dup', region: 'vietnam', coins: 500, vnd: 40000, usd: 0, enabled: true },
    { id: 'vn-bad-vnd', region: 'vietnam', coins: 600, vnd: 500, usd: 0, enabled: true },
    { id: 'intl-bad-usd', region: 'international', coins: 700, vnd: 0, usd: 0.1, enabled: true },
  ]);
  assert.equal(regionalDedup.length, 2);
  assert.equal(regionalDedup[0].region, 'vietnam');
  assert.equal(regionalDedup[1].region, 'international');

  const active = siteConfig.extractLiveAnnouncements({
    announcements: [
      { id: 'a1', name: 'Live update', status: 'Đang bật', updated: '24/11/2026', values: { category: 'Ưu đãi', pinned: 'Không', text: 'Hello', titleEn: 'Live update EN', textEn: 'Hello EN', start: '2026-11-01', end: '2026-12-31', url: '/studio' } },
      { id: 'a-pin', name: 'Pinned feature', status: 'Đang bật', updated: '25/11/2026', values: { category: 'Tính năng mới', pinned: 'Có', text: 'New CAD boxes', url: '/studio?domain=packaging' } },
      { id: 'a2', name: 'Expired', status: 'Đang bật', updated: '24/11/2026', values: { text: 'Old', start: '2025-01-01', end: '2025-12-31', url: '/studio' } },
      { id: 'a3', name: 'Off', status: 'Đang tắt', updated: '24/11/2026', values: { text: 'Off' } },
    ],
  }, '2026-11-24');
  assert.equal(active.length, 2);
  assert.equal(active[0].id, 'a-pin');
  assert.equal(active[0].pinned, true);
  assert.equal(active[0].tone, 'mint');
  assert.equal(active[1].title, 'Live update');
  assert.equal(active[1].tone, 'pink');
  assert.equal(active[1].titleEn, 'Live update EN');
  assert.equal(active[1].bodyEn, 'Hello EN');
});

test('site settings default to live launched mode and sanitize pricing & maintenance toggles', () => {
  const load = createLoader();
  const siteConfig = load(path.resolve(ROOT, 'lib/server/site-config.ts'));

  assert.equal(siteConfig.DEFAULT_SITE_SETTINGS.name, 'HyperMockup');
  assert.equal(siteConfig.DEFAULT_SITE_SETTINGS.domain, 'hypermockup.com');
  assert.equal(siteConfig.DEFAULT_SITE_SETTINGS.maintenance, false);
  assert.equal(siteConfig.DEFAULT_SITE_SETTINGS.renderCost, 10);
  assert.equal(siteConfig.DEFAULT_SITE_SETTINGS.dielineCost, 10);

  const customMaintenance = siteConfig.sanitizeSiteSettings({
    maintenance: true,
    domain: 'hypermockup.com',
    renderCost: 12,
    dielineCost: 25,
  });
  assert.equal(customMaintenance.maintenance, true);
  assert.equal(customMaintenance.domain, 'hypermockup.com');
  assert.equal(customMaintenance.name, 'HyperMockup');
  assert.equal(customMaintenance.renderCost, 12);
  assert.equal(customMaintenance.dielineCost, 25);

  const invalidNeg = siteConfig.sanitizeSiteSettings({ renderCost: -5, dielineCost: -1 });
  assert.equal(invalidNeg.renderCost, 10);
  assert.equal(invalidNeg.dielineCost, 10);
});

test('coin reserve API charges 5/10/15/30 coins for renders and 10 coins for 1:1 mm dieline exports', async () => {
  const reservedCalls = [];
  const load = createLoader({
    '@/lib/server/http': {
      assertSameOrigin: async () => undefined,
      sessionUser: async () => ({ id: 'usr_tester', email: 't@example.com', name: 'Tester', role: 'user', status: 'active' }),
      env: async () => ({}),
      json: (data, init) => Response.json(data, init),
      errorResponse: (err) => Response.json({ error: err instanceof Error ? err.message : 'ERROR' }, { status: 400 }),
    },
    '@/lib/server/site-config': {
      getLiveSiteSettings: async () => ({ renderCost: 10, dielineCost: 10 }),
    },
    '@/lib/server/wallet': {
      reserveCoins: async (_env, input) => {
        reservedCalls.push(input);
        return { id: 'res_1', ...input, status: 'reserved', balance: 100 - input.amount };
      },
    },
  });
  const { POST } = load(path.resolve(ROOT, 'app/api/account/coin/reserve/route.ts'));

  for (const [resolution, expectedCoins] of [[1024, 5], [2048, 10], [4096, 15], [8129, 30]]) {
    const res = await POST(new Request('https://hypermockup.com/api/account/coin/reserve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: `reserve_render_${resolution}_1234567890`,
        modelId: 'basil-strawberry',
        resolution,
      }),
    }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.quote.amount, expectedCoins);
    assert.equal(body.quote.action, 'render');
  }

  // Dieline export charges 10 coins and validates format allowlist
  const dielineRes = await POST(new Request('https://hypermockup.com/api/account/coin/reserve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'dieline',
      idempotencyKey: 'reserve_dieline_svg_1234567890',
      modelId: 'fefco-0421-tray',
      format: 'svg',
    }),
  }));
  assert.equal(dielineRes.status, 200);
  const dielineBody = await dielineRes.json();
  assert.equal(dielineBody.quote.amount, 10);
  assert.equal(dielineBody.quote.action, 'dieline');
  assert.equal(reservedCalls.at(-1).reference, 'dieline:fefco-0421-tray:svg');

  // Invalid dieline format rejected
  const badFormat = await POST(new Request('https://hypermockup.com/api/account/coin/reserve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'dieline',
      idempotencyKey: 'reserve_dieline_bad_1234567890',
      modelId: 'fefco-0421-tray',
      format: 'exe',
    }),
  }));
  assert.equal(badFormat.status, 400);
});

test('bug bounty 1000 coins and VIP custom 3D model announcements are seeded and migrated once into existing DBs', async () => {
  const { DatabaseSync } = require('node:sqlite');
  const load = createLoader();
  const siteConfig = load(path.resolve(ROOT, 'lib/server/site-config.ts'));
  const updates = load(path.resolve(ROOT, 'lib/labellab/updates.ts'));
  const launchConst = load(path.resolve(ROOT, 'lib/promotions/launch-event.ts'));

  // Fresh production management includes both pinned right after launch promo
  const initial = siteConfig.createInitialProductionManagement();
  const live = siteConfig.extractLiveAnnouncements(initial, '2026-11-27');
  assert.equal(live[0].id, launchConst.LAUNCH_PROMO_ANNOUNCEMENT_ID);
  assert.equal(live[1].id, updates.BUG_BOUNTY_ANNOUNCEMENT_ID);
  assert.equal(live[1].url, '/#home-feedback');
  assert.equal(live[2].id, updates.VIP_CUSTOM_MODEL_ANNOUNCEMENT_ID);
  assert.equal(live[2].url, '/contact');

  // Existing DB without the new announcements imports them once after launch promo, and respects later admin deletion
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE users (id TEXT PRIMARY KEY);');
  const wrap = (query, bound = []) => ({
    bind(...values) { return wrap(query, values); },
    async first() { return sqlite.prepare(query).get(...bound) ?? null; },
    async all() { return { success: true, results: sqlite.prepare(query).all(...bound) }; },
    async run() { sqlite.prepare(query).run(...bound); return { success: true }; },
    _execSync() { sqlite.prepare(query).run(...bound); return { success: true }; },
  });
  const env = {
    DB: {
      prepare(query) { return wrap(query, []); },
      async batch(stmts) { stmts.forEach((s) => s._execSync()); },
    },
  };

  const legacySaved = structuredClone(initial);
  delete legacySaved[siteConfig.BUILTIN_ANNOUNCEMENT_MARKER_KEY];
  legacySaved.announcements = legacySaved.announcements.filter(
    (row) => row.id !== updates.BUG_BOUNTY_ANNOUNCEMENT_ID && row.id !== updates.VIP_CUSTOM_MODEL_ANNOUNCEMENT_ID,
  );
  await siteConfig.writeConfigJson(env, 'management', legacySaved, null);

  const loaded = await siteConfig.loadManagementData(env);
  assert.deepEqual(
    loaded.announcements.slice(0, 3).map((r) => r.id),
    [
      launchConst.LAUNCH_PROMO_ANNOUNCEMENT_ID,
      updates.BUG_BOUNTY_ANNOUNCEMENT_ID,
      updates.VIP_CUSTOM_MODEL_ANNOUNCEMENT_ID,
    ],
  );

  // Admin deletes bug bounty -> stays deleted on reload
  loaded.announcements = loaded.announcements.filter((r) => r.id !== updates.BUG_BOUNTY_ANNOUNCEMENT_ID);
  await siteConfig.writeConfigJson(env, 'management', loaded, null);
  const reloaded = await siteConfig.loadManagementData(env);
  assert.equal(reloaded.announcements.some((r) => r.id === updates.BUG_BOUNTY_ANNOUNCEMENT_ID), false);
  assert.equal(reloaded.announcements.some((r) => r.id === updates.VIP_CUSTOM_MODEL_ANNOUNCEMENT_ID), true);
});
