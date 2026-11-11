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
  await settleExpiredReservations(env, userId);
  const row = await requireDb(env).prepare("SELECT balance FROM wallets WHERE user_id=?").bind(userId).first<{ balance: number }>();
  return Number(row?.balance ?? 0);
}

type Reservation = { id: string; userId: string; amount: number; reference: string; status: "reserved" | "committed" | "released"; ledgerId: string | null; createdAt: string; updatedAt: string; expiresAt: string };

function reservationKey(key: string) {
  if (!/^reserve_[A-Za-z0-9_-]{16,120}$/.test(key)) throw new Error("INVALID_INPUT");
  return key;
}

async function readReservation(env: AppEnv, key: string) {
  return requireDb(env).prepare("SELECT id,user_id AS userId,amount,reference,status,ledger_id AS ledgerId,created_at AS createdAt,updated_at AS updatedAt,expires_at AS expiresAt FROM coin_reservations WHERE idempotency_key=?").bind(key).first<Reservation>();
}

function reservationLedgerKey(key: string) { return `reservation_${key.slice(8)}`; }
function releaseLedgerKey(key: string) { return `release_${key.slice(8)}`; }

async function reservationLedger(env: AppEnv, key: string) {
  return requireDb(env).prepare("SELECT id,user_id AS userId,amount,kind,reference,balance,created_at AS createdAt FROM coin_ledger WHERE idempotency_key=?").bind(reservationLedgerKey(key)).first<LedgerEntry>();
}

async function assertReservationLedger(env: AppEnv, key: string, row: Reservation) {
  const ledger = await reservationLedger(env, key);
  if (!ledger) return null;
  const expectedReference = row.reference || ledger.reference;
  if (ledger.userId !== row.userId || ledger.amount !== -row.amount || ledger.kind !== "reservation" || ledger.reference !== expectedReference) throw new Error("IDEMPOTENCY_CONFLICT");
  if (!row.reference) await requireDb(env).prepare("UPDATE coin_reservations SET reference=?,updated_at=? WHERE id=? AND reference='' ").bind(ledger.reference, nowIso(), row.id).run();
  if (!row.ledgerId) await requireDb(env).prepare("UPDATE coin_reservations SET ledger_id=?,updated_at=? WHERE id=? AND ledger_id IS NULL").bind(ledger.id, nowIso(), row.id).run();
  return ledger;
}

/**
 * Repair the only intentionally recoverable gap in reservation creation: the
 * debit may have committed while the isolate died before ledger_id was saved.
 * The deterministic ledger idempotency key makes repair safe under retries.
 */
async function ensureReservationLedger(env: AppEnv, key: string, row: Reservation, reference: string) {
  if (row.reference && row.reference !== reference) throw new Error("IDEMPOTENCY_CONFLICT");
  const effectiveReference = row.reference || reference;
  const existing = await assertReservationLedger(env, key, row);
  if (existing) return existing;
  try {
    const entry = await appendLedgerEntry(env, {
      userId: row.userId,
      amount: -row.amount,
      kind: "reservation",
      reference: effectiveReference,
      idempotencyKey: reservationLedgerKey(key),
      metadata: { reservationId: row.id, expiresAt: row.expiresAt },
    });
    await requireDb(env).prepare("UPDATE coin_reservations SET ledger_id=?,updated_at=? WHERE id=? AND ledger_id IS NULL").bind(entry.id, nowIso(), row.id).run();
    return entry;
  } catch (error) {
    // A failed debit due to insufficient funds can be terminally released.
    // Unknown errors remain reserved so a later retry can reconcile a debit
    // that may have committed immediately before the error was observed.
    if (error instanceof Error && error.message === "INSUFFICIENT_COINS") {
      await requireDb(env).prepare("UPDATE coin_reservations SET status='released',updated_at=? WHERE id=? AND status='reserved' AND ledger_id IS NULL").bind(nowIso(), row.id).run();
    }
    throw error;
  }
}

async function reservationReference(env: AppEnv, key: string, row: Reservation) {
  const ledger = await reservationLedger(env, key);
  if (!ledger) return null;
  if (ledger.userId !== row.userId || ledger.amount !== -row.amount || ledger.kind !== "reservation" || (row.reference && ledger.reference !== row.reference)) throw new Error("IDEMPOTENCY_CONFLICT");
  if (!row.reference || !row.ledgerId) await requireDb(env).prepare("UPDATE coin_reservations SET reference=CASE WHEN reference='' THEN ? ELSE reference END,ledger_id=COALESCE(ledger_id,?),updated_at=? WHERE id=?").bind(ledger.reference, ledger.id, nowIso(), row.id).run();
  return ledger.reference;
}

async function ensureReleaseLedger(env: AppEnv, key: string, row: Reservation) {
  const db = requireDb(env);
  const existing = await db.prepare("SELECT id,user_id AS userId,amount,kind,reference,balance,created_at AS createdAt FROM coin_ledger WHERE idempotency_key=?").bind(releaseLedgerKey(key)).first<LedgerEntry>();
  if (existing) {
    if (existing.userId !== row.userId || existing.amount !== row.amount || existing.kind !== "reservation_release" || existing.reference !== `reservation:${row.id}`) throw new Error("IDEMPOTENCY_CONFLICT");
    return existing;
  }
  return appendLedgerEntry(env, {
    userId: row.userId,
    amount: row.amount,
    kind: "reservation_release",
    reference: `reservation:${row.id}`,
    idempotencyKey: releaseLedgerKey(key),
    metadata: { reservationId: row.id },
  });
}

/** Release expired holds when the account is touched, so a dead render job
 * cannot leave a debit outstanding forever. The status CAS remains the
 * linearization point; the idempotent ledger write is safe to retry after a
 * worker crash. */
async function settleExpiredReservations(env: AppEnv, userId: string) {
  const db = requireDb(env), cutoff = nowIso();
  const rows = await db.prepare("SELECT id,user_id AS userId,amount,reference,status,ledger_id AS ledgerId,created_at AS createdAt,updated_at AS updatedAt,expires_at AS expiresAt FROM coin_reservations WHERE user_id=? AND expires_at <= ? AND (status='reserved' OR status='released') ORDER BY expires_at LIMIT 50").bind(userId, cutoff).all<Reservation>();
  for (const row of rows.results ?? []) {
    if (row.status === "reserved") {
      const claim = await db.prepare("UPDATE coin_reservations SET status='released',updated_at=? WHERE id=? AND status='reserved' AND expires_at <= ?").bind(nowIso(), row.id, cutoff).run();
      if ((claim.meta?.changes as number | undefined) !== 1) continue;
    }
    const key = await db.prepare("SELECT idempotency_key AS idempotencyKey FROM coin_reservations WHERE id=?").bind(row.id).first<{ idempotencyKey: string }>();
    if (key) {
      let settled = row;
      if (!settled.ledgerId) {
        const debit = await reservationLedger(env, key.idempotencyKey);
        if (debit) {
          if (debit.userId !== settled.userId || debit.amount !== -settled.amount || debit.kind !== "reservation") throw new Error("IDEMPOTENCY_CONFLICT");
          await db.prepare("UPDATE coin_reservations SET reference=CASE WHEN reference='' THEN ? ELSE reference END,ledger_id=COALESCE(ledger_id,?),updated_at=? WHERE id=?").bind(debit.reference, debit.id, nowIso(), settled.id).run();
          settled = (await readReservation(env, key.idempotencyKey)) ?? settled;
        } else if (settled.status === "reserved" && settled.reference) {
          await ensureReservationLedger(env, key.idempotencyKey, settled, settled.reference);
          settled = (await readReservation(env, key.idempotencyKey)) ?? settled;
        }
      }
      if (settled.ledgerId) await ensureReleaseLedger(env, key.idempotencyKey, settled);
    }
  }
}

/** Hold coins by recording an auditable debit. Replays are idempotent. */
export async function reserveCoins(env: AppEnv, input: { userId: string; amount: number; idempotencyKey: string; reference: string; ttlSeconds?: number }) {
  const key = reservationKey(input.idempotencyKey);
  if (!input.userId || !Number.isSafeInteger(input.amount) || input.amount <= 0 || input.amount > 1000000 || !/^[A-Za-z0-9._:-]{1,240}$/.test(input.reference)) throw new Error("INVALID_INPUT");
  await settleExpiredReservations(env, input.userId);
  const db = requireDb(env), existing = await readReservation(env, key);
  if (existing) {
    if (existing.userId !== input.userId || existing.amount !== input.amount) throw new Error("IDEMPOTENCY_CONFLICT");
    if (existing.reference && existing.reference !== input.reference) throw new Error("IDEMPOTENCY_CONFLICT");
    if (existing.status === "reserved" || existing.status === "committed") {
      const entry = await ensureReservationLedger(env, key, existing, input.reference);
      return { ...((await readReservation(env, key)) ?? existing), balance: entry.balance };
    }
    const existingReference = await reservationReference(env, key, existing);
    if (existingReference !== null && existingReference !== input.reference) throw new Error("IDEMPOTENCY_CONFLICT");
    return existing;
  }
  const now = nowIso(), ttl = Math.min(900, Math.max(30, Math.floor(input.ttlSeconds ?? 300))), expires = new Date(Date.parse(now) + ttl * 1000).toISOString(), id = randomId("res");
  try {
    await db.prepare("INSERT INTO coin_reservations (id,user_id,amount,reference,idempotency_key,status,ledger_id,created_at,updated_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(id, input.userId, input.amount, input.reference, key, "reserved", null, now, now, expires).run();
  } catch (e) {
    const raced = await readReservation(env, key);
    if (raced) {
      if (raced.userId !== input.userId || raced.amount !== input.amount) throw new Error("IDEMPOTENCY_CONFLICT");
      if (raced.status === "reserved" || raced.status === "committed") {
        const entry = await ensureReservationLedger(env, key, raced, input.reference);
        return { ...((await readReservation(env, key)) ?? raced), balance: entry.balance };
      }
      if (raced.reference && raced.reference !== input.reference) throw new Error("IDEMPOTENCY_CONFLICT");
      const racedReference = await reservationReference(env, key, raced);
      if (racedReference !== null && racedReference !== input.reference) throw new Error("IDEMPOTENCY_CONFLICT");
      return raced;
    }
    throw e;
  }
  try {
    const row = (await readReservation(env, key))!;
    const entry = await ensureReservationLedger(env, key, row, input.reference);
    return { ...(await readReservation(env, key) ?? { id, userId: input.userId, amount: input.amount, status: "reserved", ledgerId: entry.id, createdAt: now, updatedAt: now, expiresAt: expires }), balance: entry.balance };
  } catch (e) {
    if (e instanceof Error && e.message === "INSUFFICIENT_COINS") await db.prepare("UPDATE coin_reservations SET status='released',updated_at=? WHERE id=? AND status='reserved' AND ledger_id IS NULL").bind(nowIso(), id).run();
    throw e;
  }
}

export async function commitCoins(env: AppEnv, input: { userId: string; idempotencyKey: string }) {
  const key = reservationKey(input.idempotencyKey), db = requireDb(env), row = await readReservation(env, key);
  if (!row || row.userId !== input.userId) throw new Error("NOT_FOUND");
  if (row.status === "committed") return row;
  if (row.status === "released") throw new Error("RESERVATION_RELEASED");
  const reference = await reservationReference(env, key, row);
  if (!reference) throw new Error("RESERVATION_NOT_READY");
  const commitNow = nowIso();
  if (Date.parse(row.expiresAt) <= Date.parse(commitNow)) { await releaseCoins(env, input); throw new Error("RESERVATION_EXPIRED"); }
  // Include expiry in the same CAS. A request that was delayed past the TTL
  // must not commit merely because it read the row before the deadline.
  const result = await db.prepare("UPDATE coin_reservations SET status='committed',updated_at=? WHERE id=? AND status='reserved' AND ledger_id IS NOT NULL AND expires_at > ?").bind(commitNow, row.id, commitNow).run();
  if ((result.meta?.changes as number | undefined) !== 1) {
    const raced = await readReservation(env, key);
    if (raced?.status === "committed") return raced;
    if (raced?.status === "released") throw new Error("RESERVATION_RELEASED");
    if (raced?.status === "reserved" && Date.parse(raced.expiresAt) <= Date.now()) {
      await releaseCoins(env, input);
      throw new Error("RESERVATION_EXPIRED");
    }
    throw new Error("RESERVATION_CONFLICT");
  }
  return (await readReservation(env, key))!;
}

export async function releaseCoins(env: AppEnv, input: { userId: string; idempotencyKey: string }) {
  const key = reservationKey(input.idempotencyKey), db = requireDb(env), row = await readReservation(env, key);
  if (!row || row.userId !== input.userId) throw new Error("NOT_FOUND");
  if (row.status === "released") {
    if (!row.ledgerId) {
      const debit = await reservationLedger(env, key);
      if (!debit) return row;
      if (debit.userId !== row.userId || debit.amount !== -row.amount || debit.kind !== "reservation") throw new Error("IDEMPOTENCY_CONFLICT");
      await db.prepare("UPDATE coin_reservations SET ledger_id=?,updated_at=? WHERE id=? AND ledger_id IS NULL").bind(debit.id, nowIso(), row.id).run();
    }
    const entry = await ensureReleaseLedger(env, key, row);
    return { ...((await readReservation(env, key)) ?? row), balance: entry.balance };
  }
  if (row.status === "committed") throw new Error("RESERVATION_COMMITTED");
  const reference = await reservationReference(env, key, row);
  if (!reference) throw new Error("RESERVATION_NOT_READY");
  // Claim the reservation before crediting the wallet.  The status CAS is the
  // linearization point shared with commitCoins: exactly one of commit/release
  // can win, so a late release can never refund a reservation that committed.
  const result = await db.prepare("UPDATE coin_reservations SET status='released',updated_at=? WHERE id=? AND status='reserved' AND ledger_id IS NOT NULL").bind(nowIso(), row.id).run();
  if ((result.meta?.changes as number | undefined) !== 1) {
    const raced = await readReservation(env, key);
    if (raced?.status === "released") return releaseCoins(env, input);
    if (raced?.status === "committed") throw new Error("RESERVATION_COMMITTED");
    throw new Error("RESERVATION_CONFLICT");
  }
  const entry = await ensureReleaseLedger(env, key, row);
  return { ...(await readReservation(env, key) ?? row), balance: entry.balance };
}
