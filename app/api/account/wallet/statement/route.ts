import { getUiMessages } from "@/lib/i18n/messages";
import { env, errorResponse, sessionUser } from "@/lib/server/http";
import { getCoinBalance } from "@/lib/server/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LedgerRow = {
  id: string;
  amount: number;
  kind: string;
  reference: string | null;
  balance: number;
  createdAt: string;
};

function sanitizeCsvText(raw: string): string {
  const value = raw.replace(/\r\n/g, " ").replace(/[\r\n]/g, " ");
  const safe = /^[=+\-@\t]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

function formatStatementTime(iso: string, locale: "vi" | "en"): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return iso;
  try {
    return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date(ts));
  } catch {
    return iso;
  }
}

function describeEntry(row: LedgerRow, locale: "vi" | "en"): string {
  const pr = getUiMessages(locale).profile;
  if (row.kind === "welcome_bonus") return pr.entryWelcome;
  if (row.kind === "promo_bonus") return pr.entryLaunchPromo;
  if (row.kind === "daily_checkin") return pr.entryCheckin;
  if (row.kind === "purchase") return pr.entryPurchase;
  if (row.kind === "admin_adjustment") return pr.entryAdmin;
  if (row.kind === "refund") return pr.entryRefund;
  if (row.kind === "render" || row.kind === "reservation") {
    return row.reference?.startsWith("dieline:") ? pr.entryDieline : pr.entryRender;
  }
  if (row.kind === "reservation_release") {
    return row.reference?.startsWith("dieline:") ? pr.entryDielineRefund : pr.entryRenderRefund;
  }
  return row.amount >= 0 ? pr.entryReward : pr.entrySpend;
}

export async function GET(request: Request) {
  try {
    const user = await sessionUser();
    if (!user) throw new Error("FORBIDDEN");

    const url = new URL(request.url);
    const locale: "vi" | "en" = url.searchParams.get("lang") === "en" ? "en" : "vi";
    const runtimeEnv = await env();
    const db = runtimeEnv.DB!;

    // Settle expired reservations first so exported balances are accurate.
    await getCoinBalance(runtimeEnv, user.id);

    const ledger = await db
      .prepare(
        "SELECT id,amount,kind,reference,balance,created_at AS createdAt FROM coin_ledger WHERE user_id=? ORDER BY created_at DESC LIMIT 2000",
      )
      .bind(user.id)
      .all<LedgerRow>();

    const rows = ledger.results ?? [];
    const header =
      locale === "vi"
        ? ["Thời gian (GMT+7)", "Hoạt động", "Phân loại", "Biến động (Coin)", "Số dư sau GD (Coin)", "Mã tham chiếu"]
        : ["Timestamp (GMT+7)", "Activity", "Type", "Amount (Coins)", "Balance After (Coins)", "Reference"];

    const lines = [
      header.map((col) => sanitizeCsvText(col)).join(","),
      ...rows.map((row) =>
        [
          sanitizeCsvText(formatStatementTime(row.createdAt, locale)),
          sanitizeCsvText(describeEntry(row, locale)),
          sanitizeCsvText(row.kind),
          String(Number(row.amount ?? 0)),
          String(Number(row.balance ?? 0)),
          sanitizeCsvText(row.reference ?? row.id),
        ].join(","),
      ),
    ];

    const today = new Date().toISOString().slice(0, 10);
    const filename =
      locale === "vi"
        ? `hypermockup-sao-ke-coin-${today}.csv`
        : `hypermockup-coin-statement-${today}.csv`;

    // Prepend UTF-8 BOM so Microsoft Excel renders Vietnamese diacritics accurately.
    const csvBody = `\uFEFF${lines.join("\r\n")}\r\n`;

    return new Response(csvBody, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
