import { persistentManagementData, type ManagementRecord } from "@/lib/admin/management-data";
import { requireAdmin } from "@/lib/server/admin";
import { nowIso, randomId } from "@/lib/server/db";
import { assertSameOrigin, errorResponse, json } from "@/lib/server/http";
import { ensureSiteTables, loadManagementData, writeConfigJson } from "@/lib/server/site-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isValidManagementPayload(value: unknown): value is Record<string, ManagementRecord[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every(
    (list) => Array.isArray(list) && list.every(
      (row) => row && typeof row === "object"
        && typeof (row as ManagementRecord).id === "string"
        && typeof (row as ManagementRecord).name === "string"
        && typeof (row as ManagementRecord).status === "string"
        && (row as ManagementRecord).values && typeof (row as ManagementRecord).values === "object",
    ),
  );
}

export async function GET() {
  try {
    const { env } = await requireAdmin();
    const data = await loadManagementData(env);
    return json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    await assertSameOrigin();
    const { env, user: actor } = await requireAdmin();
    const body = await request.json().catch(() => ({})) as { data?: unknown; summary?: unknown; target?: unknown };
    if (!isValidManagementPayload(body.data)) throw new Error("INVALID_INPUT");

    const cleaned = persistentManagementData(body.data);
    const updatedAt = await writeConfigJson(env, "management", cleaned, actor.id);
    const db = await ensureSiteTables(env);
    const actionLabel = typeof body.summary === "string" && body.summary.trim() ? body.summary.trim().slice(0, 120) : "admin_management_update";
    const targetLabel = typeof body.target === "string" && body.target.trim() ? body.target.trim().slice(0, 160) : "management";
    await db.prepare(
      "INSERT INTO audit_events (id,actor_user_id,action,target_type,target_id,metadata_json,created_at) VALUES (?,?,?,?,?,?,?)",
    ).bind(randomId("audit"), actor.id, actionLabel, "site_config", targetLabel, JSON.stringify({ updatedAt }), nowIso()).run();

    return json({ ok: true, updatedAt, data: cleaned });
  } catch (error) {
    return errorResponse(error);
  }
}
