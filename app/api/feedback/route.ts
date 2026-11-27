import {
  checkUserFeedbackQuota,
  createUserFeedback,
  FEEDBACK_COOLDOWN_SECONDS,
  FEEDBACK_DAILY_LIMIT_PER_USER,
  sanitizeFeedbackCategory,
  sanitizeFeedbackMessage,
} from "@/lib/server/feedback";
import { assertSameOrigin, env, errorResponse, json, sessionUser } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const user = await sessionUser();
    if (!user) {
      return json({ error: "LOGIN_REQUIRED" }, { status: 401 });
    }

    const runtimeEnv = await env();
    const quota = await checkUserFeedbackQuota(runtimeEnv, user.id);
    if (!quota.allowed) {
      if (quota.reason === "FEEDBACK_DAILY_LIMIT") {
        return json(
          { error: "FEEDBACK_DAILY_LIMIT", limit: quota.limit, sentToday: quota.sentToday },
          { status: 429 },
        );
      }
      return json(
        { error: "FEEDBACK_COOLDOWN", retryAfterSec: quota.retryAfterSec },
        {
          status: 429,
          headers: { "Retry-After": String(quota.retryAfterSec) },
        },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      category?: unknown;
      message?: unknown;
      pagePath?: unknown;
      locale?: unknown;
    };

    const message = sanitizeFeedbackMessage(body.message);
    if (message.length < 3) {
      throw new Error("INVALID_INPUT");
    }

    const category = sanitizeFeedbackCategory(body.category);
    const created = await createUserFeedback(runtimeEnv, {
      userId: user.id,
      senderName: user.name,
      senderEmail: user.email,
      category,
      message,
      pagePath: typeof body.pagePath === "string" ? body.pagePath : "/",
      locale: typeof body.locale === "string" ? body.locale : "vi",
    });

    return json(
      {
        ok: true,
        id: created.id,
        createdAt: created.createdAt,
        cooldownSeconds: FEEDBACK_COOLDOWN_SECONDS,
        dailyLimit: FEEDBACK_DAILY_LIMIT_PER_USER,
        remainingToday: Math.max(0, quota.remainingToday - 1),
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
