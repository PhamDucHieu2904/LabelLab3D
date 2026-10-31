"use client";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Download, Pencil, Plus, Search, SlidersHorizontal, Wallet, X } from "lucide-react";
import { useAdminUsers, type AdminUser } from "@/lib/admin/users-store";
import { useAdminCommerce, updateCommerce } from "@/lib/admin/commerce-store";
import { logAdminActivity } from "@/lib/admin/activity-store";
import { downloadCsv, formatDate, formatMoney, formatNumber, orderBalanceDelta, REGION_LABELS, STATUS_LABELS, summarizeRevenue, type AdminOrder, type CoinPack, type CommerceData, type OrderStatus, type Region } from "@/lib/admin/commerce";
import { CoinValue } from "./OverviewPanel";
import s from "./AdminWorkspace.module.css";
type ModalState = { kind: "new" } | { kind: "adjust" } | { kind: "order"; id: string } | { kind: "pack"; id: string } | null;
function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current, previous = document.activeElement as HTMLElement | null;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { previous?.focus(); };
  }, []);
  return <dialog ref={ref} className={s.modal} aria-labelledby={titleId} onCancel={e => { e.preventDefault(); close(); }} onClick={e => { if (e.target === e.currentTarget) { const bounds = e.currentTarget.getBoundingClientRect(); if (e.clientX < bounds.left || e.clientX > bounds.right || e.clientY < bounds.top || e.clientY > bounds.bottom) close(); } }}><div className={s.modalHeader}><h2 id={titleId}>{title}</h2><button className={s.iconButton} aria-label="Đóng" onClick={close}><X size={18}/></button></div>{children}</dialog>;
}
export default function CommercePanel() {
  const data = useAdminCommerce();
  const { users, updateUser } = useAdminUsers();
  const [tab, setTab] = useState<"orders" | "ledger" | "packs">("orders");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [region, setRegion] = useState("all");
  const [month, setMonth] = useState("2026-10");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<ModalState>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [newRegion, setNewRegion] = useState<Region>("vn");
  const [orderStatus, setOrderStatus] = useState<OrderStatus>("pending");
  const normalized = query.trim().toLowerCase();
  const name = (id: string) => users.find(user => user.id === id)?.name ?? `Đã xóa · ${id}`;
  const userSearch = (id: string) => `${name(id)} ${users.find(user => user.id === id)?.email ?? ""} ${id}`;
  const matchesMonth = (date: string) => !month || new Date(Date.parse(date) + 7 * 3600000).toISOString().startsWith(month);
  const orders = data.orders.filter(order => (status === "all" || status === order.status) && (region === "all" || region === order.region) && matchesMonth(order.createdAt) && `${order.id} ${order.reference} ${userSearch(order.userId)}`.toLowerCase().includes(normalized));
  const ledger = data.ledger.filter(entry => matchesMonth(entry.at) && `${userSearch(entry.userId)} ${entry.reason} ${entry.orderId ?? ""}`.toLowerCase().includes(normalized));
  const filtered = tab === "ledger" ? ledger : orders;
  const count = filtered.length;
  const lastPage = Math.max(1, Math.ceil(count / 10));
  const currentPage = Math.min(page, lastPage);
  const revenue = summarizeRevenue(orders);
  const totalCoins = ledger.reduce((sum, entry) => sum + entry.coins, 0);
  const selectedOrder = modal?.kind === "order" ? data.orders.find(order => order.id === modal.id) : undefined;
  const selectedPack = modal?.kind === "pack" ? data.packs.find(pack => pack.id === modal.id) : undefined;
  const open = (value: ModalState) => { setError(""); setModal(value); };
  const close = () => { setModal(null); setError(""); };
  const announce = (message: string) => { setNotice(message); setTimeout(() => setNotice(""), 4500); };
  function audit(action: string, target: string) { logAdminActivity({ actor: "Chủ sở hữu", action, target, level: "info" }); }
  function saveBalanceAndLedger(user: AdminUser, patch: Partial<AdminUser>, update: (current: CommerceData) => CommerceData) {
    updateUser(user.id, patch);
    try { updateCommerce(update); }
    catch (failure) {
      // Browser fixtures use separate keys. Restore the profile if the larger ledger write fails.
      updateUser(user.id, { coins: user.coins, totalVnd: user.totalVnd, totalUsd: user.totalUsd });
      throw failure;
    }
  }
  function saveOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!selectedOrder) return;
    const values = new FormData(event.currentTarget);
    const reason = String(values.get("reason") ?? "").trim();
    if (orderStatus === selectedOrder.status) { close(); return; }
    if (reason.length < 5) { setError("Nhập lý do thay đổi ít nhất 5 ký tự."); return; }
    const user = users.find(user => user.id === selectedOrder.userId);
    if (!user) { setError("Tài khoản đã bị xóa. Không thể thay đổi số dư."); return; }
    const delta = orderBalanceDelta(selectedOrder, orderStatus);
    if (user.coins + delta < 0) { setError("Số dư không đủ để thu hồi coin của đơn này."); return; }
    try {
      const revenueDelta = (orderStatus === "paid" ? selectedOrder.amount : 0) - (selectedOrder.status === "paid" ? selectedOrder.amount : 0);
      const totalKey = selectedOrder.region === "vn" ? "totalVnd" : "totalUsd";
      saveBalanceAndLedger(user, { coins: user.coins + delta, [totalKey]: Math.max(0, user[totalKey] + revenueDelta) }, current => ({ ...current, orders: current.orders.map(order => order.id === selectedOrder.id ? { ...order, status: orderStatus } : order), ledger: delta ? [{ id: crypto.randomUUID(), userId: user.id, coins: delta, reason, at: new Date().toISOString(), orderId: selectedOrder.id }, ...current.ledger] : current.ledger }));
      audit(`Đổi trạng thái đơn mẫu: ${STATUS_LABELS[orderStatus]} · ${reason}`, selectedOrder.id);
      close(); announce("Đã cập nhật giao dịch mẫu.");
    } catch (e) { setError(e instanceof Error ? e.message : "Không thể cập nhật giao dịch."); }
  }
  function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const values = new FormData(event.currentTarget);
    const pack = data.packs.find(pack => pack.id === values.get("pack") && pack.enabled);
    const user = users.find(user => user.id === values.get("user"));
    if (!pack || !user || user.status !== "active") { setError("Chọn tài khoản hoạt động và gói coin đang bật."); return; }
    const order: AdminOrder = { id: `LL-DEMO-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, userId: user.id, region: pack.region, amount: pack.amount, coins: pack.coins, status: "pending", createdAt: new Date().toISOString(), reference: String(values.get("reference") ?? "").trim() };
    try {
      updateCommerce(current => ({ ...current, orders: [order, ...current.orders] })); audit("Tạo đơn nạp mẫu", order.id);
      close(); setMonth(""); setStatus("all"); setRegion("all"); setQuery(""); setPage(1); announce("Đã tạo đơn mẫu ở trạng thái chờ xử lý.");
    } catch (e) { setError(e instanceof Error ? e.message : "Không thể lưu đơn mẫu."); }
  }
  function adjustCoins(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const values = new FormData(event.currentTarget), user = users.find(user => user.id === values.get("user"));
    const amount = Number(values.get("amount")), direction = values.get("direction") === "subtract" ? -1 : 1;
    const reason = String(values.get("reason") ?? "").trim();
    if (!user || !Number.isSafeInteger(amount) || amount < 1 || amount > 1000000 || reason.length < 5) { setError("Chọn người dùng, số coin hợp lệ và lý do ít nhất 5 ký tự."); return; }
    const delta = amount * direction;
    if (user.coins + delta < 0) { setError("Số dư người dùng không đủ để trừ coin."); return; }
    try {
      saveBalanceAndLedger(user, { coins: user.coins + delta }, current => ({ ...current, ledger: [{ id: crypto.randomUUID(), userId: user.id, coins: delta, reason, at: new Date().toISOString() }, ...current.ledger] }));
      audit(`${delta > 0 ? "Cộng" : "Trừ"} ${amount} coin mẫu · ${reason}`, user.email);
      close(); setTab("ledger"); setMonth(""); setQuery(""); setPage(1); announce("Đã điều chỉnh số dư mẫu.");
    } catch (e) { setError(e instanceof Error ? e.message : "Không thể điều chỉnh coin."); }
  }
  function editPack(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); if (!selectedPack) return;
    const values = new FormData(event.currentTarget);
    const amount = Number(values.get("amount")), coins = Number(values.get("coins"));
    if (!Number.isFinite(amount) || amount <= 0 || (selectedPack.region === "vn" && !Number.isInteger(amount)) || !Number.isSafeInteger(coins) || coins < 1) { setError("Giá và số coin phải lớn hơn 0. Coin phải là số nguyên."); return; }
    const patch: CoinPack = { ...selectedPack, amount, coins, enabled: values.get("enabled") === "on" };
    try {
      updateCommerce(current => ({ ...current, packs: current.packs.map(pack => pack.id === patch.id ? patch : pack) }));
      audit("Sửa bảng giá mẫu", patch.id); close(); announce("Đã lưu gói coin mẫu.");
    } catch (e) { setError(e instanceof Error ? e.message : "Không thể lưu gói coin mẫu."); }
  }
  function exportData() {
    if (tab === "ledger") downloadCsv("labellab-so-coin.csv", ["Mã", "Người dùng", "Thời gian", "Biến động", "Lý do", "Đơn liên quan"], ledger.map(entry => [entry.id, name(entry.userId), formatDate(entry.at), entry.coins, entry.reason, entry.orderId ?? ""]));
    else downloadCsv("labellab-giao-dich.csv", ["Mã đơn", "Người dùng", "Thời gian", "Khu vực", "Tiền tệ", "Giá trị", "Coin", "Trạng thái", "Tham chiếu"], orders.map(order => [order.id, name(order.userId), formatDate(order.createdAt), REGION_LABELS[order.region], order.region === "vn" ? "VND" : "USD", order.amount, order.coins, STATUS_LABELS[order.status], order.reference]));
  }
  return <>
    <div className={s.pageHeading}><h1>Giao dịch & coin</h1><div className={s.actions}><button className={s.secondary} onClick={() => open({ kind: "adjust" })}><SlidersHorizontal size={16} aria-hidden="true"/>Điều chỉnh coin</button><button className={s.primary} onClick={() => { setNewRegion("vn"); open({ kind: "new" }); }}><Plus size={16} aria-hidden="true"/>Tạo đơn mẫu</button></div></div>
    <div className={s.tabs}>{([['orders', 'Đơn nạp'], ['ledger', 'Sổ coin'], ['packs', 'Bảng giá']] as const).map(([key, title]) => <button key={key} aria-pressed={key === tab} onClick={() => { setTab(key); setPage(1); setQuery(""); }}>{title}</button>)}</div>
    {tab !== "packs" && <>
      <div className={s.toolbar}><div className={s.search}><Search size={17} aria-hidden="true"/><input className={s.input} type="search" aria-label="Tìm giao dịch" placeholder={tab === "orders" ? "Tìm tên, email, mã giao dịch…" : "Tìm người dùng, lý do…"} value={query} onChange={e => { setQuery(e.target.value); setPage(1); }}/></div><div className={s.actions}><input type="month" className={s.dateInput} value={month} aria-label="Tháng giao dịch" onChange={e => { setMonth(e.target.value); setPage(1); }}/><button className={s.secondary} onClick={() => { setMonth(""); setQuery(""); setStatus("all"); setRegion("all"); setPage(1); }}>Tất cả</button>{tab === "orders" && <><select className={s.select} aria-label="Khu vực thanh toán" value={region} onChange={e => { setRegion(e.target.value); setPage(1); }}><option value="all">Mọi khu vực</option><option value="vn">Việt Nam</option><option value="international">Quốc tế</option></select><select className={s.select} aria-label="Trạng thái giao dịch" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="all">Mọi trạng thái</option>{Object.entries(STATUS_LABELS).map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></>}<button className={s.secondary} onClick={exportData}><Download size={15} aria-hidden="true"/>Xuất CSV</button></div></div>
      {tab === "orders" ? <div className={s.stats}><article className={s.stat}><div className={s.statTop}>Doanh thu VNĐ<Wallet size={17}/></div><div className={s.statValue}>{formatMoney(revenue.vn, "vn")}</div><span className={s.subtle}>Đơn thành công</span></article><article className={s.stat}><div className={s.statTop}>Doanh thu USD<Wallet size={17}/></div><div className={s.statValue}>{formatMoney(revenue.international, "international")}</div><span className={s.subtle}>Đơn thành công</span></article><article className={s.stat}><div className={s.statTop}>Coin đã nạp</div><div className={s.statValue}>{formatNumber(revenue.coins)}</div><span className={s.subtle}>{revenue.paid} đơn thành công</span></article><article className={s.stat}><div className={s.statTop}>Đơn chờ xử lý</div><div className={s.statValue}>{orders.filter(order => order.status === "pending").length}</div><span className={s.subtle}>{orders.length} đơn trong bộ lọc</span></article></div> : <div className={s.inline} style={{ marginBottom: 18 }}><span className={s.subtle}>{ledger.length} biến động · Tổng thay đổi</span><CoinValue value={totalCoins}/></div>}
      <section className={s.panel}><div className={s.tableScroll}>{tab === "orders" ? <table className={s.table}><thead><tr><th>Mã giao dịch</th><th>Người dùng</th><th>Khu vực</th><th>Số tiền</th><th>Coin</th><th>Trạng thái</th><th>Thời gian</th><th><span className="sr-only">Thao tác</span></th></tr></thead><tbody>{orders.slice((currentPage - 1) * 10, currentPage * 10).map(order => <tr key={order.id}><td><button onClick={() => { setOrderStatus(order.status); open({ kind: "order", id: order.id }); }}>{order.id}</button></td><td>{name(order.userId)}</td><td>{REGION_LABELS[order.region]}</td><td><strong>{formatMoney(order.amount, order.region)}</strong></td><td><CoinValue value={order.coins}/></td><td><span className={s.status} data-status={order.status}>{STATUS_LABELS[order.status]}</span></td><td>{formatDate(order.createdAt)}</td><td><button aria-label={`Chi tiết ${order.id}`} onClick={() => { setOrderStatus(order.status); open({ kind: "order", id: order.id }); }}>Chi tiết</button></td></tr>)}</tbody></table> : <table className={s.table}><thead><tr><th>Người dùng</th><th>Biến động</th><th>Lý do</th><th>Đơn liên quan</th><th>Thời gian</th></tr></thead><tbody>{ledger.slice((currentPage - 1) * 10, currentPage * 10).map(entry => <tr key={entry.id}><td>{name(entry.userId)}</td><td className={entry.coins >= 0 ? s.positive : s.negative}>{entry.coins > 0 ? "+" : ""}{formatNumber(entry.coins)}</td><td>{entry.reason}</td><td>{entry.orderId ?? "—"}</td><td>{formatDate(entry.at)}</td></tr>)}</tbody></table>}{!count && <div className={s.empty}>Không có dữ liệu phù hợp.</div>}</div><div className={s.pager}><span>{count ? (currentPage - 1) * 10 + 1 : 0}–{Math.min(currentPage * 10, count)} / {count} bản ghi</span><div><button disabled={currentPage <= 1} aria-label="Trang trước" onClick={() => setPage(currentPage - 1)}><ChevronLeft size={14}/></button><span>{currentPage} / {lastPage}</span><button disabled={currentPage >= lastPage} aria-label="Trang sau" onClick={() => setPage(currentPage + 1)}><ChevronRight size={14}/></button></div></div></section>
    </>}
    {tab === "packs" && <div className={s.packsGrid}>{(["vn", "international"] as Region[]).map(r => <section className={s.panel} key={r}><div className={s.panelHeader}><h2>{REGION_LABELS[r]}</h2><span className={s.subtle}>{r === "vn" ? "VNĐ" : "USD"}</span></div><div className={s.packRows}>{data.packs.filter(pack => pack.region === r).map(pack => <div className={`${s.packRow} ${!pack.enabled ? s.inactive : ""}`} key={pack.id}><CoinValue value={pack.coins}/><div><strong>{formatMoney(pack.amount, r)}</strong><span className={s.subtle}>{!pack.enabled && "Đang tắt"}</span><button className={s.iconButton} aria-label={`Sửa gói ${pack.coins} coin ${REGION_LABELS[r]}`} onClick={() => open({ kind: "pack", id: pack.id })}><Pencil size={14}/></button></div></div>)}</div></section>)}</div>}
    {modal && <Modal title={modal.kind === "new" ? "Tạo đơn nạp mẫu" : modal.kind === "adjust" ? "Điều chỉnh coin" : modal.kind === "pack" ? "Sửa gói coin" : selectedOrder?.id ?? "Chi tiết đơn"} close={close}>
      {modal.kind === "new" && <form onSubmit={createOrder}><div className={s.modalBody}><div className={s.formGrid}><label className={`${s.field} ${s.fullWidth}`}>Người dùng<select required name="user" className={s.select}>{users.filter(user => user.status === "active").map(user => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}</select></label><label className={s.field}>Khu vực<select className={s.select} value={newRegion} onChange={e => setNewRegion(e.target.value as Region)}><option value="vn">Việt Nam</option><option value="international">Quốc tế</option></select></label><label className={s.field}>Gói coin<select required name="pack" className={s.select} key={newRegion}>{data.packs.filter(pack => pack.region === newRegion && pack.enabled).map(pack => <option key={pack.id} value={pack.id}>{pack.coins} coin · {formatMoney(pack.amount, pack.region)}</option>)}</select></label><label className={`${s.field} ${s.fullWidth}`}>Mã tham chiếu<input name="reference" className={s.input} maxLength={100}/></label></div>{error && <p role="alert" className={s.formError}>{error}</p>}</div><div className={s.modalFooter}><button type="button" className={s.secondary} onClick={close}>Hủy</button><button className={s.primary} type="submit">Tạo đơn mẫu</button></div></form>}
      {modal.kind === "adjust" && <form onSubmit={adjustCoins}><div className={s.modalBody}><div className={s.formGrid}><label className={`${s.field} ${s.fullWidth}`}>Người dùng<select required name="user" className={s.select}>{users.map(user => <option key={user.id} value={user.id}>{user.name} · {user.coins} coin</option>)}</select></label><label className={s.field}>Thao tác<select name="direction" className={s.select}><option value="add">Cộng coin</option><option value="subtract">Trừ coin</option></select></label><label className={s.field}>Số coin<input name="amount" required type="number" min="1" max="1000000" step="1" className={s.input}/></label><label className={`${s.field} ${s.fullWidth}`}>Lý do<textarea name="reason" required minLength={5} maxLength={500} className={s.textarea}/></label></div>{error && <p className={s.formError} role="alert">{error}</p>}</div><div className={s.modalFooter}><button type="button" className={s.secondary} onClick={close}>Hủy</button><button type="submit" className={s.primary}>Lưu điều chỉnh</button></div></form>}
      {modal.kind === "order" && selectedOrder && <form onSubmit={saveOrder}><div className={s.modalBody}><dl className={s.detailList}><div><dt>Người dùng</dt><dd>{name(selectedOrder.userId)}</dd></div><div><dt>Thời gian</dt><dd>{formatDate(selectedOrder.createdAt)}</dd></div><div><dt>Số tiền</dt><dd>{formatMoney(selectedOrder.amount, selectedOrder.region)}</dd></div><div><dt>Coin</dt><dd><CoinValue value={selectedOrder.coins}/></dd></div><div><dt>Khu vực</dt><dd>{REGION_LABELS[selectedOrder.region]}</dd></div><div><dt>Mã tham chiếu</dt><dd>{selectedOrder.reference || "—"}</dd></div></dl><div className={s.formGrid} style={{ marginTop: 22 }}><label className={`${s.field} ${s.fullWidth}`}>Trạng thái<select className={s.select} value={orderStatus} onChange={e => setOrderStatus(e.target.value as OrderStatus)}>{Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>{orderStatus !== selectedOrder.status && <label className={`${s.field} ${s.fullWidth}`}>Lý do thay đổi<textarea required minLength={5} name="reason" className={s.textarea}/></label>}</div>{error && <p role="alert" className={s.formError}>{error}</p>}</div><div className={s.modalFooter}><button type="button" className={s.secondary} onClick={close}>Đóng</button><button type="submit" disabled={orderStatus === selectedOrder.status} className={s.primary}>Lưu trạng thái mẫu</button></div></form>}
      {modal.kind === "pack" && selectedPack && <form onSubmit={editPack}><div className={s.modalBody}><div className={s.formGrid}><label className={s.field}>Giá ({selectedPack.region === "vn" ? "VNĐ" : "USD"})<input type="number" required min={selectedPack.region === "vn" ? 1 : .01} step={selectedPack.region === "vn" ? 1 : .01} defaultValue={selectedPack.amount} name="amount" className={s.input}/></label><label className={s.field}>Số coin<input type="number" required min="1" step="1" defaultValue={selectedPack.coins} name="coins" className={s.input}/></label><label className={`${s.inline} ${s.fullWidth}`}><input type="checkbox" name="enabled" defaultChecked={selectedPack.enabled}/>Bật gói coin</label></div>{error && <p role="alert" className={s.formError}>{error}</p>}</div><div className={s.modalFooter}><button type="button" className={s.secondary} onClick={close}>Hủy</button><button type="submit" className={s.primary}>Lưu gói coin</button></div></form>}
    </Modal>}
    {notice && <div className={s.toast} role="status">{notice}</div>}
  </>;
}
