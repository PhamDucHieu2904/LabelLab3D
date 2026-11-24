const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

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

test('live check-in config parses admin schedules, toggles, and day-cycle rewards cleanly', () => {
  const load = createLoader();
  const siteConfig = load(path.resolve(ROOT, 'lib/server/site-config.ts'));
  const rewards = load(path.resolve(ROOT, 'lib/server/rewards.ts'));

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

test('live coin packages and announcements sanitize admin edits safely', () => {
  const load = createLoader();
  const siteConfig = load(path.resolve(ROOT, 'lib/server/site-config.ts'));

  const sanitized = siteConfig.sanitizeCoinPackages([
    { id: 'p1', coins: 25, vnd: 12000, usd: 1, enabled: true },
    { id: 'bad', coins: -5, vnd: 1000, usd: 1, enabled: true },
    { id: 'dup', coins: 25, vnd: 15000, usd: 2, enabled: true },
  ]);
  assert.equal(sanitized.length, 1);
  assert.equal(sanitized[0].coins, 25);
  assert.equal(sanitized[0].vnd, 12000);

  const active = siteConfig.extractLiveAnnouncements({
    announcements: [
      { id: 'a1', name: 'Live update', status: 'Đang bật', updated: '24/11/2026', values: { text: 'Hello', start: '2026-11-01', end: '2026-12-31', url: '/studio' } },
      { id: 'a2', name: 'Expired', status: 'Đang bật', updated: '24/11/2026', values: { text: 'Old', start: '2025-01-01', end: '2025-12-31', url: '/studio' } },
      { id: 'a3', name: 'Off', status: 'Đang tắt', updated: '24/11/2026', values: { text: 'Off' } },
    ],
  }, '2026-11-24');
  assert.equal(active.length, 1);
  assert.equal(active[0].title, 'Live update');
});
