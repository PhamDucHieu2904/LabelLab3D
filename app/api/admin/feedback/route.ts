import { requireAdmin } from "@/lib/server/admin";
import { nowIso, randomId } from "@/lib/server/db";
import {
  ensureFeedbackTable,
  listAdminFeedback,
  sanitizeFeedbackStatus,
} from "@/lib/server/feedback";
import { assertSameOrigin, errorResponse, json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { env } = await requireAdmin();
    const url = new URL(request.url);
    const summaryOnly = url.searchParams.get("summary") === "1";
    const data = await listAdminFeedback(env, summaryOnly ? 1 : 250);
    if (summaryOnly) {
      return json({ summary: data.summary });
    }
    return json(data);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await assertSameOrigin();
    const { env, user: actor } = await requireAdmin();
    const db = await ensureFeedbackTable(env);
    const body = (await request.json().catch(() => ({}))) as {
      action?: unknown;
      id?: unknown;
      status?: unknown;
      adminNote?: unknown;
    };

    const now = nowIso();

    if (body.action === "mark_all_read") {
      await db
        .prepare("UPDATE user_feedback SET status = 'read', updated_at = ? WHERE status = 'new'")
        .bind(now)
        .run();
      return json({ ok: true });
    }

    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) throw new Error("INVALID_INPUT");

    const existing = await db
      .prepare("SELECT id, status, admin_note AS adminNote FROM user_feedback WHERE id = ?")
      .bind(id)
      .first<{ id: string; status: string; adminNote: string }>();
    if (!existing) throw new Error("NOT_FOUND");

    const nextStatus =
      body.status !== undefined ? sanitizeFeedbackStatus(body.status) : existing.status;
    if (!nextStatus) throw new Error("INVALID_INPUT");

    const nextNote =
      typeof body.adminNote === "string"
        ? body.adminNote.replace(/\r\n/g, "\n").trim().slice(0, 1000)
        : existing.adminNote;

    await db
      .prepare("UPDATE user_feedback SET status = ?, admin_note = ?, updated_at = ? WHERE id = ?")
      .bind(nextStatus, nextNote, now, id)
      .run();

    await db
      .prepare(
        "INSERT INTO audit_events (id,actor_user_id,action,target_type,target_id,metadata_json,created_at) VALUES (?,?,?,?,?,?,?)",
      )
      .bind(
        randomId("audit"),
        actor.id,
        "admin_feedback_update",
        "user_feedback",
        id,
        JSON.stringify({ status: nextStatus }),
        now,
      )
      .run();

    return json({ ok: true, id, status: nextStatus, adminNote: nextNote, updatedAt: now });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await assertSameOrigin();
    const { env, user: actor } = await requireAdmin();
    const db = await ensureFeedbackTable(env);
    const body = (await request.json().catch(() => ({}))) as { id?: unknown };
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) throw new Error("INVALID_INPUT");

    const existing = await db
      .prepare("SELECT id FROM user_feedback WHERE id = ?")
      .bind(id)
      .first<{ id: string }>();
    if (!existing) throw new Error("NOT_FOUND");

    await db.prepare("DELETE FROM user_feedback WHERE id = ?").bind(id).run();
    await db
      .prepare(
        "INSERT INTO audit_events (id,actor_user_id,action,target_type,target_id,metadata_json,created_at) VALUES (?,?,?,?,?,?,?)",
      )
      .bind(randomId("audit"), actor.id, "admin_feedback_delete", "user_feedback", id, "{}", nowIso())
      .run();

    return json({ ok: true, id });
  } catch (error) {
    return errorResponse(error);
  }
}
