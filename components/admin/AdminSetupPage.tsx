"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminSetupPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    const token = String(data.get("token") ?? "");
    try {
      const response = await fetch("/api/admin/bootstrap", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "x-admin-bootstrap-token": token }, body: JSON.stringify({ email: String(data.get("email") ?? ""), name: String(data.get("name") ?? ""), password: String(data.get("password") ?? "") }) });
      if (!response.ok) throw new Error("Không thể tạo tài khoản quản trị. Kiểm tra bootstrap secret và thông tin nhập.");
      router.replace("/admin/login");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể tạo tài khoản quản trị."); }
    finally { setBusy(false); }
  }
  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f6f4f5", padding: 24 }}><form onSubmit={submit} style={{ width: "min(100%, 460px)", background: "#fff", border: "1px solid #e4dfe2", borderRadius: 20, padding: 32, boxShadow: "0 18px 50px #35132312" }}><p style={{ margin: 0, color: "#b31354", fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", fontSize: 12 }}>Labellab Admin</p><h1 style={{ margin: "10px 0 8px", fontSize: 30 }}>Thiết lập admin đầu tiên</h1><p style={{ margin: "0 0 24px", color: "#70686d" }}>Cloudflare secret được dùng một lần để tạo tài khoản quản trị đầu tiên.</p><label style={{ display: "grid", gap: 7, marginBottom: 16 }}>Bootstrap secret<input required type="password" name="token" autoComplete="off" style={{ padding: "12px 14px", border: "1px solid #d8d0d5", borderRadius: 10 }} /></label><label style={{ display: "grid", gap: 7, marginBottom: 16 }}>Tên<input required name="name" maxLength={120} autoComplete="name" style={{ padding: "12px 14px", border: "1px solid #d8d0d5", borderRadius: 10 }} /></label><label style={{ display: "grid", gap: 7, marginBottom: 16 }}>Email<input required type="email" name="email" autoComplete="email" style={{ padding: "12px 14px", border: "1px solid #d8d0d5", borderRadius: 10 }} /></label><label style={{ display: "grid", gap: 7, marginBottom: 16 }}>Mật khẩu (ít nhất 12 ký tự, có chữ và số)<input required minLength={12} type="password" name="password" autoComplete="new-password" style={{ padding: "12px 14px", border: "1px solid #d8d0d5", borderRadius: 10 }} /></label>{error && <p role="alert" style={{ color: "#b42318" }}>{error}</p>}<button disabled={busy} type="submit" style={{ width: "100%", padding: "13px 16px", border: 0, borderRadius: 10, background: "#b31354", color: "#fff", fontWeight: 700 }}>{busy ? "Đang tạo…" : "Tạo tài khoản admin"}</button></form></main>;
}
