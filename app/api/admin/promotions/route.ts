import {
  LAUNCH_PROMO_COINS,
  LAUNCH_PROMO_END_DATE,
  LAUNCH_PROMO_MAX_CLAIMS_PER_IP,
  LAUNCH_PROMO_START_DATE,
} from "@/lib/promotions/launch-event";
import {
  TOPUP_MULTIPLIER_MAX,
  TOPUP_MULTIPLIER_MIN,
} from "@/lib/promotions/topup-multiplier";
import { requireAdmin } from "@/lib/server/admin";
import { nowIso, randomId, requireDb } from "@/lib/server/db";
import { assertSameOrigin, errorResponse, json } from "@/lib/server/http";
import {
  executeMassCoinGiftEvent,
  listCoinGiftEvents,
} from "@/lib/server/promotions";
import {
  getLiveCoinPackages,
  getLiveTopupMultiplier,
  saveLiveTopupMultiplier,
} from "@/lib/server/site-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { env } = await requireAdmin();
    const db = requireDb(env);
    const [topupMultiplier, giftEvents, coinPackages, activeRow] = await Promise.all([
      getLiveTopupMultiplier(env),
      listCoinGiftEvents(env, 50),
      getLiveCoinPackages(env),
      db.prepare("SELECT COUNT(*) AS cnt FROM users WHERE status = 'active'").first<{ cnt: number | null }>(),
    ]);

    return json({
      topupMultiplier,
      giftEvents,
      activeUserCount: Number(activeRow?.cnt ?? 0),
      coinPackages: coinPackages.filter((pkg) => pkg.enabled),
      launchPromo: {
        coins: LAUNCH_PROMO_COINS,
        startDate: LAUNCH_PROMO_START_DATE,
        endDate: LAUNCH_PROMO_END_DATE,
        maxClaimsPerIp: LAUNCH_PROMO_MAX_CLAIMS_PER_IP,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const { env, user: actor } = await requireAdmin();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "update_topup_multiplier") {
      const enabled = body.enabled === true;
      const multiplier = Number(body.multiplier);
      const label = typeof body.label === "string" ? body.label.trim().slice(0, 120) : "";
      if (
        !Number.isSafeInteger(multiplier) ||
        multiplier < TOPUP_MULTIPLIER_MIN ||
        multiplier > TOPUP_MULTIPLIER_MAX
      ) {
        throw new Error("INVALID_INPUT");
      }

      const saved = await saveLiveTopupMultiplier(env, { enabled, multiplier, label }, actor.id);
      const db = requireDb(env);
      await db
        .prepare(
          "INSERT INTO audit_events (id,actor_user_id,action,target_type,target_id,metadata_json,created_at) VALUES (?,?,?,?,?,?,?)",
        )
        .bind(
          randomId("audit"),
          actor.id,
          "admin_topup_multiplier",
          "site_config",
          "topup_multiplier",
          JSON.stringify(saved),
          nowIso(),
        )
        .run();

      return json({ ok: true, topupMultiplier: saved });
    }

    if (action === "mass_coin_gift") {
      const coins = Number(body.coins);
      const title = typeof body.title === "string" ? body.title : "";
      const message = typeof body.body === "string" ? body.body : "";
      const idempotencyKey =
        typeof body.idempotencyKey === "string" && body.idempotencyKey.trim()
          ? body.idempotencyKey.trim()
          : `evtgift_${randomId("batch")}`;

      const event = await executeMassCoinGiftEvent(env, {
        actorUserId: actor.id,
        coins,
        title,
        body: message,
        idempotencyKey,
      });

      return json({ ok: true, event }, { status: 201 });
    }

    throw new Error("INVALID_INPUT");
  } catch (error) {
    return errorResponse(error);
  }
}
