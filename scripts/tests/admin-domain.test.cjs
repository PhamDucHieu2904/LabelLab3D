const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function load(relative) {
  const filename = path.resolve(__dirname, '../../lib/admin', relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = module.paths;
  loaded._compile(compiled, filename);
  return loaded.exports;
}
const analytics = load('analytics.ts');
const commerce = load('commerce.ts');
const order = (id, createdAt, fields = {}) => ({
  id, createdAt, userId: 'sample-user', region: 'vn', amount: 10000, coins: 20,
  status: 'paid', reference: id, ...fields,
});

test('Vietnam day, month and year include midnight and exclude the next period midnight', () => {
  const periods = [
    ['2026-10-31', 'day', '2026-10-30T17:00:00.000Z', '2026-10-31T17:00:00.000Z'],
    ['2026-10-18', 'month', '2026-09-30T17:00:00.000Z', '2026-10-31T17:00:00.000Z'],
    ['2026-08-18', 'year', '2025-12-31T17:00:00.000Z', '2026-12-31T17:00:00.000Z'],
    ['2024-02-29', 'month', '2024-01-31T17:00:00.000Z', '2024-02-29T17:00:00.000Z'],
  ];
  for (const [anchor, granularity, start, end] of periods) {
    const from = Date.parse(start), to = Date.parse(end);
    assert.deepEqual(analytics.periodBounds(anchor, granularity), [from, to]);
    const rows = [order('before', new Date(from - 1).toISOString()), order('first', start), order('last', new Date(to - 1).toISOString()), order('next', end)];
    assert.deepEqual(analytics.ordersInPeriod(rows, anchor, granularity).map(item => item.id), ['first', 'last']);
  }
});

test('previous periods cross New Year, month end and leap day without skipping', () => {
  assert.equal(analytics.previousAnchor('2026-01-01', 'day'), '2025-12-31');
  assert.equal(analytics.previousAnchor('2026-03-31', 'month'), '2026-02-01');
  assert.equal(analytics.previousAnchor('2024-03-01', 'day'), '2024-02-29');
  assert.equal(analytics.previousAnchor('2026-10-31', 'year').slice(0, 4), '2025');
});

test('traffic totals agree when drilling from year to month to hourly days', () => {
  const year = analytics.trafficForPeriod('2026-10-31', 'year');
  const months = Array.from({ length: 12 }, (_, index) => analytics.trafficForPeriod(`2026-${String(index + 1).padStart(2, '0')}-01`, 'month'));
  assert.deepEqual(analytics.sumTraffic(year), analytics.sumTraffic(months.flat()));
  for (let index = 0; index < 12; index++) {
    assert.deepEqual(analytics.sumTraffic([year[index]]), analytics.sumTraffic(months[index]));
    for (const day of months[index]) {
      const hours = analytics.trafficForPeriod(day.iso, 'day');
      assert.equal(hours.length, 24);
      assert.deepEqual(analytics.sumTraffic(hours), analytics.sumTraffic([day]));
      for (const hour of hours) for (const key of ['guests', 'users', 'bots', 'sessions', 'renders']) assert.ok(Number.isSafeInteger(hour[key]) && hour[key] >= 0);
    }
  }
  assert.ok(analytics.sumTraffic(year).guests > 0);
  assert.equal(analytics.sumTraffic(analytics.trafficForPeriod('2026-11-01', 'month')).guests, 0);
});

test('calendar buckets retain February 29 in leap years and 28 days otherwise', () => {
  for (const year of [2024, 2028]) {
    const february = analytics.trafficForPeriod(`${year}-02-01`, 'month');
    assert.equal(february.length, 29);
    assert.equal(february.at(-1).iso, `${year}-02-29`);
    assert.deepEqual(analytics.sumTraffic(analytics.trafficForPeriod(`${year}-02-29`, 'day')), analytics.sumTraffic([february.at(-1)]));
  }
  assert.equal(analytics.trafficForPeriod('2025-02-01', 'month').length, 28);
});

test('user activity respects signup, last login, lifetime totals and edited counters', () => {
  const user = { createdAt: '2026-07-03T09:00:00+07:00', lastLogin: '2026-10-31T20:15:00+07:00', logins: 187, appSessions: 146 };
  assert.deepEqual(analytics.periodUserActivity(user, '2025-10-01', 'year'), { logins: 0, app: 0 });
  assert.deepEqual(analytics.periodUserActivity(user, '2026-07-02', 'day'), { logins: 0, app: 0 });
  assert.deepEqual(analytics.periodUserActivity(user, '2026-11-01', 'month'), { logins: 0, app: 0 });
  const months = Array.from({ length: 12 }, (_, index) => analytics.periodUserActivity(user, `2026-${String(index + 1).padStart(2, '0')}-01`, 'month'));
  const total = months.reduce((sum, item) => ({ logins: sum.logins + item.logins, app: sum.app + item.app }), { logins: 0, app: 0 });
  assert.deepEqual(total, { logins: 187, app: 146 });
  assert.deepEqual(analytics.periodUserActivity(user, '2026-01-01', 'year'), total);
  const edited = { ...user, logins: 23, appSessions: 9 };
  assert.deepEqual(analytics.periodUserActivity(edited, '2026-01-01', 'year'), { logins: 23, app: 9 });
  assert.deepEqual(analytics.periodUserActivity({ ...user, lastLogin: '', logins: 0, appSessions: 0 }, '2026-10-31', 'year'), { logins: 0, app: 0 });
  assert.deepEqual(analytics.periodUserActivity({ ...user, createdAt: '2026-11-01T09:00:00+07:00' }, '2026-10-31', 'month'), { logins: 0, app: 0 });
});

test('payment transitions credit once, refund once and can explicitly repay', () => {
  let current = order('payment', '2026-10-31T00:00:00Z', { status: 'pending', coins: 120 });
  let balance = 0;
  const change = status => { const delta = commerce.orderBalanceDelta(current, status); balance += delta; current = { ...current, status }; return delta; };
  assert.equal(change('paid'), 120);
  assert.equal(change('paid'), 0);
  assert.equal(balance, 120);
  assert.equal(change('refunded'), -120);
  assert.equal(change('refunded'), 0);
  assert.equal(balance, 0);
  assert.equal(change('paid'), 120);
  assert.equal(change('paid'), 0);
  assert.equal(balance, 120);
  assert.equal(commerce.orderBalanceDelta({ ...current, status: 'failed' }, 'pending'), 0);
});

test('revenue separates currencies, refunds and unsuccessful payments', () => {
  const at = '2026-10-31T00:00:00Z';
  const revenue = commerce.summarizeRevenue([
    order('vn', at, { amount: 100000, coins: 300 }),
    order('usd', at, { region: 'international', amount: 2, coins: 45 }),
    order('vn-refund', at, { status: 'refunded', amount: 20000, coins: 45 }),
    order('usd-refund', at, { status: 'refunded', region: 'international', amount: 1, coins: 20 }),
    order('pending', at, { status: 'pending', amount: 50000, coins: 120 }),
    order('failed', at, { status: 'failed', region: 'international', amount: 10, coins: 300 }),
  ]);
  assert.deepEqual(revenue, { vn: 100000, international: 2, coins: 345, paid: 2, refunds: { vn: 20000, international: 1 } });
  assert.deepEqual(commerce.summarizeRevenue([]), { vn: 0, international: 0, coins: 0, paid: 0, refunds: { vn: 0, international: 0 } });
});

test('CSV quotes multiline names and prevents spreadsheet formulas without changing numeric deductions', () => {
  const csv = commerce.createCsv(['Tên', 'Giá trị'], [
    ['Nguyễn "A", B\nC', 20], ['=HYPERLINK("https://example.com")', -20], ['+1+1', 2], ['@SUM(A1)', 3], ['-2+3', 4], ['\t=1+1', 5], ['\r=1+1', 6],
  ]);
  assert.ok(csv.startsWith('\uFEFF"Tên","Giá trị"\r\n'));
  assert.ok(csv.includes('"Nguyễn ""A"", B\nC","20"'));
  assert.ok(csv.includes('"\'=HYPERLINK(""https://example.com"")","-20"'));
  for (const text of ['+1+1', '@SUM(A1)', '-2+3', '\t=1+1', '\r=1+1']) assert.ok(csv.includes(`"'${text}"`));
});
