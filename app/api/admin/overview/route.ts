import { periodBounds, previousAnchor, type Granularity, type TrafficPoint } from "@/lib/admin/analytics";
import { requireAdmin } from "@/lib/server/admin";
import { errorResponse, json } from "@/lib/server/http";
import { currentRewardDay } from "@/lib/server/rewards";
import { ensureSiteTables } from "@/lib/server/site-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OFFSET_MS = 7 * 3600_000;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function buildEmptyBuckets(anchor: string, granularity: Granularity): TrafficPoint[] {
  const [year, month] = anchor.split("-").map(Number);
  if (granularity === "day") {
    return Array.from({ length: 24 }, (_, hour) => ({
      label: `${pad(hour)}h`,
      iso: `${anchor}T${pad(hour)}:00:00+07:00`,
      guests: 0,
      users: 0,
      bots: 0,
      sessions: 0,
      renders: 0,
    }));
  }
  if (granularity === "month") {
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return Array.from({ length: days }, (_, index) => {
      const day = index + 1;
      return {
        label: pad(day),
        iso: `${year}-${pad(month)}-${pad(day)}`,
        guests: 0,
        users: 0,
        bots: 0,
        sessions: 0,
        renders: 0,
      };
    });
  }
  return Array.from({ length: 12 }, (_, index) => {
    const m = index + 1;
    return {
      label: `T${m}`,
      iso: `${year}-${pad(m)}-01`,
      guests: 0,
      users: 0,
      bots: 0,
      sessions: 0,
      renders: 0,
    };
  });
}

function bucketIndexForIso(isoTimestamp: string, granularity: Granularity): number {
  const ms = Date.parse(isoTimestamp);
  if (!Number.isFinite(ms)) return -1;
  const vn = new Date(ms + OFFSET_MS);
  if (granularity === "day") return vn.getUTCHours();
  if (granularity === "month") return vn.getUTCDate() - 1;
  return vn.getUTCMonth();
}

export async function GET(request: Request) {
  try {
    const { env } = await requireAdmin();
    const db = await ensureSiteTables(env);
    const url = new URL(request.url);
    const rawGranularity = url.searchParams.get("granularity");
    const granularity: Granularity = rawGranularity === "day" || rawGranularity === "year" ? rawGranularity : "month";
    const today = currentRewardDay();
    const rawAnchor = url.searchParams.get("anchor") ?? today;
    const anchor = /^\d{4}-\d{2}-\d{2}$/.test(rawAnchor) ? rawAnchor : today;

    const [fromMs, toMs] = periodBounds(anchor, granularity);
    const prevAnchor = previousAnchor(anchor, granularity);
    const [prevFromMs, prevToMs] = periodBounds(prevAnchor, granularity);

    const fromIso = new Date(fromMs).toISOString();
    const toIso = new Date(toMs).toISOString();
    const prevFromIso = new Date(prevFromMs).toISOString();
    const prevToIso = new Date(prevToMs).toISOString();

    const [
      eventsCur,
      eventsPrev,
      ordersCur,
      ordersPrev,
      rendersCur,
      rendersPrev,
      sessionsCur,
      sessionsPrev,
      usersRows,
      recentOrdersRows,
    ] = await Promise.all([
      db.prepare("SELECT kind,visitor_type AS visitorType,user_id AS userId,created_at AS createdAt FROM site_events WHERE created_at>=? AND created_at<?").bind(fromIso, toIso).all<{ kind: string; visitorType: string; userId: string | null; createdAt: string }>(),
      db.prepare("SELECT kind,visitor_type AS visitorType,created_at AS createdAt FROM site_events WHERE created_at>=? AND created_at<?").bind(prevFromIso, prevToIso).all<{ kind: string; visitorType: string; createdAt: string }>(),
      db.prepare("SELECT id,user_id AS userId,order_code AS orderCode,package_coins AS coins,amount_minor AS amount,currency,status,created_at AS createdAt FROM payment_orders WHERE created_at>=? AND created_at<? ORDER BY created_at DESC").bind(fromIso, toIso).all<{ id: string; userId: string; orderCode: string; coins: number; amount: number; currency: string; status: string; createdAt: string }>(),
      db.prepare("SELECT package_coins AS coins,amount_minor AS amount,currency,status FROM payment_orders WHERE created_at>=? AND created_at<?").bind(prevFromIso, prevToIso).all<{ coins: number; amount: number; currency: string; status: string }>(),
      db.prepare("SELECT created_at AS createdAt FROM coin_reservations WHERE status='committed' AND created_at>=? AND created_at<?").bind(fromIso, toIso).all<{ createdAt: string }>(),
      db.prepare("SELECT COUNT(*) AS count FROM coin_reservations WHERE status='committed' AND created_at>=? AND created_at<?").bind(prevFromIso, prevToIso).first<{ count: number }>(),
      db.prepare("SELECT user_id AS userId,created_at AS createdAt FROM sessions WHERE created_at>=? AND created_at<?").bind(fromIso, toIso).all<{ userId: string; createdAt: string }>(),
      db.prepare("SELECT COUNT(*) AS count FROM sessions WHERE created_at>=? AND created_at<?").bind(prevFromIso, prevToIso).first<{ count: number }>(),
      db.prepare("SELECT u.id,u.name,u.email,u.role,u.status,COALESCE(w.balance,0) AS balance FROM users u LEFT JOIN wallets w ON w.user_id=u.id ORDER BY u.created_at DESC LIMIT 500").all<{ id: string; name: string; email: string; role: string; status: string; balance: number }>(),
      db.prepare(`SELECT po.id,po.order_code AS orderCode,po.user_id AS userId,u.name AS userName,u.email AS userEmail,
        po.package_coins AS coins,po.amount_minor AS amount,po.currency,po.status,po.created_at AS createdAt
        FROM payment_orders po LEFT JOIN users u ON u.id=po.user_id
        ORDER BY po.created_at DESC LIMIT 10`).all<{ id: string; orderCode: string; userId: string; userName: string | null; userEmail: string | null; coins: number; amount: number; currency: string; status: string; createdAt: string }>(),
    ]);

    const points = buildEmptyBuckets(anchor, granularity);
    const vnBars = Array.from({ length: points.length }, () => 0);
    const intlBars = Array.from({ length: points.length }, () => 0);

    let studioSessions = 0;
    let prevStudioSessions = 0;
    const studioByUser = new Map<string, number>();

    for (const evt of eventsCur.results ?? []) {
      const idx = bucketIndexForIso(evt.createdAt, granularity);
      if (idx < 0 || idx >= points.length) continue;
      if (evt.kind === "studio_session") {
        studioSessions += 1;
        points[idx].sessions += 1;
        if (evt.userId) studioByUser.set(evt.userId, (studioByUser.get(evt.userId) ?? 0) + 1);
      } else if (evt.kind === "render") {
        points[idx].renders += 1;
      } else {
        if (evt.visitorType === "bot") points[idx].bots += 1;
        else if (evt.visitorType === "user") points[idx].users += 1;
        else points[idx].guests += 1;
      }
    }

    for (const renderRow of rendersCur.results ?? []) {
      const idx = bucketIndexForIso(renderRow.createdAt, granularity);
      if (idx >= 0 && idx < points.length) points[idx].renders += 1;
    }

    const prevTotals = { guests: 0, users: 0, bots: 0, sessions: 0, renders: Number(rendersPrev?.count ?? 0) };
    for (const evt of eventsPrev.results ?? []) {
      if (evt.kind === "studio_session") {
        prevStudioSessions += 1;
        prevTotals.sessions += 1;
      } else if (evt.kind === "render") {
        prevTotals.renders += 1;
      } else if (evt.visitorType === "bot") {
        prevTotals.bots += 1;
      } else if (evt.visitorType === "user") {
        prevTotals.users += 1;
      } else {
        prevTotals.guests += 1;
      }
    }

    const revenue = { vn: 0, international: 0, coins: 0, paid: 0, pending: 0 };
    const paidCoinsByUser = new Map<string, { all: number; vn: number; international: number }>();

    for (const ord of ordersCur.results ?? []) {
      const isVn = ord.currency === "VND";
      if (ord.status === "paid") {
        revenue.paid += 1;
        revenue.coins += Number(ord.coins);
        const majorAmount = isVn ? Number(ord.amount) : Number(ord.amount) / 100;
        if (isVn) revenue.vn += majorAmount;
        else revenue.international += majorAmount;
        const idx = bucketIndexForIso(ord.createdAt, granularity);
        if (idx >= 0 && idx < points.length) {
          if (isVn) vnBars[idx] += majorAmount;
          else intlBars[idx] += majorAmount;
        }
        const entry = paidCoinsByUser.get(ord.userId) ?? { all: 0, vn: 0, international: 0 };
        entry.all += Number(ord.coins);
        if (isVn) entry.vn += Number(ord.coins);
        else entry.international += Number(ord.coins);
        paidCoinsByUser.set(ord.userId, entry);
      } else if (ord.status === "pending") {
        revenue.pending += 1;
      }
    }

    let prevPaidCoins = 0;
    for (const ord of ordersPrev.results ?? []) {
      if (ord.status === "paid") prevPaidCoins += Number(ord.coins);
    }

    const loginsByUser = new Map<string, number>();
    for (const sess of sessionsCur.results ?? []) {
      loginsByUser.set(sess.userId, (loginsByUser.get(sess.userId) ?? 0) + 1);
    }

    const rankedUsers = (usersRows.results ?? []).map((u) => {
      const paid = paidCoinsByUser.get(u.id) ?? { all: 0, vn: 0, international: 0 };
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        balance: Number(u.balance),
        logins: loginsByUser.get(u.id) ?? 0,
        app: studioByUser.get(u.id) ?? 0,
        paidAll: paid.all,
        paidVn: paid.vn,
        paidInternational: paid.international,
      };
    });

    const totals = points.reduce(
      (acc, p) => ({
        guests: acc.guests + p.guests,
        users: acc.users + p.users,
        bots: acc.bots + p.bots,
        sessions: acc.sessions + p.sessions,
        renders: acc.renders + p.renders,
      }),
      { guests: 0, users: 0, bots: 0, sessions: 0, renders: 0 },
    );

    return json({
      today,
      anchor,
      granularity,
      points,
      totals,
      previous: prevTotals,
      studioSessions,
      prevStudioSessions,
      loginsTotal: (sessionsCur.results ?? []).length,
      prevLoginsTotal: Number(sessionsPrev?.count ?? 0),
      revenue,
      prevPaidCoins,
      revenueBars: { vn: vnBars, international: intlBars },
      rankedUsers,
      recentOrders: recentOrdersRows.results ?? [],
      summary: {
        totalUsers: (usersRows.results ?? []).length,
        totalCoinsBalance: (usersRows.results ?? []).reduce((sum, u) => sum + Number(u.balance), 0),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
