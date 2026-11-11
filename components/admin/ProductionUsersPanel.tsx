"use client";

import { useEffect, useState } from "react";

type User = { id: string; email: string; name: string; role: "user" | "admin"; status: "active" | "locked"; balance: number; loginDays: number; lastCheckin: string | null };

export default function ProductionUsersPanel() {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const response = await fetch("/api/admin/users", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw new Error("Không thể tải người dùng.");
    setUsers((await response.json() as { users?: User[] }).users ?? []);
  };
  useEffect(() => { void load().catch((e) => setError(e instanceof Error ? e.message : "Không thể tải dữ liệu.")); }, []);
  const mutate = async (payload: Record<string, unknown>) => {
    setBusy(true); setError("");
    try { const response = await fetch("/api/admin/users", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); if (!response.ok) throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error ?? "Không thể cập nhật."); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Không thể cập nhật."); }
    finally { setBusy(false); }
  };
  return <section style={{ display: "grid", gap: 18 }} aria-label="Người dùng production">
    <div style={{ padding: 18, borderRadius: 14, background: "#fff", border: "1px solid #e8e1e4" }}><strong>Dữ liệu production</strong><p style={{ margin: "6px 0 0", color: "#70686d" }}>Danh sách và số dư được đọc trực tiếp từ Cloudflare D1. Mọi điều chỉnh coin đều ghi vào ledger bất biến và audit log.</p></div>
    {error && <p role="alert" style={{ color: "#b42318" }}>{error}</p>}
    <div style={{ overflowX: "auto", background: "#fff", border: "1px solid #e8e1e4", borderRadius: 14 }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}><thead><tr>{["Người dùng", "Vai trò", "Trạng thái", "Coin", "Điểm danh", "Thao tác"].map((label) => <th key={label} style={{ textAlign: "left", padding: 14, borderBottom: "1px solid #eee", fontSize: 12 }}>{label}</th>)}</tr></thead><tbody>{users.map((user) => <tr key={user.id}><td style={{ padding: 14, borderBottom: "1px solid #f0ecee" }}><strong>{user.name}</strong><br /><small>{user.email}</small></td><td style={{ padding: 14, borderBottom: "1px solid #f0ecee" }}>{user.role}</td><td style={{ padding: 14, borderBottom: "1px solid #f0ecee" }}>{user.status}</td><td style={{ padding: 14, borderBottom: "1px solid #f0ecee", fontVariantNumeric: "tabular-nums" }}>{Number(user.balance).toLocaleString("vi-VN")}</td><td style={{ padding: 14, borderBottom: "1px solid #f0ecee" }}>{user.loginDays}</td><td style={{ padding: 14, borderBottom: "1px solid #f0ecee", display: "flex", gap: 8, flexWrap: "wrap" }}><button disabled={busy} type="button" onClick={() => void mutate({ action: "status", userId: user.id, status: user.status === "active" ? "locked" : "active" })}>{user.status === "active" ? "Khóa" : "Mở khóa"}</button><button disabled={busy} type="button" onClick={() => { const value = window.prompt("Số coin cộng (+) hoặc trừ (-)", "20"); const amount = Number(value); const reason = window.prompt("Lý do điều chỉnh", "Điều chỉnh hỗ trợ"); if (Number.isSafeInteger(amount) && amount !== 0 && reason) void mutate({ action: "coin_adjustment", userId: user.id, amount, reason, idempotencyKey: `admincoin_${crypto.randomUUID()}` }); }}>Điều chỉnh coin</button></td></tr>)}</tbody></table>{users.length === 0 && <p style={{ padding: 20 }}>Chưa có tài khoản production.</p>}</div>
  </section>;
}
