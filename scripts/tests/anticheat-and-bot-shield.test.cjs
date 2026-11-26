const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const modules = new Map();

function loadSource(filename) {
  const resolved = [filename, `${filename}.ts`, `${filename}.json`].find(
    (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
  );
  if (!resolved) throw new Error(`Cannot resolve ${filename}`);
  if (resolved.endsWith('.json')) return require(resolved);
  if (modules.has(resolved)) return modules.get(resolved).exports;
  const loaded = new Module(resolved, module);
  loaded.filename = resolved;
  loaded.paths = module.paths;
  modules.set(resolved, loaded);
  const nativeRequire = loaded.require.bind(loaded);
  loaded.require = (request) => {
    if (request.startsWith('@/')) return loadSource(path.join(root, request.slice(2)));
    if (request.startsWith('.')) return loadSource(path.resolve(path.dirname(resolved), request));
    return nativeRequire(request);
  };
  loaded._compile(
    ts.transpileModule(fs.readFileSync(resolved, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText,
    resolved,
  );
  return loaded.exports;
}

const botShield = loadSource(path.join(root, 'lib/server/bot-shield'));
const anticheat = loadSource(path.join(root, 'lib/server/anticheat'));
const requestMeter = loadSource(path.join(root, 'lib/server/request-meter'));

test('Bot Shield blocks vulnerability probes, AI scrapers, and empty API user-agents', () => {
  botShield.resetBotShieldStateForTests();
  const browserUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';

  for (const probePath of ['/.env', '/.git/config', '/wp-admin/install.php', '/xmlrpc.php', '/shell.php']) {
    const res = botShield.evaluateIncomingRequest({
      pathname: probePath,
      method: 'GET',
      userAgent: browserUA,
      ip: '203.0.113.10',
    });
    assert.equal(res.allowed, false, probePath);
    assert.equal(res.status, 403);
    assert.equal(res.reason, 'PROBE_PATH_BLOCKED');
  }

  for (const botUA of ['GPTBot/1.0', 'ClaudeBot/1.0', 'Bytespider', 'python-requests/2.32', 'curl/8.7.1', 'HeadlessChrome/120']) {
    const res = botShield.evaluateIncomingRequest({
      pathname: '/studio',
      method: 'GET',
      userAgent: botUA,
      ip: '203.0.113.11',
    });
    assert.equal(res.allowed, false, botUA);
    assert.equal(res.status, 403);
    assert.equal(res.reason, 'BOT_USER_AGENT_BLOCKED');
  }

  const emptyApi = botShield.evaluateIncomingRequest({
    pathname: '/api/site/config',
    method: 'GET',
    userAgent: '',
    ip: '203.0.113.12',
  });
  assert.equal(emptyApi.allowed, false);
  assert.equal(emptyApi.status, 403);
  assert.equal(emptyApi.reason, 'EMPTY_USER_AGENT');
});

test('Bot Shield always allows payment webhooks and legitimate SEO bots on public pages only', () => {
  botShield.resetBotShieldStateForTests();

  const webhook = botShield.evaluateIncomingRequest({
    pathname: '/api/payments/webhook/sepay',
    method: 'POST',
    userAgent: 'Go-http-client/1.1',
    ip: '198.51.100.5',
  });
  assert.equal(webhook.allowed, true);

  const googleHome = botShield.evaluateIncomingRequest({
    pathname: '/',
    method: 'GET',
    userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    ip: '66.249.66.1',
  });
  assert.equal(googleHome.allowed, true);
  assert.equal(googleHome.isKnownBot, true);

  const googleApi = botShield.evaluateIncomingRequest({
    pathname: '/api/account/me',
    method: 'GET',
    userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    ip: '66.249.66.1',
  });
  assert.equal(googleApi.allowed, false);
  assert.equal(googleApi.status, 403);
  assert.equal(googleApi.reason, 'BOT_RESTRICTED_ROUTE');
});

test('Bot Shield enforces per-IP burst rate limiting and returns 429', () => {
  botShield.resetBotShieldStateForTests();
  const browserUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36';
  const now = 1_700_000_000_000;

  for (let i = 0; i < 35; i += 1) {
    const res = botShield.evaluateIncomingRequest({
      pathname: '/api/account/login',
      method: 'POST',
      userAgent: browserUA,
      ip: '198.51.100.77',
      nowMs: now + i * 100,
    });
    assert.equal(res.allowed, true, `req ${i + 1}`);
  }

  const throttled = botShield.evaluateIncomingRequest({
    pathname: '/api/account/login',
    method: 'POST',
    userAgent: browserUA,
    ip: '198.51.100.77',
    nowMs: now + 4000,
  });
  assert.equal(throttled.allowed, false);
  assert.equal(throttled.status, 429);
  assert.equal(throttled.reason, 'SENSITIVE_RATE_LIMIT');
  assert.ok(throttled.retryAfterSec >= 10);
});

test('Anti-cheat engine leaves normal paid users clean without false positives', () => {
  const normal = anticheat.evaluateUserFraudRisk({
    userId: 'usr_clean',
    name: 'Normal Designer',
    email: 'designer@example.com',
    status: 'active',
    rendersCommitted: 12,
    dielinesCommitted: 2,
    committedCoinSum: 160,
    openReservedCoins: 0,
    actualCoinBurn: 160,
    rendersStartedReported: 5,
    rendersCompletedReported: 5,
    dielinesStartedReported: 1,
    dielinesCompletedReported: 1,
    reportedExpectedCoins: 70,
    walletBalance: 340,
    ledgerBalance: 340,
    reservesTotal: 15,
    reservesReleased: 1,
    reservesExpiredOpen: 0,
    domSvgCopies: 0,
    sameIpAccountCount: 1,
  });

  assert.equal(normal.riskLevel, 'ok');
  assert.equal(normal.signals.length, 0);
  assert.equal(normal.coinDiscrepancy, 0);
  assert.equal(normal.walletDrift, 0);
});

test('Anti-cheat engine detects coin burn shortfall, release abuse, DOM dieline scraping, wallet drift, and IP farming', () => {
  const shortfall = anticheat.evaluateUserFraudRisk({
    userId: 'usr_cheat1',
    name: 'Bypass User',
    email: 'bypass@example.com',
    status: 'active',
    rendersCommitted: 1,
    dielinesCommitted: 0,
    committedCoinSum: 10,
    openReservedCoins: 0,
    actualCoinBurn: 10,
    rendersStartedReported: 1,
    rendersCompletedReported: 1,
    dielinesStartedReported: 3,
    dielinesCompletedReported: 3,
    reportedExpectedCoins: 70,
    walletBalance: 90,
    ledgerBalance: 90,
    reservesTotal: 6,
    reservesReleased: 4,
    reservesExpiredOpen: 1,
    domSvgCopies: 3,
    sameIpAccountCount: 4,
  });

  assert.equal(shortfall.riskLevel, 'high');
  assert.equal(shortfall.coinDiscrepancy, 60);
  const codes = new Set(shortfall.signals.map((s) => s.code));
  assert.ok(codes.has('COIN_BURN_SHORTFALL'));
  assert.ok(codes.has('RESERVATION_RELEASE_ABUSE'));
  assert.ok(codes.has('DOM_DIELINE_SCRAPE'));
  assert.ok(codes.has('MULTI_ACCOUNT_IP_FARM'));

  const drift = anticheat.evaluateUserFraudRisk({
    userId: 'usr_drift',
    name: 'Wallet Drift',
    email: 'drift@example.com',
    status: 'active',
    rendersCommitted: 0,
    dielinesCommitted: 0,
    committedCoinSum: 0,
    openReservedCoins: 0,
    actualCoinBurn: 0,
    rendersStartedReported: 0,
    rendersCompletedReported: 0,
    dielinesStartedReported: 0,
    dielinesCompletedReported: 0,
    reportedExpectedCoins: 0,
    walletBalance: 5000,
    ledgerBalance: 50,
    reservesTotal: 0,
    reservesReleased: 0,
    reservesExpiredOpen: 0,
    domSvgCopies: 0,
    sameIpAccountCount: 1,
  });
  assert.equal(drift.riskLevel, 'high');
  assert.equal(drift.walletDrift, 4950);
  assert.ok(drift.signals.some((s) => s.code === 'LEDGER_WALLET_DRIFT'));
});

test('Anti-cheat engine excludes admin accounts from fraud alerts and reports', async () => {
  const adminEval = anticheat.evaluateUserFraudRisk({
    userId: 'usr_admin',
    name: 'LabelLab Admin',
    email: 'labellab3d@gmail.com',
    role: 'admin',
    status: 'active',
    rendersCommitted: 1,
    dielinesCommitted: 0,
    committedCoinSum: 40,
    openReservedCoins: 0,
    actualCoinBurn: 40,
    rendersStartedReported: 4,
    rendersCompletedReported: 1,
    dielinesStartedReported: 0,
    dielinesCompletedReported: 0,
    reportedExpectedCoins: 40,
    walletBalance: 9999,
    ledgerBalance: 9999,
    reservesTotal: 4,
    reservesReleased: 3,
    reservesExpiredOpen: 0,
    domSvgCopies: 5,
    sameIpAccountCount: 5,
  });
  assert.equal(adminEval.riskLevel, 'ok');
  assert.equal(adminEval.signals.length, 0);

  // Also verify buildAntiCheatReport queries non-admin users only and filters out any admin row.
  const executedSql = [];
  const fakeDb = {
    batch: async () => [],
    prepare(sql) {
      executedSql.push(sql);
      const runQuery = async () => {
        if (sql.includes('FROM users u')) {
          return {
            results: [
              { id: 'usr_admin', name: 'LabelLab Admin', email: 'labellab3d@gmail.com', role: 'admin', status: 'active', walletBalance: 1000 },
              { id: 'usr_normal', name: 'Normal User', email: 'user@example.com', role: 'user', status: 'active', walletBalance: 100 },
            ],
          };
        }
        if (sql.includes('FROM coin_reservations')) {
          return {
            results: [
              { userId: 'usr_admin', reservesTotal: 4, rendersCommitted: 1, dielinesCommitted: 0, committedCoinSum: 40, openReservedCoins: 0, reservesReleased: 3, reservesExpiredOpen: 0 },
              { userId: 'usr_normal', reservesTotal: 1, rendersCommitted: 1, dielinesCommitted: 0, committedCoinSum: 10, openReservedCoins: 0, reservesReleased: 0, reservesExpiredOpen: 0 },
            ],
          };
        }
        if (sql.includes('FROM coin_ledger')) {
          return {
            results: [
              { userId: 'usr_admin', ledgerBalance: 1000, actualCoinBurn: 40 },
              { userId: 'usr_normal', ledgerBalance: 100, actualCoinBurn: 10 },
            ],
          };
        }
        return { results: [] };
      };
      return {
        bind: () => ({ all: runQuery, run: async () => ({}) }),
        all: runQuery,
        run: async () => ({}),
      };
    },
  };

  const report = await anticheat.buildAntiCheatReport({ DB: fakeDb }, 100);
  assert.ok(
    executedSql.some((sql) => sql.includes('FROM users u') && sql.includes("<> 'admin'")),
    'users query excludes admin role at SQL level',
  );
  assert.ok(
    executedSql.some((sql) => sql.includes('FROM legal_consents') && sql.includes("<> 'admin'")),
    'IP farming query excludes admin accounts from inflating same-IP counts',
  );
  assert.equal(report.users.length, 1);
  assert.equal(report.users[0].userId, 'usr_normal');
  assert.equal(report.alerts.length, 0);
  assert.equal(report.summary.flaggedUsersCount, 0);
  assert.equal(report.summary.totalUsersChecked, 1);
});

test('Worker request metering computes average requests per user/visitor and quota upgrade status', () => {
  const snapshot = requestMeter.buildWorkerQuotaSnapshot(
    [
      { day: '2026-11-26', totalRequests: 62_000, pageRequests: 20_000, apiRequests: 35_000, authRequests: 7_000, blockedRequests: 4_200 },
    ],
    [
      { actorType: 'user', uniqueActors: 500, totalRequests: 25_000 },
      { actorType: 'guest', uniqueActors: 4_000, totalRequests: 32_800 },
      { actorType: 'bot', uniqueActors: 120, totalRequests: 4_200 },
    ],
    { day: '2026-11-26' },
  );

  assert.equal(snapshot.totalRequests, 62_000);
  assert.equal(snapshot.blockedRequests, 4_200);
  assert.equal(snapshot.avgRequestsPerUser, 50);
  assert.equal(snapshot.avgRequestsPerVisitor, 12.8);
  assert.equal(snapshot.quotaPercent, 62);
  assert.equal(snapshot.status, 'watch');

  assert.equal(requestMeter.computeQuotaStatus(12_000).status, 'safe');
  assert.equal(requestMeter.computeQuotaStatus(85_000).status, 'upgrade');
});
