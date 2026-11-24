"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { COIN_PACKAGES } from "@/lib/payments/packages";
import { useAccount, useAuthDialog } from "./AuthDialog";
import styles from "./CoinPricing.module.css";

const regions = [
  { id: "vietnam", label: "Vietnam", currency: "VND", locale: "vi-VN", enabled: true },
  { id: "international", label: "International", currency: "USD", locale: "en-US", enabled: false },
] as const;

type Checkout = { action: string; method: "POST"; fields: Record<string, string> };
type PaymentOrder = { id: string; orderCode: string; coins: number; amount: number; currency: string; status: string; expiresAt: string };

export default function CoinPricing() {
  const { user } = useAccount();
  const openAuth = useAuthDialog();
  const [regionId, setRegionId] = useState<typeof regions[number]["id"]>("vietnam");
  const [selectedCoins, setSelectedCoins] = useState<number>(20);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paymentState, setPaymentState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [paymentError, setPaymentError] = useState("");
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [paymentOrder, setPaymentOrder] = useState<PaymentOrder | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const checkoutFormRef = useRef<HTMLFormElement>(null);
  const region = regions.find((item) => item.id === regionId)!;
  const prices = new Intl.NumberFormat(region.locale, {
    style: "currency",
    currency: region.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  useEffect(() => {
    if (!checkoutOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && setCheckoutOpen(false);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [checkoutOpen]);

  useEffect(() => {
    if (!checkoutOpen || !paymentOrder || paymentOrder.status !== "pending") return;
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      const response = await fetch(`/api/payments/orders/${encodeURIComponent(paymentOrder.id)}`, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok || cancelled) return;
      const payload = await response.json().catch(() => ({})) as { order?: PaymentOrder };
      if (!payload.order) return;
      setPaymentOrder(payload.order);
      if (payload.order.status === "paid") window.dispatchEvent(new Event("labellab-account-changed"));
      if (payload.order.status === "pending") timer = window.setTimeout(poll, 3000);
    };
    void poll();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [checkoutOpen, paymentOrder]);

  const selectedPackage = COIN_PACKAGES.find((item) => item.coins === selectedCoins)!;
  const selectedPrice = prices.format(regionId === "vietnam" ? selectedPackage.vnd : selectedPackage.usd);

  async function createPaymentOrder() {
    if (regionId !== "vietnam") return;
    if (!user) {
      setPaymentState("error");
      setPaymentError("Bạn cần đăng nhập trước khi nạp coin.");
      openAuth("login");
      return;
    }
    setPaymentState("loading");
    setPaymentError("");
    try {
      const response = await fetch("/api/payments/orders", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coins: selectedPackage.coins }),
      });
      const payload = await response.json().catch(() => ({})) as { checkout?: Checkout; order?: PaymentOrder; error?: string };
      if (!response.ok || !payload.checkout) {
        if (response.status === 403) throw new Error("Bạn cần đăng nhập trước khi nạp coin.");
        if (payload.error === "PAYMENT_NOT_CONFIGURED") throw new Error("Cổng thanh toán SePay chưa được cấu hình trên máy chủ.");
        if (payload.error === "PAYMENT_ENV_MISMATCH") throw new Error("Cấu hình môi trường SePay (Sandbox/Production) chưa khớp với khóa merchant.");
        if (payload.error === "PAYMENT_PUBLIC_URL_REQUIRED") throw new Error("Cần cấu hình URL HTTPS công khai để SePay gọi IPN.");
        throw new Error("Không thể tạo đơn thanh toán. Vui lòng thử lại.");
      }
      setCheckout(payload.checkout);
      setPaymentOrder(payload.order ?? null);
      setPaymentState("ready");
    } catch (error) {
      setPaymentState("error");
      setPaymentError(error instanceof Error ? error.message : "Không thể tạo đơn thanh toán.");
    }
  }

  function submitCheckout() {
    if (!checkout || !checkoutFormRef.current) return;
    checkoutFormRef.current.submit();
  }

  return (
    <article className={`home-card ${styles.card}`} aria-labelledby="coin-pricing-title">
      <div className={styles.headingRow}>
        <div className={styles.titleBlock}>
          <h2 id="coin-pricing-title">Coin packages</h2>
          <p>Choose your region to view local prices.</p>
        </div>
        <Image className={styles.coinArt} src="/branding/LLCoin.svg" alt="" width={56} height={56} />
      </div>

      <div className={styles.markets} role="group" aria-label="Pricing region">
        {regions.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={!item.enabled}
            aria-pressed={regionId === item.id}
            onClick={() => setRegionId(item.id)}
          >
            <span className={styles.marketLabel}>{item.label}</span>
            <small className={styles.marketCurrency}>{item.enabled ? item.currency : "Sắp mở"}</small>
          </button>
        ))}
      </div>

      <div className={styles.packs} role="group" aria-label={`${region.label} coin packages`}>
        {COIN_PACKAGES.map((item) => {
          const price = prices.format(regionId === "vietnam" ? item.vnd : item.usd);
          return (
            <button
              key={item.coins}
              className={styles.pack}
              type="button"
              aria-pressed={selectedCoins === item.coins}
              aria-label={`${item.coins} coins, ${price}`}
            onClick={() => { setSelectedCoins(item.coins); setCheckoutOpen(true); setPaymentState("idle"); setCheckout(null); setPaymentOrder(null); setPaymentError(""); }}
            >
              <span className={styles.coinRow}>
                <Image src="/branding/LLCoin.svg" alt="" width={20} height={20} />
                <strong>{item.coins}</strong>
                <span>coins</span>
              </span>
              <strong className={styles.price}>{price}</strong>
            </button>
          );
        })}
      </div>

      {checkoutOpen && (
        <div className={styles.overlay} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCheckoutOpen(false); }}>
          <section className={styles.checkout} role="dialog" aria-modal="true" aria-labelledby="coin-checkout-title" aria-describedby="coin-checkout-description">
            <button ref={closeButtonRef} className={styles.close} type="button" aria-label="Close top-up panel" onClick={() => setCheckoutOpen(false)}>×</button>
            <div className={styles.checkoutHeader}>
              <div><span className={styles.eyebrow}>Nạp coin nội địa</span><h3 id="coin-checkout-title">Nạp {selectedPackage.coins} coins</h3><p id="coin-checkout-description">{checkout?.action.includes("pay-sandbox.sepay.vn") ? "Thanh toán QR VietQR qua SePay (Test Mode)" : "Thanh toán QR VietQR qua SePay"}</p></div>
              <Image src="/branding/LLCoin.svg" alt="" width={42} height={42} />
            </div>
            <div className={styles.checkoutGrid}>
              <div className={styles.qrWrap}>
                <div className={styles.demoQr} aria-label="Xem trước khu vực QR SePay"><span>SEPAY</span><b>QR</b></div>
                <strong>QR thật mở trên trang SePay</strong>
                <small>Chỉ ghi nhận coin sau khi webhook SePay xác nhận thanh toán.</small>
              </div>
              <dl className={styles.summary}>
                <div><dt>Gói coin</dt><dd>{selectedPackage.coins} coins</dd></div>
                <div><dt>Số tiền</dt><dd>{selectedPrice}</dd></div>
                <div><dt>Phương thức</dt><dd>Quét QR ngân hàng</dd></div>
                <div><dt>Trạng thái</dt><dd><span className={styles.demoStatus}>{paymentOrder?.status === "paid" ? "Đã thanh toán · đã cộng coin" : paymentOrder?.status === "expired" ? "Đơn đã hết hạn" : paymentState === "loading" ? "Đang tạo đơn…" : paymentState === "ready" ? "Đã tạo đơn · chờ thanh toán" : "Chưa tạo đơn"}</span></dd></div>
              </dl>
            </div>
            {paymentState === "error" && <p className={styles.paymentError} role="alert">{paymentError}</p>}
            <div className={styles.paymentAction}>
              <button type="button" className={styles.payButton} onClick={paymentState === "ready" ? submitCheckout : createPaymentOrder} disabled={paymentState === "loading" || paymentOrder?.status === "paid" || paymentOrder?.status === "expired"}>
                {paymentState === "loading" ? "Đang tạo mã QR…" : paymentState === "ready" ? "Mở QR thanh toán" : "Tạo mã QR thanh toán"}
              </button>
              {paymentState === "ready" && checkout && <form ref={checkoutFormRef} method={checkout.method} action={checkout.action} target="_blank" className={styles.hiddenForm} aria-hidden="true">
                {Object.entries(checkout.fields).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
              </form>}
            </div>
            <div className={styles.notice}><strong>Chính sách giao dịch</strong><p>Coin là credit nội bộ, không quy đổi tiền mặt, không chuyển nhượng. Điều khoản, chính sách hoàn tiền và bảo mật sẽ được áp dụng khi thanh toán thật được bật.</p><div><Link href="/legal/terms">Điều khoản</Link><Link href="/legal/refund">Hoàn tiền</Link><Link href="/legal/privacy">Bảo mật</Link></div></div>
          </section>
        </div>
      )}
    </article>
  );
}
