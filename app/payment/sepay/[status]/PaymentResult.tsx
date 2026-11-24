"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Order = { orderCode?: string; status: string; coins: number; amount: number; currency: string };

export default function PaymentResult({ status, orderId }: { status: "success" | "error" | "cancel"; orderId: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [checking, setChecking] = useState(status === "success");

  useEffect(() => {
    if (status !== "success") return;
    let cancelled = false;
    let attempts = 0;
    const check = async () => {
      const response = await fetch(`/api/payments/orders/${encodeURIComponent(orderId)}`, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok || cancelled) return;
      const payload = await response.json().catch(() => ({})) as { order?: Order };
      if (payload.order) {
        setOrder(payload.order);
        if (payload.order.status === "paid") window.dispatchEvent(new Event("labellab-account-changed"));
      }
      attempts += 1;
      if (payload.order?.status === "paid" || attempts >= 15) setChecking(false);
      else window.setTimeout(check, 2000);
    };
    void check();
    return () => { cancelled = true; };
  }, [orderId, status]);

  const paid = order?.status === "paid";
  return <main style={{ maxWidth: 640, margin: "80px auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
    <p style={{ color: "#a12e56", fontWeight: 700, letterSpacing: ".08em" }}>LABELLAB3D · SEPAY</p>
    <h1>{status === "success" ? (paid ? "Nạp coin thành công" : "Đang xác nhận thanh toán") : status === "cancel" ? "Bạn đã hủy thanh toán" : "Thanh toán chưa hoàn tất"}</h1>
    {order?.orderCode && <p>Mã đơn: <code>{order.orderCode}</code></p>}
    {status === "success" && checking && <p>SePay đang gửi xác nhận. Coin chỉ được cộng sau khi server nhận webhook hợp lệ.</p>}
    {status === "success" && !checking && !paid && <p>Chưa nhận được xác nhận trong thời gian chờ. Bạn có thể mở lại ví sau ít phút hoặc liên hệ hỗ trợ kèm mã đơn.</p>}
    {paid && order && <p>Đã cộng {order.coins} coins vào tài khoản của bạn.</p>}
    <Link href="/">Về trang chủ</Link>
  </main>;
}
