import { nowIso, requireDb, type AppEnv } from "./db";

export type StudioTourStatus = "pending" | "completed" | "skipped";

const tableReady = new WeakSet<object>();

export async function ensureOnboardingTable(env: AppEnv) {
  const db = requireDb(env);
  if (tableReady.has(db)) return db;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS user_onboarding (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        studio_tour_status TEXT NOT NULL DEFAULT 'pending' CHECK (studio_tour_status IN ('pending','completed','skipped')),
        updated_at TEXT NOT NULL
      )`,
    )
    .run();
  tableReady.add(db);
  return db;
}

/**
 * Marks a newly registered user as pending for the interactive Studio onboarding tour.
 * Existing accounts created before this feature will not have a row and therefore won't be auto-prompted.
 */
export async function markNewUserOnboardingPending(env: AppEnv, userId: string): Promise<void> {
  try {
    const db = await ensureOnboardingTable(env);
    await db
      .prepare(
        `INSERT INTO user_onboarding (user_id, studio_tour_status, updated_at)
         VALUES (?, 'pending', ?)
         ON CONFLICT(user_id) DO NOTHING`,
      )
      .bind(userId, nowIso())
      .run();
  } catch {
    // Non-fatal in minimal test DB harnesses that don't expose full user_onboarding support.
  }
}

export async function isStudioTourPending(env: AppEnv, userId: string): Promise<boolean> {
  try {
    const db = await ensureOnboardingTable(env);
    const row = await db
      .prepare("SELECT studio_tour_status AS status FROM user_onboarding WHERE user_id = ?")
      .bind(userId)
      .first<{ status: StudioTourStatus }>();
    return row?.status === "pending";
  } catch {
    return false;
  }
}

export async function setStudioTourStatus(
  env: AppEnv,
  userId: string,
  status: Exclude<StudioTourStatus, "pending">,
): Promise<void> {
  const db = await ensureOnboardingTable(env);
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO user_onboarding (user_id, studio_tour_status, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET studio_tour_status = excluded.studio_tour_status, updated_at = excluded.updated_at`,
    )
    .bind(userId, status, now)
    .run();
}
