/**
 * Automated Anti-Cheat & Per-User Coin Burn Reconciliation Engine.
 * Compares server-authoritative coin reservations & ledger burns against
 * batched studio session tool usage summaries, reservation release abuse,
 * wallet/ledger drift, DOM dieline copy heuristics, and multi-account IP farming.
 */

import { nowIso, randomId, requireDb, type AppEnv } from "./db";

export type FraudRiskLevel = "high" | "medium" | "ok";

export type FraudSignalCode =
  | "COIN_BURN_SHORTFALL"
  | "LEDGER_WALLET_DRIFT"
  | "RESERVATION_RELEASE_ABUSE"
  | "DOM_DIELINE_SCRAPE"
  | "MULTI_ACCOUNT_IP_FARM";

export type FraudSignal = {
  code: FraudSignalCode;
  severity: "high" | "medium";
  title: string;
  detail: string;
};

export type UserUsageMetrics = {
  userId: string;
  name: string;
  email: string;
  status: string;
  rendersCommitted: number;
  dielinesCommitted: number;
  committedCoinSum: number;
  openReservedCoins: number;
  actualCoinBurn: number;
  rendersStartedReported: number;
  rendersCompletedReported: number;
  dielinesStartedReported: number;
  dielinesCompletedReported: number;
  reportedExpectedCoins: number;
  walletBalance: number;
  ledgerBalance: number;
  reservesTotal: number;
  reservesReleased: number;
  reservesExpiredOpen: number;
  domSvgCopies: number;
  sameIpAccountCount: number;
};

export type UserAntiCheatRow = {
  userId: string;
  name: string;
  email: string;
  status: string;
  rendersCommitted: number;
  dielinesCommitted: number;
  toolUsesCommitted: number;
  toolUsesReported: number;
  expectedCoinBurn: number;
  actualCoinBurn: number;
  coinDiscrepancy: number;
  walletBalance: number;
  ledgerBalance: number;
  walletDrift: number;
  reservesTotal: number;
  reservesReleased: number;
  reservesExpiredOpen: number;
  releaseRatePct: number;
  domSvgCopies: number;
  sameIpAccountCount: number;
  riskLevel: FraudRiskLevel;
  signals: FraudSignal[];
};

export type AntiCheatReport = {
  generatedAt: string;
  summary: {
    totalUsersChecked: number;
    totalRendersCommitted: number;
    totalDielinesCommitted: number;
    totalToolUsesCommitted: number;
    totalToolUsesReported: number;
    totalExpectedCoinBurn: number;
    totalActualCoinBurn: number;
    totalCoinDiscrepancy: number;
    flaggedUsersCount: number;
    highRiskCount: number;
    mediumRiskCount: number;
  };
  alerts: UserAntiCheatRow[];
  users: UserAntiCheatRow[];
};

const tablesReady = new WeakSet<object>();

export async function ensureMonitoringTables(env: AppEnv) {
  const db = requireDb(env);
  if (tablesReady.has(db)) return db;
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS tool_usage_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        visitor_hash TEXT NOT NULL DEFAULT '',
        renders_started INTEGER NOT NULL DEFAULT 0 CHECK (renders_started >= 0),
        renders_completed INTEGER NOT NULL DEFAULT 0 CHECK (renders_completed >= 0),
        dielines_started INTEGER NOT NULL DEFAULT 0 CHECK (dielines_started >= 0),
        dielines_completed INTEGER NOT NULL DEFAULT 0 CHECK (dielines_completed >= 0),
        expected_coins INTEGER NOT NULL DEFAULT 0 CHECK (expected_coins >= 0),
        dom_svg_copies INTEGER NOT NULL DEFAULT 0 CHECK (dom_svg_copies >= 0),
        created_at TEXT NOT NULL
      )`,
    ),
    db.prepare("CREATE INDEX IF NOT EXISTS tool_usage_sessions_user_time ON tool_usage_sessions(user_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS tool_usage_sessions_time ON tool_usage_sessions(created_at)"),
  ]);
  tablesReady.add(db);
  return db;
}

function clampCount(value: unknown, max: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(max, n);
}

export async function recordToolUsageSummary(
  env: AppEnv,
  input: {
    userId: string | null;
    visitorHash: string;
    rendersStarted?: unknown;
    rendersCompleted?: unknown;
    dielinesStarted?: unknown;
    dielinesCompleted?: unknown;
    expectedCoins?: unknown;
    domSvgCopies?: unknown;
  },
) {
  const rendersStarted = clampCount(input.rendersStarted, 200);
  const rendersCompleted = clampCount(input.rendersCompleted, 200);
  const dielinesStarted = clampCount(input.dielinesStarted, 200);
  const dielinesCompleted = clampCount(input.dielinesCompleted, 200);
  const expectedCoins = clampCount(input.expectedCoins, 50_000);
  const domSvgCopies = clampCount(input.domSvgCopies, 200);

  if (
    rendersStarted === 0 &&
    rendersCompleted === 0 &&
    dielinesStarted === 0 &&
    dielinesCompleted === 0 &&
    expectedCoins === 0 &&
    domSvgCopies === 0
  ) {
    return { recorded: false };
  }

  const db = await ensureMonitoringTables(env);
  await db.prepare(
    `INSERT INTO tool_usage_sessions
      (id,user_id,visitor_hash,renders_started,renders_completed,dielines_started,dielines_completed,expected_coins,dom_svg_copies,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    randomId("use"),
    input.userId,
    input.visitorHash.slice(0, 64),
    rendersStarted,
    rendersCompleted,
    dielinesStarted,
    dielinesCompleted,
    expectedCoins,
    domSvgCopies,
    nowIso(),
  ).run();

  return { recorded: true };
}

/**
 * Pure, deterministic per-user fraud risk evaluator (unit tested directly).
 */
export function evaluateUserFraudRisk(metrics: UserUsageMetrics): UserAntiCheatRow {
  const toolUsesCommitted = metrics.rendersCommitted + metrics.dielinesCommitted;
  const toolUsesReported = metrics.rendersCompletedReported + metrics.dielinesCompletedReported;

  // Expected burn is the larger of server-committed coin obligations and
  // client-reported paid tool completions (since historical usage prior to
  // beacon deployment may have committedCoinSum > reportedExpectedCoins).
  const expectedCoinBurn = Math.max(metrics.committedCoinSum, metrics.reportedExpectedCoins);

  // Actual net burned coins excluding currently open (unexpired) reservations.
  const settledActualBurn = Math.max(0, metrics.actualCoinBurn - metrics.openReservedCoins);
  const coinDiscrepancy = expectedCoinBurn - settledActualBurn;
  const walletDrift = metrics.walletBalance - metrics.ledgerBalance;

  const failedHolds = metrics.reservesReleased + metrics.reservesExpiredOpen;
  const releaseRatePct =
    metrics.reservesTotal > 0 ? Math.round((failedHolds / metrics.reservesTotal) * 1000) / 10 : 0;

  const signals: FraudSignal[] = [];

  // 1. Coin burn shortfall: tool uses/expected coins exceed actual ledger burn.
  const serverBurnShortfall = metrics.committedCoinSum - settledActualBurn;
  const reportedBurnShortfall = metrics.reportedExpectedCoins - settledActualBurn;
  if (serverBurnShortfall > 0) {
    signals.push({
      code: "COIN_BURN_SHORTFALL",
      severity: "high",
      title: "Hao hụt coin không khớp lượt chốt",
      detail: `Chốt ${toolUsesCommitted} lượt công cụ (cần burn ${metrics.committedCoinSum} xu) nhưng sổ cái chỉ burn thực tế ${settledActualBurn} xu (thiếu ${serverBurnShortfall} xu).`,
    });
  } else if (reportedBurnShortfall > 0) {
    const severity: "high" | "medium" =
      reportedBurnShortfall >= 20 || toolUsesReported - toolUsesCommitted >= 2 ? "high" : "medium";
    signals.push({
      code: "COIN_BURN_SHORTFALL",
      severity,
      title: "Dùng công cụ nhiều hơn số coin bị trừ",
      detail: `Ghi nhận ${toolUsesReported} lượt xuất (dự kiến ${metrics.reportedExpectedCoins} xu) nhưng hệ thống chỉ chốt ${toolUsesCommitted} lượt (${settledActualBurn} xu, lệch ${reportedBurnShortfall} xu).`,
    });
  }

  // 2. Wallet balance vs Ledger sum drift (tampering or broken atomicity).
  if (walletDrift !== 0) {
    signals.push({
      code: "LEDGER_WALLET_DRIFT",
      severity: "high",
      title: "Lệch số dư ví so với sổ cái",
      detail: `Số dư ví hiện tại là ${metrics.walletBalance} xu nhưng tổng sổ cái là ${metrics.ledgerBalance} xu (chênh ${walletDrift > 0 ? `+${walletDrift}` : walletDrift} xu).`,
    });
  }

  // 3. Repeated reservation release / expiry abuse (blocking /commit to avoid paying).
  if ((failedHolds >= 3 && releaseRatePct >= 50) || failedHolds >= 5) {
    const severity: "high" | "medium" = failedHolds >= 5 || releaseRatePct >= 75 ? "high" : "medium";
    signals.push({
      code: "RESERVATION_RELEASE_ABUSE",
      severity,
      title: "Hủy giữ xu bất thường (nghi chặn commit)",
      detail: `${failedHolds}/${metrics.reservesTotal} lượt giữ xu bị hoàn trả/hết hạn (${releaseRatePct}%), nghi ngờ người dùng can thiệp DevTools để lấy kết quả không trả xu.`,
    });
  }

  // 4. DOM SVG dieline copying without paying for any dieline export.
  if (metrics.domSvgCopies >= 2 && metrics.dielinesCommitted === 0) {
    signals.push({
      code: "DOM_DIELINE_SCRAPE",
      severity: metrics.domSvgCopies >= 4 ? "high" : "medium",
      title: "Sao chép SVG Dieline trực tiếp từ DOM",
      detail: `Phát hiện ${metrics.domSvgCopies} lần sao chép vùng Dieline SVG trong trình duyệt nhưng chưa từng thanh toán lượt xuất Dieline nào.`,
    });
  }

  // 5. Multi-account IP farming (farming welcome bonus / daily check-in coins).
  if (metrics.sameIpAccountCount >= 3) {
    signals.push({
      code: "MULTI_ACCOUNT_IP_FARM",
      severity: metrics.sameIpAccountCount >= 5 ? "high" : "medium",
      title: "Nghi tạo nhiều tài khoản cày xu miễn phí",
      detail: `Cùng dấu vân tay IP có ${metrics.sameIpAccountCount} tài khoản đăng ký (nguy cơ cày welcome bonus / điểm danh).`,
    });
  }

  const riskLevel: FraudRiskLevel = signals.some((sig) => sig.severity === "high")
    ? "high"
    : signals.length > 0
      ? "medium"
      : "ok";

  return {
    userId: metrics.userId,
    name: metrics.name,
    email: metrics.email,
    status: metrics.status,
    rendersCommitted: metrics.rendersCommitted,
    dielinesCommitted: metrics.dielinesCommitted,
    toolUsesCommitted,
    toolUsesReported,
    expectedCoinBurn,
    actualCoinBurn: settledActualBurn,
    coinDiscrepancy,
    walletBalance: metrics.walletBalance,
    ledgerBalance: metrics.ledgerBalance,
    walletDrift,
    reservesTotal: metrics.reservesTotal,
    reservesReleased: metrics.reservesReleased,
    reservesExpiredOpen: metrics.reservesExpiredOpen,
    releaseRatePct,
    domSvgCopies: metrics.domSvgCopies,
    sameIpAccountCount: metrics.sameIpAccountCount,
    riskLevel,
    signals,
  };
}

export async function buildAntiCheatReport(env: AppEnv, limit = 300): Promise<AntiCheatReport> {
  const db = await ensureMonitoringTables(env);
  const now = nowIso();

  const [usersRes, resAggRes, ledgerAggRes, usageAggRes, ipFarmRes] = await Promise.all([
    db.prepare(
      `SELECT u.id,u.name,u.email,u.status,COALESCE(w.balance,0) AS walletBalance
       FROM users u LEFT JOIN wallets w ON w.user_id=u.id
       ORDER BY u.created_at DESC LIMIT ?`,
    ).bind(limit).all<{ id: string; name: string; email: string; status: string; walletBalance: number }>(),

    db.prepare(
      `SELECT user_id AS userId,
         COUNT(*) AS reservesTotal,
         SUM(CASE WHEN status='committed' AND reference LIKE 'render:%' THEN 1 ELSE 0 END) AS rendersCommitted,
         SUM(CASE WHEN status='committed' AND reference LIKE 'dieline:%' THEN 1 ELSE 0 END) AS dielinesCommitted,
         SUM(CASE WHEN status='committed' THEN amount ELSE 0 END) AS committedCoinSum,
         SUM(CASE WHEN status='reserved' AND expires_at > ? THEN amount ELSE 0 END) AS openReservedCoins,
         SUM(CASE WHEN status='released' THEN 1 ELSE 0 END) AS reservesReleased,
         SUM(CASE WHEN status='reserved' AND expires_at <= ? THEN 1 ELSE 0 END) AS reservesExpiredOpen
       FROM coin_reservations GROUP BY user_id`,
    ).bind(now, now).all<{
      userId: string;
      reservesTotal: number;
      rendersCommitted: number;
      dielinesCommitted: number;
      committedCoinSum: number;
      openReservedCoins: number;
      reservesReleased: number;
      reservesExpiredOpen: number;
    }>(),

    db.prepare(
      `SELECT user_id AS userId,
         COALESCE(SUM(amount), 0) AS ledgerBalance,
         COALESCE(SUM(CASE
           WHEN kind IN ('reservation','render') AND amount < 0 THEN -amount
           WHEN kind = 'reservation_release' AND amount > 0 THEN -amount
           ELSE 0
         END), 0) AS actualCoinBurn
       FROM coin_ledger GROUP BY user_id`,
    ).all<{ userId: string; ledgerBalance: number; actualCoinBurn: number }>(),

    db.prepare(
      `SELECT user_id AS userId,
         COALESCE(SUM(renders_started),0) AS rendersStartedReported,
         COALESCE(SUM(renders_completed),0) AS rendersCompletedReported,
         COALESCE(SUM(dielines_started),0) AS dielinesStartedReported,
         COALESCE(SUM(dielines_completed),0) AS dielinesCompletedReported,
         COALESCE(SUM(expected_coins),0) AS reportedExpectedCoins,
         COALESCE(SUM(dom_svg_copies),0) AS domSvgCopies
       FROM tool_usage_sessions WHERE user_id IS NOT NULL GROUP BY user_id`,
    ).all<{
      userId: string;
      rendersStartedReported: number;
      rendersCompletedReported: number;
      dielinesStartedReported: number;
      dielinesCompletedReported: number;
      reportedExpectedCoins: number;
      domSvgCopies: number;
    }>(),

    db.prepare(
      `SELECT lc.user_id AS userId, MAX(ip_counts.account_count) AS sameIpAccountCount
       FROM legal_consents lc
       JOIN (
         SELECT ip_hash, COUNT(DISTINCT user_id) AS account_count
         FROM legal_consents
         WHERE consent_type IN ('register_email','oauth_google')
           AND ip_hash IS NOT NULL AND ip_hash <> '' AND user_id IS NOT NULL
         GROUP BY ip_hash
       ) ip_counts ON ip_counts.ip_hash = lc.ip_hash
       WHERE lc.user_id IS NOT NULL
       GROUP BY lc.user_id`,
    ).all<{ userId: string; sameIpAccountCount: number }>().catch(() => ({ results: [] as Array<{ userId: string; sameIpAccountCount: number }> })),
  ]);

  const resMap = new Map((resAggRes.results ?? []).map((r) => [r.userId, r]));
  const ledgerMap = new Map((ledgerAggRes.results ?? []).map((r) => [r.userId, r]));
  const usageMap = new Map((usageAggRes.results ?? []).map((r) => [r.userId, r]));
  const ipFarmMap = new Map((ipFarmRes.results ?? []).map((r) => [r.userId, Number(r.sameIpAccountCount ?? 1)]));

  const evaluated: UserAntiCheatRow[] = (usersRes.results ?? []).map((u) => {
    const r = resMap.get(u.id);
    const l = ledgerMap.get(u.id);
    const us = usageMap.get(u.id);
    return evaluateUserFraudRisk({
      userId: u.id,
      name: u.name,
      email: u.email,
      status: u.status,
      rendersCommitted: Number(r?.rendersCommitted ?? 0),
      dielinesCommitted: Number(r?.dielinesCommitted ?? 0),
      committedCoinSum: Number(r?.committedCoinSum ?? 0),
      openReservedCoins: Number(r?.openReservedCoins ?? 0),
      actualCoinBurn: Number(l?.actualCoinBurn ?? 0),
      rendersStartedReported: Number(us?.rendersStartedReported ?? 0),
      rendersCompletedReported: Number(us?.rendersCompletedReported ?? 0),
      dielinesStartedReported: Number(us?.dielinesStartedReported ?? 0),
      dielinesCompletedReported: Number(us?.dielinesCompletedReported ?? 0),
      reportedExpectedCoins: Number(us?.reportedExpectedCoins ?? 0),
      walletBalance: Number(u.walletBalance ?? 0),
      ledgerBalance: Number(l?.ledgerBalance ?? 0),
      reservesTotal: Number(r?.reservesTotal ?? 0),
      reservesReleased: Number(r?.reservesReleased ?? 0),
      reservesExpiredOpen: Number(r?.reservesExpiredOpen ?? 0),
      domSvgCopies: Number(us?.domSvgCopies ?? 0),
      sameIpAccountCount: ipFarmMap.get(u.id) ?? 1,
    });
  });

  const rank = (level: FraudRiskLevel) => (level === "high" ? 2 : level === "medium" ? 1 : 0);
  evaluated.sort((a, b) => {
    const diff = rank(b.riskLevel) - rank(a.riskLevel);
    if (diff !== 0) return diff;
    if (b.coinDiscrepancy !== a.coinDiscrepancy) return b.coinDiscrepancy - a.coinDiscrepancy;
    return b.toolUsesCommitted - a.toolUsesCommitted;
  });

  const alerts = evaluated.filter((row) => row.riskLevel !== "ok");
  const summary = evaluated.reduce(
    (acc, row) => {
      acc.totalRendersCommitted += row.rendersCommitted;
      acc.totalDielinesCommitted += row.dielinesCommitted;
      acc.totalToolUsesCommitted += row.toolUsesCommitted;
      acc.totalToolUsesReported += row.toolUsesReported;
      acc.totalExpectedCoinBurn += row.expectedCoinBurn;
      acc.totalActualCoinBurn += row.actualCoinBurn;
      acc.totalCoinDiscrepancy += row.coinDiscrepancy;
      if (row.riskLevel === "high") acc.highRiskCount += 1;
      else if (row.riskLevel === "medium") acc.mediumRiskCount += 1;
      return acc;
    },
    {
      totalUsersChecked: evaluated.length,
      totalRendersCommitted: 0,
      totalDielinesCommitted: 0,
      totalToolUsesCommitted: 0,
      totalToolUsesReported: 0,
      totalExpectedCoinBurn: 0,
      totalActualCoinBurn: 0,
      totalCoinDiscrepancy: 0,
      flaggedUsersCount: alerts.length,
      highRiskCount: 0,
      mediumRiskCount: 0,
    },
  );

  return {
    generatedAt: now,
    summary,
    alerts,
    users: evaluated,
  };
}
