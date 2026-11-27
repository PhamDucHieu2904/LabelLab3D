"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Bell, Lock, Plus, RefreshCw, Search, Send, Shield, SlidersHorizontal, Unlock, Users, Wallet, X } from "lucide-react";
import { formatDate, formatMoney, formatNumber } from "@/lib/admin/commerce";
import { CoinValue } from "./OverviewPanel";
import s from "./AdminWorkspace.module.css";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  status: "active" | "locked";
  emailVerifiedAt: string | null;
  createdAt: string;
  balance: number;
  loginDays: number;
  lastCheckin: string | null;
  paidOrders: number;
  totalPaidVnd: number;
  googleLinked: number;
};

type ModalState =
  | { kind: "coin"; user: UserRow }
  | { kind: "create" }
  | { kind: "notify"; user: UserRow | null }
  | null;

function DialogModal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={s.modal}
      aria-labelledby={titleId}
      onCancel={(e) => { e.preventDefault(); close(); }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const b = e.currentTarget.getBoundingClientRect();
          if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) close();
        }
      }}
    >
      <div className={s.modalHeader}>
        <h2 id={titleId}>{title}</h2>
        <button type="button" className={s.iconButton} aria-label="Đóng" onClick={close}><X size={18} /></button>
      </div>
      {children}
    </dialog>
  );
}

export default function ProductionUsersPanel() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "locked" | "admin">("all");
  const [modal, setModal] = useState<ModalState>(null);
  const [modalError, setModalError] = useState("");
  const [notifyTarget, setNotifyTarget] = useState<"user" | "all">("user");
  const [notifyUserId, setNotifyUserId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/users", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("Không thể tải danh sách người dùng từ D1.");
      setUsers(((await response.json()) as { users?: UserRow[] }).users ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể tải dữ liệu.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => { void load(); });
    return () => cancelAnimationFrame(frame);
  }, [load]);

  const announce = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(""), 4500);
  };

  const mutate = async (payload: Record<string, unknown>, successMsg: string) => {
    setBusy(true);
    setError("");
    setModalError("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const resBody = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(resBody?.error ?? "Không thể cập nhật.");
      await load();
      announce(successMsg);
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Không thể cập nhật.";
      if (modal) setModalError(msg);
      else setError(msg);
      return false;
    } finally {
      setBusy(false);
    }
  };

  async function submitCoinAdjust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (modal?.kind !== "coin") return;
    const fd = new FormData(event.currentTarget);
    const amount = Number(fd.get("amount"));
    const direction = fd.get("direction") === "subtract" ? -1 : 1;
    const reason = String(fd.get("reason") ?? "").trim();
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1_000_000 || reason.length < 3) {
      setModalError("Nhập số coin nguyên dương và lý do ít nhất 3 ký tự.");
      return;
    }
    const ok = await mutate(
      {
        action: "coin_adjustment",
        userId: modal.user.id,
        amount: amount * direction,
        reason,
        idempotencyKey: `admincoin_${crypto.randomUUID().replaceAll("-", "")}`,
      },
      `Đã ${direction > 0 ? "cộng" : "trừ"} ${formatNumber(amount)} coin cho ${modal.user.email}.`,
    );
    if (ok) setModal(null);
  }

  async function submitCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const name = String(fd.get("name") ?? "").trim();
    const email = String(fd.get("email") ?? "").trim().toLowerCase();
    const password = String(fd.get("password") ?? "");
    const role = fd.get("role") === "user" ? "user" : "admin";
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 12) {
      setModalError("Nhập đầy đủ tên, email hợp lệ và mật khẩu từ 12 ký tự.");
      return;
    }
    const ok = await mutate({ action: "create", name, email, password, role }, `Đã tạo tài khoản ${email}.`);
    if (ok) setModal(null);
  }

  function openNotifyModal(user: UserRow | null) {
    setModalError("");
    setNotifyTarget("user");
    setNotifyUserId(user?.id ?? users[0]?.id ?? "");
    setModal({ kind: "notify", user });
  }

  async function submitSendNotification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (modal?.kind !== "notify") return;
    const fd = new FormData(event.currentTarget);
    const title = String(fd.get("title") ?? "").trim();
    const body = String(fd.get("body") ?? "").trim();
    const target = modal.user ? "user" : notifyTarget;
    const userId = modal.user ? modal.user.id : notifyUserId;

    if (target === "user" && !userId) {
      setModalError("Vui lòng chọn người dùng nhận thông báo.");
      return;
    }
    if (title.length < 2 || body.length < 2) {
      setModalError("Vui lòng nhập tiêu đề và nội dung (tối thiểu 2 ký tự).");
      return;
    }

    setBusy(true);
    setModalError("");
    try {
      const response = await fetch("/api/admin/notifications", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target,
          userId: target === "user" ? userId : undefined,
          kind: "admin_message",
          title,
          body,
        }),
      });
      const resBody = (await response.json().catch(() => null)) as {
        error?: string;
        sentCount?: number;
      } | null;
      if (!response.ok) {
        throw new Error(resBody?.error ?? "Không thể gửi thông báo.");
      }
      setModal(null);
      if (target === "all") {
        announce(`Đã gửi thông báo tới ${formatNumber(resBody?.sentCount ?? 0)} người dùng đang hoạt động.`);
      } else {
        const picked = modal.user ?? users.find((u) => u.id === userId);
        announce(`Đã gửi thông báo tới chuông của ${picked ? picked.email : "người dùng"}.`);
      }
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "Không thể gửi thông báo.");
    } finally {
      setBusy(false);
    }
  }

  const normalized = query.trim().toLowerCase();
  const filtered = users.filter((u) => {
    if (filter === "active" && u.status !== "active") return false;
    if (filter === "locked" && u.status !== "locked") return false;
    if (filter === "admin" && u.role !== "admin") return false;
    return `${u.name} ${u.email} ${u.id}`.toLowerCase().includes(normalized);
  });

  const totalCoins = users.reduce((sum, u) => sum + Number(u.balance), 0);
  const totalVnd = users.reduce((sum, u) => sum + Number(u.totalPaidVnd), 0);
  const activeCount = users.filter((u) => u.status === "active").length;

  return (
    <section style={{ display: "grid", gap: 18 }} aria-label="Người dùng Cloudflare D1">
      <div className={s.stats}>
        <article className={s.stat}>
          <div className={s.statTop}><span>Tổng tài khoản</span><Users size={17} aria-hidden="true" /></div>
          <div className={s.statValue}>{formatNumber(users.length)}</div>
          <span className={s.subtle}>{activeCount} đang hoạt động</span>
        </article>
        <article className={s.stat}>
          <div className={s.statTop}><span>Quản trị viên</span><Shield size={17} aria-hidden="true" /></div>
          <div className={s.statValue}>{formatNumber(users.filter((u) => u.role === "admin").length)}</div>
          <span className={s.subtle}>Đồng bộ trực tiếp D1</span>
        </article>
        <article className={s.stat}>
          <div className={s.statTop}><span>Tổng số dư coin</span><Wallet size={17} aria-hidden="true" /></div>
          <div className={s.statValue}>{formatNumber(totalCoins)}</div>
          <span className={s.subtle}>Đang lưu hành trong ví</span>
        </article>
        <article className={s.stat}>
          <div className={s.statTop}><span>Tổng nạp VNĐ</span><Wallet size={17} aria-hidden="true" /></div>
          <div className={s.statValue}>{formatMoney(totalVnd, "vn")}</div>
          <span className={s.subtle}>Từ đơn SePay đã xác nhận</span>
        </article>
      </div>

      <div className={s.toolbar}>
        <div className={s.search}>
          <Search size={17} aria-hidden="true" />
          <input
            className={s.input}
            type="search"
            aria-label="Tìm người dùng"
            placeholder="Tìm theo tên, email, ID…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className={s.actions}>
          <select className={s.select} aria-label="Lọc trạng thái" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="all">Tất cả tài khoản</option>
            <option value="active">Đang hoạt động</option>
            <option value="locked">Đã khóa</option>
            <option value="admin">Quản trị viên</option>
          </select>
          <button type="button" className={s.secondary} onClick={() => void load()} disabled={loading}>
            <RefreshCw size={15} aria-hidden="true" />Làm mới
          </button>
          <button type="button" className={s.secondary} onClick={() => openNotifyModal(null)} disabled={busy}>
            <Bell size={15} aria-hidden="true" />Gửi thông báo
          </button>
          <button type="button" className={s.primary} onClick={() => { setModalError(""); setModal({ kind: "create" }); }}>
            <Plus size={16} aria-hidden="true" />Tạo tài khoản
          </button>
        </div>
      </div>

      {error && <p role="alert" className={s.formError}>{error}</p>}

      <section className={s.panel}>
        <div className={s.tableScroll}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Người dùng</th>
                <th>Vai trò</th>
                <th>Trạng thái</th>
                <th>Số dư coin</th>
                <th>Đã nạp</th>
                <th>Điểm danh</th>
                <th>Ngày tạo</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className={s.userName}>
                      <strong>{user.name}</strong>
                      <small>
                        {user.email}
                        {user.googleLinked > 0 ? " · Google" : ""}
                        {user.emailVerifiedAt ? " · Đã xác minh" : ""}
                      </small>
                    </div>
                  </td>
                  <td>
                    <span className={s.status} data-status={user.role === "admin" ? "paid" : "pending"}>
                      {user.role === "admin" ? "Admin" : "User"}
                    </span>
                  </td>
                  <td>
                    <span className={s.status} data-status={user.status === "active" ? "paid" : "failed"}>
                      {user.status === "active" ? "Hoạt động" : "Đã khóa"}
                    </span>
                  </td>
                  <td><CoinValue value={Number(user.balance)} /></td>
                  <td>
                    <strong>{formatMoney(Number(user.totalPaidVnd), "vn")}</strong>
                    <div className={s.subtle}>{user.paidOrders} đơn</div>
                  </td>
                  <td>{formatNumber(user.loginDays)} ngày</td>
                  <td>{formatDate(user.createdAt)}</td>
                  <td>
                    <div className={s.actions} style={{ gap: 6 }}>
                      <button
                        type="button"
                        className={s.secondary}
                        disabled={busy}
                        onClick={() => openNotifyModal(user)}
                        title={`Gửi thông báo tới ${user.name}`}
                      >
                        <Bell size={14} aria-hidden="true" />Thông báo
                      </button>
                      <button
                        type="button"
                        className={s.secondary}
                        disabled={busy}
                        onClick={() => { setModalError(""); setModal({ kind: "coin", user }); }}
                      >
                        <SlidersHorizontal size={14} aria-hidden="true" />Coin
                      </button>
                      <button
                        type="button"
                        className={s.secondary}
                        disabled={busy}
                        onClick={() => void mutate(
                          { action: "role", userId: user.id, role: user.role === "admin" ? "user" : "admin" },
                          `Đã chuyển vai trò của ${user.email} thành ${user.role === "admin" ? "user" : "admin"}.`,
                        )}
                      >
                        <Shield size={14} aria-hidden="true" />{user.role === "admin" ? "Hạ user" : "Lên admin"}
                      </button>
                      <button
                        type="button"
                        className={s.secondary}
                        disabled={busy}
                        onClick={() => void mutate(
                          { action: "status", userId: user.id, status: user.status === "active" ? "locked" : "active" },
                          `Đã ${user.status === "active" ? "khóa" : "mở khóa"} tài khoản ${user.email}.`,
                        )}
                      >
                        {user.status === "active" ? <Lock size={14} aria-hidden="true" /> : <Unlock size={14} aria-hidden="true" />}
                        {user.status === "active" ? "Khóa" : "Mở"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && filtered.length === 0 && <div className={s.empty}>Không tìm thấy tài khoản phù hợp trên D1.</div>}
        </div>
      </section>

      {modal?.kind === "coin" && (
        <DialogModal title={`Điều chỉnh coin · ${modal.user.name}`} close={() => setModal(null)}>
          <form onSubmit={(e) => void submitCoinAdjust(e)}>
            <div className={s.modalBody}>
              <p className={s.subtle} style={{ marginTop: 0 }}>Số dư hiện tại: <strong>{formatNumber(modal.user.balance)} coins</strong> ({modal.user.email})</p>
              <div className={s.formGrid}>
                <label className={s.field}>Thao tác
                  <select name="direction" className={s.select}>
                    <option value="add">Cộng coin</option>
                    <option value="subtract">Trừ coin</option>
                  </select>
                </label>
                <label className={s.field}>Số coin
                  <input name="amount" type="number" required min="1" max="1000000" step="1" defaultValue="20" className={s.input} />
                </label>
                <label className={`${s.field} ${s.fullWidth}`}>Lý do (ghi vào sổ coin & audit log)
                  <textarea name="reason" required minLength={3} maxLength={300} placeholder="Ví dụ: Thưởng hỗ trợ khách hàng" className={s.textarea} />
                </label>
              </div>
              {modalError && <p role="alert" className={s.formError}>{modalError}</p>}
            </div>
            <div className={s.modalFooter}>
              <button type="button" className={s.secondary} onClick={() => setModal(null)}>Hủy</button>
              <button type="submit" disabled={busy} className={s.primary}>Lưu vào Cloudflare D1</button>
            </div>
          </form>
        </DialogModal>
      )}

      {modal?.kind === "create" && (
        <DialogModal title="Tạo tài khoản mới trên D1" close={() => setModal(null)}>
          <form onSubmit={(e) => void submitCreateUser(e)}>
            <div className={s.modalBody}>
              <div className={s.formGrid}>
                <label className={`${s.field} ${s.fullWidth}`}>Tên hiển thị<input name="name" required maxLength={120} className={s.input} /></label>
                <label className={`${s.field} ${s.fullWidth}`}>Email<input name="email" type="email" required maxLength={254} className={s.input} /></label>
                <label className={s.field}>Vai trò
                  <select name="role" className={s.select} defaultValue="admin">
                    <option value="admin">Quản trị viên (admin)</option>
                    <option value="user">Người dùng (user)</option>
                  </select>
                </label>
                <label className={s.field}>Mật khẩu (≥ 12 ký tự)<input name="password" type="password" required minLength={12} maxLength={128} className={s.input} /></label>
              </div>
              {modalError && <p role="alert" className={s.formError}>{modalError}</p>}
            </div>
            <div className={s.modalFooter}>
              <button type="button" className={s.secondary} onClick={() => setModal(null)}>Hủy</button>
              <button type="submit" disabled={busy} className={s.primary}>Tạo tài khoản</button>
            </div>
          </form>
        </DialogModal>
      )}

      {modal?.kind === "notify" && (
        <DialogModal
          title={modal.user ? `Gửi thông báo · ${modal.user.name}` : "Gửi thông báo tới người dùng"}
          close={() => setModal(null)}
        >
          <form onSubmit={(e) => void submitSendNotification(e)}>
            <div className={s.modalBody}>
              {modal.user ? (
                <p className={s.subtle} style={{ marginTop: 0 }}>
                  Người nhận: <strong>{modal.user.name}</strong> ({modal.user.email}) — hiển thị trực tiếp tại biểu tượng chuông thông báo.
                </p>
              ) : (
                <div className={s.formGrid} style={{ marginBottom: 14 }}>
                  <label className={`${s.field} ${s.fullWidth}`}>
                    Đối tượng nhận
                    <select
                      className={s.select}
                      value={notifyTarget}
                      onChange={(e) => setNotifyTarget(e.target.value as "user" | "all")}
                      disabled={busy}
                    >
                      <option value="user">Một người dùng cụ thể</option>
                      <option value="all">Tất cả người dùng đang hoạt động ({activeCount} tài khoản)</option>
                    </select>
                  </label>
                  {notifyTarget === "user" && (
                    <label className={`${s.field} ${s.fullWidth}`}>
                      Chọn người dùng
                      <select
                        className={s.select}
                        value={notifyUserId}
                        onChange={(e) => setNotifyUserId(e.target.value)}
                        disabled={busy}
                        required
                      >
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.email}){u.status === "locked" ? " [Đã khóa]" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              )}
              <div className={s.formGrid}>
                <label className={`${s.field} ${s.fullWidth}`}>
                  Tiêu đề thông báo
                  <input
                    name="title"
                    required
                    minLength={2}
                    maxLength={160}
                    placeholder="Ví dụ: Phản hồi hỗ trợ hoặc thông báo từ HyperMockup"
                    className={s.input}
                  />
                </label>
                <label className={`${s.field} ${s.fullWidth}`}>
                  Nội dung thông báo
                  <textarea
                    name="body"
                    required
                    minLength={2}
                    maxLength={2000}
                    rows={4}
                    placeholder="Nhập nội dung gửi tới biểu tượng chuông thông báo của người dùng..."
                    className={s.textarea}
                  />
                </label>
              </div>
              {modalError && <p role="alert" className={s.formError}>{modalError}</p>}
            </div>
            <div className={s.modalFooter}>
              <button type="button" className={s.secondary} onClick={() => setModal(null)}>Hủy</button>
              <button type="submit" disabled={busy} className={s.primary}>
                <Send size={14} aria-hidden="true" />
                {busy ? "Đang gửi..." : "Gửi thông báo"}
              </button>
            </div>
          </form>
        </DialogModal>
      )}

      {notice && <div className={s.toast} role="status">{notice}</div>}
    </section>
  );
}
