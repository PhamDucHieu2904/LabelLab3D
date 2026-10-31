import type { AdminOrder } from "./commerce";
export type Granularity = "day" | "month" | "year";
export type TrafficPoint = { label: string; guests: number; users: number; bots: number; sessions: number; renders: number; iso: string };
export const DEMO_DATE = "2026-10-31";
const HOUR = 3600000;
export function periodBounds(anchor: string, granularity: Granularity) {
  const date = new Date(`${anchor}T00:00:00+07:00`);
  const year = Number(anchor.slice(0, 4)), month = Number(anchor.slice(5, 7));
  if (granularity === "day") return [date.getTime(), date.getTime() + 24 * HOUR] as const;
  if (granularity === "month") return [Date.UTC(year, month - 1, 1) - 7 * HOUR, Date.UTC(year, month, 1) - 7 * HOUR] as const;
  return [Date.UTC(year, 0, 1) - 7 * HOUR, Date.UTC(year + 1, 0, 1) - 7 * HOUR] as const;
}
export function ordersInPeriod(orders: readonly AdminOrder[], anchor: string, granularity: Granularity) {
  const [from, to] = periodBounds(anchor, granularity);
  return orders.filter(order => { const t = Date.parse(order.createdAt); return t >= from && t < to; });
}
export function previousAnchor(anchor: string, granularity: Granularity) {
  const d = new Date(`${anchor}T12:00:00Z`);
  if (granularity === "day") d.setUTCDate(d.getUTCDate() - 1);
  if (granularity === "month") { d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); }
  if (granularity === "year") { d.setUTCDate(1); d.setUTCFullYear(d.getUTCFullYear() - 1); }
  return d.toISOString().slice(0, 10);
}
function dailyTraffic(iso: string): TrafficPoint {
  const day = Math.floor(Date.parse(`${iso}T00:00:00Z`) / (24 * HOUR));
  const active = iso <= DEMO_DATE && iso >= "2025-01-01";
  const guests = active ? 200 + ((day * 29) % 311) + Math.floor(Math.sin(day * .6) * 70) : 0;
  const users = active ? 65 + day * 7 % 114 : 0;
  const bots = active ? 18 + day * 11 % 63 : 0;
  return { iso, label: iso, guests, users, bots, sessions: Math.round((guests + users) * 1.24), renders: active ? 12 + day * 3 % 52 : 0 };
}
export function trafficForPeriod(anchor: string, granularity: Granularity): TrafficPoint[] {
  if (granularity === "day") {
    const total = dailyTraffic(anchor);
    const weights = Array.from({ length: 24 }, (_, h) => 2 + (h >= 8 && h <= 22 ? 7 + h % 4 : h % 3));
    const sum = weights.reduce((a, b) => a + b, 0);
    // Allocate rounded remainders to the final bucket so daily totals match all views.
    const values = (key: "guests" | "users" | "bots" | "sessions" | "renders") => {
      let remainder = total[key];
      return weights.map((w, i) => { const value = i === 23 ? remainder : Math.floor(total[key] * w / sum); remainder -= value; return value; });
    };
    const columns = { guests: values("guests"), users: values("users"), bots: values("bots"), sessions: values("sessions"), renders: values("renders") };
    return weights.map((_, h) => ({ iso: `${anchor}T${String(h).padStart(2, "0")}:00:00+07:00`, label: `${h}h`, guests: columns.guests[h], users: columns.users[h], bots: columns.bots[h], sessions: columns.sessions[h], renders: columns.renders[h] }));
  }
  const year = Number(anchor.slice(0, 4)), month = Number(anchor.slice(5, 7));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (granularity === "month") return Array.from({ length: daysInMonth }, (_, i) => {
    const point = dailyTraffic(`${anchor.slice(0, 7)}-${String(i + 1).padStart(2, "0")}`);
    return { ...point, label: String(i + 1).padStart(2, "0") };
  });
  return Array.from({ length: 12 }, (_, m) => {
    const iso = `${year}-${String(m + 1).padStart(2, "0")}-01`;
    const points = trafficForPeriod(iso, "month");
    return { ...sumTraffic(points), label: `T${m + 1}`, iso };
  });
}
export function sumTraffic(points: readonly TrafficPoint[]) {
  return points.reduce((a, p) => ({ guests: a.guests + p.guests, users: a.users + p.users, bots: a.bots + p.bots, sessions: a.sessions + p.sessions, renders: a.renders + p.renders }), { guests: 0, users: 0, bots: 0, sessions: 0, renders: 0 });
}
export function periodUserActivity(user: { createdAt: string; lastLogin: string; logins: number; appSessions: number }, anchor: string, granularity: Granularity) {
  const [from, to] = periodBounds(anchor, granularity);
  if (!user.lastLogin || !Number.isFinite(Date.parse(user.createdAt)) || Date.parse(user.lastLogin) < Date.parse(user.createdAt)) return { logins: 0, app: 0 };
  const day = 24 * HOUR;
  const firstDay = Math.floor((Date.parse(user.createdAt) + 7 * HOUR) / day);
  const lastDay = Math.floor((Date.parse(user.lastLogin) + 7 * HOUR) / day);
  const lifetimeDays = Math.max(1, lastDay - firstDay + 1);
  const startIndex = Math.max(0, Math.min(lifetimeDays, Math.floor((from + 7 * HOUR) / day) - firstDay));
  const endIndex = Math.max(0, Math.min(lifetimeDays, Math.floor((to + 7 * HOUR) / day) - firstDay));
  // Distribute fixture lifetime counters over their actual account lifetime.
  // Production will aggregate login/session events instead of interpolating counters.
  const allocation = (total: number) => Math.floor(total * endIndex / lifetimeDays) - Math.floor(total * startIndex / lifetimeDays);
  return { logins: allocation(user.logins), app: allocation(user.appSessions) };
}
