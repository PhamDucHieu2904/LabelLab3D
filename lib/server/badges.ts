import { requireDb, nowIso, type AppEnv } from "./db";

const CATALOG = [
  { id: "badge-first-checkin", slug: "first-checkin", name: "First check-in", description: "Completed your first daily check-in." },
  { id: "badge-seven-checkins", slug: "seven-checkins", name: "Seven day creator", description: "Completed seven daily check-ins." },
] as const;

export async function ensureBadgeCatalog(env: AppEnv) {
  const db = requireDb(env);
  const createdAt = nowIso();
  await db.batch(CATALOG.map((badge) => db.prepare("INSERT OR IGNORE INTO badges (id,slug,name,description,created_at) VALUES (?,?,?,?,?)").bind(badge.id, badge.slug, badge.name, badge.description, createdAt)));
}

export async function awardBadge(env: AppEnv, userId: string, slug: string, metadata: Record<string, unknown> = {}) {
  await ensureBadgeCatalog(env);
  const db = requireDb(env);
  const badge = await db.prepare("SELECT id FROM badges WHERE slug=?").bind(slug).first<{ id: string }>();
  if (!badge) return false;
  const result = await db.prepare("INSERT OR IGNORE INTO user_badges (user_id,badge_id,awarded_at,metadata_json) VALUES (?,?,?,?)").bind(userId, badge.id, nowIso(), JSON.stringify(metadata)).run();
  return (result.meta?.changes as number | undefined) === 1;
}
