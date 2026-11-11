import { nowIso, requireDb, sha256, type AppEnv } from "./db";

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

const tableReady = new WeakSet<object>();
async function ensureTable(env: AppEnv) {
  const db = requireDb(env);
  if (tableReady.has(db)) return db;
  await db.prepare("CREATE TABLE IF NOT EXISTS auth_rate_limits (scope TEXT PRIMARY KEY, failures INTEGER NOT NULL DEFAULT 0 CHECK (failures >= 0), locked_until TEXT, updated_at TEXT NOT NULL)").run();
  tableReady.add(db);
  return db;
}

export async function authScope(email: string, ip: string) {
  return sha256(`auth:v1:${email.toLowerCase()}:${ip}`);
}

export async function assertLoginAllowed(env: AppEnv, scope: string) {
  const row = await (await ensureTable(env)).prepare("SELECT failures,locked_until AS lockedUntil FROM auth_rate_limits WHERE scope=?").bind(scope).first<{ failures: number; lockedUntil: string | null }>();
  if (row?.lockedUntil && Date.parse(row.lockedUntil) > Date.now()) throw new Error("AUTH_RATE_LIMIT");
}

export async function recordLoginFailure(env: AppEnv, scope: string) {
  const db = await ensureTable(env), now = nowIso();
  const lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString();
  // Increment inside SQLite so simultaneous failures cannot overwrite one
  // another and let an attacker bypass the threshold with parallel requests.
  await db.prepare("INSERT INTO auth_rate_limits (scope,failures,locked_until,updated_at) VALUES (?,1,NULL,?) ON CONFLICT(scope) DO UPDATE SET failures=auth_rate_limits.failures+1,locked_until=CASE WHEN auth_rate_limits.failures+1 >= ? THEN ? ELSE auth_rate_limits.locked_until END,updated_at=excluded.updated_at").bind(scope, now, MAX_FAILURES, lockedUntil).run();
}

export async function clearLoginFailures(env: AppEnv, scope: string) {
  await (await ensureTable(env)).prepare("DELETE FROM auth_rate_limits WHERE scope=?").bind(scope).run();
}
