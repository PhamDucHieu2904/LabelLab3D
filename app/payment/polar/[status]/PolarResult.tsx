"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Order = { orderCode?: string; status: string; coins: number; amount: number; currency: string };

export default function PolarResult({ status, orderId }: { status: "success" | "cancel"; orderId: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [checking, setChecking] = useState(status === "success");

  useEffect(() => {
    if (status !== "success") return;
    let cancelled = false;
    let attempts = 0;
    const check = async () => {
      const response = await fetch(`/api/payments/orders/${encodeURIComponent(orderId)}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok || cancelled) return;
      const payload = await response.json().catch(() => ({})) as { order?: Order };
      if (payload.order) {
        setOrder(payload.order);
        if (payload.order.status === "paid") window.dispatchEvent(new Event("labellab-account-changed"));
      }
      attempts += 1;
      if (payload.order?.status === "paid" || attempts >= 20) setChecking(false);
      else window.setTimeout(check, 2000);
    };
    void check();
    return () => { cancelled = true; };
  }, [orderId, status]);

  const paid = order?.status === "paid";
  return (
    <main style={{ maxWidth: 560, margin: "80px auto", padding: 28, borderRadius: 24, border: "1px solid #f0d7e1", background: "#fff9fb", color: "#3d1e2e", fontFamily: "system-ui, sans-serif" }}>
      <p style={{ margin: "0 0 8px", color: "#a12e56", fontSize: 12, fontWeight: 700, letterSpacing: ".08em" }}>LABELLAB3D · POLAR INTERNATIONAL</p>
      <h1 style={{ margin: "0 0 12px", fontSize: 28 }}>
        {status === "success" ? (paid ? "Payment successful!" : "Confirming your payment…") : "Checkout cancelled"}
      </h1>
      {order?.orderCode && <p style={{ margin: "0 0 12px", color: "#795464" }}>Order code: <code>{order.orderCode}</code></p>}
      {status === "success" && checking && (
        <p style={{ margin: "0 0 20px", lineHeight: 1.55 }}>Polar is sending the verified payment webhook. Your coins will appear automatically in a few seconds.</p>
      )}
      {status === "success" && !checking && !paid && (
        <p style={{ margin: "0 0 20px", lineHeight: 1.55 }}>Still waiting for confirmation. Please check your wallet on the home page in a moment or contact support with your order code.</p>
      )}
      {paid && order && (
        <p style={{ margin: "0 0 20px", color: "#1f7a4c", fontWeight: 600 }}>+{order.coins} coins have been added to your account!</p>
      )}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link href="/" style={{ padding: "10px 20px", borderRadius: 12, background: "#a12e56", color: "#fff", textDecoration: "none", fontWeight: 650 }}>Back to Home</Link>
        <Link href="/studio" style={{ padding: "10px 20px", borderRadius: 12, border: "1px solid #ddb8c7", color: "#7e2544", textDecoration: "none", fontWeight: 650 }}>Open Studio</Link>
      </div>
    </main>
  );
}
