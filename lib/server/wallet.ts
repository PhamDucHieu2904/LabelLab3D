import { requireDb, randomId, nowIso, type AppEnv } from "./db";

export type LedgerEntry = { id: string; userId: string; amount: number; kind: string; reference: string; balance: number; createdAt: string };

export async function appendLedgerEntry(env: AppEnv, input: { userId: string; amount: number; kind: string; reference: string; idempotencyKey: string; metadata?: Record<string, unknown> }): Promise<LedgerEntry> {
  if (!Number.isSafeInteger(input.amount) || input.amount === 0) throw new Error("INVALID_AMOUNT");
  const db = requireDb(env), existing = await db.prepare("SELECT id,user_id,amount,kind,reference,balance,created_at FROM coin_ledger WHERE idempotency_key=?").bind(input.idempotencyKey).first<LedgerEntry>();
  if (existing) return existing;
  const current = await db.prepare("SELECT balance FROM wallets WHERE user_id=?").bind(input.userId).first<{ balance: number }>();
  const oldBalance = Number(current?.balance ?? 0), nextBalance = oldBalance + input.amount;
  if (nextBalance < 0) throw new Error("INSUFFICIENT_COINS");
  const entry = { id: randomId("led"), userId: input.userId, amount: input.amount, kind: input.kind, reference: input.reference, balance: nextBalance, createdAt: nowIso() };
  const result = await db.batch([
    db.prepare("INSERT INTO wallets (user_id,balance,updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO NOTHING").bind(input.userId, oldBalance, entry.createdAt),
    db.prepare("UPDATE wallets SET balance=balance+?,updated_at=? WHERE user_id=? AND balance=? AND balance+? >= 0").bind(input.amount, entry.createdAt, input.userId, oldBalance, input.amount),
    db.prepare("INSERT INTO coin_ledger (id,user_id,amount,kind,reference,idempotency_key,balance,metadata_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(entry.id, entry.userId, entry.amount, entry.kind, entry.reference, input.idempotencyKey, entry.balance, JSON.stringify(input.metadata ?? {}), entry.createdAt),
  ]);
  if ((result[1]?.meta?.changes as number | undefined) !== 1) throw new Error("WALLET_CONFLICT_RETRY");
  return entry;
}

export async function getCoinBalance(env: AppEnv, userId: string) {
  const row = await requireDb(env).prepare("SELECT balance FROM wallets WHERE user_id=?").bind(userId).first<{ balance: number }>();
  return Number(row?.balance ?? 0);
}
