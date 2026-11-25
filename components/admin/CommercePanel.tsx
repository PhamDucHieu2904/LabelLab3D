"use client";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Download, Pencil, RefreshCw, Search, SlidersHorizontal, Wallet, X } from "lucide-react";
import { downloadCsv, formatDate, formatMoney, formatNumber } from "@/lib/admin/commerce";
import { CoinValue } from "./OverviewPanel";
import s from "./AdminWorkspace.module.css";

type DbOrder = {
  id: string;
  orderCode: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  provider: string;
  coins: number;
  amount: number;
  currency: string;
  status: "pending" | "paid" | "expired" | "cancelled" | "refunded";
  providerOrderId: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

type DbLedger = {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  amount: number;
  kind: string;
  reference: string;
  balance: number;
  createdAt: string;
};

type DbUserLite = {
  id: string;
  name: string;
  email: string;
  status: string;
  balance: number;
};

type LivePack = {
  id: string;
  region?: "vietnam" | "international";
  tier?: string;
  coins: number;
  baseCoins?: number;
  bonusPct?: number;
  badge?: "popular" | "best";
  vnd: number;
  usd: number;
  enabled: boolean;
};

const ORDER_STATUS_LABELS: Record<DbOrder["status"], string> = {
  paid: "Đã thanh toán",
  pending: "Chờ xử lý",
  expired: "Hết hạn",
  cancelled: "Đã hủy",
  refunded: "Hoàn tiền",
};

const LEDGER_KIND_LABELS: Record<string, string> = {
  purchase: "Nạp coin",
  daily_checkin: "Điểm danh hằng ngày",
  welcome_bonus: "Quà chào mừng",
  admin_adjustment: "Admin điều chỉnh",
  refund: "Hoàn tiền",
  reservation: "Giữ coin render",
  reservation_release: "Hoàn coin giữ chỗ",
  render: "Render ảnh 3D",
};

function ledgerLabel(entry: DbLedger) {
  if ((entry.kind === "reservation" || entry.kind === "render") && entry.reference.startsWith("dieline:")) {
    return "Xuất Dieline 1:1 mm";
  }
  if (entry.kind === "reservation_release" && entry.reference.startsWith("dieline:")) {
    return "Hoàn coin Dieline";
  }
  return LEDGER_KIND_LABELS[entry.kind] ?? entry.kind;
}

type ModalState = { kind: "adjust" } | { kind: "order"; order: DbOrder } | { kind: "pack"; pack: LivePack } | null;

function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
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
          const bounds = e.currentTarget.getBoundingClientRect();
          if (e.clientX < bounds.left || e.clientX > bounds.right || e.clientY < bounds.top || e.clientY > bounds.bottom) close();
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

export default function CommercePanel() {
  const [ordersData, setOrdersData] = useState<DbOrder[]>([]);
  const [ledgerData, setLedgerData] = useState<DbLedger[]>([]);
  const [users, setUsers] = useState<DbUserLite[]>([]);
  const [packs, setPacks] = useState<LivePack[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [tab, setTab] = useState<"orders" | "ledger" | "packs">("orders");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [month, setMonth] = useState("");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<ModalState>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [orderStatus, setOrderStatus] = useState<DbOrder["status"]>("pending");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/commerce", { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) throw new Error("Không thể tải dữ liệu giao dịch từ D1.");
      const payload = await res.json() as { orders?: DbOrder[]; ledger?: DbLedger[]; users?: DbUserLite[]; packs?: LivePack[] };
      setOrdersData(payload.orders ?? []);
      setLedgerData(payload.ledger ?? []);
      setUsers(payload.users ?? []);
      setPacks(payload.packs ?? []);
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

  const announce = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 4500);
  };
  const close = () => { setModal(null); setError(""); };

  const normalized = query.trim().toLowerCase();
  const matchesMonth = (date: string) => !month || new Date(Date.parse(date) + 7 * 3600000).toISOString().startsWith(month);
  const orders = ordersData.filter((o) =>
    (status === "all" || o.status === status)
    && matchesMonth(o.createdAt)
    && `${o.orderCode} ${o.providerOrderId ?? ""} ${o.userName ?? ""} ${o.userEmail ?? ""} ${o.userId}`.toLowerCase().includes(normalized),
  );
  const ledger = ledgerData.filter((entry) =>
    matchesMonth(entry.createdAt)
    && `${entry.userName ?? ""} ${entry.userEmail ?? ""} ${entry.reference} ${entry.kind}`.toLowerCase().includes(normalized),
  );

  const count = tab === "ledger" ? ledger.length : orders.length;
  const lastPage = Math.max(1, Math.ceil(count / 10));
  const currentPage = Math.min(page, lastPage);

  const revenueVn = orders.filter((o) => o.status === "paid" && o.currency === "VND").reduce((sum, o) => sum + Number(o.amount), 0);
  const revenueUsd = orders.filter((o) => o.status === "paid" && o.currency !== "VND").reduce((sum, o) => sum + Number(o.amount) / 100, 0);
  const paidOrdersCount = orders.filter((o) => o.status === "paid").length;
  const paidCoins = orders.filter((o) => o.status === "paid").reduce((sum, o) => sum + Number(o.coins), 0);
  const totalLedgerDelta = ledger.reduce((sum, entry) => sum + Number(entry.amount), 0);

  async function postAction(payload: Record<string, unknown>, successMessage: string) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/commerce", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "Thao tác thất bại.");
      await load();
      close();
      announce(successMessage);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Thao tác thất bại.");
    } finally {
      setSaving(false);
    }
  }

  function adjustCoins(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const userId = String(fd.get("user") ?? "");
    const amount = Number(fd.get("amount"));
    const direction = fd.get("direction") === "subtract" ? -1 : 1;
    const reason = String(fd.get("reason") ?? "").trim();
    if (!userId || !Number.isSafeInteger(amount) || amount < 1 || amount > 1_000_000 || reason.length < 3) {
      setError("Chọn người dùng, số coin nguyên dương và lý do ít nhất 3 ký tự.");
      return;
    }
    void postAction(
      {
        action: "adjust_coins",
        userId,
        amount: amount * direction,
        reason,
        idempotencyKey: `admincoin_${crypto.randomUUID().replaceAll("-", "")}`,
      },
      "Đã ghi biến động coin vào Cloudflare D1.",
    );
  }

  function saveOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (modal?.kind !== "order") return;
    const fd = new FormData(event.currentTarget);
    const reason = String(fd.get("reason") ?? "").trim();
    if (orderStatus === modal.order.status) { close(); return; }
    if (reason.length < 5) { setError("Nhập lý do thay đổi ít nhất 5 ký tự."); return; }
    void postAction(
      { action: "update_order_status", orderId: modal.order.id, status: orderStatus, reason },
      `Đã cập nhật đơn ${modal.order.orderCode} trên Cloudflare D1.`,
    );
  }

  function savePack(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (modal?.kind !== "pack") return;
    const fd = new FormData(event.currentTarget);
    const coins = Number(fd.get("coins"));
    const packRegion = modal.pack.region;
    const vnd = packRegion === "international" ? 0 : Number(fd.get("vnd"));
    const usd = packRegion === "vietnam" ? 0 : Number(fd.get("usd"));
    const bonusPctRaw = fd.get("bonusPct");
    const bonusPct = bonusPctRaw !== null && String(bonusPctRaw).trim() !== "" ? Number(bonusPctRaw) : modal.pack.bonusPct ?? 0;
    const enabled = fd.get("enabled") === "on";
    if (!Number.isSafeInteger(coins) || coins < 1) {
      setError("Số coin phải là số nguyên ≥ 1.");
      return;
    }
    if (packRegion !== "international" && (!Number.isSafeInteger(vnd) || vnd < 1000)) {
      setError("Giá VNĐ phải là số nguyên ≥ 1.000 ₫.");
      return;
    }
    if (packRegion !== "vietnam" && (!Number.isFinite(usd) || usd < 0.5)) {
      setError("Giá USD phải ≥ 0.5.");
      return;
    }
    if (!Number.isSafeInteger(bonusPct) || bonusPct < 0 || bonusPct > 100) {
      setError("Tỷ lệ bonus phải từ 0% đến 100%.");
      return;
    }
    const updatedPacks = packs.map((p) => (p.id === modal.pack.id ? { ...p, coins, vnd, usd, bonusPct, enabled } : p));
    void postAction({ action: "save_packs", packs: updatedPacks }, "Đã lưu bảng giá lên D1 — đồng bộ ngay với trang chủ!");
  }

  function exportData() {
    if (tab === "ledger") {
      downloadCsv(
        "labellab-so-coin.csv",
        ["Mã", "Người dùng", "Email", "Thời gian", "Biến động", "Loại", "Tham chiếu", "Số dư sau GD"],
        ledger.map((e) => [e.id, e.userName ?? e.userId, e.userEmail ?? "", formatDate(e.createdAt), e.amount, e.kind, e.reference, e.balance]),
      );
    } else {
      downloadCsv(
        "labellab-giao-dich.csv",
        ["Mã đơn", "Người dùng", "Email", "Thời gian", "Tiền tệ", "Số tiền", "Coin", "Trạng thái", "Mã GD ngân hàng"],
        orders.map((o) => [o.orderCode, o.userName ?? o.userId, o.userEmail ?? "", formatDate(o.createdAt), o.currency, o.currency === "VND" ? o.amount : (o.amount / 100).toFixed(2), o.coins, ORDER_STATUS_LABELS[o.status] ?? o.status, o.providerOrderId ?? ""]),
      );
    }
  }

  return (
    <>
      <div className={s.pageHeading}>
        <h1>Giao dịch & coin</h1>
        <div className={s.actions}>
          <button type="button" className={s.secondary} onClick={() => void load()} disabled={loading}>
            <RefreshCw size={15} aria-hidden="true" />Làm mới
          </button>
          <button type="button" className={s.primary} onClick={() => { setError(""); setModal({ kind: "adjust" }); }}>
            <SlidersHorizontal size={16} aria-hidden="true" />Điều chỉnh coin
          </button>
        </div>
      </div>

      <div className={s.tabs}>
        {([["orders", `Đơn nạp (${ordersData.length})`], ["ledger", `Sổ coin (${ledgerData.length})`], ["packs", `Bảng giá (${packs.length})`]] as const).map(([key, title]) => (
          <button key={key} aria-pressed={key === tab} onClick={() => { setTab(key); setPage(1); setQuery(""); }}>{title}</button>
        ))}
      </div>

      {tab !== "packs" && (
        <>
          <div className={s.toolbar}>
            <div className={s.search}>
              <Search size={17} aria-hidden="true" />
              <input
                className={s.input}
                type="search"
                aria-label="Tìm giao dịch"
                placeholder={tab === "orders" ? "Tìm tên, email, mã đơn LL…, mã FT…" : "Tìm người dùng, lý do, tham chiếu…"}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              />
            </div>
            <div className={s.actions}>
              <input type="month" className={s.dateInput} value={month} aria-label="Tháng giao dịch" onChange={(e) => { setMonth(e.target.value); setPage(1); }} />
              <button type="button" className={s.secondary} onClick={() => { setMonth(""); setQuery(""); setStatus("all"); setPage(1); }}>Tất cả</button>
              {tab === "orders" && (
                <select className={s.select} aria-label="Trạng thái giao dịch" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
                  <option value="all">Mọi trạng thái</option>
                  {Object.entries(ORDER_STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              )}
              <button type="button" className={s.secondary} onClick={exportData}><Download size={15} aria-hidden="true" />Xuất CSV</button>
            </div>
          </div>

          {tab === "orders" ? (
            <div className={s.stats}>
              <article className={s.stat}>
                <div className={s.statTop}>Doanh thu VNĐ<Wallet size={17} /></div>
                <div className={s.statValue}>{formatMoney(revenueVn, "vn")}</div>
                <span className={s.subtle}>SePay VietQR đã xác nhận</span>
              </article>
              <article className={s.stat}>
                <div className={s.statTop}>Doanh thu USD<Wallet size={17} /></div>
                <div className={s.statValue}>{formatMoney(revenueUsd, "international")}</div>
                <span className={s.subtle}>Cổng quốc tế</span>
              </article>
              <article className={s.stat}>
                <div className={s.statTop}>Coin đã nạp</div>
                <div className={s.statValue}>{formatNumber(paidCoins)}</div>
                <span className={s.subtle}>{paidOrdersCount} đơn thành công</span>
              </article>
              <article className={s.stat}>
                <div className={s.statTop}>Đơn đang chờ</div>
                <div className={s.statValue}>{orders.filter((o) => o.status === "pending").length}</div>
                <span className={s.subtle}>{orders.length} đơn trong bộ lọc</span>
              </article>
            </div>
          ) : (
            <div className={s.inline} style={{ marginBottom: 18 }}>
              <span className={s.subtle}>{ledger.length} biến động thực tế từ D1 · Tổng chênh lệch</span>
              <CoinValue value={totalLedgerDelta} />
            </div>
          )}

          <section className={s.panel}>
            <div className={s.tableScroll}>
              {tab === "orders" ? (
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>Mã đơn</th>
                      <th>Người dùng</th>
                      <th>Số tiền</th>
                      <th>Coin</th>
                      <th>Trạng thái</th>
                      <th>Mã GD NH</th>
                      <th>Thời gian</th>
                      <th><span className="sr-only">Thao tác</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.slice((currentPage - 1) * 10, currentPage * 10).map((order) => (
                      <tr key={order.id}>
                        <td>
                          <button type="button" onClick={() => { setOrderStatus(order.status); setError(""); setModal({ kind: "order", order }); }}>
                            {order.orderCode}
                          </button>
                        </td>
                        <td>
                          <div className={s.userName}>
                            <strong>{order.userName || order.userId}</strong>
                            <small>{order.userEmail || ""}</small>
                          </div>
                        </td>
                        <td><strong>{formatMoney(order.currency === "VND" ? Number(order.amount) : Number(order.amount) / 100, order.currency === "VND" ? "vn" : "international")}</strong></td>
                        <td><CoinValue value={Number(order.coins)} /></td>
                        <td>
                          <span className={s.status} data-status={order.status === "cancelled" || order.status === "expired" ? "failed" : order.status}>
                            {ORDER_STATUS_LABELS[order.status] ?? order.status}
                          </span>
                        </td>
                        <td>{order.providerOrderId || "—"}</td>
                        <td>{formatDate(order.createdAt)}</td>
                        <td>
                          <button type="button" onClick={() => { setOrderStatus(order.status); setError(""); setModal({ kind: "order", order }); }}>
                            Chi tiết
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>Người dùng</th>
                      <th>Biến động</th>
                      <th>Loại</th>
                      <th>Tham chiếu</th>
                      <th>Số dư sau GD</th>
                      <th>Thời gian</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.slice((currentPage - 1) * 10, currentPage * 10).map((entry) => (
                      <tr key={entry.id}>
                        <td>
                          <div className={s.userName}>
                            <strong>{entry.userName || entry.userId}</strong>
                            <small>{entry.userEmail || ""}</small>
                          </div>
                        </td>
                        <td className={entry.amount >= 0 ? s.positive : s.negative}>
                          <strong>{entry.amount > 0 ? "+" : ""}{formatNumber(entry.amount)}</strong>
                        </td>
                        <td>{ledgerLabel(entry)}</td>
                        <td>{entry.reference}</td>
                        <td><CoinValue value={Number(entry.balance)} /></td>
                        <td>{formatDate(entry.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {!loading && count === 0 && <div className={s.empty}>Chưa có dữ liệu phù hợp trên Cloudflare D1.</div>}
            </div>
            <div className={s.pager}>
              <span>{count ? (currentPage - 1) * 10 + 1 : 0}–{Math.min(currentPage * 10, count)} / {count} bản ghi</span>
              <div>
                <button type="button" disabled={currentPage <= 1} aria-label="Trang trước" onClick={() => setPage(currentPage - 1)}><ChevronLeft size={14} /></button>
                <span>{currentPage} / {lastPage}</span>
                <button type="button" disabled={currentPage >= lastPage} aria-label="Trang sau" onClick={() => setPage(currentPage + 1)}><ChevronRight size={14} /></button>
              </div>
            </div>
          </section>
        </>
      )}

      {tab === "packs" && (
        <section className={s.panel}>
          <div className={s.panelHeader}>
            <div>
              <h2>Bảng giá gói coin (Việt Nam · SePay VietQR &amp; Quốc tế · Polar.sh)</h2>
              <p className={s.subtle} style={{ margin: "4px 0 0" }}>Thay đổi giá hoặc số coin tại đây sẽ đồng bộ ngay với trang chủ và đơn tạo thanh toán mới.</p>
            </div>
            <button
              type="button"
              className={s.secondary}
              disabled={saving}
              onClick={() => void postAction({ action: "reset_packs" }, "Đã khôi phục bảng giá mặc định hai khu vực lên Cloudflare D1.")}
            >
              <RefreshCw size={14} aria-hidden="true" />Khôi phục mặc định
            </button>
          </div>
          <div className={s.packRows}>
            {packs.map((pack) => (
              <div className={`${s.packRow} ${!pack.enabled ? s.inactive : ""}`} key={pack.id}>
                <div className={s.inline}>
                  <CoinValue value={pack.coins} />
                  <span className={s.subtle}>
                    {pack.region === "vietnam" ? "VN · VND" : pack.region === "international" ? "Quốc tế · USD" : "Chung"}
                    {pack.tier ? ` · ${pack.tier}` : ""}
                    {pack.bonusPct ? ` · +${pack.bonusPct}%` : ""}
                  </span>
                </div>
                <div>
                  {pack.region === "vietnam" ? (
                    <strong>{formatMoney(pack.vnd, "vn")}</strong>
                  ) : pack.region === "international" ? (
                    <strong>{formatMoney(pack.usd, "international")}</strong>
                  ) : (
                    <>
                      <strong>{formatMoney(pack.vnd, "vn")}</strong>
                      <span className={s.subtle}>· {formatMoney(pack.usd, "international")}</span>
                    </>
                  )}
                  {!pack.enabled && <span className={s.subtle}>· Đang tắt</span>}
                  <button
                    type="button"
                    className={s.iconButton}
                    aria-label={`Sửa gói ${pack.coins} coin`}
                    onClick={() => { setError(""); setModal({ kind: "pack", pack }); }}
                  >
                    <Pencil size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {modal?.kind === "adjust" && (
        <Modal title="Điều chỉnh coin trên Cloudflare D1" close={close}>
          <form onSubmit={adjustCoins}>
            <div className={s.modalBody}>
              <div className={s.formGrid}>
                <label className={`${s.field} ${s.fullWidth}`}>Người dùng
                  <select required name="user" className={s.select}>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>{user.name} ({user.email}) · {formatNumber(user.balance)} coin</option>
                    ))}
                  </select>
                </label>
                <label className={s.field}>Thao tác
                  <select name="direction" className={s.select}>
                    <option value="add">Cộng coin</option>
                    <option value="subtract">Trừ coin</option>
                  </select>
                </label>
                <label className={s.field}>Số coin<input name="amount" required type="number" min="1" max="1000000" step="1" defaultValue="20" className={s.input} /></label>
                <label className={`${s.field} ${s.fullWidth}`}>Lý do<textarea name="reason" required minLength={3} maxLength={300} className={s.textarea} /></label>
              </div>
              {error && <p className={s.formError} role="alert">{error}</p>}
            </div>
            <div className={s.modalFooter}>
              <button type="button" className={s.secondary} onClick={close}>Hủy</button>
              <button type="submit" disabled={saving} className={s.primary}>Lưu điều chỉnh</button>
            </div>
          </form>
        </Modal>
      )}

      {modal?.kind === "order" && (
        <Modal title={`Đơn ${modal.order.orderCode}`} close={close}>
          <form onSubmit={saveOrder}>
            <div className={s.modalBody}>
              <dl className={s.detailList}>
                <div><dt>Người dùng</dt><dd>{modal.order.userName || modal.order.userId} ({modal.order.userEmail || ""})</dd></div>
                <div><dt>Thời gian tạo</dt><dd>{formatDate(modal.order.createdAt)}</dd></div>
                <div><dt>Số tiền</dt><dd>{formatMoney(modal.order.currency === "VND" ? modal.order.amount : modal.order.amount / 100, modal.order.currency === "VND" ? "vn" : "international")}</dd></div>
                <div><dt>Coin</dt><dd><CoinValue value={modal.order.coins} /></dd></div>
                <div><dt>Mã GD ngân hàng</dt><dd>{modal.order.providerOrderId || "—"}</dd></div>
              </dl>
              <div className={s.formGrid} style={{ marginTop: 20 }}>
                <label className={`${s.field} ${s.fullWidth}`}>Trạng thái
                  <select className={s.select} value={orderStatus} onChange={(e) => setOrderStatus(e.target.value as DbOrder["status"])}>
                    {Object.entries(ORDER_STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                </label>
                {orderStatus !== modal.order.status && (
                  <label className={`${s.field} ${s.fullWidth}`}>Lý do đối soát (tối thiểu 5 ký tự)
                    <textarea required minLength={5} name="reason" className={s.textarea} placeholder="Ví dụ: Đã kiểm tra sao kê MBBank khớp giao dịch" />
                  </label>
                )}
              </div>
              {error && <p role="alert" className={s.formError}>{error}</p>}
            </div>
            <div className={s.modalFooter}>
              <button type="button" className={s.secondary} onClick={close}>Đóng</button>
              <button type="submit" disabled={saving || orderStatus === modal.order.status} className={s.primary}>Cập nhật trên D1</button>
            </div>
          </form>
        </Modal>
      )}

      {modal?.kind === "pack" && (
        <Modal
          title={`Sửa gói ${modal.pack.tier ?? ""} (${modal.pack.region === "international" ? "Quốc tế · USD" : modal.pack.region === "vietnam" ? "Việt Nam · VND" : "Chung"})`}
          close={close}
        >
          <form onSubmit={savePack}>
            <div className={s.modalBody}>
              <div className={s.formGrid}>
                <label className={s.field}>Số coin nhận được<input type="number" required min="1" step="1" defaultValue={modal.pack.coins} name="coins" className={s.input} /></label>
                <label className={s.field}>Bonus (%)<input type="number" min="0" max="100" step="1" defaultValue={modal.pack.bonusPct ?? 0} name="bonusPct" className={s.input} /></label>
                {modal.pack.region !== "international" && (
                  <label className={s.field}>Giá VNĐ<input type="number" required min="1000" step="1000" defaultValue={modal.pack.vnd} name="vnd" className={s.input} /></label>
                )}
                {modal.pack.region !== "vietnam" && (
                  <label className={s.field}>Giá USD<input type="number" required min="0.5" step="0.5" defaultValue={modal.pack.usd} name="usd" className={s.input} /></label>
                )}
                <label className={`${s.inline} ${s.fullWidth}`}><input type="checkbox" name="enabled" defaultChecked={modal.pack.enabled} />Hiển thị gói coin này trên trang chủ</label>
              </div>
              {error && <p role="alert" className={s.formError}>{error}</p>}
            </div>
            <div className={s.modalFooter}>
              <button type="button" className={s.secondary} onClick={close}>Hủy</button>
              <button type="submit" disabled={saving} className={s.primary}>Lưu bảng giá lên D1</button>
            </div>
          </form>
        </Modal>
      )}

      {notice && <div className={s.toast} role="status">{notice}</div>}
    </>
  );
}
