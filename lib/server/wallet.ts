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
