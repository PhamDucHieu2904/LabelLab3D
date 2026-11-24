"use client";

import Image from "next/image";
import Link from "next/link";
import { Check, CheckCircle2, Copy, Download, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { COIN_PACKAGES, type CoinPackage } from "@/lib/payments/packages";
import { useAccount, useAuthDialog } from "./AuthDialog";
import styles from "./CoinPricing.module.css";

const regions = [
  { id: "vietnam", label: "Vietnam", currency: "VND", locale: "vi-VN", enabled: true },
  { id: "international", label: "International", currency: "USD", locale: "en-US", enabled: false },
] as const;

type Checkout = { action: string; method: "POST"; fields: Record<string, string> };
type DirectQr = {
  imageUrl: string;
  downloadUrl: string;
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountOwner: string;
  transferContent: string;
};
type PaymentOrder = {
  id: string;
  orderCode: string;
  coins: number;
  amount: number;
  currency: string;
  status: string;
  expiresAt: string;
};

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export default function CoinPricing() {
  const { user } = useAccount();
  const openAuth = useAuthDialog();
  const [regionId, setRegionId] = useState<typeof regions[number]["id"]>("vietnam");
  const [packages, setPackages] = useState<readonly CoinPackage[]>(COIN_PACKAGES);
  const [selectedCoins, setSelectedCoins] = useState<number>(20);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paymentState, setPaymentState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [paymentError, setPaymentError] = useState("");
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [directQr, setDirectQr] = useState<DirectQr | null>(null);
  const [qrLoaded, setQrLoaded] = useState(false);
  const [qrImageError, setQrImageError] = useState(false);
  const [paymentOrder, setPaymentOrder] = useState<PaymentOrder | null>(null);
  const [clockMs, setClockMs] = useState(0);
  const [copiedKey, setCopiedKey] = useState<"account" | "content" | null>(null);
  const [manualCheckHint, setManualCheckHint] = useState("");
  const [checkingNow, setCheckingNow] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const checkoutFormRef = useRef<HTMLFormElement>(null);
  const orderRequestSeq = useRef(0);
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCheckoutOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [checkoutOpen]);

  const pollOrderOnce = useCallback(async (orderId: string): Promise<PaymentOrder | null> => {
    const response = await fetch(`/api/payments/orders/${encodeURIComponent(orderId)}`, {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => ({})) as { order?: PaymentOrder };
    return payload.order ?? null;
  }, []);

  useEffect(() => {
    if (!checkoutOpen || !paymentOrder || paymentOrder.status !== "pending") return;
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      const updated = await pollOrderOnce(paymentOrder.id);
      if (cancelled || !updated) return;
      setPaymentOrder(updated);
      if (updated.status === "paid") {
        setManualCheckHint("");
        window.dispatchEvent(new Event("labellab-account-changed"));
        return;
      }
      if (updated.status === "pending") {
        timer = window.setTimeout(poll, 3000);
      }
    };
    timer = window.setTimeout(poll, 3000);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [checkoutOpen, paymentOrder, pollOrderOnce]);

  useEffect(() => {
    if (!checkoutOpen || !paymentOrder || paymentOrder.status !== "pending") return;
    const interval = window.setInterval(() => setClockMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [checkoutOpen, paymentOrder]);

  useEffect(() => {
    let active = true;
    void fetch("/api/site/config", { cache: "no-store" })
      .then(async (res) => res.ok ? await res.json() as { coinPackages?: CoinPackage[] } : null)
      .then((payload) => {
        if (!active || !Array.isArray(payload?.coinPackages) || payload.coinPackages.length === 0) return;
        setPackages(payload.coinPackages);
        setSelectedCoins((curr) => payload.coinPackages!.some((p) => p.coins === curr) ? curr : payload.coinPackages![0].coins);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const selectedPackage = packages.find((item) => item.coins === selectedCoins) ?? packages[0] ?? COIN_PACKAGES[0];
  const selectedPrice = prices.format(regionId === "vietnam" ? selectedPackage.vnd : selectedPackage.usd);

  const createPaymentOrder = useCallback(async (coinsToBuy: number) => {
    if (regionId !== "vietnam") return;
    if (!user) {
      setCheckoutOpen(false);
      openAuth("login");
      return;
    }
    const seq = ++orderRequestSeq.current;
    setPaymentState("loading");
    setPaymentError("");
    setManualCheckHint("");
    setDirectQr(null);
    setCheckout(null);
    setPaymentOrder(null);
    setQrLoaded(false);
    setQrImageError(false);
    try {
      const response = await fetch("/api/payments/orders", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coins: coinsToBuy }),
      });
      const payload = await response.json().catch(() => ({})) as {
        mode?: "direct_qr" | "gateway";
        qr?: DirectQr | null;
        checkout?: Checkout | null;
        order?: PaymentOrder;
        error?: string;
      };
      if (seq !== orderRequestSeq.current) return;
      if (!response.ok || (!payload.qr && !payload.checkout)) {
        if (response.status === 403) throw new Error("Bạn cần đăng nhập trước khi nạp coin.");
        if (payload.error === "PAYMENT_NOT_CONFIGURED") throw new Error("Cổng thanh toán SePay chưa được cấu hình trên máy chủ.");
        if (payload.error === "PAYMENT_ENV_MISMATCH") throw new Error("Cấu hình môi trường SePay (Sandbox/Production) chưa khớp với khóa merchant.");
        if (payload.error === "PAYMENT_PUBLIC_URL_REQUIRED") throw new Error("Cần cấu hình URL HTTPS công khai để SePay gọi IPN.");
        throw new Error("Không thể tạo đơn thanh toán. Vui lòng thử lại.");
      }
      setDirectQr(payload.qr ?? null);
      setCheckout(payload.checkout ?? null);
      setPaymentOrder(payload.order ?? null);
      setClockMs(Date.now());
      setPaymentState("ready");
    } catch (error) {
      if (seq !== orderRequestSeq.current) return;
      setPaymentState("error");
      setPaymentError(error instanceof Error ? error.message : "Không thể tạo đơn thanh toán.");
    }
  }, [openAuth, regionId, user]);

  function submitCheckout() {
    if (!checkout || !checkoutFormRef.current) return;
    checkoutFormRef.current.submit();
  }

  async function copyText(key: "account" | "content", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((curr) => (curr === key ? null : curr)), 1800);
    } catch {
      // Ignore clipboard permission errors on restricted contexts.
    }
  }

  async function checkPaymentNow() {
    if (!paymentOrder || checkingNow) return;
    setCheckingNow(true);
    setManualCheckHint("");
    try {
      const updated = await pollOrderOnce(paymentOrder.id);
      if (updated) {
        setPaymentOrder(updated);
        if (updated.status === "paid") {
          window.dispatchEvent(new Event("labellab-account-changed"));
        } else if (updated.status === "pending") {
          setManualCheckHint("Hệ thống chưa nhận được giao dịch — coin sẽ tự cộng sau vài giây khi chuyển khoản xong.");
        }
      }
    } finally {
      setCheckingNow(false);
    }
  }

  const expiresAtMs = paymentOrder ? Date.parse(paymentOrder.expiresAt) : NaN;
  const remainingMs = checkoutOpen && paymentOrder?.status === "pending" && Number.isFinite(expiresAtMs) && clockMs > 0
    ? Math.max(0, expiresAtMs - clockMs)
    : null;
  const isExpired = paymentOrder?.status === "expired" || (remainingMs !== null && remainingMs <= 0 && paymentOrder?.status === "pending");
  const isPaid = paymentOrder?.status === "paid";
  const isDirectQr = Boolean(directQr);
  const isSandbox = Boolean(checkout?.action.includes("pay-sandbox.sepay.vn"));

  const statusText = isPaid
    ? "Đã thanh toán · đã cộng coin"
    : isExpired
      ? "Đơn đã hết hạn"
      : paymentState === "loading"
        ? "Đang tạo mã QR…"
        : paymentState === "ready"
          ? "Chờ chuyển khoản · tự động cộng coin"
          : "Chưa tạo đơn";

  const statusClass = isPaid
    ? styles.statusPaid
    : isExpired
      ? styles.statusExpired
      : styles.demoStatus;

  const checkoutModal = checkoutOpen && typeof document !== "undefined"
    ? createPortal(
      <div
        className={styles.overlay}
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setCheckoutOpen(false);
        }}
      >
        <section
          className={styles.checkout}
          role="dialog"
          aria-modal="true"
          aria-labelledby="coin-checkout-title"
          aria-describedby="coin-checkout-description"
        >
          <button
            ref={closeButtonRef}
            className={styles.close}
            type="button"
            aria-label="Close top-up panel"
            onClick={() => setCheckoutOpen(false)}
          >
            ×
          </button>
          <div className={styles.checkoutHeader}>
            <div>
              <span className={styles.eyebrow}>Nạp coin nội địa</span>
              <h3 id="coin-checkout-title">Nạp {selectedPackage.coins} coins</h3>
              <p id="coin-checkout-description">
                {isDirectQr
                  ? "Quét mã VietQR bằng app ngân hàng — coin tự cộng ngay sau khi chuyển khoản"
                  : isSandbox
                    ? "Thanh toán QR VietQR qua SePay (Test Mode)"
                    : "Thanh toán QR VietQR qua SePay"}
              </p>
            </div>
            <Image src="/branding/LLCoin.svg" alt="" width={46} height={46} unoptimized />
          </div>
          <div className={styles.checkoutGrid}>
            <div className={styles.qrWrap}>
              {directQr && !qrImageError ? (
                <div className={styles.qrFrame}>
                  {!qrLoaded && <div className={styles.qrSkeleton} aria-hidden="true">Đang tải QR…</div>}
                  <Image
                    src={directQr.imageUrl}
                    alt={`Mã QR thanh toán ${selectedPackage.coins} coins qua ${directQr.bankName}`}
                    width={204}
                    height={204}
                    unoptimized
                    className={`${styles.qrImage} ${qrLoaded ? styles.qrImageReady : ""}`}
                    onLoad={() => setQrLoaded(true)}
                    onError={() => setQrImageError(true)}
                  />
                  {isPaid && (
                    <div className={styles.qrOverlayPaid} aria-label="Đã thanh toán thành công">
                      <CheckCircle2 size={44} aria-hidden="true" />
                      <span>Đã cộng coin</span>
                    </div>
                  )}
                  {isExpired && !isPaid && (
                    <div className={styles.qrOverlayExpired} aria-label="Mã QR đã hết hạn">
                      <span>Mã đã hết hạn</span>
                    </div>
                  )}
                </div>
              ) : paymentState === "loading" ? (
                <div className={styles.qrFrame}>
                  <div className={styles.qrSkeleton}>Đang tạo mã QR…</div>
                </div>
              ) : (
                <div className={styles.demoQr} aria-label="Khu vực QR thanh toán SePay">
                  <span>VIETQR</span>
                  <b>QR</b>
                </div>
              )}
              <strong>
                {isPaid
                  ? "Thanh toán thành công!"
                  : isDirectQr
                    ? `VietQR · ${directQr?.bankName}`
                    : user
                      ? "QR thanh toán SePay"
                      : "Đăng nhập để hiện QR"}
              </strong>
              <small>
                {isPaid
                  ? "Số dư coin đã được cập nhật vào tài khoản."
                  : isDirectQr && remainingMs !== null && !isExpired
                    ? `Quét trực tiếp bằng app ngân hàng · Hết hạn sau ${formatCountdown(remainingMs)}`
                    : isDirectQr && isExpired
                      ? "Bấm Tạo mã QR mới nếu bạn chưa chuyển khoản."
                      : "Chỉ ghi nhận coin sau khi webhook SePay xác nhận thanh toán."}
              </small>
            </div>
            <dl className={styles.summary}>
              <div><dt>Gói coin</dt><dd>{selectedPackage.coins} coins</dd></div>
              <div><dt>Số tiền</dt><dd>{selectedPrice}</dd></div>
              {directQr ? (
                <>
                  <div><dt>Ngân hàng</dt><dd>{directQr.bankName}</dd></div>
                  <div>
                    <dt>Số tài khoản</dt>
                    <dd className={styles.copyCell}>
                      <span className={styles.monoValue}>{directQr.accountNumber}</span>
                      <button
                        type="button"
                        className={styles.copyBtn}
                        aria-label="Sao chép số tài khoản"
                        onClick={() => void copyText("account", directQr.accountNumber)}
                      >
                        {copiedKey === "account" ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                        <span>{copiedKey === "account" ? "Đã chép" : "Chép"}</span>
                      </button>
                    </dd>
                  </div>
                  {directQr.accountOwner && (
                    <div><dt>Chủ tài khoản</dt><dd>{directQr.accountOwner}</dd></div>
                  )}
                  <div>
                    <dt>Nội dung CK</dt>
                    <dd className={styles.copyCell}>
                      <span className={styles.orderCode}>{directQr.transferContent}</span>
                      <button
                        type="button"
                        className={styles.copyBtn}
                        aria-label="Sao chép nội dung chuyển khoản"
                        onClick={() => void copyText("content", directQr.transferContent)}
                      >
                        {copiedKey === "content" ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                        <span>{copiedKey === "content" ? "Đã chép" : "Chép"}</span>
                      </button>
                    </dd>
                  </div>
                </>
              ) : (
                <>
                  <div><dt>Phương thức</dt><dd>Quét QR ngân hàng</dd></div>
                  {paymentOrder?.orderCode && <div><dt>Mã đơn</dt><dd className={styles.orderCode}>{paymentOrder.orderCode}</dd></div>}
                </>
              )}
              <div><dt>Trạng thái</dt><dd><span className={statusClass}>{statusText}</span></dd></div>
            </dl>
          </div>
          {paymentState === "error" && <p className={styles.paymentError} role="alert">{paymentError}</p>}
          {manualCheckHint && !isPaid && <p className={styles.checkHint} role="status">{manualCheckHint}</p>}
          <div className={styles.paymentAction}>
            {isDirectQr && paymentState === "ready" && !isExpired && !isPaid && directQr ? (
              <>
                <a
                  href={directQr.downloadUrl}
                  download={`vietqr-${directQr.transferContent}.png`}
                  className={styles.secondaryButton}
                >
                  <Download size={16} aria-hidden="true" />
                  <span>Tải ảnh QR</span>
                </a>
                <button
                  type="button"
                  className={styles.payButton}
                  onClick={() => void checkPaymentNow()}
                  disabled={checkingNow}
                >
                  <RefreshCw size={16} className={checkingNow ? styles.spin : undefined} aria-hidden="true" />
                  <span>{checkingNow ? "Đang kiểm tra…" : "Tôi đã chuyển khoản"}</span>
                </button>
              </>
            ) : isPaid ? (
              <button
                type="button"
                className={styles.payButtonPaid}
                onClick={() => setCheckoutOpen(false)}
              >
                <CheckCircle2 size={18} aria-hidden="true" />
                <span>Đã cộng {selectedPackage.coins} coins · Đóng</span>
              </button>
            ) : (
              <button
                type="button"
                className={styles.payButton}
                onClick={checkout && paymentState === "ready" && !isExpired ? submitCheckout : () => void createPaymentOrder(selectedPackage.coins)}
                disabled={paymentState === "loading"}
              >
                {paymentState === "loading"
                  ? "Đang tạo mã QR…"
                  : isExpired
                    ? "Tạo mã QR mới"
                    : checkout && paymentState === "ready"
                      ? "Mở QR thanh toán"
                      : user
                        ? "Tạo mã QR thanh toán"
                        : "Đăng nhập để nạp coin"}
              </button>
            )}
            {paymentState === "ready" && checkout && (
              <form
                ref={checkoutFormRef}
                method={checkout.method}
                action={checkout.action}
                target="_blank"
                className={styles.hiddenForm}
                aria-hidden="true"
              >
                {Object.entries(checkout.fields).map(([key, value]) => (
                  <input key={key} type="hidden" name={key} value={value} />
                ))}
              </form>
            )}
          </div>
          <div className={styles.notice}>
            <strong>Chính sách giao dịch</strong>
            <p>Coin là credit nội bộ, không quy đổi tiền mặt, không chuyển nhượng. Vui lòng giữ nguyên số tiền và nội dung chuyển khoản để hệ thống cộng coin tự động.</p>
            <div>
              <Link href="/legal/terms">Điều khoản</Link>
              <Link href="/legal/refund">Hoàn tiền</Link>
              <Link href="/legal/privacy">Bảo mật</Link>
            </div>
          </div>
        </section>
      </div>,
      document.body,
    )
    : null;

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
        {packages.map((item) => {
          const price = prices.format(regionId === "vietnam" ? item.vnd : item.usd);
          return (
            <button
              key={item.coins}
              className={styles.pack}
              type="button"
              aria-pressed={selectedCoins === item.coins}
              aria-label={`${item.coins} coins, ${price}`}
              onClick={() => {
                setSelectedCoins(item.coins);
                setCheckoutOpen(true);
                if (user) {
                  void createPaymentOrder(item.coins);
                } else {
                  orderRequestSeq.current += 1;
                  setPaymentState("idle");
                  setDirectQr(null);
                  setCheckout(null);
                  setPaymentOrder(null);
                  setPaymentError("");
                  setManualCheckHint("");
                }
              }}
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

      {checkoutModal}
    </article>
  );
}
