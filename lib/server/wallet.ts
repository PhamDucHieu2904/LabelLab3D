import { requireDb, randomId, nowIso, type AppEnv } from "./db";

export type LedgerEntry = { id: string; userId: string; amount: number; kind: string; reference: string; balance: number; createdAt: string };

export async function appendLedgerEntry(env: AppEnv, input: { userId: string; amount: number; kind: string; reference: string; idempotencyKey: string; metadata?: Record<string, unknown> }): Promise<LedgerEntry> {
  if (!Number.isSafeInteger(input.amount) || input.amount === 0) throw new Error("INVALID_AMOUNT");
  if (!input.userId || !input.idempotencyKey || input.idempotencyKey.length > 200 || input.reference.length > 240) throw new Error("INVALID_INPUT");
  const db = requireDb(env);

  // Idempotency keys are global. Replaying a key for another user or with a
  // different amount must fail closed instead of returning another user's
  // ledger entry.
  const existing = await db.prepare("SELECT id,user_id AS userId,amount,kind,reference,balance,created_at AS createdAt FROM coin_ledger WHERE idempotency_key=?").bind(input.idempotencyKey).first<LedgerEntry>();
  if (existing) {
    if (existing.userId !== input.userId || existing.amount !== input.amount || existing.kind !== input.kind || existing.reference !== input.reference) throw new Error("IDEMPOTENCY_CONFLICT");
    return existing;
  }

  // A failed compare-and-swap can happen under concurrent renders. Retry with
  // a fresh balance a few times; callers never need to invent a new key.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await db.prepare("SELECT balance FROM wallets WHERE user_id=?").bind(input.userId).first<{ balance: number }>();
    const oldBalance = Number(current?.balance ?? 0), nextBalance = oldBalance + input.amount;
    if (nextBalance < 0) throw new Error("INSUFFICIENT_COINS");
    const entry = { id: randomId("led"), userId: input.userId, amount: input.amount, kind: input.kind, reference: input.reference, balance: nextBalance, createdAt: nowIso() };
    try {
      const result = await db.batch([
        db.prepare("INSERT INTO wallets (user_id,balance,updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO NOTHING").bind(input.userId, oldBalance, entry.createdAt),
        db.prepare("UPDATE wallets SET balance=balance+?,updated_at=? WHERE user_id=? AND balance=? AND balance+? >= 0").bind(input.amount, entry.createdAt, input.userId, oldBalance, input.amount),
        // changes() refers to the immediately preceding CAS UPDATE. A stale
        // request therefore writes no ledger row and can safely retry.
        db.prepare("INSERT INTO coin_ledger (id,user_id,amount,kind,reference,idempotency_key,balance,metadata_json,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE changes()=1").bind(entry.id, entry.userId, entry.amount, entry.kind, entry.reference, input.idempotencyKey, entry.balance, JSON.stringify(input.metadata ?? {}), entry.createdAt),
      ]);
      if ((result[1]?.meta?.changes as number | undefined) === 1 && (result[2]?.meta?.changes as number | undefined) === 1) return entry;
      continue;
    } catch (error) {
      const replay = await db.prepare("SELECT id,user_id AS userId,amount,kind,reference,balance,created_at AS createdAt FROM coin_ledger WHERE idempotency_key=?").bind(input.idempotencyKey).first<LedgerEntry>();
      if (replay) {
        if (replay.userId !== input.userId || replay.amount !== input.amount || replay.kind !== input.kind || replay.reference !== input.reference) throw new Error("IDEMPOTENCY_CONFLICT");
        return replay;
      }
      const message = error instanceof Error ? error.message : "";
      if (message.includes("WALLET_CONFLICT") || message.includes("rollback")) continue;
      // A duplicate key can race with another request even when the replay
      // read above happened before the other transaction committed.
      if (message.toLowerCase().includes("unique") && attempt < 2) continue;
      throw error;
    }
  }
  throw new Error("WALLET_CONFLICT_RETRY");
}

export async function getCoinBalance(env: AppEnv, userId: string) {
  const row = await requireDb(env).prepare("SELECT balance FROM wallets WHERE user_id=?").bind(userId).first<{ balance: number }>();
  return Number(row?.balance ?? 0);
}

type Reservation = { id: string; userId: string; amount: number; status: "reserved" | "committed" | "released"; ledgerId: string | null; createdAt: string; updatedAt: string; expiresAt: string };

function reservationKey(key: string) {
  if (!/^reserve_[A-Za-z0-9_-]{16,120}$/.test(key)) throw new Error("INVALID_INPUT");
  return key;
}

async function readReservation(env: AppEnv, key: string) {
  return requireDb(env).prepare("SELECT id,user_id AS userId,amount,status,ledger_id AS ledgerId,created_at AS createdAt,updated_at AS updatedAt,expires_at AS expiresAt FROM coin_reservations WHERE idempotency_key=?").bind(key).first<Reservation>();
}

/** Hold coins by recording an auditable debit. Replays are idempotent. */
export async function reserveCoins(env: AppEnv, input: { userId: string; amount: number; idempotencyKey: string; reference: string; ttlSeconds?: number }) {
  const key = reservationKey(input.idempotencyKey);
  if (!input.userId || !Number.isSafeInteger(input.amount) || input.amount <= 0 || input.amount > 1000000 || !/^[A-Za-z0-9._:-]{1,240}$/.test(input.reference)) throw new Error("INVALID_INPUT");
  const db = requireDb(env), existing = await readReservation(env, key);
  if (existing) {
    if (existing.userId !== input.userId || existing.amount !== input.amount) throw new Error("IDEMPOTENCY_CONFLICT");
    return existing;
  }
  const now = nowIso(), ttl = Math.min(900, Math.max(30, Math.floor(input.ttlSeconds ?? 300))), expires = new Date(Date.parse(now) + ttl * 1000).toISOString(), id = randomId("res");
  try {
    await db.prepare("INSERT INTO coin_reservations (id,user_id,amount,idempotency_key,status,ledger_id,created_at,updated_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(id, input.userId, input.amount, key, "reserved", null, now, now, expires).run();
  } catch (e) {
    const raced = await readReservation(env, key);
    if (raced) {
      if (raced.userId !== input.userId || raced.amount !== input.amount) throw new Error("IDEMPOTENCY_CONFLICT");
      return raced;
    }
    throw e;
  }
  try {
    const entry = await appendLedgerEntry(env, { userId: input.userId, amount: -input.amount, kind: "reservation", reference: input.reference, idempotencyKey: `reservation_${key.slice(8)}`, metadata: { reservationId: id, expiresAt: expires } });
    await db.prepare("UPDATE coin_reservations SET ledger_id=?,updated_at=? WHERE id=? AND status='reserved'").bind(entry.id, nowIso(), id).run();
    return { ...(await readReservation(env, key) ?? { id, userId: input.userId, amount: input.amount, status: "reserved", ledgerId: entry.id, createdAt: now, updatedAt: now, expiresAt: expires }), balance: entry.balance };
  } catch (e) {
    await db.prepare("UPDATE coin_reservations SET status='released',updated_at=? WHERE id=? AND status='reserved'").bind(nowIso(), id).run();
    throw e;
  }
}

export async function commitCoins(env: AppEnv, input: { userId: string; idempotencyKey: string }) {
  const key = reservationKey(input.idempotencyKey), db = requireDb(env), row = await readReservation(env, key);
  if (!row || row.userId !== input.userId) throw new Error("NOT_FOUND");
  if (row.status === "committed") return row;
  if (row.status === "released") throw new Error("RESERVATION_RELEASED");
  if (Date.parse(row.expiresAt) <= Date.now()) { await releaseCoins(env, input); throw new Error("RESERVATION_EXPIRED"); }
  await db.prepare("UPDATE coin_reservations SET status='committed',updated_at=? WHERE id=? AND status='reserved'").bind(nowIso(), row.id).run();
  return await readReservation(env, key);
}

export async function releaseCoins(env: AppEnv, input: { userId: string; idempotencyKey: string }) {
  const key = reservationKey(input.idempotencyKey), db = requireDb(env), row = await readReservation(env, key);
  if (!row || row.userId !== input.userId) throw new Error("NOT_FOUND");
  if (row.status === "released") return row;
  if (row.status === "committed") throw new Error("RESERVATION_COMMITTED");
  const entry = await appendLedgerEntry(env, { userId: input.userId, amount: row.amount, kind: "reservation_release", reference: `reservation:${row.id}`, idempotencyKey: `release_${key.slice(8)}`, metadata: { reservationId: row.id } });
  await db.prepare("UPDATE coin_reservations SET status='released',updated_at=? WHERE id=? AND status='reserved'").bind(nowIso(), row.id).run();
  return { ...(await readReservation(env, key) ?? row), balance: entry.balance };
}
