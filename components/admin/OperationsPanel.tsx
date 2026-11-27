"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { CheckCircle2, Download, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import type { AntiCheatReport, FraudRiskLevel } from "@/lib/server/anticheat";
import type { WorkerQuotaReport } from "@/lib/server/request-meter";
import s from "./OperationsPanel.module.css";

type AuditEntry = {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
  level: "info" | "warning" | "error";
  metadata?: string;
};

type IntegrationInfo = {
  id: string;
  name: string;
  connected: boolean;
  detail: string;
};

type SecurityPayload = {
  activeLocks: Array<{ scope: string; failures: number; lockedUntil: string | null; updatedAt: string }>;
  rejectedPaymentEvents: Array<{ id: string; provider: string; providerEventId: string; status: string; createdAt: string }>;
};

const defaults = {
  name: "HyperMockup",
  domain: "hypermockup.com",
  timezone: "Asia/Ho_Chi_Minh",
  locale: "vi",
  contact: "hypermockup@gmail.com",
  ownerName: "",
  ownerTaxId: "",
  maskOwnerTaxId: true,
  ownerAddress: "",
  ownerPhone: "",
  moitStatusUrl: "",
  usdToVndRate: 25500,
  maintenance: false,
  resolutions: [1024, 2048, 4096, 8129],
  tileThreshold: 4096,
  freeDownloads: 1,
  renderCost: 10,
  dielineCost: 10,
  shareCost: 20,
  projectExtendCost: 10,
  emailVerified: true,
  sessionHours: 720,
  loginLimit: 5,
  registrations: true,
  botPatterns: "bot, crawler, spider, headless, slurp, curl, wget",
  excludedIPs: "",
  retention: 90,
  consent: true,
  excludeOwner: true,
  analytics: true,
  storagePublicId: "",
  analyticsPublicId: "",
};

type Settings = typeof defaults;

const vnOptions = { timeZone: "Asia/Ho_Chi_Minh" };
const vnDate = (at: string) => new Date(at).toLocaleDateString("vi-VN", vnOptions);
const vnTime = (at: string) => new Date(at).toLocaleTimeString("vi-VN", vnOptions);
const vnDay = (at: string) => new Date(Date.parse(at) + 7 * 3600000).toISOString().slice(0, 10);
const fmtNum = (n: number) => new Intl.NumberFormat("vi-VN").format(Math.round(n));

function downloadCSV(entries: AuditEntry[]) {
  const rows = [
    ["Thời gian (UTC+7)", "Người thực hiện", "Thao tác", "Đối tượng", "Mức độ"],
    ...entries.map((item) => [`${vnDate(item.at)} ${vnTime(item.at)}`, item.actor, item.action, item.target, item.level]),
  ];
  const blob = new Blob(
    ["\uFEFF", rows.map((row) => row.map((value) => { const text = String(value); return `"${(/^[=+\-@\t\r]/.test(text) ? "'" + text : text).replace(/"/g, '""')}"`; }).join(",")).join("\r\n")],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "hypermockup-nhat-ky.csv";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => previous?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      className={s.dialog}
      aria-labelledby="operations-dialog-title"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
        }
      }}
    >
      <h2 id="operations-dialog-title">{title}</h2>
      {children}
    </dialog>
  );
}

const levels = { info: "Thông tin", warning: "Cảnh báo", error: "Lỗi" };
const riskLabels: Record<FraudRiskLevel, string> = {
  high: "Cảnh báo cao",
  medium: "Nghi ngờ",
  ok: "Bình thường",
};

export default function OperationsPanel({ section }: { section: "activity" | "settings" }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [security, setSecurity] = useState<SecurityPayload>({ activeLocks: [], rejectedPaymentEvents: [] });
  const [antiCheat, setAntiCheat] = useState<AntiCheatReport | null>(null);
  const [workerQuota, setWorkerQuota] = useState<WorkerQuotaReport | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationInfo[]>([]);
  const [settings, setSettings] = useState<Settings>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [tab, setTab] = useState("anticheat");
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [antiCheatQuery, setAntiCheatQuery] = useState("");
  const [settingsTab, setSettingsTab] = useState("general");
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<AuditEntry | null>(null);
  const [toast, setToast] = useState("");
  const [reset, setReset] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/operations", { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) throw new Error("Không thể tải dữ liệu vận hành từ Cloudflare D1.");
      const payload = await res.json() as {
        entries?: AuditEntry[];
        security?: SecurityPayload;
        antiCheat?: AntiCheatReport | null;
        workerQuota?: WorkerQuotaReport | null;
        integrations?: IntegrationInfo[];
        settings?: Settings;
      };
      setEntries(payload.entries ?? []);
      if (payload.security) setSecurity(payload.security);
      setAntiCheat(payload.antiCheat ?? null);
      setWorkerQuota(payload.workerQuota ?? null);
      setIntegrations(payload.integrations ?? []);
      if (payload.settings) setSettings(payload.settings);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Không thể tải dữ liệu.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => { void load(); });
    return () => cancelAnimationFrame(frame);
  }, [load]);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timeout);
  }, [toast]);

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings((current) => ({ ...current, [key]: value }));

  const saveSettings = async (nextSettings: Settings, targetSection: string) => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/operations", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: nextSettings, section: targetSection }),
      });
      if (!res.ok) throw new Error("Không thể lưu cấu hình lên Cloudflare D1.");
      const payload = await res.json() as { settings?: Settings };
      if (payload.settings) setSettings(payload.settings);
      setToast("Đã lưu cấu hình lên Cloudflare D1.");
      void load();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Không thể lưu cấu hình.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void saveSettings(settings, settingsTab);
  };

  const filtered = entries.filter((item) =>
    Number.isFinite(Date.parse(item.at))
    && (tab !== "security" || item.level !== "info")
    && (severity === "all" || item.level === severity)
    && `${item.action} ${item.actor} ${item.target}`.toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi"))
    && (!from || vnDay(item.at) >= from)
    && (!to || vnDay(item.at) <= to),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 50));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * 50, currentPage * 50);

  const flaggedCount = antiCheat?.summary.flaggedUsersCount ?? 0;
  const visibleAntiCheatUsers = (antiCheat?.users ?? []).filter((row) => {
    if (onlyFlagged && row.riskLevel === "ok") return false;
    if (!antiCheatQuery.trim()) return true;
    const needle = antiCheatQuery.toLocaleLowerCase("vi");
    return `${row.name} ${row.email} ${row.signals.map((sig) => sig.title).join(" ")}`
      .toLocaleLowerCase("vi")
      .includes(needle);
  });

  const textField = (key: keyof Settings, label: string, type = "text", min?: number, max?: number) => (
    <label className={s.field}>
      {label}
      <input
        type={type}
        value={String(settings[key])}
        min={min}
        max={max}
        required={type === "number" || key === "name" || key === "domain"}
        onChange={(event) => update(key, (type === "number" ? Number(event.target.value) : event.target.value) as Settings[typeof key])}
      />
    </label>
  );
  const check = (key: keyof Settings, label: string) => (
    <label className={s.check}>
      <input type="checkbox" checked={Boolean(settings[key])} onChange={(event) => update(key, event.target.checked as Settings[typeof key])} />
      {label}
    </label>
  );

  return (
    <div className={s.root}>
      {toast && <div role="status" className={`${s.toast} ${/^(Cần|Không)/.test(toast) ? s.errorToast : ""}`}>{toast}</div>}

      {section === "activity" ? (
        <>
          <div className={s.tabs} role="group" aria-label="Nhật ký và giám sát">
            {[
              ["anticheat", flaggedCount > 0 ? `Chống gian lận (${flaggedCount})` : "Chống gian lận"],
              ["all", "Nhật ký D1"],
              ["security", "An ninh & Bot Shield"],
              ["integrations", "Tích hợp hệ thống"],
            ].map(([id, label]) => (
              <button key={id} aria-pressed={tab === id} className={tab === id ? s.active : ""} onClick={() => { setTab(id); setPage(1); }}>
                {label}
              </button>
            ))}
          </div>

          {tab === "anticheat" ? (
            <>
              <div
                className={s.notice}
                style={
                  flaggedCount > 0
                    ? { borderColor: "#f0c8ce", background: "#fff5f6" }
                    : { borderColor: "#cde8d6", background: "#f2fbf5" }
                }
              >
                <div>
                  <strong style={flaggedCount > 0 ? { color: "#a8243a" } : { color: "#1c6b42" }}>
                    {flaggedCount > 0 ? (
                      <>
                        <ShieldAlert size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} />
                        Phát hiện {flaggedCount} tài khoản có dấu hiệu gian lận ({antiCheat?.summary.highRiskCount ?? 0} cảnh báo cao · {antiCheat?.summary.mediumRiskCount ?? 0} nghi ngờ)
                      </>
                    ) : (
                      <>
                        <ShieldCheck size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} />
                        Hệ thống đối soát coin tự động: toàn bộ tài khoản khớp lượt dùng công cụ và số xu hao hụt
                      </>
                    )}
                  </strong>
                  <small style={{ color: "#5e6270" }}>
                    Tự động đối chiếu giữa lượt dùng công cụ (Render 3D + Dieline 1:1 mm), coin dự kiến burn, coin thực tế trừ trên sổ cái, tỷ lệ hủy giữ xu, hành vi sao chép DOM SVG và trùng IP đăng ký (tự động loại trừ tài khoản Admin).
                  </small>
                </div>
                <button type="button" className={s.button} onClick={() => void load()} disabled={loading}>
                  <RefreshCw size={15} />Đối soát lại
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: 14,
                  marginBottom: 18,
                }}
              >
                <article className={s.card} style={{ padding: 18 }}>
                  <span className={s.muted} style={{ fontSize: 12.5 }}>Tổng lượt dùng công cụ</span>
                  <div style={{ fontSize: 24, fontWeight: 650, marginTop: 6 }}>
                    {fmtNum(antiCheat?.summary.totalToolUsesCommitted ?? 0)}
                  </div>
                  <small className={s.muted}>
                    {fmtNum(antiCheat?.summary.totalRendersCommitted ?? 0)} render · {fmtNum(antiCheat?.summary.totalDielinesCommitted ?? 0)} dieline
                  </small>
                </article>
                <article className={s.card} style={{ padding: 18 }}>
                  <span className={s.muted} style={{ fontSize: 12.5 }}>Xu dự kiến burn (theo lượt dùng)</span>
                  <div style={{ fontSize: 24, fontWeight: 650, marginTop: 6 }}>
                    {fmtNum(antiCheat?.summary.totalExpectedCoinBurn ?? 0)} xu
                  </div>
                  <small className={s.muted}>
                    Ghi nhận client: {fmtNum(antiCheat?.summary.totalToolUsesReported ?? 0)} lượt
                  </small>
                </article>
                <article className={s.card} style={{ padding: 18 }}>
                  <span className={s.muted} style={{ fontSize: 12.5 }}>Xu thực tế hao hụt (sổ cái D1)</span>
                  <div style={{ fontSize: 24, fontWeight: 650, marginTop: 6 }}>
                    {fmtNum(antiCheat?.summary.totalActualCoinBurn ?? 0)} xu
                  </div>
                  <small className={s.muted}>
                    Độ lệch tổng:{" "}
                    <strong style={{ color: (antiCheat?.summary.totalCoinDiscrepancy ?? 0) > 0 ? "#b32f42" : "#287448" }}>
                      {(antiCheat?.summary.totalCoinDiscrepancy ?? 0) > 0 ? "+" : ""}
                      {fmtNum(antiCheat?.summary.totalCoinDiscrepancy ?? 0)} xu
                    </strong>
                  </small>
                </article>
                <article className={s.card} style={{ padding: 18 }}>
                  <span className={s.muted} style={{ fontSize: 12.5 }}>Tài khoản bị cảnh báo</span>
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 650,
                      marginTop: 6,
                      color: flaggedCount > 0 ? "#b32f42" : "#287448",
                    }}
                  >
                    {fmtNum(flaggedCount)} / {fmtNum(antiCheat?.summary.totalUsersChecked ?? 0)}
                  </div>
                  <small className={s.muted}>Chỉ cảnh báo — Admin tự quyết định xử lý</small>
                </article>
              </div>

              <div className={s.toolbar}>
                <input
                  className={s.search}
                  aria-label="Tìm người dùng hoặc dấu hiệu gian lận"
                  placeholder="Tìm tên, email hoặc loại dấu hiệu gian lận…"
                  value={antiCheatQuery}
                  onChange={(event) => setAntiCheatQuery(event.target.value)}
                />
                <label className={s.check} style={{ minHeight: 42, padding: "0 6px" }}>
                  <input
                    type="checkbox"
                    checked={onlyFlagged}
                    onChange={(event) => setOnlyFlagged(event.target.checked)}
                  />
                  Chỉ hiện tài khoản có cảnh báo ({flaggedCount})
                </label>
                <Link href="/admin/users" className={s.button} style={{ textDecoration: "none" }}>
                  Mở trang Quản lý người dùng
                </Link>
              </div>

              <div className={s.panel}>
                <div className={s.scroll}>
                  <table className={s.table}>
                    <thead>
                      <tr>
                        <th>Người dùng</th>
                        <th>Lượt dùng (Chốt / Ghi nhận)</th>
                        <th>Xu dự kiến / Thực tế</th>
                        <th>Hủy giữ xu</th>
                        <th>Mức cảnh báo</th>
                        <th>Dấu hiệu gian lận phát hiện</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleAntiCheatUsers.map((row) => (
                        <tr key={row.userId}>
                          <td>
                            <strong>{row.name}</strong>
                            <small>{row.email} {row.status === "locked" ? "· Đã khóa" : ""}</small>
                          </td>
                          <td>
                            <strong>{fmtNum(row.toolUsesCommitted)}</strong> lượt chốt
                            <small>
                              {row.rendersCommitted} render · {row.dielinesCommitted} dieline · client: {row.toolUsesReported}
                            </small>
                          </td>
                          <td>
                            <strong>{fmtNum(row.expectedCoinBurn)}</strong> / {fmtNum(row.actualCoinBurn)} xu
                            <small style={row.coinDiscrepancy > 0 || row.walletDrift !== 0 ? { color: "#b32f42", fontWeight: 600 } : undefined}>
                              {row.coinDiscrepancy > 0
                                ? `Thiếu ${fmtNum(row.coinDiscrepancy)} xu`
                                : row.walletDrift !== 0
                                  ? `Lệch ví ${fmtNum(row.walletDrift)} xu`
                                  : "Khớp sổ cái"}
                            </small>
                          </td>
                          <td>
                            {row.reservesReleased + row.reservesExpiredOpen} / {row.reservesTotal}
                            <small>{row.releaseRatePct}% hủy/hết hạn</small>
                          </td>
                          <td>
                            <span
                              className={`${s.badge} ${
                                row.riskLevel === "high" ? s.error : row.riskLevel === "medium" ? s.warning : s.ok
                              }`}
                            >
                              {riskLabels[row.riskLevel]}
                            </span>
                          </td>
                          <td style={{ whiteSpace: "normal", minWidth: 280, maxWidth: 440 }}>
                            {row.signals.length > 0 ? (
                              <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 4 }}>
                                {row.signals.map((sig, idx) => (
                                  <li key={`${sig.code}-${idx}`} style={{ fontSize: 12.5 }}>
                                    <strong style={{ color: sig.severity === "high" ? "#b32f42" : "#815b15" }}>
                                      {sig.title}:
                                    </strong>{" "}
                                    <span>{sig.detail}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <span className={s.muted} style={{ fontSize: 12.5 }}>Không có dấu hiệu bất thường</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!loading && visibleAntiCheatUsers.length === 0 && (
                    <div className={s.empty}>
                      {onlyFlagged ? "Không có tài khoản nào đang bị cảnh báo gian lận." : "Chưa có dữ liệu người dùng trên Cloudflare D1."}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : tab === "integrations" ? (
            <div className={s.grid}>
              {integrations.map((item) => (
                <article className={s.card} key={item.id}>
                  <div className={s.cardHeader}>
                    <strong>{item.name}</strong>
                    <span
                      className={s.badge}
                      style={item.connected ? { background: "#ecfdf3", color: "#067647" } : undefined}
                    >
                      {item.connected ? "Đã kết nối" : "Chưa kết nối"}
                    </span>
                  </div>
                  <p style={{ margin: "6px 0 0", color: "#6c636a", fontSize: 13.5 }}>{item.detail}</p>
                </article>
              ))}
            </div>
          ) : (
            <>
              {tab === "security" && (
                <>
                  <div className={s.notice}>
                    <div>
                      <strong>
                        {security.activeLocks.length > 0 || security.rejectedPaymentEvents.length > 0 ? (
                          <><ShieldAlert size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} />{security.activeLocks.length} phiên đang bị khóa đăng nhập · {security.rejectedPaymentEvents.length} sự kiện webhook bị từ chối</>
                        ) : (
                          <><CheckCircle2 size={16} style={{ verticalAlign: "-3px", marginRight: 6, color: "#067647" }} />Không có cảnh báo khóa đăng nhập hay webhook bất thường trên Cloudflare D1</>
                        )}
                      </strong>
                      <small>
                        Bot Shield hôm nay đã chặn <strong>{fmtNum(workerQuota?.today.blockedRequests ?? 0)}</strong> request độc hại / bot phá hạn mức · Hôm nay đã dùng <strong>{fmtNum(workerQuota?.today.totalRequests ?? 0)}</strong> / 100.000 request Workers Free ({workerQuota?.today.quotaPercent ?? 0}%).
                      </small>
                    </div>
                    <button type="button" className={s.button} onClick={() => void load()} disabled={loading}>
                      <RefreshCw size={15} />Làm mới
                    </button>
                  </div>
                </>
              )}

              <div className={s.toolbar}>
                <input className={s.search} aria-label="Tìm nhật ký" placeholder="Tìm thao tác, người thực hiện, đối tượng…" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
                <select aria-label="Mức độ" value={severity} onChange={(event) => { setSeverity(event.target.value); setPage(1); }}>
                  <option value="all">Tất cả mức độ</option>
                  {Object.entries(levels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <input aria-label="Từ ngày" type="date" value={from} max={to || undefined} onChange={(event) => { setFrom(event.target.value); setPage(1); }} />
                <input aria-label="Đến ngày" type="date" value={to} min={from || undefined} onChange={(event) => { setTo(event.target.value); setPage(1); }} />
                <button type="button" className={s.button} onClick={() => void load()} disabled={loading}><RefreshCw size={15} />Làm mới</button>
                <button type="button" className={s.button} onClick={() => downloadCSV(filtered)}><Download size={16} />Xuất CSV</button>
              </div>

              <div className={s.panel}>
                <div className={s.scroll}>
                  <table className={s.table}>
                    <thead>
                      <tr><th>Thời gian</th><th>Người thực hiện</th><th>Thao tác</th><th>Đối tượng</th><th>Mức độ</th><th /></tr>
                    </thead>
                    <tbody>
                      {visible.map((item) => (
                        <tr key={item.id}>
                          <td>{vnDate(item.at)}<small>{vnTime(item.at)}</small></td>
                          <td>{item.actor}</td>
                          <td>{item.action}</td>
                          <td>{item.target}</td>
                          <td><span className={`${s.badge} ${s[item.level] || ""}`}>{levels[item.level]}</span></td>
                          <td><button type="button" className={s.rowButton} onClick={() => setDetail(item)}>Chi tiết</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!loading && !filtered.length && <div className={s.empty}>Chưa có nhật ký quản trị nào trên Cloudflare D1.</div>}
                </div>
              </div>
              <div className={s.footer}>
                <span>{filtered.length} bản ghi</span>
                <div className={s.pagination}>
                  <button type="button" className={s.button} disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Trước</button>
                  <span>{currentPage} / {pages}</span>
                  <button type="button" className={s.button} disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Sau</button>
                </div>
                <button type="button" className={s.rowButton} onClick={() => { setQuery(""); setSeverity("all"); setFrom(""); setTo(""); setPage(1); }}>Xóa bộ lọc</button>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <div className={s.tabs} role="group" aria-label="Cấu hình">
            {[["general", "Chung"], ["render", "Coin & render"], ["security", "Tài khoản & bảo mật"], ["tracking", "Theo dõi"]].map(([id, label]) => (
              <button key={id} aria-pressed={settingsTab === id} className={settingsTab === id ? s.active : ""} onClick={() => setSettingsTab(id)}>
                {label}
              </button>
            ))}
          </div>
          <form className={s.settings} onSubmit={handleSaveSubmit}>
            <h2>{({ general: "Website", render: "Coin & render", security: "Tài khoản & bảo mật", tracking: "Theo dõi truy cập" } as Record<string, string>)[settingsTab]}</h2>
            <div className={s.formGrid}>
              {settingsTab === "general" && (
                <>
                  {textField("name", "Tên website")}
                  {textField("domain", "Tên miền")}
                  {textField("contact", "Email liên hệ", "email")}
                  <label className={s.field}>Múi giờ
                    <select value={settings.timezone} onChange={(event) => update("timezone", event.target.value)}>
                      <option value="Asia/Ho_Chi_Minh">Việt Nam · UTC+7</option>
                      <option value="UTC">UTC</option>
                    </select>
                  </label>
                  <label className={s.field}>Ngôn ngữ website
                    <select value={settings.locale} onChange={(event) => update("locale", event.target.value)}>
                      <option value="vi">Tiếng Việt</option>
                      <option value="en">English</option>
                    </select>
                  </label>
                  {check("maintenance", "Chế độ Bảo trì (tạm ẩn trang với khách truy cập)")}
                </>
              )}
              {settingsTab === "render" && (
                <>
                  <div className={`${s.field} ${s.full}`}>
                    Độ phân giải xuất ảnh
                    <div className={s.resolutions}>
                      {[1024, 2048, 4096, 8129].map((value) => (
                        <label className={s.check} key={value}>
                          <input
                            type="checkbox"
                            checked={settings.resolutions.includes(value)}
                            onChange={(event) => update("resolutions", event.target.checked ? [...settings.resolutions, value].sort((a, b) => a - b) : settings.resolutions.filter((item) => item !== value))}
                          />
                          {value} px
                        </label>
                      ))}
                    </div>
                  </div>
                  <label className={s.field}>Tile render từ
                    <select value={settings.tileThreshold} onChange={(event) => update("tileThreshold", Number(event.target.value))}>
                      <option value={4096}>4096 px</option>
                      <option value={8129}>8129 px</option>
                    </select>
                  </label>
                  {textField("renderCost", "Coin render chuẩn 2048 px (1K=0.5× · 4K=1.5× · 8K=3×)", "number", 0, 10000)}
                  {textField("dielineCost", "Coin xuất Dieline 1:1 mm (SVG/PDF/DXF)", "number", 0, 10000)}
                  {textField("shareCost", "Coin tạo Link Share 3D cho khách duyệt (0 = miễn phí)", "number", 0, 10000)}
                  {textField("projectExtendCost", "Coin gia hạn dự án Cloud thêm 30 ngày (0 = miễn phí)", "number", 0, 10000)}
                  {textField("freeDownloads", "Lượt tải miễn phí / ngày", "number", 0, 100)}
                </>
              )}
              {settingsTab === "security" && (
                <>
                  {textField("sessionHours", "Thời hạn phiên (giờ)", "number", 1, 720)}
                  {textField("loginLimit", "Giới hạn đăng nhập sai / 15 phút", "number", 1, 100)}
                  {check("emailVerified", "Yêu cầu xác minh email OTP")}
                  {check("registrations", "Cho phép đăng ký tài khoản mới")}
                </>
              )}
              {settingsTab === "tracking" && (
                <>
                  {textField("botPatterns", "Mẫu nhận diện bot")}
                  {textField("excludedIPs", "IP loại trừ (phân cách bằng dấu phẩy)")}
                  {textField("retention", "Lưu dữ liệu truy cập (ngày)", "number", 7, 730)}
                  {textField("analyticsPublicId", "Mã đo lường công khai")}
                  {check("analytics", "Thu thập thống kê truy cập vào D1")}
                  {check("excludeOwner", "Loại trừ phiên quản trị viên")}
                  {check("consent", "Yêu cầu đồng ý cookie phân tích")}
                </>
              )}
            </div>
            <div className={s.actions}>
              <button type="button" className={s.button} onClick={() => setReset(true)}>Khôi phục mặc định</button>
              <button type="submit" className={s.primary} disabled={loading || saving}>{saving ? "Đang lưu…" : "Lưu lên D1"}</button>
            </div>
          </form>
        </>
      )}

      {detail && (
        <Dialog title="Chi tiết nhật ký D1" onClose={() => setDetail(null)}>
          <dl className={s.detail}>
            <dt>Thời gian</dt><dd>{`${vnDate(detail.at)} ${vnTime(detail.at)}`}</dd>
            <dt>Người thực hiện</dt><dd>{detail.actor}</dd>
            <dt>Thao tác</dt><dd>{detail.action}</dd>
            <dt>Đối tượng</dt><dd>{detail.target}</dd>
            <dt>Mức độ</dt><dd>{levels[detail.level]}</dd>
            <dt>Mã bản ghi</dt><dd>{detail.id}</dd>
            {detail.metadata && <><dt>Chi tiết</dt><dd style={{ wordBreak: "break-word" }}>{detail.metadata}</dd></>}
          </dl>
          <div className={s.actions}><button type="button" className={s.button} onClick={() => setDetail(null)}>Đóng</button></div>
        </Dialog>
      )}

      {reset && (
        <Dialog title="Khôi phục cấu hình mặc định?" onClose={() => setReset(false)}>
          <p>Toàn bộ cấu hình website trong Cloudflare D1 sẽ trở về giá trị mặc định.</p>
          <div className={s.actions}>
            <button type="button" className={s.button} onClick={() => setReset(false)}>Hủy</button>
            <button
              type="button"
              className={s.danger}
              onClick={() => {
                setReset(false);
                void saveSettings(defaults, "reset_defaults");
              }}
            >
              Khôi phục
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
