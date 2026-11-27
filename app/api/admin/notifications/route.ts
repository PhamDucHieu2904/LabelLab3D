import { requireAdmin } from "@/lib/server/admin";
import { nowIso, randomId } from "@/lib/server/db";
import { ensureFeedbackTable } from "@/lib/server/feedback";
import { assertSameOrigin, errorResponse, json } from "@/lib/server/http";
import {
  broadcastNotificationToActiveUsers,
  createUserNotification,
  ensureNotificationTable,
  listAdminSentNotifications,
  sanitizeNotificationBody,
  sanitizeNotificationKind,
  sanitizeNotificationTitle,
} from "@/lib/server/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { env } = await requireAdmin();
    const items = await listAdminSentNotifications(env, 150);
    return json({ items });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const { env, user: actor } = await requireAdmin();
    const db = await ensureNotificationTable(env);

    const body = (await request.json().catch(() => ({}))) as {
      target?: unknown;
      userId?: unknown;
      kind?: unknown;
      title?: unknown;
      body?: unknown;
      feedbackId?: unknown;
      markFeedbackResolved?: unknown;
    };

    const title = sanitizeNotificationTitle(body.title);
    const message = sanitizeNotificationBody(body.body);
    if (title.length < 2 || message.length < 2) {
      throw new Error("INVALID_INPUT");
    }

    const kind = sanitizeNotificationKind(body.kind);
    const target = body.target === "all" ? "all" : "user";

    if (target === "all") {
      const result = await broadcastNotificationToActiveUsers(env, {
        senderAdminId: actor.id,
        title,
        body: message,
        kind: kind === "feedback_reply" ? "admin_message" : kind,
      });
      await db
        .prepare(
          "INSERT INTO audit_events (id,actor_user_id,action,target_type,target_id,metadata_json,created_at) VALUES (?,?,?,?,?,?,?)",
        )
        .bind(
          randomId("audit"),
          actor.id,
          "admin_notification_broadcast",
          "user_notifications",
          "all_active_users",
          JSON.stringify({ sentCount: result.sentCount, title }),
          result.createdAt,
        )
        .run();
      return json({ ok: true, target: "all", sentCount: result.sentCount, createdAt: result.createdAt }, { status: 201 });
    }

    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    if (!userId) throw new Error("INVALID_INPUT");

    const targetUser = await db
      .prepare("SELECT id, email FROM users WHERE id = ?")
      .bind(userId)
      .first<{ id: string; email: string }>();
    if (!targetUser) throw new Error("NOT_FOUND");

    const feedbackId = typeof body.feedbackId === "string" && body.feedbackId.trim() ? body.feedbackId.trim() : null;
    if (feedbackId) {
      await ensureFeedbackTable(env);
      const fb = await db
        .prepare("SELECT id FROM user_feedback WHERE id = ?")
        .bind(feedbackId)
        .first<{ id: string }>();
      if (!fb) throw new Error("NOT_FOUND");
    }

    const created = await createUserNotification(env, {
      userId: targetUser.id,
      senderAdminId: actor.id,
      kind: feedbackId ? "feedback_reply" : kind,
      title,
      body: message,
      feedbackId,
    });

    if (feedbackId && body.markFeedbackResolved !== false) {
      await db
        .prepare("UPDATE user_feedback SET status = 'resolved', updated_at = ? WHERE id = ?")
        .bind(nowIso(), feedbackId)
        .run();
    }

    await db
      .prepare(
        "INSERT INTO audit_events (id,actor_user_id,action,target_type,target_id,metadata_json,created_at) VALUES (?,?,?,?,?,?,?)",
      )
      .bind(
        randomId("audit"),
        actor.id,
        feedbackId ? "admin_feedback_reply" : "admin_notification_send",
        "user",
        targetUser.id,
        JSON.stringify({ notificationId: created.id, feedbackId, title }),
        created.createdAt,
      )
      .run();

    return json({ ok: true, id: created.id, createdAt: created.createdAt }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
