/**
 * Lightweight Cloudflare Workers request quota & avg-requests-per-user metering.
 * Buffers increments in Worker isolate memory and flushes asynchronously via
 * ctx.waitUntil() so there is 0 ms user latency and minimal D1 row writes.
 */

import type { AppEnv, D1Database, D1Statement } from "./db";
import type { RequestCategory } from "./bot-shield";

export const CLOUDFLARE_FREE_DAILY_REQUEST_LIMIT = 100_000;

export type RequestActorType = "user" | "guest" | "bot";

export type DailyRequestRow = {
  day: string;
  totalRequests: number;
  pageRequests: number;
  apiRequests: number;
  authRequests: number;
  blockedRequests: number;
};

export type ActorAggregateRow = {
  actorType: RequestActorType;
  uniqueActors: number;
  totalRequests: number;
};

export type WorkerQuotaSnapshot = {
  day?: string;
  fromDay?: string;
  toDay?: string;
  totalRequests: number;
  pageRequests: number;
  apiRequests: number;
  authRequests: number;
  blockedRequests: number;
  uniqueUsers: number;
  uniqueGuests: number;
  uniqueBots: number;
  userRequests: number;
  guestRequests: number;
  avgRequestsPerUser: number;
  avgRequestsPerVisitor: number;
  quotaPercent: number;
  status: "safe" | "watch" | "upgrade";
  recommendation: string;
};

export type WorkerQuotaReport = {
  freeDailyLimit: number;
  today: WorkerQuotaSnapshot;
  period: WorkerQuotaSnapshot & {
    peakDay: string | null;
    peakRequests: number;
    daily: DailyRequestRow[];
  };
};

type DayBuffer = {
  total: number;
  page: number;
  api: number;
  auth: number;
  blocked: number;
  actors: Map<string, { type: RequestActorType; count: number }>;
};

const OFFSET_MS = 7 * 3600_000;
const FLUSH_BATCH_THRESHOLD = 8;
const FLUSH_INTERVAL_MS = 12_000;
const FLUSH_MAX_ACTORS = 25;

const pendingDays = new Map<string, DayBuffer>();
let pendingTotal = 0;
let lastFlushMs = 0;
let hasFlushedOnce = false;
const tablesReady = new WeakSet<object>();

export function currentVnDay(nowMs = Date.now()): string {
  return new Date(nowMs + OFFSET_MS).toISOString().slice(0, 10);
}

export async function ensureRequestMeterTables(db: D1Database) {
  if (tablesReady.has(db)) return;
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS worker_request_daily (
        day TEXT PRIMARY KEY,
        total_requests INTEGER NOT NULL DEFAULT 0 CHECK (total_requests >= 0),
        page_requests INTEGER NOT NULL DEFAULT 0 CHECK (page_requests >= 0),
        api_requests INTEGER NOT NULL DEFAULT 0 CHECK (api_requests >= 0),
        auth_requests INTEGER NOT NULL DEFAULT 0 CHECK (auth_requests >= 0),
        blocked_requests INTEGER NOT NULL DEFAULT 0 CHECK (blocked_requests >= 0),
        updated_at TEXT NOT NULL
      )`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS worker_request_actors (
        day TEXT NOT NULL,
        actor_key TEXT NOT NULL,
        actor_type TEXT NOT NULL CHECK (actor_type IN ('user','guest','bot')),
        request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
        updated_at TEXT NOT NULL,
        PRIMARY KEY (day, actor_key)
      )`,
    ),
    db.prepare("CREATE INDEX IF NOT EXISTS worker_request_actors_day_type ON worker_request_actors(day, actor_type)"),
  ]);
  tablesReady.add(db);
}

async function flushBufferToD1(db: D1Database, snapshot: Map<string, DayBuffer>) {
  if (snapshot.size === 0) return;
  await ensureRequestMeterTables(db);
  const now = new Date().toISOString();
  const statements: D1Statement[] = [];

  for (const [day, buf] of snapshot) {
    statements.push(
      db.prepare(
        `INSERT INTO worker_request_daily (day,total_requests,page_requests,api_requests,auth_requests,blocked_requests,updated_at)
         VALUES (?,?,?,?,?,?,?)
         ON CONFLICT(day) DO UPDATE SET
           total_requests = total_requests + excluded.total_requests,
           page_requests = page_requests + excluded.page_requests,
           api_requests = api_requests + excluded.api_requests,
           auth_requests = auth_requests + excluded.auth_requests,
           blocked_requests = blocked_requests + excluded.blocked_requests,
           updated_at = excluded.updated_at`,
      ).bind(day, buf.total, buf.page, buf.api, buf.auth, buf.blocked, now),
    );

    for (const [actorKey, actor] of buf.actors) {
      statements.push(
        db.prepare(
          `INSERT INTO worker_request_actors (day,actor_key,actor_type,request_count,updated_at)
           VALUES (?,?,?,?,?)
           ON CONFLICT(day,actor_key) DO UPDATE SET
             actor_type = CASE WHEN worker_request_actors.actor_type='user' THEN 'user' ELSE excluded.actor_type END,
             request_count = request_count + excluded.request_count,
             updated_at = excluded.updated_at`,
        ).bind(day, actorKey, actor.type, actor.count, now),
      );
    }
  }

  if (statements.length > 0) {
    await db.batch(statements);
  }
}

export function recordWorkerRequest(
  env: AppEnv | undefined,
  waitUntil: ((promise: Promise<unknown>) => void) | undefined,
  input: {
    category: RequestCategory;
    actorKey: string;
    actorType: RequestActorType;
    blocked: boolean;
    nowMs?: number;
  },
) {
  const db = env?.DB;
  if (!db) return;

  const nowMs = input.nowMs ?? Date.now();
  const day = currentVnDay(nowMs);
  let buf = pendingDays.get(day);
  if (!buf) {
    buf = { total: 0, page: 0, api: 0, auth: 0, blocked: 0, actors: new Map() };
    pendingDays.set(day, buf);
  }

  buf.total += 1;
  if (input.category === "page") buf.page += 1;
  else if (input.category === "auth") buf.auth += 1;
  else buf.api += 1;
  if (input.blocked) buf.blocked += 1;

  if (input.actorKey) {
    const existing = buf.actors.get(input.actorKey);
    if (existing) {
      existing.count += 1;
      if (input.actorType === "user") existing.type = "user";
    } else {
      buf.actors.set(input.actorKey, { type: input.actorType, count: 1 });
    }
  }

  pendingTotal += 1;
  let totalActors = 0;
  for (const item of pendingDays.values()) totalActors += item.actors.size;

  const shouldFlush =
    !hasFlushedOnce ||
    pendingTotal >= FLUSH_BATCH_THRESHOLD ||
    totalActors >= FLUSH_MAX_ACTORS ||
    nowMs - lastFlushMs >= FLUSH_INTERVAL_MS;

  if (!shouldFlush) return;

  const snapshot = new Map<string, DayBuffer>(pendingDays);
  pendingDays.clear();
  pendingTotal = 0;
  lastFlushMs = nowMs;
  hasFlushedOnce = true;

  const task = flushBufferToD1(db, snapshot).catch(() => {
    // Telemetry metering must never fail a real request.
  });
  if (typeof waitUntil === "function") {
    waitUntil(task);
  } else {
    void task;
  }
}

export function computeQuotaStatus(
  dailyTotalRequests: number,
  freeLimit = CLOUDFLARE_FREE_DAILY_REQUEST_LIMIT,
): { quotaPercent: number; status: "safe" | "watch" | "upgrade"; recommendation: string } {
  const quotaPercent = freeLimit > 0 ? Math.round((dailyTotalRequests / freeLimit) * 1000) / 10 : 0;
  if (quotaPercent >= 80) {
    return {
      quotaPercent,
      status: "upgrade",
      recommendation: "Đã vượt 80% hạn mức miễn phí 100k/ngày — nên nâng cấp Cloudflare Workers Paid ($5/tháng, 10 triệu req).",
    };
  }
  if (quotaPercent >= 55) {
    return {
      quotaPercent,
      status: "watch",
      recommendation: "Lưu lượng đang tăng (55–80% mốc free) — theo dõi sát tỷ lệ bot và chuẩn bị nâng cấp Workers Paid.",
    };
  }
  return {
    quotaPercent,
    status: "safe",
    recommendation: "An toàn trong gói Cloudflare Workers Free (100.000 request/ngày).",
  };
}

export function buildWorkerQuotaSnapshot(
  dailyRows: DailyRequestRow[],
  actorRows: ActorAggregateRow[],
  meta: { day?: string; fromDay?: string; toDay?: string },
): WorkerQuotaSnapshot {
  let totalRequests = 0;
  let pageRequests = 0;
  let apiRequests = 0;
  let authRequests = 0;
  let blockedRequests = 0;

  for (const row of dailyRows) {
    totalRequests += Number(row.totalRequests ?? 0);
    pageRequests += Number(row.pageRequests ?? 0);
    apiRequests += Number(row.apiRequests ?? 0);
    authRequests += Number(row.authRequests ?? 0);
    blockedRequests += Number(row.blockedRequests ?? 0);
  }

  let uniqueUsers = 0;
  let uniqueGuests = 0;
  let uniqueBots = 0;
  let userRequests = 0;
  let guestRequests = 0;

  for (const actor of actorRows) {
    if (actor.actorType === "user") {
      uniqueUsers += Number(actor.uniqueActors ?? 0);
      userRequests += Number(actor.totalRequests ?? 0);
    } else if (actor.actorType === "guest") {
      uniqueGuests += Number(actor.uniqueActors ?? 0);
      guestRequests += Number(actor.totalRequests ?? 0);
    } else {
      uniqueBots += Number(actor.uniqueActors ?? 0);
    }
  }

  const avgRequestsPerUser = uniqueUsers > 0 ? Math.round((userRequests / uniqueUsers) * 10) / 10 : 0;
  const totalHumanActors = uniqueUsers + uniqueGuests;
  const avgRequestsPerVisitor =
    totalHumanActors > 0 ? Math.round(((userRequests + guestRequests) / totalHumanActors) * 10) / 10 : 0;

  const dailyEquivalent = dailyRows.length > 0 ? Math.max(...dailyRows.map((r) => Number(r.totalRequests ?? 0))) : 0;
  const quotaEval = computeQuotaStatus(meta.day ? totalRequests : dailyEquivalent);

  return {
    ...meta,
    totalRequests,
    pageRequests,
    apiRequests,
    authRequests,
    blockedRequests,
    uniqueUsers,
    uniqueGuests,
    uniqueBots,
    userRequests,
    guestRequests,
    avgRequestsPerUser,
    avgRequestsPerVisitor,
    ...quotaEval,
  };
}

export async function getWorkerRequestReport(
  env: AppEnv,
  options: { fromDay: string; toDay: string; today?: string },
): Promise<WorkerQuotaReport> {
  const today = options.today ?? currentVnDay();
  const db = env.DB;
  if (!db) {
    const emptyToday = buildWorkerQuotaSnapshot([], [], { day: today });
    const emptyPeriod = buildWorkerQuotaSnapshot([], [], { fromDay: options.fromDay, toDay: options.toDay });
    return {
      freeDailyLimit: CLOUDFLARE_FREE_DAILY_REQUEST_LIMIT,
      today: emptyToday,
      period: { ...emptyPeriod, peakDay: null, peakRequests: 0, daily: [] },
    };
  }

  await ensureRequestMeterTables(db);

  const [todayDaily, todayActors, periodDaily, periodActors] = await Promise.all([
    db.prepare(
      `SELECT day,total_requests AS totalRequests,page_requests AS pageRequests,api_requests AS apiRequests,
              auth_requests AS authRequests,blocked_requests AS blockedRequests
       FROM worker_request_daily WHERE day=?`,
    ).bind(today).all<DailyRequestRow>(),
    db.prepare(
      `SELECT actor_type AS actorType,COUNT(DISTINCT actor_key) AS uniqueActors,COALESCE(SUM(request_count),0) AS totalRequests
       FROM worker_request_actors WHERE day=? GROUP BY actor_type`,
    ).bind(today).all<ActorAggregateRow>(),
    db.prepare(
      `SELECT day,total_requests AS totalRequests,page_requests AS pageRequests,api_requests AS apiRequests,
              auth_requests AS authRequests,blocked_requests AS blockedRequests
       FROM worker_request_daily WHERE day>=? AND day<=? ORDER BY day ASC`,
    ).bind(options.fromDay, options.toDay).all<DailyRequestRow>(),
    db.prepare(
      `SELECT actor_type AS actorType,COUNT(DISTINCT actor_key) AS uniqueActors,COALESCE(SUM(request_count),0) AS totalRequests
       FROM worker_request_actors WHERE day>=? AND day<=? GROUP BY actor_type`,
    ).bind(options.fromDay, options.toDay).all<ActorAggregateRow>(),
  ]);

  const periodRows = periodDaily.results ?? [];
  let peakDay: string | null = null;
  let peakRequests = 0;
  for (const row of periodRows) {
    const reqs = Number(row.totalRequests ?? 0);
    if (reqs > peakRequests) {
      peakRequests = reqs;
      peakDay = row.day;
    }
  }

  return {
    freeDailyLimit: CLOUDFLARE_FREE_DAILY_REQUEST_LIMIT,
    today: buildWorkerQuotaSnapshot(todayDaily.results ?? [], todayActors.results ?? [], { day: today }),
    period: {
      ...buildWorkerQuotaSnapshot(periodRows, periodActors.results ?? [], {
        fromDay: options.fromDay,
        toDay: options.toDay,
      }),
      peakDay,
      peakRequests,
      daily: periodRows,
    },
  };
}
