"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowDownUp, ArrowLeft, ArrowRight, Check, Download, Eye, LockKeyhole, Pencil, Plus, Search, ShieldCheck, Trash2, UnlockKeyhole, Users, Wallet, X } from "lucide-react";
import { useAdminUsers, type AdminUser } from "@/lib/admin/users-store";
import { logAdminActivity } from "@/lib/admin/activity-store";
import { updateCommerce, useAdminCommerce } from "@/lib/admin/commerce-store";
import styles from "./UsersPanel.module.css";

type ModalMode = "add" | "edit" | "view" | "delete" | "coins";
type Draft = Omit<AdminUser, "id">;
const num = (value: number) => value.toLocaleString("vi-VN");
const date = (value: string) => value ? new Date(value).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }) : "—";
const initials = (name: string) => name.split(" ").filter(Boolean).slice(-2).map(part => part[0]).join("").toUpperCase();
const pageSize = 8;

function recordCoinChange(userId: string, coins: number, reason: string, id = crypto.randomUUID()) {
  if (!coins) return;
  updateCommerce(current => ({ ...current, ledger: [{ id, userId, coins, reason, at: new Date().toISOString() }, ...current.ledger] }));
}

function logUserAction(action: string, user: AdminUser, warning = false) {
  logAdminActivity({ actor: "Quản trị viên", action, target: `${user.name} · ${user.email}`, level: warning ? "warning" : "info" });
}

function downloadCsv(users: AdminUser[]) {
  const rows: (string | number)[][] = [["ID", "Họ tên", "Email", "Danh hiệu", "Quốc gia", "Vai trò", "Trạng thái", "Coin", "Ngày đăng nhập", "Lượt đăng nhập", "Phiên Studio", "Tổng nạp VNĐ", "Tổng nạp USD", "Ngày tạo", "Đăng nhập cuối", "Ghi chú"],
    ...users.map(u => [u.id, u.name, u.email, u.title, u.country, u.role, u.status, u.coins, u.loginDays, u.logins, u.appSessions, u.totalVnd, u.totalUsd, u.createdAt, u.lastLogin, u.notes])];
  const text = rows.map(row => row.map(value => {
    let cell = String(value);
    if (/^[=+\-@\t\r]/.test(cell)) cell = `'${cell}`;
    return `"${cell.replaceAll('"', '""')}"`;
  }).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = "labellab-nguoi-dung-mau.csv"; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Modal({ title, children, onClose, small }: { title: string; children: ReactNode; onClose: () => void; small?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!ref.current?.open) ref.current?.showModal();
    return () => { opener.current?.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={ref} className={`${styles.dialog} ${small ? styles.smallDialog : ""}`} aria-labelledby="admin-user-modal-title" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
  }}>
    <div className={styles.modalHead}><h2 id="admin-user-modal-title">{title}</h2><button type="button" className={styles.iconButton} onClick={onClose} aria-label="Đóng"><X size={20} /></button></div>
    {children}
  </dialog>;
}

function Coin({ value }: { value: number }) {
  return <span className={styles.coin}><img src="/branding/LLCoin.svg" alt="" width={19} height={19} />{num(value)}</span>;
}

function Avatar({ user }: { user: AdminUser }) {
  return <span className={styles.avatar} aria-hidden="true">{initials(user.name)}</span>;
}

function UserForm({ user, users, onSave, onClose }: { user?: AdminUser; users: AdminUser[]; onSave: (draft: Draft) => void; onClose: () => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState("");
  const [editedCoins, setEditedCoins] = useState(user?.coins ?? 0);
  const today = new Date().toISOString().slice(0, 10);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const string = (key: string) => String(data.get(key) ?? "").trim();
    const number = (key: string) => Number(data.get(key));
    const email = string("email").toLowerCase();
    if (users.some(item => item.id !== user?.id && item.email.toLowerCase() === email)) { setError("Email này đã được sử dụng."); formRef.current?.querySelector<HTMLInputElement>('[name="email"]')?.focus(); return; }
    const draft: Draft = {
      name: string("name"), email, title: string("title"), country: string("country"), notes: string("notes"), avatar: string("avatar") || undefined,
      role: string("role") as AdminUser["role"], status: string("status") as AdminUser["status"],
      coins: number("coins"), loginDays: number("loginDays"), logins: number("logins"), appSessions: number("appSessions"), totalVnd: number("totalVnd"), totalUsd: number("totalUsd"),
      createdAt: `${string("createdAt")}T00:00:00+07:00`,
      lastLogin: string("lastLogin") ? `${string("lastLogin")}:00+07:00` : "",
      history: user?.history ?? [],
    };
    if (user && draft.coins !== user.coins) {
      const reason = string("coinReason");
      if (reason.length < 3) { setError("Nhập lý do điều chỉnh coin (ít nhất 3 ký tự)."); formRef.current?.querySelector<HTMLInputElement>('[name="coinReason"]')?.focus(); return; }
      draft.history = [{ id: crypto.randomUUID(), type: "coin", text: reason, coins: draft.coins - user.coins, at: new Date().toISOString() }, ...(user.history ?? [])];
    }
    try { onSave(draft); } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể lưu thông tin."); }
  }
  const lastLogin = user?.lastLogin ? new Date(new Date(user.lastLogin).getTime() + 7 * 3600000).toISOString().slice(0, 16) : "";
  return <form ref={formRef} onSubmit={submit}>
    <div className={styles.modalBody}>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.formGrid}>
        <label>Họ tên<input name="name" required maxLength={100} defaultValue={user?.name ?? ""} autoComplete="name" autoFocus /></label>
        <label>Email<input name="email" type="email" required maxLength={254} defaultValue={user?.email ?? ""} autoComplete="email" /></label>
        <label>Danh hiệu<input name="title" maxLength={80} defaultValue={user?.title ?? "New designer"} /></label>
        <label>Quốc gia<input name="country" required maxLength={80} defaultValue={user?.country ?? "Việt Nam"} list="admin-country-options" /><datalist id="admin-country-options">{["Việt Nam", "Hoa Kỳ", "Singapore", "Anh", "Nhật Bản", "Hàn Quốc", "Đức", "Pháp", "Úc"].map(country => <option key={country} value={country} />)}</datalist></label>
        <label>Vai trò<select name="role" defaultValue={user?.role ?? "user"}><option value="user">Người dùng</option><option value="admin">Quản trị viên</option></select></label>
        <label>Trạng thái<select name="status" defaultValue={user?.status ?? "active"}><option value="active">Hoạt động</option><option value="locked">Đã khóa</option></select></label>
        <label className={styles.spanTwo}>Ảnh đại diện<input name="avatar" maxLength={1000} defaultValue={user?.avatar ?? ""} placeholder="https://…" /></label>
        <label className={styles.spanTwo}>Ghi chú<textarea name="notes" rows={2} maxLength={1500} defaultValue={user?.notes ?? ""} /></label>
      </div>
      <details className={styles.metricsEdit} open={!user}><summary>Coin và chỉ số tài khoản</summary><div className={styles.formGrid}>
        {([{ field: "coins", label: "Số coin" }, { field: "loginDays", label: "Số ngày đăng nhập" }, { field: "logins", label: "Lượt đăng nhập" }, { field: "appSessions", label: "Phiên Studio" }, { field: "totalVnd", label: "Tổng nạp · VNĐ" }, { field: "totalUsd", label: "Tổng nạp · USD" }] as const).map(({ field, label }) => <label key={field}>{label}<input name={field} type="number" min={0} max={999999999999} step={field === "totalUsd" ? ".01" : "1"} required defaultValue={user?.[field] ?? 0} onChange={field === "coins" ? event => setEditedCoins(Number(event.target.value)) : undefined} /></label>)}
        {user && editedCoins !== user.coins && <label className={styles.spanTwo}>Lý do điều chỉnh coin<input name="coinReason" required minLength={3} maxLength={300} /></label>}
        <label>Ngày tạo<input name="createdAt" type="date" required max={today} defaultValue={user?.createdAt.slice(0, 10) ?? today} /></label>
        <label>Đăng nhập gần nhất<input name="lastLogin" type="datetime-local" defaultValue={lastLogin} /></label>
      </div></details>
    </div>
    <div className={styles.modalFoot}><button type="button" className={styles.secondary} onClick={onClose}>Hủy</button><button type="submit" className={styles.primary}><Check size={17} aria-hidden="true" />{user ? "Lưu thay đổi" : "Thêm người dùng"}</button></div>
  </form>;
}

export default function UsersPanel() {
  const { users, addUser, updateUser, deleteUser } = useAdminUsers();
  const commerce = useAdminCommerce();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [role, setRole] = useState("all");
  const [sort, setSort] = useState("created");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<{ mode: ModalMode; id?: string } | null>(null);
  const [message, setMessage] = useState("");
  const [modalError, setModalError] = useState("");
  const [historyFilter, setHistoryFilter] = useState("all");
  const selected = users.find(u => u.id === modal?.id);
  const userHistory = selected ? [...new Map([
    ...(selected.history ?? []),
    ...commerce.ledger.filter(entry => entry.userId === selected.id).map(entry => ({ id: entry.id, type: "coin" as const, text: entry.reason, at: entry.at, coins: entry.coins })),
  ].map(entry => [entry.id, entry])).values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)) : [];
  const filtered = users.filter(user => (status === "all" || user.status === status) && (role === "all" || user.role === role)
    && `${user.name} ${user.email} ${user.id} ${user.country}`.toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi"))).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name, "vi") : sort === "coins" ? b.coins - a.coins : sort === "logins" ? b.logins - a.logins : sort === "created-asc" ? Date.parse(a.createdAt) - Date.parse(b.createdAt) : Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const activePage = Math.min(page, totalPages);
  const visible = filtered.slice((activePage - 1) * pageSize, activePage * pageSize);
  function open(mode: ModalMode, id?: string) { setModal({ mode, id }); setModalError(""); setHistoryFilter("all"); }
  function close() { setModal(null); setModalError(""); }
  function saveUserWithLedger(before: AdminUser, patch: Partial<Omit<AdminUser, "id">>, delta: number, reason: string, entryId?: string) {
    updateUser(before.id, patch);
    try { recordCoinChange(before.id, delta, reason, entryId); }
    catch (cause) {
      try { updateUser(before.id, before); }
      catch { throw new Error("Không thể ghi sổ coin và khôi phục hồ sơ. Vui lòng kiểm tra dữ liệu trước khi thử lại."); }
      throw cause;
    }
  }
  function toggleLock(user: AdminUser) {
    try { updateUser(user.id, { status: user.status === "active" ? "locked" : "active" }); logUserAction(user.status === "active" ? "Khóa tài khoản" : "Mở khóa tài khoản", user, user.status === "active"); setMessage(user.status === "active" ? `Đã khóa ${user.name}.` : `Đã mở khóa ${user.name}.`); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Không thể cập nhật."); }
  }
  function adjustCoins(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return;
    const form = new FormData(event.currentTarget); const amount = Number(form.get("amount")); const reason = String(form.get("reason") ?? "").trim();
    if (!Number.isInteger(amount) || !amount || !reason) { setModalError("Nhập số coin khác 0 và lý do điều chỉnh."); return; }
    if (selected.coins + amount < 0) { setModalError("Số dư sau điều chỉnh không thể âm."); return; }
    try {
      const entryId = crypto.randomUUID();
      saveUserWithLedger(selected, { coins: selected.coins + amount, history: [{ id: entryId, type: "coin", text: reason, coins: amount, at: new Date().toISOString() }, ...(selected.history ?? [])] }, amount, reason, entryId);
      logUserAction(`Điều chỉnh ${amount > 0 ? "+" : ""}${num(amount)} coin · ${reason}`, selected);
      setMessage(`Đã ${amount > 0 ? "cộng" : "trừ"} ${num(Math.abs(amount))} coin cho ${selected.name}.`); close();
    } catch (cause) { setModalError(cause instanceof Error ? cause.message : "Không thể điều chỉnh coin."); }
  }
  return <section className={styles.root} aria-label="Quản lý người dùng">
    <div className={styles.summary}>
      <div><span className={styles.summaryIcon}><Users size={20} aria-hidden="true" /></span><span>Tổng người dùng<strong>{num(users.length)}</strong></span></div>
      <div><span className={`${styles.summaryIcon} ${styles.green}`}><ShieldCheck size={20} aria-hidden="true" /></span><span>Đang hoạt động<strong>{num(users.filter(u => u.status === "active").length)}</strong></span></div>
      <div><span className={styles.summaryIcon}><LockKeyhole size={20} aria-hidden="true" /></span><span>Đã khóa<strong>{num(users.filter(u => u.status === "locked").length)}</strong></span></div>
      <div><span className={styles.summaryIcon}><Wallet size={20} aria-hidden="true" /></span><span>Tổng coin hiện có<strong>{num(users.reduce((sum, u) => sum + u.coins, 0))}</strong></span></div>
    </div>
    {message && <div className={styles.notice} role="status"><span>{message}</span><button type="button" className={styles.iconButton} onClick={() => setMessage("")} aria-label="Đóng thông báo"><X size={16} /></button></div>}
    <div className={styles.tableCard}>
      <div className={styles.toolbar}>
        <label className={styles.search}><Search size={18} aria-hidden="true" /><input type="search" aria-label="Tìm người dùng" placeholder="Tìm tên, email hoặc ID…" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label>
        <div className={styles.tools}><button type="button" className={styles.secondary} onClick={() => { downloadCsv(filtered); setMessage(`Đã xuất ${num(filtered.length)} người dùng trong bộ lọc.`); }}><Download size={17} aria-hidden="true" />Xuất CSV</button><button type="button" className={styles.primary} onClick={() => open("add")}><Plus size={18} aria-hidden="true" />Thêm người dùng</button></div>
      </div>
      <div className={styles.filters}>
        <label>Trạng thái<select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="all">Tất cả trạng thái</option><option value="active">Hoạt động</option><option value="locked">Đã khóa</option></select></label>
        <label>Vai trò<select value={role} onChange={event => { setRole(event.target.value); setPage(1); }}><option value="all">Tất cả vai trò</option><option value="user">Người dùng</option><option value="admin">Quản trị viên</option></select></label>
        <label className={styles.sort}><ArrowDownUp size={15} aria-hidden="true" /><select value={sort} aria-label="Sắp xếp người dùng" onChange={event => { setSort(event.target.value); setPage(1); }}><option value="created">Mới nhất</option><option value="created-asc">Cũ nhất</option><option value="name">Tên A–Z</option><option value="coins">Coin cao nhất</option><option value="logins">Đăng nhập nhiều nhất</option></select></label>
      </div>
      <div className={styles.tableScroll}><table className={styles.table}>
        <thead><tr><th>Người dùng</th><th>Quốc gia</th><th>Trạng thái</th><th>Số coin</th><th>Ngày đăng nhập</th><th>Đăng nhập cuối</th><th><span className="sr-only">Thao tác</span></th></tr></thead>
        <tbody>{visible.map(user => <tr key={user.id}>
          <td><button type="button" className={styles.userButton} onClick={() => open("view", user.id)}><Avatar user={user} /><span><strong>{user.name}{user.role === "admin" && <ShieldCheck size={14} aria-label="Quản trị viên" />}</strong><small>{user.email}</small></span></button></td>
          <td>{user.country}</td><td><span className={`${styles.badge} ${user.status === "active" ? styles.active : styles.locked}`}><i />{user.status === "active" ? "Hoạt động" : "Đã khóa"}</span></td>
          <td><Coin value={user.coins} /></td><td>{num(user.loginDays)}</td><td className={styles.dateCell}>{date(user.lastLogin)}</td>
          <td><div className={styles.actions}><button type="button" className={styles.iconButton} onClick={() => open("view", user.id)} aria-label={`Xem ${user.name}`} title="Xem chi tiết"><Eye size={17} /></button><button type="button" className={styles.iconButton} onClick={() => open("edit", user.id)} aria-label={`Sửa ${user.name}`} title="Chỉnh sửa"><Pencil size={16} /></button><button type="button" className={styles.iconButton} onClick={() => toggleLock(user)} aria-label={`${user.status === "active" ? "Khóa" : "Mở khóa"} ${user.name}`} title={user.status === "active" ? "Khóa" : "Mở khóa"}>{user.status === "active" ? <LockKeyhole size={16} /> : <UnlockKeyhole size={16} />}</button><button type="button" className={`${styles.iconButton} ${styles.dangerIcon}`} onClick={() => open("delete", user.id)} aria-label={`Xóa ${user.name}`} title="Xóa"><Trash2 size={16} /></button></div></td>
        </tr>)}</tbody>
      </table>{!visible.length && <div className={styles.empty}><Search size={28} aria-hidden="true" /><strong>Không tìm thấy người dùng</strong><button type="button" className={styles.secondary} onClick={() => { setQuery(""); setStatus("all"); setRole("all"); setPage(1); }}>Xóa bộ lọc</button></div>}</div>
      <div className={styles.pagination}><span>{filtered.length ? `${(activePage - 1) * pageSize + 1}–${Math.min(activePage * pageSize, filtered.length)}` : "0"} / {num(filtered.length)} người dùng</span><div><button type="button" className={styles.iconButton} disabled={activePage <= 1} onClick={() => setPage(activePage - 1)} aria-label="Trang trước"><ArrowLeft size={17} /></button><span>{activePage} / {totalPages}</span><button type="button" className={styles.iconButton} disabled={activePage >= totalPages} onClick={() => setPage(activePage + 1)} aria-label="Trang sau"><ArrowRight size={17} /></button></div></div>
    </div>
    {modal?.mode === "add" && <Modal title="Thêm người dùng" onClose={close}><UserForm users={users} onClose={close} onSave={draft => {
      const added = addUser(draft);
      try { recordCoinChange(added.id, added.coins, "Số dư khởi tạo"); }
      catch (cause) {
        try { deleteUser(added.id); }
        catch { throw new Error("Không thể ghi sổ coin hoặc khôi phục tài khoản vừa tạo. Vui lòng kiểm tra dữ liệu trước khi thử lại."); }
        throw cause;
      }
      logUserAction("Thêm người dùng", added); setMessage("Đã thêm người dùng vào dữ liệu mẫu."); close();
    }} /></Modal>}
    {modal?.mode === "edit" && selected && <Modal title="Chỉnh sửa người dùng" onClose={close}><UserForm user={selected} users={users} onClose={close} onSave={draft => {
      const delta = draft.coins - selected.coins;
      saveUserWithLedger(selected, { ...draft, history: [{ id: crypto.randomUUID(), type: "profile", text: "Cập nhật hồ sơ", at: new Date().toISOString() }, ...(draft.history ?? [])] }, delta, draft.history?.[0]?.text ?? "Điều chỉnh từ hồ sơ", draft.history?.[0]?.id);
      logUserAction("Cập nhật người dùng", { ...selected, ...draft }); setMessage("Đã lưu thông tin người dùng."); close();
    }} /></Modal>}
    {modal?.mode === "view" && selected && <Modal title="Thông tin người dùng" onClose={close}>
      <div className={styles.modalBody}><div className={styles.profileHead}><Avatar user={selected} /><div><h3>{selected.name}</h3><span>{selected.title || "—"}</span></div><span className={`${styles.badge} ${selected.status === "active" ? styles.active : styles.locked}`}>{selected.status === "active" ? "Hoạt động" : "Đã khóa"}</span></div>
        <dl className={styles.details}><div><dt>ID</dt><dd>{selected.id}</dd></div><div><dt>Email</dt><dd>{selected.email}</dd></div><div><dt>Quốc gia</dt><dd>{selected.country}</dd></div><div><dt>Vai trò</dt><dd>{selected.role === "admin" ? "Quản trị viên" : "Người dùng"}</dd></div><div><dt>Ngày tạo</dt><dd>{date(selected.createdAt)}</dd></div><div><dt>Đăng nhập cuối</dt><dd>{date(selected.lastLogin)}</dd></div><div><dt>Ảnh đại diện</dt><dd>{selected.avatar || "Chưa có"}</dd></div>{selected.notes && <div><dt>Ghi chú</dt><dd>{selected.notes}</dd></div>}</dl>
        <div className={styles.profileStats}><div><span>Số coin</span><strong><Coin value={selected.coins} /></strong></div><div><span>Ngày đăng nhập</span><strong>{num(selected.loginDays)}</strong></div><div><span>Lượt đăng nhập</span><strong>{num(selected.logins)}</strong></div><div><span>Phiên Studio</span><strong>{num(selected.appSessions)}</strong></div></div>
        <div className={styles.revenue}><span>Tổng đã nạp</span><strong>{num(selected.totalVnd)} ₫ <span>·</span> {num(selected.totalUsd)} USD</strong><button type="button" className={styles.secondary} onClick={() => open("coins", selected.id)}><Wallet size={16} aria-hidden="true" />Điều chỉnh coin</button></div>
        <div className={styles.historyHead}><h3>Lịch sử gần nhất</h3><select aria-label="Lọc lịch sử người dùng" value={historyFilter} onChange={event => setHistoryFilter(event.target.value)}><option value="all">Tất cả</option><option value="coin">Giao dịch coin</option><option value="login">Đăng nhập</option><option value="render">Render</option><option value="profile">Hồ sơ</option></select></div>
        <div className={styles.history}>{userHistory.filter(item => historyFilter === "all" || item.type === historyFilter).slice(0, 12).map(item => <div key={item.id}><span className={styles.historyDot} /><span><strong>{item.text}</strong><small>{date(item.at)}</small></span>{item.coins !== undefined && <b className={item.coins >= 0 ? styles.positive : styles.negative}>{item.coins > 0 ? "+" : ""}{num(item.coins)} coin</b>}</div>)}{!userHistory.some(item => historyFilter === "all" || item.type === historyFilter) && <p className={styles.noHistory}>Chưa có lịch sử.</p>}</div>
      </div><div className={styles.modalFoot}><button type="button" className={styles.secondary} onClick={close}>Đóng</button><button type="button" className={styles.primary} onClick={() => open("edit", selected.id)}><Pencil size={16} aria-hidden="true" />Chỉnh sửa</button></div>
    </Modal>}
    {modal?.mode === "delete" && selected && <Modal title="Xóa người dùng" onClose={close} small><div className={styles.modalBody}>{modalError && <p role="alert" className={styles.error}>{modalError}</p>}<p className={styles.confirmText}>Xóa <strong>{selected.name}</strong> khỏi dữ liệu mẫu?</p><p className={styles.confirmEmail}>{selected.email}</p></div><div className={styles.modalFoot}><button type="button" className={styles.secondary} onClick={close} autoFocus>Hủy</button><button type="button" className={styles.danger} onClick={() => { try { deleteUser(selected.id); logUserAction("Xóa người dùng", selected, true); setMessage(`Đã xóa ${selected.name}.`); close(); } catch (cause) { setModalError(cause instanceof Error ? cause.message : "Không thể xóa."); } }}><Trash2 size={16} aria-hidden="true" />Xóa người dùng</button></div></Modal>}
    {modal?.mode === "coins" && selected && <Modal title="Điều chỉnh coin" onClose={close} small><form onSubmit={adjustCoins}><div className={styles.modalBody}>{modalError && <p role="alert" className={styles.error}>{modalError}</p>}<div className={styles.coinAccount}><span>{selected.name}</span><Coin value={selected.coins} /></div><div className={styles.formGrid}><label className={styles.spanTwo}>Coin cộng / trừ<input type="number" name="amount" step={1} required placeholder="Ví dụ: 20 hoặc -10" autoFocus /></label><label className={styles.spanTwo}>Lý do<textarea name="reason" required minLength={3} maxLength={300} rows={3} /></label></div></div><div className={styles.modalFoot}><button type="button" className={styles.secondary} onClick={close}>Hủy</button><button type="submit" className={styles.primary}><Check size={17} aria-hidden="true" />Xác nhận</button></div></form></Modal>}
  </section>;
}
