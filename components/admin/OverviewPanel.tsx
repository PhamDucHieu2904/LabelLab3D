"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Bot, Download, Image, LogIn, Users } from "lucide-react";
import { DEMO_DATE, ordersInPeriod, periodUserActivity, previousAnchor, sumTraffic, trafficForPeriod, type Granularity, type TrafficPoint } from "@/lib/admin/analytics";
import { downloadCsv, formatMoney, formatNumber, STATUS_LABELS, summarizeRevenue, type Region } from "@/lib/admin/commerce";
import { useAdminCommerce } from "@/lib/admin/commerce-store";
import { useAdminUsers } from "@/lib/admin/users-store";
import s from "./AdminWorkspace.module.css";
type SeriesKey = "guests" | "users" | "bots";
const SERIES: { key: SeriesKey; label: string; color: string }[] = [
  { key: "guests", label: "Khách lạ", color: "#b83d61" },
  { key: "users", label: "Người dùng", color: "#668caa" },
  { key: "bots", label: "Bot", color: "#99a0af" },
];
export function CoinValue({ value }: { value: number }) {
  return <span className={s.coinValue}><img src="/branding/LLCoin.svg" width="18" height="18" alt="coin"/>{formatNumber(value)}</span>;
}
function Trend({ value, previous }: { value: number; previous: number }) {
  if (!previous) return <span className={s.subtle}>— kỳ trước</span>;
  const percent = (value - previous) / previous * 100;
  const Icon = percent >= 0 ? ArrowUpRight : ArrowDownRight;
  return <><span className={percent >= 0 ? s.positive : s.negative}><Icon size={12} aria-hidden="true"/>{Math.abs(percent).toFixed(1)}%</span><span>so với kỳ trước</span></>;
}
function TrafficChart({ points }: { points: TrafficPoint[] }) {
  const gradientId = useId().replace(/:/g, "");
  const [active, setActive] = useState<number | null>(null);
  const [width, setWidth] = useState(800);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(entries => setWidth(Math.max(280, Math.round(entries[0].contentRect.width))));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const W = width, H = width < 420 ? 195 : 235, left = 48, top = 18, right = 14, bottom = 30;
  const maxValue = Math.max(10, ...points.flatMap(p => SERIES.map(series => p[series.key])));
  const max = Math.ceil(maxValue / (maxValue > 1000 ? 1000 : maxValue > 100 ? 100 : 10)) * (maxValue > 1000 ? 1000 : maxValue > 100 ? 100 : 10);
  const x = (index: number) => left + index * (W - left - right) / Math.max(1, points.length - 1);
  const y = (value: number) => H - bottom - value / max * (H - top - bottom);
  const path = (key: SeriesKey) => points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p[key])}`).join(" ");
  const current = active === null ? null : points[Math.min(active, points.length - 1)];
  const total = sumTraffic(points);
  return <>
    <div className={s.chartWrap} ref={container}>
      {current && <div className={s.chartTooltip}><strong>{current.label}</strong>{SERIES.map(series => <span key={series.key}>{series.label}: {formatNumber(current[series.key])}</span>)}</div>}
      <svg className={s.trafficSvg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Biểu đồ lượt truy cập: khách lạ, người dùng và bot" tabIndex={0}
        onPointerMove={event => { const bounds = event.currentTarget.getBoundingClientRect(); const position = (event.clientX - bounds.left) / bounds.width * W; setActive(Math.max(0, Math.min(points.length - 1, Math.round((position - left) / (W - left - right) * (points.length - 1))))); }}
        onPointerLeave={() => setActive(null)} onFocus={() => setActive(0)} onBlur={() => setActive(null)}
        onKeyDown={event => { if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); setActive(i => Math.max(0, Math.min(points.length - 1, (i ?? 0) + (event.key === "ArrowRight" ? 1 : -1)))); } }}>
        <defs><linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#b83d61" stopOpacity=".13"/><stop offset="100%" stopColor="#b83d61" stopOpacity=".005"/></linearGradient></defs>
        {Array.from({ length: 5 }, (_, i) => <g key={i}><line x1={left} x2={W - right} y1={y(max * i / 4)} y2={y(max * i / 4)} stroke="#edf0f4" strokeDasharray={i ? "3 5" : "0"}/><text x={left - 10} y={y(max * i / 4) + 4} textAnchor="end" fontSize="11" fill="#8a8e9a">{formatNumber(Math.round(max * i / 4))}</text></g>)}
        <path d={`${path("guests")} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#${gradientId})`}/>
        {SERIES.map(series => <path key={series.key} d={path(series.key)} fill="none" stroke={series.color} strokeWidth={series.key === "guests" ? 2.5 : 2} strokeDasharray={series.key === "bots" ? "4 5" : undefined} strokeLinejoin="round" strokeLinecap="round"/>)}
        {points.map((p, i) => i % Math.ceil(points.length / (width < 420 ? 5 : 7)) === 0 || i === points.length - 1 ? <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" fill="#737986">{p.label}</text> : null)}
        {current && active !== null && <g><line x1={x(active)} x2={x(active)} y1={top} y2={H - bottom} stroke="#c6c9d2" strokeDasharray="3 3"/>{SERIES.map(series => <circle key={series.key} cx={x(active)} cy={y(current[series.key])} r="4" fill={series.color} stroke="#fff" strokeWidth="2"/>)}</g>}
      </svg>
    </div>
    <div className={s.chartSummary}>{SERIES.map(series => <div key={series.key}><strong>{formatNumber(total[series.key])}</strong><span>{series.label}</span></div>)}</div>
  </>;
}
export default function OverviewPanel({ detailed = false }: { detailed?: boolean }) {
  const [granularity, setGranularity] = useState<Granularity>("month");
  const [anchor, setAnchor] = useState(DEMO_DATE);
  const [ranking, setRanking] = useState<"logins" | "app" | "paid">("logins");
  const [region, setRegion] = useState<Region | "all">("all");
  const { users } = useAdminUsers();
  const { orders } = useAdminCommerce();
  const points = useMemo(() => trafficForPeriod(anchor, granularity), [anchor, granularity]);
  const totals = sumTraffic(points);
  const previous = sumTraffic(trafficForPeriod(previousAnchor(anchor, granularity), granularity));
  const periodOrders = ordersInPeriod(orders, anchor, granularity);
  const revenue = summarizeRevenue(periodOrders);
  const ranked = users.map(user => {
    const activity = periodUserActivity(user, anchor, granularity);
    const paid = periodOrders.filter(order => order.userId === user.id && order.status === "paid" && (region === "all" || order.region === region)).reduce((sum, order) => sum + order.coins, 0);
    return { user, ...activity, paid };
  }).sort((a, b) => b[ranking] - a[ranking]);
  const allActivity = ranked.reduce((a, item) => ({ logins: a.logins + item.logins, app: a.app + item.app }), { logins: 0, app: 0 });
  const periodText = granularity === "year" ? anchor.slice(0, 4) : granularity === "month" ? `${anchor.slice(5, 7)}/${anchor.slice(0, 4)}` : `${anchor.slice(8, 10)}/${anchor.slice(5, 7)}/${anchor.slice(0, 4)}`;
  const inputValue = granularity === "year" ? anchor.slice(0, 4) : granularity === "month" ? anchor.slice(0, 7) : anchor;
  const stats = detailed ? [
    { title: "Lượt khách lạ", value: totals.guests, prev: previous.guests, icon: Users },
    { title: "Lượt người dùng", value: totals.users, prev: previous.users, icon: LogIn },
    { title: "Lượt bot", value: totals.bots, prev: previous.bots, icon: Bot },
    { title: "Phiên truy cập", value: totals.sessions, prev: previous.sessions, icon: Activity },
  ] : [
    { title: "Lượt truy cập", value: totals.guests + totals.users + totals.bots, prev: previous.guests + previous.users + previous.bots, icon: Users },
    { title: "Phiên Studio", value: allActivity.app, prev: users.reduce((sum, user) => sum + periodUserActivity(user, previousAnchor(anchor, granularity), granularity).app, 0), icon: Activity },
    { title: "Lượt render", value: totals.renders, prev: previous.renders, icon: Image },
    { title: "Coin đã nạp", value: revenue.coins, prev: summarizeRevenue(ordersInPeriod(orders, previousAnchor(anchor, granularity), granularity)).coins, icon: null },
  ];
  function exportAnalytics() {
    downloadCsv(`labellab-truy-cap-${inputValue}.csv`, ["Thời gian", "Khách lạ", "Người dùng", "Bot", "Phiên truy cập", "Lượt render"], points.map(p => [p.iso, p.guests, p.users, p.bots, p.sessions, p.renders]));
  }
  return <>
    <div className={s.pageHeading}><h1>{detailed ? "Lượt truy cập" : "Tổng quan"}</h1><div className={s.periodControls}><div className={s.segmented} aria-label="Khoảng thống kê">{([['day', 'Ngày'], ['month', 'Tháng'], ['year', 'Năm']] as const).map(([value, label]) => <button key={value} aria-pressed={granularity === value} onClick={() => setGranularity(value)}>{label}</button>)}</div>{granularity === "year" ? <select className={s.dateInput} aria-label="Kỳ thống kê" value={anchor.slice(0, 4)} onChange={event => setAnchor(`${event.target.value}-01-01`)}><option value="2026">2026</option><option value="2025">2025</option></select> : <input className={s.dateInput} aria-label="Kỳ thống kê" type={granularity === "month" ? "month" : "date"} min={granularity === "month" ? "2025-01" : "2025-01-01"} max={granularity === "month" ? "2026-10" : DEMO_DATE} value={inputValue} onChange={event => { const raw = event.target.value; if (granularity === "month" && /^\d{4}-\d{2}$/.test(raw)) setAnchor(`${raw}-01`); if (granularity === "day" && /^\d{4}-\d{2}-\d{2}$/.test(raw)) setAnchor(raw); }}/> }</div></div>
    <div className={s.stats}>{stats.map(stat => <article className={s.stat} key={stat.title}><div className={s.statTop}><span>{stat.title}</span>{stat.icon ? <stat.icon size={18} aria-hidden="true"/> : <img src="/branding/LLCoin.svg" alt="" width="20" height="20"/>}</div><div className={s.statValue}>{formatNumber(stat.value)}</div><div className={s.statBottom}><Trend value={stat.value} previous={stat.prev}/></div></article>)}</div>
    <div className={s.chartGrid}>
      <section className={s.panel}><div className={s.panelHeader}><h2>Lượt truy cập</h2><div className={s.legend}>{SERIES.map(series => <span key={series.key}><i style={{ background: series.color }}/>{series.label}</span>)}</div></div><TrafficChart key={`${anchor}-${granularity}`} points={points}/></section>
      <section className={s.panel}><div className={s.panelHeader}><h2>Doanh thu</h2><span className={s.subtle}>{periodText}</span></div><div className={s.revenueRows}>{(["vn", "international"] as Region[]).map(r => {
        const bars = points.map(point => {
          const filtered = periodOrders.filter(o => {
            const local = new Date(Date.parse(o.createdAt) + 7 * 3600000).toISOString();
            return o.region === r && o.status === "paid" && (granularity === "day" ? Number(local.slice(11, 13)) === Number(point.label.replace("h", "")) : granularity === "month" ? local.slice(0, 10) === point.iso : local.slice(0, 7) === point.iso.slice(0, 7));
          });
          return filtered.reduce((sum, order) => sum + order.amount, 0);
        });
        return <div className={s.revenueRow} key={r}><div><span>{r === "vn" ? "Việt Nam" : "Quốc tế"}</span><span className={s.currency}>{r === "vn" ? "VND" : "USD"}</span></div><strong>{formatMoney(revenue[r], r)}</strong><div className={s.miniBars} aria-hidden="true">{bars.map((bar, i) => <span key={i} style={{ height: `${Math.max(5, bar / Math.max(1, ...bars) * 100)}%` }}/>)}</div></div>;
      })}</div><div className={s.revenueFooter}><span><strong>{formatNumber(revenue.paid)}</strong> đơn thành công</span><Link href="/admin/transactions">Giao dịch<ArrowRight size={13} aria-hidden="true"/></Link></div></section>
    </div>
    {detailed ? <>
      <section className={s.panel}><div className={s.panelHeader}><h2>Chi tiết truy cập</h2><button className={s.secondary} onClick={exportAnalytics}><Download size={15} aria-hidden="true"/>Xuất CSV</button></div><div className={s.tableScroll}><table className={s.table}><thead><tr><th>{granularity === "day" ? "Giờ" : granularity === "month" ? "Ngày" : "Tháng"}</th><th>Khách lạ</th><th>Người dùng</th><th>Bot</th><th>Tổng lượt</th><th>Phiên truy cập</th></tr></thead><tbody>{points.map(point => <tr key={point.iso}><td>{point.label}</td><td>{formatNumber(point.guests)}</td><td>{formatNumber(point.users)}</td><td>{formatNumber(point.bots)}</td><td><strong>{formatNumber(point.guests + point.users + point.bots)}</strong></td><td>{formatNumber(point.sessions)}</td></tr>)}</tbody></table></div></section>
    </> : <div className={s.lowerGrid}>
      <section className={s.panel}><div className={s.panelHeader}><h2>Top người dùng</h2>{ranking === "paid" ? <select aria-label="Khu vực xếp hạng" className={s.select} value={region} onChange={e => setRegion(e.target.value as Region | "all")}><option value="all">Mọi khu vực</option><option value="vn">Việt Nam</option><option value="international">Quốc tế</option></select> : <span className={s.subtle}>{periodText}</span>}</div><div className={s.rankTabbar}>{([['logins', 'Đăng nhập'], ['app', 'Dùng Studio'], ['paid', 'Nạp coin']] as const).map(([key, label]) => <button key={key} aria-pressed={ranking === key} onClick={() => setRanking(key)}>{label}</button>)}</div><div className={s.rankList}>{ranked.filter(item => item[ranking] > 0).slice(0, 5).map((item, i) => <div key={item.user.id} className={s.rankRow}><span className={s.rankNumber}>{i + 1}</span><span className={s.avatar}>{item.user.name.split(" ").map(s => s[0]).slice(0, 2).join("")}</span><Link href="/admin/users" className={s.userName}><strong>{item.user.name}</strong><small>{item.user.email}</small></Link><span className={s.rankValue}>{ranking === "paid" ? <CoinValue value={item.paid}/> : formatNumber(item[ranking])}{ranking !== "paid" && <small> lần</small>}</span></div>)}{!ranked.some(item => item[ranking] > 0) && <div className={s.empty}>Chưa có hoạt động trong kỳ này.</div>}</div></section>
      <section className={s.panel}><div className={s.panelHeader}><h2>Giao dịch gần đây</h2><Link href="/admin/transactions" className={s.smallLink}>Xem tất cả<ArrowRight size={13} aria-hidden="true"/></Link></div><div className={s.tableScroll}><table className={s.table}><thead><tr><th>Người dùng</th><th>Số tiền</th><th>Trạng thái</th></tr></thead><tbody>{periodOrders.slice(0, 5).map(order => <tr key={order.id}><td><div className={s.userName}><strong>{users.find(u => u.id === order.userId)?.name ?? order.userId}</strong><small>{new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(order.createdAt))} · {order.id}</small></div></td><td>{formatMoney(order.amount, order.region)}</td><td><span className={s.status} data-status={order.status}>{STATUS_LABELS[order.status]}</span></td></tr>)}</tbody></table>{!periodOrders.length && <div className={s.empty}>Chưa có giao dịch trong kỳ này.</div>}</div></section>
    </div>}
    {!detailed && <details className={s.dataDisclosure}><summary>Bảng số liệu truy cập · {periodText}</summary><div className={s.tableScroll}><table className={s.table}><thead><tr><th>Thời gian</th><th>Khách lạ</th><th>Người dùng</th><th>Bot</th></tr></thead><tbody>{points.map(point => <tr key={point.iso}><td>{point.label}</td><td>{formatNumber(point.guests)}</td><td>{formatNumber(point.users)}</td><td>{formatNumber(point.bots)}</td></tr>)}</tbody></table></div><button className={s.secondary} onClick={exportAnalytics}><Download size={15} aria-hidden="true"/>Xuất CSV</button></details>}
  </>;
}
