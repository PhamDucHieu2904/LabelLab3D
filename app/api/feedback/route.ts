import { headers } from "next/headers";
import {
  createUserFeedback,
  sanitizeFeedbackCategory,
  sanitizeFeedbackMessage,
  sanitizeOptionalEmail,
} from "@/lib/server/feedback";
import { assertSameOrigin, env, errorResponse, json, sessionUser } from "@/lib/server/http";
import { consumeRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readClientIp() {
  const h = await headers();
  return (
    h.get("cf-connecting-ip")?.trim() ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const runtimeEnv = await env();
    const user = await sessionUser();
    const ip = await readClientIp();

    const allowed = await consumeRateLimit(runtimeEnv, {
      namespace: "feedback",
      key: user?.id ? `u:${user.id}` : `ip:${ip}`,
      limit: 5,
      windowMinutes: 15,
    });
    if (!allowed) {
      throw new Error("AUTH_RATE_LIMIT");
    }

    const body = (await request.json().catch(() => ({}))) as {
      category?: unknown;
      message?: unknown;
      contactEmail?: unknown;
      pagePath?: unknown;
      locale?: unknown;
    };

    const message = sanitizeFeedbackMessage(body.message);
    if (message.length < 3) {
      throw new Error("INVALID_INPUT");
    }

    const category = sanitizeFeedbackCategory(body.category);
    const guestEmailRaw = typeof body.contactEmail === "string" ? body.contactEmail.trim() : "";
    const contactEmail = sanitizeOptionalEmail(guestEmailRaw);
    if (guestEmailRaw && !contactEmail) {
      throw new Error("INVALID_INPUT");
    }

    const created = await createUserFeedback(runtimeEnv, {
      userId: user?.id ?? null,
      senderName: user?.name ?? "",
      senderEmail: user?.email ?? contactEmail,
      category,
      message,
      pagePath: typeof body.pagePath === "string" ? body.pagePath : "/",
      locale: typeof body.locale === "string" ? body.locale : "vi",
    });

    return json({ ok: true, id: created.id, createdAt: created.createdAt }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
