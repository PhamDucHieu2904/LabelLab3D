"use client";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Bot, Download, Gauge, Image, LogIn, RefreshCw, ShieldAlert, ShieldCheck, Users } from "lucide-react";
import { sumTraffic, type Granularity, type TrafficPoint } from "@/lib/admin/analytics";
import { downloadCsv, formatMoney, formatNumber, type Region } from "@/lib/admin/commerce";
import type { WorkerQuotaReport } from "@/lib/server/request-meter";
import s from "./AdminWorkspace.module.css";

type SeriesKey = "guests" | "users" | "bots";
const SERIES: { key: SeriesKey; label: string; color: string }[] = [
  { key: "guests", label: "Khách lạ", color: "#b83d61" },
  { key: "users", label: "Người dùng", color: "#668caa" },
  { key: "bots", label: "Bot", color: "#99a0af" },
];

const ORDER_STATUS_VI: Record<string, string> = {
  paid: "Đã thanh toán",
  pending: "Chờ xử lý",
  expired: "Hết hạn",
  cancelled: "Đã hủy",
  refunded: "Hoàn tiền",
};

type OverviewResponse = {
  today: string;
  anchor: string;
  granularity: Granularity;
  points: TrafficPoint[];
  totals: { guests: number; users: number; bots: number; sessions: number; renders: number };
  previous: { guests: number; users: number; bots: number; sessions: number; renders: number };
  studioSessions: number;
  prevStudioSessions: number;
  loginsTotal: number;
  prevLoginsTotal: number;
  revenue: { vn: number; international: number; coins: number; paid: number; pending: number };
  prevPaidCoins: number;
  revenueBars: { vn: number[]; international: number[] };
  rankedUsers: Array<{
    id: string;
    name: string;
    email: string;
    balance: number;
    logins: number;
    app: number;
    paidAll: number;
    paidVn: number;
    paidInternational: number;
  }>;
  recentOrders: Array<{
    id: string;
    orderCode: string;
    userId: string;
    userName: string | null;
    userEmail: string | null;
    coins: number;
    amount: number;
    currency: string;
    status: string;
    createdAt: string;
  }>;
  workerQuota?: WorkerQuotaReport | null;
  antiCheatSummary?: {
    flaggedUsersCount: number;
    highRiskCount: number;
    mediumRiskCount: number;
    totalCoinDiscrepancy: number;
    totalToolUsesCommitted: number;
    totalExpectedCoinBurn: number;
    totalActualCoinBurn: number;
  } | null;
  summary: { totalUsers: number; totalCoinsBalance: number };
};

function todayVnIso() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}

export function CoinValue({ value }: { value: number }) {
  return (
    <span className={s.coinValue}>
      <img src="/branding/LLCoin.svg" width="18" height="18" alt="coin" />
      {formatNumber(value)}
    </span>
  );
}

function Trend({ value, previous }: { value: number; previous: number }) {
  if (!previous) return <span className={s.subtle}>{value > 0 ? "Mới phát sinh kỳ này" : "— kỳ trước"}</span>;
  const percent = ((value - previous) / previous) * 100;
  const Icon = percent >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <>
      <span className={percent >= 0 ? s.positive : s.negative}>
        <Icon size={12} aria-hidden="true" />
        {Math.abs(percent).toFixed(1)}%
      </span>
      <span>so với kỳ trước</span>
    </>
  );
}

function TrafficChart({ points }: { points: TrafficPoint[] }) {
  const gradientId = useId().replace(/:/g, "");
  const [active, setActive] = useState<number | null>(null);
  const [width, setWidth] = useState(800);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver((entries) => setWidth(Math.max(280, Math.round(entries[0].contentRect.width))));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);

  if (points.length === 0) {
    return <div className={s.empty}>Chưa có dữ liệu truy cập trong kỳ này.</div>;
  }

  const W = width, H = width < 420 ? 195 : 235, left = 48, top = 18, right = 14, bottom = 30;
  const maxValue = Math.max(4, ...points.flatMap((p) => SERIES.map((series) => p[series.key])));
  const step = maxValue > 1000 ? 1000 : maxValue > 100 ? 100 : maxValue > 20 ? 10 : 4;
  const max = Math.ceil(maxValue / step) * step;
  const x = (index: number) => left + (index * (W - left - right)) / Math.max(1, points.length - 1);
  const y = (value: number) => H - bottom - (value / max) * (H - top - bottom);
  const path = (key: SeriesKey) => points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p[key])}`).join(" ");
  const current = active === null ? null : points[Math.min(active, points.length - 1)];
  const total = sumTraffic(points);

  return (
    <>
      <div className={s.chartWrap} ref={container}>
        {current && (
          <div className={s.chartTooltip}>
            <strong>{current.label}</strong>
            {SERIES.map((series) => <span key={series.key}>{series.label}: {formatNumber(current[series.key])}</span>)}
          </div>
        )}
        <svg
          className={s.trafficSvg}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Biểu đồ lượt truy cập thực tế từ Cloudflare D1"
          tabIndex={0}
          onPointerMove={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            const position = ((event.clientX - bounds.left) / bounds.width) * W;
            setActive(Math.max(0, Math.min(points.length - 1, Math.round(((position - left) / (W - left - right)) * (points.length - 1)))));
          }}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive(0)}
          onBlur={() => setActive(null)}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
              event.preventDefault();
              setActive((i) => Math.max(0, Math.min(points.length - 1, (i ?? 0) + (event.key === "ArrowRight" ? 1 : -1))));
            }
          }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#b83d61" stopOpacity=".13" />
              <stop offset="100%" stopColor="#b83d61" stopOpacity=".005" />
            </linearGradient>
          </defs>
          {Array.from({ length: 5 }, (_, i) => (
            <g key={i}>
              <line x1={left} x2={W - right} y1={y((max * i) / 4)} y2={y((max * i) / 4)} stroke="#edf0f4" strokeDasharray={i ? "3 5" : "0"} />
              <text x={left - 10} y={y((max * i) / 4) + 4} textAnchor="end" fontSize="11" fill="#8a8e9a">{formatNumber(Math.round((max * i) / 4))}</text>
            </g>
          ))}
          <path d={`${path("guests")} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#${gradientId})`} />
          {SERIES.map((series) => (
            <path
              key={series.key}
              d={path(series.key)}
              fill="none"
              stroke={series.color}
              strokeWidth={series.key === "guests" ? 2.5 : 2}
              strokeDasharray={series.key === "bots" ? "4 5" : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {points.map((p, i) => (
            i % Math.ceil(points.length / (width < 420 ? 5 : 7)) === 0 || i === points.length - 1
              ? <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" fill="#737986">{p.label}</text>
              : null
          ))}
          {current && active !== null && (
            <g>
              <line x1={x(active)} x2={x(active)} y1={top} y2={H - bottom} stroke="#c6c9d2" strokeDasharray="3 3" />
              {SERIES.map((series) => (
                <circle key={series.key} cx={x(active)} cy={y(current[series.key])} r="4" fill={series.color} stroke="#fff" strokeWidth="2" />
              ))}
            </g>
          )}
        </svg>
      </div>
      <div className={s.chartSummary}>
        {SERIES.map((series) => (
          <div key={series.key}>
            <strong>{formatNumber(total[series.key])}</strong>
            <span>{series.label}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export default function OverviewPanel({ detailed = false }: { detailed?: boolean }) {
  const [granularity, setGranularity] = useState<Granularity>("month");
  const [anchor, setAnchor] = useState(() => todayVnIso());
  const [ranking, setRanking] = useState<"logins" | "app" | "paid">("paid");
  const [region, setRegion] = useState<Region | "all">("all");
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadSeq, setReloadSeq] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/admin/overview?granularity=${encodeURIComponent(granularity)}&anchor=${encodeURIComponent(anchor)}`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Không thể tải dữ liệu từ Cloudflare D1.");
        const payload = await res.json() as OverviewResponse;
        if (active) setData(payload);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Không thể tải dữ liệu.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [granularity, anchor, reloadSeq]);

  const points = data?.points ?? [];
  const totals = data?.totals ?? { guests: 0, users: 0, bots: 0, sessions: 0, renders: 0 };
  const previous = data?.previous ?? { guests: 0, users: 0, bots: 0, sessions: 0, renders: 0 };
  const revenue = data?.revenue ?? { vn: 0, international: 0, coins: 0, paid: 0, pending: 0 };
  const currentYear = Number(todayVnIso().slice(0, 4));
  const years = Array.from(new Set([currentYear, currentYear - 1, 2025, 2026])).sort((a, b) => b - a);
  const periodText = granularity === "year" ? anchor.slice(0, 4) : granularity === "month" ? `${anchor.slice(5, 7)}/${anchor.slice(0, 4)}` : `${anchor.slice(8, 10)}/${anchor.slice(5, 7)}/${anchor.slice(0, 4)}`;
  const inputValue = granularity === "year" ? anchor.slice(0, 4) : granularity === "month" ? anchor.slice(0, 7) : anchor;

  const ranked = (data?.rankedUsers ?? []).map((u) => ({
    user: u,
    logins: u.logins,
    app: u.app,
    paid: region === "vn" ? u.paidVn : region === "international" ? u.paidInternational : u.paidAll,
  })).sort((a, b) => b[ranking] - a[ranking]);

  const stats = detailed ? [
    { title: "Lượt khách lạ", value: totals.guests, prev: previous.guests, icon: Users },
    { title: "Lượt người dùng", value: totals.users, prev: previous.users, icon: LogIn },
    { title: "Lượt bot", value: totals.bots, prev: previous.bots, icon: Bot },
    { title: "Phiên Studio", value: data?.studioSessions ?? 0, prev: data?.prevStudioSessions ?? 0, icon: Activity },
  ] : [
    { title: "Lượt truy cập", value: totals.guests + totals.users + totals.bots, prev: previous.guests + previous.users + previous.bots, icon: Users },
    { title: "Phiên Studio", value: data?.studioSessions ?? 0, prev: data?.prevStudioSessions ?? 0, icon: Activity },
    { title: "Lượt render", value: totals.renders, prev: previous.renders, icon: Image },
    { title: "Coin đã nạp", value: revenue.coins, prev: data?.prevPaidCoins ?? 0, icon: null },
  ];

  function exportAnalytics() {
    downloadCsv(
      `hypermockup-truy-cap-${inputValue}.csv`,
      ["Thời gian", "Khách lạ", "Người dùng", "Bot", "Phiên Studio", "Lượt render"],
      points.map((p) => [p.iso, p.guests, p.users, p.bots, p.sessions, p.renders]),
    );
  }

  const quota = data?.workerQuota ?? null;
  const antiCheat = data?.antiCheatSummary ?? null;
  const quotaBarColor =
    quota?.today.status === "upgrade"
      ? "#b83d61"
      : quota?.today.status === "watch"
        ? "#c9821d"
        : "#24806b";

  return (
    <>
      <div className={s.pageHeading}>
        <h1>{detailed ? "Lượt truy cập" : "Tổng quan"}</h1>
        <div className={s.periodControls}>
          <div className={s.segmented} aria-label="Khoảng thống kê">
            {([["day", "Ngày"], ["month", "Tháng"], ["year", "Năm"]] as const).map(([value, label]) => (
              <button key={value} aria-pressed={granularity === value} onClick={() => setGranularity(value)}>{label}</button>
            ))}
          </div>
          {granularity === "year" ? (
            <select className={s.dateInput} aria-label="Kỳ thống kê" value={anchor.slice(0, 4)} onChange={(event) => setAnchor(`${event.target.value}-01-01`)}>
              {years.map((y) => <option key={y} value={String(y)}>{y}</option>)}
            </select>
          ) : (
            <input
              className={s.dateInput}
              aria-label="Kỳ thống kê"
              type={granularity === "month" ? "month" : "date"}
              min={granularity === "month" ? "2025-01" : "2025-01-01"}
              value={inputValue}
              onChange={(event) => {
                const raw = event.target.value;
                if (granularity === "month" && /^\d{4}-\d{2}$/.test(raw)) setAnchor(`${raw}-01`);
                if (granularity === "day" && /^\d{4}-\d{2}-\d{2}$/.test(raw)) setAnchor(raw);
              }}
            />
          )}
          <button type="button" className={s.secondary} onClick={() => setReloadSeq((n) => n + 1)} disabled={loading} aria-label="Tải lại dữ liệu">
            <RefreshCw size={15} aria-hidden="true" />
            {loading ? "Đang tải…" : "Làm mới"}
          </button>
        </div>
      </div>

      {error && <p role="alert" className={s.formError} style={{ marginBottom: 16 }}>{error}</p>}

      {antiCheat && antiCheat.flaggedUsersCount > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
            flexWrap: "wrap",
            padding: "14px 18px",
            marginBottom: 18,
            borderRadius: 12,
            border: "1px solid #f0c8ce",
            background: "#fff5f6",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ShieldAlert size={18} color="#b23e50" aria-hidden="true" />
            <div>
              <strong style={{ color: "#9c2337", display: "block" }}>
                Cảnh báo chống gian lận: {formatNumber(antiCheat.flaggedUsersCount)} tài khoản có dấu hiệu bất thường
              </strong>
              <span className={s.subtle}>
                {antiCheat.highRiskCount} cảnh báo cao · {antiCheat.mediumRiskCount} nghi ngờ · Chênh lệch coin burn: {formatNumber(antiCheat.totalCoinDiscrepancy)} xu
              </span>
            </div>
          </div>
          <Link href="/admin/activity" className={s.secondary} style={{ textDecoration: "none" }}>
            Xem chi tiết gian lận<ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      )}

      <div className={s.stats}>
        {stats.map((stat) => (
          <article className={s.stat} key={stat.title}>
            <div className={s.statTop}>
              <span>{stat.title}</span>
              {stat.icon ? <stat.icon size={18} aria-hidden="true" /> : <img src="/branding/LLCoin.svg" alt="" width="20" height="20" />}
            </div>
            <div className={s.statValue}>{formatNumber(stat.value)}</div>
            <div className={s.statBottom}><Trend value={stat.value} previous={stat.prev} /></div>
          </article>
        ))}
      </div>

      {quota && (
        <section className={s.panel} style={{ marginBottom: 22 }}>
          <div className={s.panelHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Gauge size={18} color={quotaBarColor} aria-hidden="true" />
              <h2>Hạn mức Cloudflare Workers (100.000 req/ngày) &amp; Bot Shield</h2>
            </div>
            <span
              className={s.status}
              data-status={quota.today.status === "upgrade" ? "failed" : quota.today.status === "watch" ? "pending" : "active"}
            >
              {quota.today.status === "upgrade"
                ? "Nên nâng cấp Paid"
                : quota.today.status === "watch"
                  ? "Theo dõi sát"
                  : "An toàn gói Free"}
            </span>
          </div>
          <div style={{ padding: "0 22px 18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap", fontSize: 13 }}>
              <span>
                Hôm nay ({quota.today.day}): <strong>{formatNumber(quota.today.totalRequests)}</strong> / {formatNumber(quota.freeDailyLimit)} request ({quota.today.quotaPercent}%)
              </span>
              <span className={s.subtle}>{quota.today.recommendation}</span>
            </div>
            <div className={s.progress} style={{ height: 8, marginTop: 10 }}>
              <span
                style={{
                  width: `${Math.min(100, Math.max(quota.today.totalRequests > 0 ? 2 : 0, quota.today.quotaPercent))}%`,
                  background: quotaBarColor,
                }}
              />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))",
                gap: 14,
                marginTop: 16,
                paddingTop: 16,
                borderTop: "1px solid #eceef2",
              }}
            >
              <div>
                <div className={s.subtle} style={{ fontSize: 12 }}>TB request / 1 user (hôm nay)</div>
                <strong style={{ fontSize: 20, display: "block", marginTop: 2 }}>
                  {quota.today.avgRequestsPerUser.toLocaleString("vi-VN")} <small className={s.subtle}>req/user</small>
                </strong>
                <span className={s.subtle} style={{ fontSize: 11.5 }}>
                  {formatNumber(quota.today.uniqueUsers)} user đăng nhập · Trong kỳ: {quota.period.avgRequestsPerUser.toLocaleString("vi-VN")} req/user
                </span>
              </div>
              <div>
                <div className={s.subtle} style={{ fontSize: 12 }}>TB request / khách truy cập</div>
                <strong style={{ fontSize: 20, display: "block", marginTop: 2 }}>
                  {quota.today.avgRequestsPerVisitor.toLocaleString("vi-VN")} <small className={s.subtle}>req/khách</small>
                </strong>
                <span className={s.subtle} style={{ fontSize: 11.5 }}>
                  {formatNumber(quota.today.uniqueUsers + quota.today.uniqueGuests)} người thực hôm nay · Kỳ: {quota.period.avgRequestsPerVisitor.toLocaleString("vi-VN")}
                </span>
              </div>
              <div>
                <div className={s.subtle} style={{ fontSize: 12 }}>Tổng Worker request ({periodText})</div>
                <strong style={{ fontSize: 20, display: "block", marginTop: 2 }}>
                  {formatNumber(quota.period.totalRequests)}
                </strong>
                <span className={s.subtle} style={{ fontSize: 11.5 }}>
                  Trang: {formatNumber(quota.period.pageRequests)} · API: {formatNumber(quota.period.apiRequests)} · Auth: {formatNumber(quota.period.authRequests)}
                </span>
              </div>
              <div>
                <div className={s.subtle} style={{ fontSize: 12 }}>Bot &amp; probe đã chặn (Bot Shield)</div>
                <strong style={{ fontSize: 20, display: "block", marginTop: 2, color: quota.today.blockedRequests > 0 ? "#b83d61" : "#24806b" }}>
                  {formatNumber(quota.today.blockedRequests)} <small className={s.subtle}>hôm nay</small>
                </strong>
                <span className={s.subtle} style={{ fontSize: 11.5 }}>
                  Trong kỳ: {formatNumber(quota.period.blockedRequests)} · Đỉnh ngày: {quota.period.peakDay ? `${formatNumber(quota.period.peakRequests)} (${quota.period.peakDay.slice(5)})` : "—"}
                </span>
              </div>
              <div>
                <div className={s.subtle} style={{ fontSize: 12 }}>Đối soát chống gian lận</div>
                <strong style={{ fontSize: 20, display: "flex", alignItems: "center", gap: 6, marginTop: 2, color: (antiCheat?.flaggedUsersCount ?? 0) > 0 ? "#b23e50" : "#24806b" }}>
                  {(antiCheat?.flaggedUsersCount ?? 0) > 0 ? <ShieldAlert size={17} /> : <ShieldCheck size={17} />}
                  {formatNumber(antiCheat?.flaggedUsersCount ?? 0)} <small className={s.subtle}>cảnh báo</small>
                </strong>
                <Link href="/admin/activity" className={s.smallLink} style={{ marginTop: 2 }}>
                  Xem đối soát coin<ArrowRight size={12} aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className={s.chartGrid}>
        <section className={s.panel}>
          <div className={s.panelHeader}>
            <h2>Lượt truy cập thực tế</h2>
            <div className={s.legend}>
              {SERIES.map((series) => <span key={series.key}><i style={{ background: series.color }} />{series.label}</span>)}
            </div>
          </div>
          <TrafficChart key={`${anchor}-${granularity}-${reloadSeq}`} points={points} />
        </section>

        <section className={s.panel}>
          <div className={s.panelHeader}>
            <h2>Doanh thu</h2>
            <span className={s.subtle}>{periodText}</span>
          </div>
          <div className={s.revenueRows}>
            {(["vn", "international"] as Region[]).map((r) => {
              const bars = r === "vn" ? (data?.revenueBars.vn ?? []) : (data?.revenueBars.international ?? []);
              const maxBar = Math.max(1, ...bars);
              return (
                <div className={s.revenueRow} key={r}>
                  <div>
                    <span>{r === "vn" ? "Việt Nam" : "Quốc tế"}</span>
                    <span className={s.currency}>{r === "vn" ? "VND" : "USD"}</span>
                  </div>
                  <strong>{formatMoney(revenue[r], r)}</strong>
                  <div className={s.miniBars} aria-hidden="true">
                    {bars.map((bar, i) => <span key={i} style={{ height: `${Math.max(5, (bar / maxBar) * 100)}%` }} />)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className={s.revenueFooter}>
            <span><strong>{formatNumber(revenue.paid)}</strong> đơn thành công · <strong>{formatNumber(data?.summary.totalUsers ?? 0)}</strong> tài khoản</span>
            <Link href="/admin/transactions">Giao dịch<ArrowRight size={13} aria-hidden="true" /></Link>
          </div>
        </section>
      </div>

      {detailed ? (
        <section className={s.panel}>
          <div className={s.panelHeader}>
            <h2>Chi tiết truy cập</h2>
            <button className={s.secondary} onClick={exportAnalytics}><Download size={15} aria-hidden="true" />Xuất CSV</button>
          </div>
          <div className={s.tableScroll}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>{granularity === "day" ? "Giờ" : granularity === "month" ? "Ngày" : "Tháng"}</th>
                  <th>Khách lạ</th>
                  <th>Người dùng</th>
                  <th>Bot</th>
                  <th>Tổng lượt</th>
                  <th>Phiên Studio</th>
                </tr>
              </thead>
              <tbody>
                {points.map((point) => (
                  <tr key={point.iso}>
                    <td>{point.label}</td>
                    <td>{formatNumber(point.guests)}</td>
                    <td>{formatNumber(point.users)}</td>
                    <td>{formatNumber(point.bots)}</td>
                    <td><strong>{formatNumber(point.guests + point.users + point.bots)}</strong></td>
                    <td>{formatNumber(point.sessions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <div className={s.lowerGrid}>
          <section className={s.panel}>
            <div className={s.panelHeader}>
              <h2>Top người dùng</h2>
              {ranking === "paid" ? (
                <select aria-label="Khu vực xếp hạng" className={s.select} value={region} onChange={(e) => setRegion(e.target.value as Region | "all")}>
                  <option value="all">Mọi khu vực</option>
                  <option value="vn">Việt Nam</option>
                  <option value="international">Quốc tế</option>
                </select>
              ) : (
                <span className={s.subtle}>{periodText}</span>
              )}
            </div>
            <div className={s.rankTabbar}>
              {([["paid", "Nạp coin"], ["logins", "Phiên đăng nhập"], ["app", "Dùng Studio"]] as const).map(([key, label]) => (
                <button key={key} aria-pressed={ranking === key} onClick={() => setRanking(key)}>{label}</button>
              ))}
            </div>
            <div className={s.rankList}>
              {ranked.filter((item) => item[ranking] > 0).slice(0, 5).map((item, i) => (
                <div key={item.user.id} className={s.rankRow}>
                  <span className={s.rankNumber}>{i + 1}</span>
                  <span className={s.avatar}>{item.user.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}</span>
                  <Link href="/admin/users" className={s.userName}>
                    <strong>{item.user.name}</strong>
                    <small>{item.user.email}</small>
                  </Link>
                  <span className={s.rankValue}>
                    {ranking === "paid" ? <CoinValue value={item.paid} /> : formatNumber(item[ranking])}
                    {ranking !== "paid" && <small> lần</small>}
                  </span>
                </div>
              ))}
              {!ranked.some((item) => item[ranking] > 0) && <div className={s.empty}>Chưa có hoạt động trong kỳ này.</div>}
            </div>
          </section>

          <section className={s.panel}>
            <div className={s.panelHeader}>
              <h2>Giao dịch gần đây</h2>
              <Link href="/admin/transactions" className={s.smallLink}>Xem tất cả<ArrowRight size={13} aria-hidden="true" /></Link>
            </div>
            <div className={s.tableScroll}>
              <table className={s.table}>
                <thead>
                  <tr><th>Người dùng / Mã đơn</th><th>Số tiền</th><th>Trạng thái</th></tr>
                </thead>
                <tbody>
                  {(data?.recentOrders ?? []).slice(0, 6).map((order) => (
                    <tr key={order.id}>
                      <td>
                        <div className={s.userName}>
                          <strong>{order.userName || order.userEmail || order.userId}</strong>
                          <small>
                            {new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(order.createdAt))}
                            {" · "}
                            {order.orderCode}
                          </small>
                        </div>
                      </td>
                      <td>{formatMoney(order.currency === "VND" ? order.amount : order.amount / 100, order.currency === "VND" ? "vn" : "international")}</td>
                      <td>
                        <span className={s.status} data-status={order.status === "cancelled" || order.status === "expired" ? "failed" : order.status}>
                          {ORDER_STATUS_VI[order.status] ?? order.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!(data?.recentOrders?.length) && <div className={s.empty}>Chưa có giao dịch nào trên Cloudflare D1.</div>}
            </div>
          </section>
        </div>
      )}

      {!detailed && (
        <details className={s.dataDisclosure}>
          <summary>Bảng số liệu truy cập · {periodText}</summary>
          <div className={s.tableScroll}>
            <table className={s.table}>
              <thead><tr><th>Thời gian</th><th>Khách lạ</th><th>Người dùng</th><th>Bot</th><th>Studio</th></tr></thead>
              <tbody>
                {points.map((point) => (
                  <tr key={point.iso}>
                    <td>{point.label}</td>
                    <td>{formatNumber(point.guests)}</td>
                    <td>{formatNumber(point.users)}</td>
                    <td>{formatNumber(point.bots)}</td>
                    <td>{formatNumber(point.sessions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className={s.secondary} onClick={exportAnalytics}><Download size={15} aria-hidden="true" />Xuất CSV</button>
        </details>
      )}
    </>
  );
}
