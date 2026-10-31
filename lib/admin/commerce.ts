export type Region = "vn" | "international";
export type OrderStatus = "pending" | "paid" | "failed" | "refunded";
export type AdminOrder = {
  id: string; userId: string; region: Region; amount: number; coins: number;
  status: OrderStatus; createdAt: string; reference: string;
};
export type CoinEntry = {
  id: string; userId: string; coins: number; reason: string; at: string; orderId?: string;
};
export type CoinPack = { id: string; region: Region; amount: number; coins: number; enabled: boolean };
export type CommerceData = { orders: AdminOrder[]; ledger: CoinEntry[]; packs: CoinPack[] };
export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Chờ xử lý", paid: "Thành công", failed: "Thất bại", refunded: "Đã hoàn tiền",
};
export const REGION_LABELS: Record<Region, string> = { vn: "Việt Nam", international: "Quốc tế" };
export const formatNumber = (n: number) => new Intl.NumberFormat("vi-VN").format(n);
export const formatMoney = (n: number, region: Region) => new Intl.NumberFormat("vi-VN", {
  style: "currency", currency: region === "vn" ? "VND" : "USD", maximumFractionDigits: region === "vn" ? 0 : 2,
}).format(n);
export const formatDate = (date: string) => new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh",
}).format(new Date(date));
export const INITIAL_PACKS: CoinPack[] = (["vn", "international"] as Region[]).flatMap(region =>
  [20, 45, 120, 300].map((coins, i) => ({ id: `${region}-${i}`, region, coins, amount: [1, 2, 5, 10][i] * (region === "vn" ? 10000 : 1), enabled: true })),
);
export const INITIAL_ORDERS: AdminOrder[] = Array.from({ length: 144 }, (_, i) => {
  const region: Region = i % 3 === 0 ? "international" : "vn";
  const pack = INITIAL_PACKS.filter(p => p.region === region)[i % 4];
  const month = i < 84 ? 6 + (i % 10) % 3 : 9;
  const day = i < 84 ? 3 + (i % 10) * 2 + Math.floor(i / 10) % 8 : 1 + (i - 84) % 31;
  const date = new Date(Date.UTC(2026, month, day, 2 + i % 13, i * 7 % 60));
  return { id: `LL-${String(i + 1001)}`, userId: `usr-${String(i % 10 + 1).padStart(3, "0")}`,
    region, amount: pack.amount, coins: pack.coins, status: (i % 19 === 0 ? "pending" : i % 17 === 0 ? "refunded" : i % 13 === 0 ? "failed" : "paid") as OrderStatus,
    createdAt: date.toISOString(), reference: `DEMO-${String(i + 1001)}` };
}).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
export const INITIAL_COMMERCE: CommerceData = {
  orders: INITIAL_ORDERS, packs: INITIAL_PACKS,
  ledger: INITIAL_ORDERS.filter(o => o.status === "paid").map(o => ({ id: `coin-${o.id}`, userId: o.userId, coins: o.coins,
    reason: "Nạp coin", at: o.createdAt, orderId: o.id })),
};
/** Coin entitlement is derived from order state, so repeated callbacks have zero effect. */
export function orderBalanceDelta(order: AdminOrder, status: OrderStatus) {
  return (status === "paid" ? order.coins : 0) - (order.status === "paid" ? order.coins : 0);
}
export function summarizeRevenue(orders: readonly AdminOrder[]) {
  return orders.reduce((a, order) => {
    if (order.status === "paid") {
      a[order.region] += order.amount; a.coins += order.coins; a.paid++;
    }
    if (order.status === "refunded") a.refunds[order.region] += order.amount;
    return a;
  }, { vn: 0, international: 0, coins: 0, paid: 0, refunds: { vn: 0, international: 0 } });
}

/** CSV values are quoted and neutralized for spreadsheet formula injection. */
export function createCsv(headers: string[], rows: (string | number)[][]) {
  const escape = (value: string | number) => {
    let cell = String(value);
    if (/^[=+@\-\t\r]/.test(cell) && typeof value !== "number") cell = `'${cell}`;
    return `"${cell.replace(/"/g, '""')}"`;
  };
  return "\uFEFF" + [headers, ...rows].map(row => row.map(escape).join(",")).join("\r\n");
}
export function downloadCsv(name: string, headers: string[], rows: (string | number)[][]) {
  const url = URL.createObjectURL(new Blob([createCsv(headers, rows)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
