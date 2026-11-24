import { requireAdmin } from "@/lib/server/admin";
import { nowIso, randomId } from "@/lib/server/db";
import { readEmailConfig } from "@/lib/server/email";
import { readGoogleOAuthConfig } from "@/lib/server/google-oauth";
import { assertSameOrigin, errorResponse, json } from "@/lib/server/http";
import { readSepayConfig, readSepayQrConfig } from "@/lib/server/sepay";
import { ensureSiteTables, getLiveSiteSettings, sanitizeSiteSettings, writeConfigJson } from "@/lib/server/site-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function maskAccount(acc: string) {
  if (acc.length <= 4) return acc;
  return `${"•".repeat(Math.min(6, acc.length - 4))}${acc.slice(-4)}`;
}

export async function GET(request: Request) {
  try {
    const { env } = await requireAdmin();
    const db = await ensureSiteTables(env);
    const origin = new URL(request.url).origin;

    const [auditRows, lockRows, rejectedPayRows, settings] = await Promise.all([
      db.prepare(`SELECT a.id,a.action,a.target_type AS targetType,a.target_id AS targetId,a.metadata_json AS metadataJson,a.created_at AS createdAt,
        u.name AS actorName,u.email AS actorEmail
        FROM audit_events a LEFT JOIN users u ON u.id=a.actor_user_id
        ORDER BY a.created_at DESC LIMIT 200`).all<{
        id: string; action: string; targetType: string; targetId: string | null; metadataJson: string; createdAt: string; actorName: string | null; actorEmail: string | null;
      }>(),
      db.prepare("SELECT scope,failures,locked_until AS lockedUntil,updated_at AS updatedAt FROM auth_rate_limits WHERE locked_until IS NOT NULL ORDER BY updated_at DESC LIMIT 20").all<{
        scope: string; failures: number; lockedUntil: string | null; updatedAt: string;
      }>(),
      db.prepare("SELECT id,provider,provider_event_id AS providerEventId,processing_status AS status,created_at AS createdAt FROM payment_events WHERE processing_status='rejected' ORDER BY created_at DESC LIMIT 20").all<{
        id: string; provider: string; providerEventId: string; status: string; createdAt: string;
      }>(),
      getLiveSiteSettings(env),
    ]);

    const qrCfg = readSepayQrConfig(env);
    const gwCfg = readSepayConfig(env);
    const emailCfg = readEmailConfig(env);
    const googleCfg = readGoogleOAuthConfig(env, origin);

    const integrations = [
      {
        id: "d1",
        name: "Cơ sở dữ liệu Cloudflare D1",
        connected: Boolean(env.DB),
        detail: "labellab3d-production · Đồng bộ trực tiếp",
      },
      {
        id: "sepay-vn",
        name: "Thanh toán nội địa (SePay VietQR)",
        connected: Boolean(qrCfg || (gwCfg.merchantId && gwCfg.secretKey && gwCfg.ipnSecret)),
        detail: qrCfg
          ? `Direct VietQR Live · ${qrCfg.bankCode} ${maskAccount(qrCfg.accountNumber)}`
          : gwCfg.merchantId
            ? `Payment Gateway (${gwCfg.environment})`
            : "Chưa cấu hình",
      },
      {
        id: "email",
        name: "Email xác thực OTP",
        connected: Boolean(emailCfg),
        detail: emailCfg ? `${emailCfg.provider === "brevo" ? "Brevo" : "Resend"} · ${emailCfg.fromEmail}` : "Chưa cấu hình",
      },
      {
        id: "google-oauth",
        name: "Đăng nhập Google OAuth",
        connected: Boolean(googleCfg),
        detail: googleCfg ? `Web Crypto OIDC · ${googleCfg.origin}` : "Chưa cấu hình",
      },
      {
        id: "intl-pay",
        name: "Thanh toán quốc tế (USD)",
        connected: false,
        detail: "Sắp mở (Stripe / LemonSqueezy)",
      },
    ];

    const entries = (auditRows.results ?? []).map((row) => ({
      id: row.id,
      at: row.createdAt,
      actor: row.actorName ? `${row.actorName}${row.actorEmail ? ` (${row.actorEmail})` : ""}` : "Hệ thống",
      action: row.action,
      target: row.targetId ? `${row.targetType}:${row.targetId}` : row.targetType,
      level: row.action.includes("lock") || row.action.includes("delete") || row.action.includes("refund") ? "warning" as const : "info" as const,
      metadata: row.metadataJson,
    }));

    return json({
      entries,
      security: {
        activeLocks: (lockRows.results ?? []).filter((r) => r.lockedUntil && Date.parse(r.lockedUntil) > Date.now()),
        rejectedPaymentEvents: rejectedPayRows.results ?? [],
      },
      integrations,
      settings,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    await assertSameOrigin();
    const { env, user: actor } = await requireAdmin();
    const body = await request.json().catch(() => ({})) as { settings?: unknown; section?: unknown };
    const cleaned = sanitizeSiteSettings(body.settings);
    const updatedAt = await writeConfigJson(env, "settings", cleaned, actor.id);
    const db = await ensureSiteTables(env);
    await db.prepare(
      "INSERT INTO audit_events (id,actor_user_id,action,target_type,target_id,metadata_json,created_at) VALUES (?,?,?,?,?,?,?)",
    ).bind(randomId("audit"), actor.id, "admin_settings_update", "site_config", String(body.section ?? "settings").slice(0, 60), JSON.stringify({ updatedAt }), nowIso()).run();
    return json({ ok: true, settings: cleaned, updatedAt });
  } catch (error) {
    return errorResponse(error);
  }
}
