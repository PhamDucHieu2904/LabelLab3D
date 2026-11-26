import { computeAnnualTaxSummary, vietnamYearOf, type AnnualTaxOrderRow } from "@/lib/legal/policies";
import { requireAdmin } from "@/lib/server/admin";
import { nowIso, randomId } from "@/lib/server/db";
import { assertSameOrigin, errorResponse, json } from "@/lib/server/http";
import { ensureLegalTables } from "@/lib/server/legal";
import {
  ensureSiteTables,
  getLiveSiteSettings,
  readConfigJson,
  sanitizeSiteSettings,
  writeConfigJson,
} from "@/lib/server/site-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type MonthlyLegalLog = {
  sepayStatementSaved: boolean;
  csvExported: boolean;
  polarSettled: boolean;
  note: string;
  updatedAt: string;
};

export type LegalChecklistState = {
  completedSteps: Record<string, string>;
  monthlyLogs: Record<string, MonthlyLegalLog>;
};

const VALID_STEP_IDS = new Set([
  "bank_account",
  "etax_sync",
  "owner_profile",
  "vnnic_domain",
  "moit_notify",
  "polar_payout_setup",
]);

function sanitizeChecklist(input: unknown): LegalChecklistState {
  const empty: LegalChecklistState = { completedSteps: {}, monthlyLogs: {} };
  if (!input || typeof input !== "object") return empty;
  const raw = input as Record<string, unknown>;

  if (raw.completedSteps && typeof raw.completedSteps === "object") {
    for (const [key, val] of Object.entries(raw.completedSteps as Record<string, unknown>)) {
      if (VALID_STEP_IDS.has(key) && typeof val === "string" && val.trim()) {
        empty.completedSteps[key] = val.trim().slice(0, 40);
      }
    }
  }

  if (raw.monthlyLogs && typeof raw.monthlyLogs === "object") {
    const entries = Object.entries(raw.monthlyLogs as Record<string, unknown>).slice(0, 60);
    for (const [monthKey, value] of entries) {
      if (!/^\d{4}-\d{2}$/.test(monthKey) || !value || typeof value !== "object") continue;
      const row = value as Record<string, unknown>;
      empty.monthlyLogs[monthKey] = {
        sepayStatementSaved: Boolean(row.sepayStatementSaved),
        csvExported: Boolean(row.csvExported),
        polarSettled: Boolean(row.polarSettled),
        note: typeof row.note === "string" ? row.note.trim().slice(0, 300) : "",
        updatedAt: typeof row.updatedAt === "string" ? row.updatedAt.slice(0, 40) : nowIso(),
      };
    }
  }
  return empty;
}

export async function GET(request: Request) {
  try {
    const { env } = await requireAdmin();
    const db = await ensureSiteTables(env);
    await ensureLegalTables(env);

    const url = new URL(request.url);
    const defaultYear = vietnamYearOf(nowIso());
    const requestedYear = Number(url.searchParams.get("year"));
    const year = Number.isSafeInteger(requestedYear) && requestedYear >= 2024 && requestedYear <= 2100
      ? requestedYear
      : defaultYear;

    const yearStartIso = new Date(Date.UTC(year, 0, 1) - 7 * 3_600_000).toISOString();
    const yearEndIso = new Date(Date.UTC(year + 1, 0, 1) - 7 * 3_600_000).toISOString();

    const [settings, savedChecklist, yearOrdersRes, consentRow] = await Promise.all([
      getLiveSiteSettings(env),
      readConfigJson<unknown>(env, "legal_checklist"),
      db.prepare(`SELECT po.id,po.order_code AS orderCode,po.user_id AS userId,u.name AS userName,u.email AS userEmail,
        po.provider,po.package_coins AS coins,po.amount_minor AS amount,po.currency,po.status,
        po.provider_order_id AS providerOrderId,po.created_at AS createdAt,
        r.buyer_name AS receiptBuyerName,r.tax_code AS receiptTaxCode,r.address AS receiptAddress,r.email AS receiptEmail
        FROM payment_orders po
        LEFT JOIN users u ON u.id=po.user_id
        LEFT JOIN order_receipts r ON r.order_id=po.id
        WHERE po.created_at>=? AND po.created_at<?
        ORDER BY po.created_at DESC LIMIT 2000`).bind(yearStartIso, yearEndIso).all<AnnualTaxOrderRow & {
        id: string;
        orderCode: string;
        userId: string;
        userName: string | null;
        userEmail: string | null;
        provider: string;
        coins: number;
        providerOrderId: string | null;
        receiptBuyerName: string | null;
        receiptTaxCode: string | null;
        receiptAddress: string | null;
        receiptEmail: string | null;
      }>(),
      db.prepare("SELECT COUNT(*) AS total FROM legal_consents").first<{ total: number }>().catch(() => ({ total: 0 })),
    ]);

    const yearOrders = yearOrdersRes.results ?? [];
    const taxSummary = computeAnnualTaxSummary(yearOrders, {
      year,
      usdToVndRate: settings.usdToVndRate,
    });

    return json({
      year,
      profile: {
        name: settings.name,
        domain: settings.domain,
        contact: settings.contact,
        ownerName: settings.ownerName,
        ownerTaxId: settings.ownerTaxId,
        maskOwnerTaxId: settings.maskOwnerTaxId,
        ownerAddress: settings.ownerAddress,
        ownerPhone: settings.ownerPhone,
        moitStatusUrl: settings.moitStatusUrl,
        usdToVndRate: settings.usdToVndRate,
      },
      taxSummary,
      consentCount: Number(consentRow?.total ?? 0),
      checklist: sanitizeChecklist(savedChecklist),
      yearOrders,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    await assertSameOrigin();
    const { env, user: actor } = await requireAdmin();
    const db = await ensureSiteTables(env);
    const body = (await request.json().catch(() => ({}))) as {
      action?: unknown;
      profile?: Record<string, unknown>;
      checklist?: unknown;
    };

    if (body.action === "save_profile" && body.profile && typeof body.profile === "object") {
      const current = await getLiveSiteSettings(env);
      const merged = sanitizeSiteSettings({
        ...current,
        contact: body.profile.contact ?? current.contact,
        ownerName: body.profile.ownerName ?? current.ownerName,
        ownerTaxId: body.profile.ownerTaxId ?? current.ownerTaxId,
        maskOwnerTaxId: body.profile.maskOwnerTaxId ?? current.maskOwnerTaxId,
        ownerAddress: body.profile.ownerAddress ?? current.ownerAddress,
        ownerPhone: body.profile.ownerPhone ?? current.ownerPhone,
        moitStatusUrl: body.profile.moitStatusUrl ?? current.moitStatusUrl,
        usdToVndRate: body.profile.usdToVndRate ?? current.usdToVndRate,
      });
      const updatedAt = await writeConfigJson(env, "settings", merged, actor.id);
      await db.prepare(
        "INSERT INTO audit_events (id,actor_user_id,action,target_type,target_id,metadata_json,created_at) VALUES (?,?,?,?,?,?,?)",
      ).bind(randomId("audit"), actor.id, "admin_legal_profile_update", "site_config", "legal_profile", JSON.stringify({ updatedAt, maskOwnerTaxId: merged.maskOwnerTaxId }), nowIso()).run();
      return json({
        ok: true,
        profile: {
          name: merged.name,
          domain: merged.domain,
          contact: merged.contact,
          ownerName: merged.ownerName,
          ownerTaxId: merged.ownerTaxId,
          maskOwnerTaxId: merged.maskOwnerTaxId,
          ownerAddress: merged.ownerAddress,
          ownerPhone: merged.ownerPhone,
          moitStatusUrl: merged.moitStatusUrl,
          usdToVndRate: merged.usdToVndRate,
        },
        updatedAt,
      });
    }

    if (body.action === "save_checklist") {
      const cleaned = sanitizeChecklist(body.checklist);
      const updatedAt = await writeConfigJson(env, "legal_checklist", cleaned, actor.id);
      await db.prepare(
        "INSERT INTO audit_events (id,actor_user_id,action,target_type,target_id,metadata_json,created_at) VALUES (?,?,?,?,?,?,?)",
      ).bind(randomId("audit"), actor.id, "admin_legal_checklist_update", "site_config", "legal_checklist", JSON.stringify({ updatedAt }), nowIso()).run();
      return json({ ok: true, checklist: cleaned, updatedAt });
    }

    throw new Error("INVALID_INPUT");
  } catch (error) {
    return errorResponse(error);
  }
}
