"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/auth", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ email, password }) });
      if (!response.ok) throw new Error("invalid");
      router.replace("/admin"); router.refresh();
    } catch { setError("Email hoặc mật khẩu quản trị không đúng."); }
    finally { setBusy(false); }
  }
  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f6f4f5", padding: 24 }}>
    <form onSubmit={submit} style={{ width: "min(100%, 420px)", background: "#fff", border: "1px solid #e4dfe2", borderRadius: 20, padding: 32, boxShadow: "0 18px 50px #35132312" }}>
      <p style={{ margin: 0, color: "#b31354", fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", fontSize: 12 }}>Labellab Admin</p>
      <h1 style={{ margin: "10px 0 8px", fontSize: 30 }}>Đăng nhập quản trị</h1>
      <p style={{ margin: "0 0 24px", color: "#70686d" }}>Khu vực này chỉ dành cho tài khoản admin đang hoạt động.</p>
      <label style={{ display: "grid", gap: 7, marginBottom: 16 }}>Email<input required type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} style={{ padding: "12px 14px", border: "1px solid #d8d0d5", borderRadius: 10 }} /></label>
      <label style={{ display: "grid", gap: 7, marginBottom: 16 }}>Mật khẩu<input required type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} style={{ padding: "12px 14px", border: "1px solid #d8d0d5", borderRadius: 10 }} /></label>
      {error && <p role="alert" style={{ color: "#b42318", margin: "0 0 14px" }}>{error}</p>}
      <button disabled={busy} type="submit" style={{ width: "100%", padding: "13px 16px", border: 0, borderRadius: 10, background: "#b31354", color: "#fff", fontWeight: 700 }}>{busy ? "Đang kiểm tra…" : "Đăng nhập"}</button>
    </form>
  </main>;
}
