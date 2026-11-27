import { assertSameOrigin, env, errorResponse, json, sessionUser } from "@/lib/server/http";
import {
  deleteUserNotification,
  listUserNotifications,
  markAllUserNotificationsRead,
  markUserNotificationRead,
} from "@/lib/server/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await sessionUser();
    if (!user) {
      return json({ notifications: [], unreadCount: 0 });
    }
    const data = await listUserNotifications(await env(), user.id, 50);
    return json(data);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await assertSameOrigin();
    const user = await sessionUser();
    if (!user) throw new Error("FORBIDDEN");

    const body = (await request.json().catch(() => ({}))) as { action?: unknown; id?: unknown };
    const runtimeEnv = await env();
    if (body.action === "mark_all_read") {
      await markAllUserNotificationsRead(runtimeEnv, user.id);
    } else if (typeof body.id === "string" && body.id.trim()) {
      await markUserNotificationRead(runtimeEnv, user.id, body.id.trim());
    } else {
      throw new Error("INVALID_INPUT");
    }

    const updated = await listUserNotifications(runtimeEnv, user.id, 50);
    return json({ ok: true, ...updated });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await assertSameOrigin();
    const user = await sessionUser();
    if (!user) throw new Error("FORBIDDEN");

    const body = (await request.json().catch(() => ({}))) as { id?: unknown };
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) throw new Error("INVALID_INPUT");

    const runtimeEnv = await env();
    await deleteUserNotification(runtimeEnv, user.id, id);
    const updated = await listUserNotifications(runtimeEnv, user.id, 50);
    return json({ ok: true, ...updated });
  } catch (error) {
    return errorResponse(error);
  }
}
