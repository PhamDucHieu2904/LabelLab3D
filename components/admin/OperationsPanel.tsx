"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Download, ExternalLink, SlidersHorizontal } from "lucide-react";
import { useAdminActivity, logAdminActivity, type AdminActivity } from "@/lib/admin/activity-store";
import s from "./OperationsPanel.module.css";

const settingsKey = "labellab.admin.demo.settings.v1";
const alertKey = "labellab.admin.demo.alert-ack.v1";
const defaults = { name: "Labellab", domain: "Labellab3D.com", timezone: "Asia/Ho_Chi_Minh", locale: "en", contact: "", maintenance: false, resolutions: [1024, 2048, 4096, 8129], tileThreshold: 4096, freeDownloads: 1, renderCost: 5, emailVerified: true, sessionHours: 24, loginLimit: 5, registrations: true, botPatterns: "bot, crawler, spider, headless", excludedIPs: "", retention: 90, consent: true, excludeOwner: true, analytics: true, storagePublicId: "", analyticsPublicId: "" };
type Settings = typeof defaults;
const numericRules: Partial<Record<keyof Settings, [number, number]>> = { freeDownloads: [0, 100], renderCost: [0, 10000], sessionHours: [1, 720], loginLimit: [1, 100], retention: [7, 730] };
const vnOptions = { timeZone: "Asia/Ho_Chi_Minh" };
const vnDate = (at: string) => new Date(at).toLocaleDateString("vi-VN", vnOptions);
const vnTime = (at: string) => new Date(at).toLocaleTimeString("vi-VN", vnOptions);
const vnDay = (at: string) => new Date(Date.parse(at) + 7 * 3600000).toISOString().slice(0, 10);
function settingsError(value: Settings) {
  if (!value.name.trim() || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(value.domain.trim())) return "Cần nhập tên website và tên miền hợp lệ";
  if (value.contact && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.contact)) return "Cần nhập email liên hệ hợp lệ";
  if (!value.resolutions.length || value.resolutions.some((item) => !defaults.resolutions.includes(item))) return "Cần chọn ít nhất một độ phân giải";
  for (const [key, range] of Object.entries(numericRules)) { const item = value[key as keyof Settings]; if (typeof item !== "number" || !Number.isSafeInteger(item) || item < range[0] || item > range[1]) return "Cần kiểm tra giới hạn các giá trị số"; }
  return "";
}
function readSettings(value: unknown): Settings {
  if (!value || typeof value !== "object") return defaults;
  const result = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof Settings)[]) {
    const stored = (value as Record<string, unknown>)[key];
    if (key === "resolutions") {
      if (Array.isArray(stored) && stored.length > 0 && stored.every((item) => defaults.resolutions.includes(item))) result.resolutions = [...new Set<number>(stored)];
    } else if (typeof stored === typeof defaults[key] && (typeof stored !== "number" || Number.isFinite(stored))) {
      const range = numericRules[key];
      if (range && (typeof stored !== "number" || !Number.isSafeInteger(stored) || stored < range[0] || stored > range[1])) continue;
      if (key === "tileThreshold" && ![4096, 8129].includes(Number(stored))) continue;
      if (key === "locale" && !["en", "vi"].includes(String(stored))) continue;
      if (key === "timezone" && !["Asia/Ho_Chi_Minh", "UTC"].includes(String(stored))) continue;
      Object.assign(result, { [key]: stored });
    }
  }
  return result;
}
function downloadCSV(entries: AdminActivity[]) {
  const rows = [["Thời gian (UTC+7)", "Người thực hiện", "Thao tác", "Đối tượng", "Mức độ"], ...entries.map((item) => [`${vnDate(item.at)} ${vnTime(item.at)}`, item.actor, item.action, item.target, item.level])];
  const blob = new Blob(["\uFEFF", rows.map((row) => row.map((value) => { const text = String(value); return `"${(/^[=+\-@\t\r]/.test(text) ? "'" + text : text).replace(/"/g, '""')}"`; }).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "labellab-nhat-ky.csv"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; ref.current?.showModal(); return () => previous?.focus(); }, []);
  return <dialog ref={ref} className={s.dialog} aria-labelledby="operations-dialog-title" onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }}><h2 id="operations-dialog-title">{title}</h2>{children}</dialog>;
}
const levels = { info: "Thông tin", warning: "Cảnh báo", error: "Lỗi" };

export default function OperationsPanel({ section }: { section: "activity" | "settings" }) {
  const { entries } = useAdminActivity();
  const [tab, setTab] = useState("all"); const [settingsTab, setSettingsTab] = useState("general");
  const [query, setQuery] = useState(""); const [severity, setSeverity] = useState("all"); const [actor, setActor] = useState("all"); const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<AdminActivity | null>(null); const [toast, setToast] = useState(""); const [ack, setAck] = useState(false);
  const [settings, setSettings] = useState<Settings>(defaults); const [ready, setReady] = useState(false); const [reset, setReset] = useState(false); const [integration, setIntegration] = useState<string | null>(null);
  useEffect(() => { const frame = requestAnimationFrame(() => { try { setSettings(readSettings(JSON.parse(localStorage.getItem(settingsKey) || "null"))); setAck(localStorage.getItem(alertKey) === "true"); } catch { /* Use defaults when the demo storage is unavailable. */ } setReady(true); }); return () => cancelAnimationFrame(frame); }, []);
  useEffect(() => { if (!toast) return; const timeout = setTimeout(() => setToast(""), 5000); return () => clearTimeout(timeout); }, [toast]);
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings((current) => ({ ...current, [key]: value }));
  const save = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const error = settingsError(settings); if (error) { setToast(error); return; } try { localStorage.setItem(settingsKey, JSON.stringify(settings)); setToast("Đã lưu bản mẫu"); logAdminActivity({ actor: "Quản trị viên", action: "Lưu cấu hình bản mẫu", target: ({ general: "Chung", render: "Coin & render", security: "Tài khoản & bảo mật", tracking: "Theo dõi" } as Record<string, string>)[settingsTab], level: "info" }); } catch { setToast("Không thể lưu vào trình duyệt"); } };
  const filtered = entries.filter((item) => Number.isFinite(Date.parse(item.at)) && (tab !== "security" || item.level !== "info") && (severity === "all" || item.level === severity) && (actor === "all" || (actor === "system" ? item.actor.startsWith("Hệ thống") : !item.actor.startsWith("Hệ thống"))) && `${item.action} ${item.actor} ${item.target}`.toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi")) && (!from || vnDay(item.at) >= from) && (!to || vnDay(item.at) <= to));
  const pages = Math.max(1, Math.ceil(filtered.length / 50)); const currentPage = Math.min(page, pages); const visible = filtered.slice((currentPage - 1) * 50, currentPage * 50);
  const textField = (key: keyof Settings, label: string, type = "text", min?: number, max?: number) => <label className={s.field}>{label}<input type={type} value={String(settings[key])} min={min} max={max} required={type === "number" || key === "name" || key === "domain"} onChange={(event) => update(key, type === "number" ? Number(event.target.value) : event.target.value)} /></label>;
  const check = (key: keyof Settings, label: string) => <label className={s.check}><input type="checkbox" checked={Boolean(settings[key])} onChange={(event) => update(key, event.target.checked)} />{label}</label>;
  return <div className={s.root}>
    {toast && <div role="status" className={`${s.toast} ${/^(Cần|Không)/.test(toast) ? s.errorToast : ""}`}>{toast}</div>}
    {section === "activity" ? <>
      <div className={s.tabs} role="group" aria-label="Nhật ký">{[["all", "Nhật ký quản trị"], ["security", "An ninh"], ["integrations", "Tích hợp"]].map(([id, label]) => <button key={id} aria-pressed={tab === id} className={tab === id ? s.active : ""} onClick={() => { setTab(id); setPage(1); }}>{label}</button>)}</div>
      {tab === "integrations" ? <div className={s.grid}>{["Thanh toán nội địa", "Thanh toán quốc tế", "Email giao dịch", "Kho tài nguyên", "Phân tích truy cập", "Đăng nhập"].map((name) => <article className={s.card} key={name}><div className={s.cardHeader}><strong>{name}</strong><span className={s.badge}>Chưa kết nối</span></div><button className={s.button} onClick={() => setIntegration(name)}><SlidersHorizontal size={16} />Cấu hình</button></article>)}</div> : <>
        {tab === "security" && !ack && <div className={s.notice}><div><strong>Nhiều lần đăng nhập thất bại</strong><small>192.0.2.24 · Cảnh báo mẫu</small></div><button className={s.button} onClick={() => { try { localStorage.setItem(alertKey, "true"); setAck(true); } catch { setToast("Không thể lưu vào trình duyệt"); return; } logAdminActivity({ actor: "Quản trị viên", action: "Đã xem cảnh báo", target: "IP mẫu 192.0.2.24", level: "info" }); setToast("Đã đánh dấu đã xem trong bản mẫu"); }}>Đánh dấu đã xem</button></div>}
        <div className={s.toolbar}><input className={s.search} aria-label="Tìm nhật ký" placeholder="Tìm thao tác, người dùng, đối tượng…" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /><select aria-label="Mức độ" value={severity} onChange={(event) => { setSeverity(event.target.value); setPage(1); }}><option value="all">Tất cả mức độ</option>{Object.entries(levels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select aria-label="Người thực hiện" value={actor} onChange={(event) => { setActor(event.target.value); setPage(1); }}><option value="all">Mọi nguồn</option><option value="admin">Quản trị viên</option><option value="system">Hệ thống</option></select><input aria-label="Từ ngày" type="date" value={from} max={to || undefined} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /><input aria-label="Đến ngày" type="date" value={to} min={from || undefined} onChange={(event) => { setTo(event.target.value); setPage(1); }} /><button className={s.button} onClick={() => downloadCSV(filtered)}><Download size={16} />Xuất CSV</button></div>
        <div className={s.panel}><div className={s.scroll}><table className={s.table}><thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Thao tác</th><th>Đối tượng</th><th>Mức độ</th><th /></tr></thead><tbody>{visible.map((item) => <tr key={item.id}><td>{vnDate(item.at)}<small>{vnTime(item.at)}</small></td><td>{item.actor}</td><td>{item.action}</td><td>{item.target}</td><td><span className={`${s.badge} ${s[item.level] || ""}`}>{levels[item.level]}</span></td><td><button className={s.rowButton} aria-label={`Chi tiết: ${item.action}`} onClick={() => setDetail(item)}>Chi tiết</button></td></tr>)}</tbody></table>{!filtered.length && <div className={s.empty}>Không có nhật ký phù hợp</div>}</div></div><div className={s.footer}><span>{filtered.length} bản ghi</span><div className={s.pagination}><button className={s.button} disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Trước</button><span>{currentPage} / {pages}</span><button className={s.button} disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Sau</button></div><button className={s.rowButton} onClick={() => { setQuery(""); setSeverity("all"); setActor("all"); setFrom(""); setTo(""); setPage(1); }}>Xóa bộ lọc</button></div>
      </>}
    </> : <>
      <div className={s.tabs} role="group" aria-label="Cấu hình">{[["general", "Chung"], ["render", "Coin & render"], ["security", "Tài khoản & bảo mật"], ["tracking", "Theo dõi"]].map(([id, label]) => <button key={id} aria-pressed={settingsTab === id} className={settingsTab === id ? s.active : ""} onClick={() => setSettingsTab(id)}>{label}</button>)}</div>
      <form className={s.settings} onSubmit={save}>
        <h2>{({ general: "Website", render: "Coin & render", security: "Tài khoản & bảo mật", tracking: "Theo dõi truy cập" } as Record<string, string>)[settingsTab]}</h2>
        <div className={s.formGrid}>
          {settingsTab === "general" && <>{textField("name", "Tên website")}{textField("domain", "Tên miền")}{textField("contact", "Email liên hệ", "email")}<label className={s.field}>Múi giờ<select value={settings.timezone} onChange={(event) => update("timezone", event.target.value)}><option value="Asia/Ho_Chi_Minh">Việt Nam · UTC+7</option><option value="UTC">UTC</option></select></label><label className={s.field}>Ngôn ngữ website<select value={settings.locale} onChange={(event) => update("locale", event.target.value)}><option value="en">English</option><option value="vi">Tiếng Việt</option></select></label>{check("maintenance", "Chế độ bảo trì")}</>}
          {settingsTab === "render" && <><div className={`${s.field} ${s.full}`}>Độ phân giải xuất ảnh<div className={s.resolutions}>{[1024, 2048, 4096, 8129].map((value) => <label className={s.check} key={value}><input type="checkbox" checked={settings.resolutions.includes(value)} onChange={(event) => update("resolutions", event.target.checked ? [...settings.resolutions, value].sort((a, b) => a - b) : settings.resolutions.filter((item) => item !== value))} />{value} px</label>)}</div></div><label className={s.field}>Tile render từ<select value={settings.tileThreshold} onChange={(event) => update("tileThreshold", Number(event.target.value))}><option value={4096}>4096 px</option><option value={8129}>8129 px</option></select></label>{textField("renderCost", "Coin / lần render", "number", 0, 10000)}{textField("freeDownloads", "Lượt tải miễn phí / ngày", "number", 0, 100)}</>}
          {settingsTab === "security" && <>{textField("sessionHours", "Thời hạn phiên (giờ)", "number", 1, 720)}{textField("loginLimit", "Giới hạn đăng nhập sai / 15 phút", "number", 1, 100)}{check("emailVerified", "Yêu cầu xác minh email")}{check("registrations", "Cho phép đăng ký mới")}</>}
          {settingsTab === "tracking" && <>{textField("botPatterns", "Mẫu nhận diện bot")}{textField("excludedIPs", "IP loại trừ (phân cách bằng dấu phẩy)")}{textField("retention", "Lưu dữ liệu truy cập (ngày)", "number", 7, 730)}{textField("analyticsPublicId", "Mã đo lường công khai")}{check("analytics", "Thu thập thống kê")}{check("excludeOwner", "Loại trừ phiên quản trị viên")}{check("consent", "Yêu cầu đồng ý cookie phân tích")}</>}
        </div><div className={s.actions}><button type="button" className={s.button} onClick={() => setReset(true)}>Khôi phục mặc định</button><button className={s.primary} disabled={!ready}>Lưu thay đổi</button></div>
      </form>
    </>}
    {detail && <Dialog title="Chi tiết nhật ký" onClose={() => setDetail(null)}><dl className={s.detail}><dt>Thời gian</dt><dd>{`${vnDate(detail.at)} ${vnTime(detail.at)}`}</dd><dt>Người thực hiện</dt><dd>{detail.actor}</dd><dt>Thao tác</dt><dd>{detail.action}</dd><dt>Đối tượng</dt><dd>{detail.target}</dd><dt>Mức độ</dt><dd>{levels[detail.level]}</dd><dt>Mã bản ghi</dt><dd>{detail.id}</dd></dl><div className={s.actions}><button className={s.button} onClick={() => setDetail(null)}>Đóng</button></div></Dialog>}
    {reset && <Dialog title="Khôi phục cấu hình mẫu?" onClose={() => setReset(false)}><p>Toàn bộ cấu hình mẫu sẽ trở về giá trị ban đầu.</p><div className={s.actions}><button className={s.button} onClick={() => setReset(false)}>Hủy</button><button className={s.danger} onClick={() => { try { localStorage.setItem(settingsKey, JSON.stringify(defaults)); setSettings(defaults); setReset(false); setToast("Đã khôi phục bản mẫu"); logAdminActivity({ actor: "Quản trị viên", action: "Khôi phục cấu hình mẫu", target: "Cấu hình website", level: "warning" }); } catch { setToast("Không thể lưu vào trình duyệt"); } }}>Khôi phục</button></div></Dialog>}
    {integration && <Dialog title={integration} onClose={() => setIntegration(null)}><span className={s.badge}>Chưa kết nối</span><p>Phương thức và nhà cung cấp chưa được cấu hình.</p>{integration === "Phân tích truy cập" && <label className={s.field}>Mã đo lường công khai<input value={settings.analyticsPublicId} onChange={(event) => update("analyticsPublicId", event.target.value)} /></label>}{integration === "Kho tài nguyên" && <label className={s.field}>Tên bucket công khai<input value={settings.storagePublicId} onChange={(event) => update("storagePublicId", event.target.value)} /></label>}<div className={s.actions}><button className={s.button} onClick={() => setIntegration(null)}>Đóng</button>{["Phân tích truy cập", "Kho tài nguyên"].includes(integration) && <button className={s.primary} onClick={() => { const error = settingsError(settings); if (error) { setToast(error); return; } try { localStorage.setItem(settingsKey, JSON.stringify(settings)); setIntegration(null); setToast("Đã lưu bản mẫu"); } catch { setToast("Không thể lưu vào trình duyệt"); } }}><ExternalLink size={15} />Lưu bản mẫu</button>}</div></Dialog>}
  </div>;
}



