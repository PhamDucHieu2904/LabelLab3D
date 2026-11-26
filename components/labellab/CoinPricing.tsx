"use client";

import Image from "next/image";
import Link from "next/link";
import { Check, CheckCircle2, Copy, CreditCard, Download, ExternalLink, Globe, Landmark, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { numberLocale } from "@/lib/i18n/locale";
import { COIN_PACKAGES, getCoinPackagesByRegion, type CoinPackage, type CoinRegion } from "@/lib/payments/packages";
import { useAccount, useAuthDialog } from "./AuthDialog";
import { useLocale } from "./LocaleProvider";
import styles from "./CoinPricing.module.css";

const regions = [
  { id: "vietnam", currency: "VND", locale: "vi-VN" },
  { id: "international", currency: "USD", locale: "en-US" },
] as const;

type RegionId = CoinRegion;
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
type PolarCheckout = {
  checkoutId: string;
  url: string;
  sandbox: boolean;
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
  const { locale, t } = useLocale();
  const p = t.pricing;
  const numLocale = numberLocale(locale);
  const { user } = useAccount();
  const openAuth = useAuthDialog();
  const [regionId, setRegionId] = useState<RegionId>("vietnam");
  const [allowRegionSwitch, setAllowRegionSwitch] = useState(false);
  const [packages, setPackages] = useState<readonly CoinPackage[]>(COIN_PACKAGES);
  const [intlReady, setIntlReady] = useState(false);
  const [intlSandbox, setIntlSandbox] = useState(false);
  const [selectedPackId, setSelectedPackId] = useState<string>("vn-pro");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paymentState, setPaymentState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [paymentError, setPaymentError] = useState("");
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [directQr, setDirectQr] = useState<DirectQr | null>(null);
  const [polarCheckout, setPolarCheckout] = useState<PolarCheckout | null>(null);
  const [qrLoaded, setQrLoaded] = useState(false);
  const [qrImageError, setQrImageError] = useState(false);
  const [paymentOrder, setPaymentOrder] = useState<PaymentOrder | null>(null);
  const [clockMs, setClockMs] = useState(0);
  const [copiedKey, setCopiedKey] = useState<"account" | "content" | null>(null);
  const [manualCheckHint, setManualCheckHint] = useState("");
  const [checkingNow, setCheckingNow] = useState(false);
  const [intlMethod, setIntlMethod] = useState<"gpay" | "card" | "bank">("card");
  const [embedOpening, setEmbedOpening] = useState(false);
  const [embedConfirmed, setEmbedConfirmed] = useState(false);
  const [receiptForm, setReceiptForm] = useState({ buyerName: "", taxCode: "", address: "", email: "" });
  const [receiptSaving, setReceiptSaving] = useState(false);
  const [receiptFeedback, setReceiptFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const checkoutFormRef = useRef<HTMLFormElement>(null);
  const embedInstanceRef = useRef<{ close: () => void } | null>(null);
  const orderRequestSeq = useRef(0);
  const region = regions.find((item) => item.id === regionId)!;
  const regionLabel = regionId === "international" ? p.regionInternational : p.regionVietnam;
  const prices = new Intl.NumberFormat(region.locale, {
    style: "currency",
    currency: region.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: region.currency === "USD" ? 2 : 0,
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
    const syncConfig = () => {
      void import("@/lib/client/api-cache")
        .then(({ fetchSiteConfigCached }) => fetchSiteConfigCached<{
          coinPackages?: CoinPackage[];
          visitor?: {
            region?: RegionId;
            allowRegionSwitch?: boolean;
          };
          payments?: { internationalEnabled?: boolean; internationalSandbox?: boolean };
        }>())
        .then((payload) => {
          if (!active || !payload) return;
          const nextPackages = Array.isArray(payload.coinPackages) && payload.coinPackages.length > 0
            ? payload.coinPackages
            : COIN_PACKAGES;
          if (Array.isArray(payload.coinPackages) && payload.coinPackages.length > 0) {
            setPackages(payload.coinPackages);
          }
          if (payload.visitor) {
            const canSwitch = Boolean(payload.visitor.allowRegionSwitch);
            setAllowRegionSwitch(canSwitch);
            const enforcedRegion: RegionId = payload.visitor.region === "international" ? "international" : "vietnam";
            if (!canSwitch) {
              setRegionId(enforcedRegion);
              const targetPacks = getCoinPackagesByRegion(nextPackages, enforcedRegion);
              const preferred = targetPacks.find((item) => item.badge === "popular") ?? targetPacks[0];
              if (preferred) setSelectedPackId(preferred.id);
            }
          }
          if (payload.payments) {
            setIntlReady(Boolean(payload.payments.internationalEnabled));
            setIntlSandbox(Boolean(payload.payments.internationalSandbox));
          }
        })
        .catch(() => undefined);
    };
    syncConfig();
    window.addEventListener("labellab-account-changed", syncConfig);
    return () => {
      active = false;
      window.removeEventListener("labellab-account-changed", syncConfig);
    };
  }, []);

  const regionalPackages = getCoinPackagesByRegion(packages, regionId);
  const fallbackRegionPackages = getCoinPackagesByRegion(COIN_PACKAGES, regionId);
  const visiblePackages = regionalPackages.length > 0 ? regionalPackages : fallbackRegionPackages;
  const selectedPackage =
    visiblePackages.find((item) => item.id === selectedPackId)
    ?? visiblePackages.find((item) => item.badge === "popular")
    ?? visiblePackages[0]
    ?? fallbackRegionPackages[0];
  const selectedPrice = prices.format(regionId === "vietnam" ? selectedPackage.vnd : selectedPackage.usd);
  const selectedCoinsText = selectedPackage.coins.toLocaleString(numLocale);
  const minFiveCoinValue = (() => {
    const rates = visiblePackages
      .filter((item) => item.coins > 0)
      .map((item) => ((regionId === "vietnam" ? item.vnd : item.usd) / item.coins) * 5)
      .filter((value) => Number.isFinite(value) && value > 0);
    const lowest = rates.length > 0 ? Math.min(...rates) : (regionId === "vietnam" ? 250 : 0.03);
    if (regionId === "vietnam") {
      const rounded = Math.max(10, Math.round(lowest / 10) * 10);
      return rounded.toLocaleString(numLocale);
    }
    return `$${lowest.toFixed(2)}`;
  })();

  const createPaymentOrder = useCallback(async (pkg: CoinPackage, targetRegion: RegionId) => {
    if (!user) {
      setCheckoutOpen(false);
      openAuth("login");
      return;
    }
    const seq = ++orderRequestSeq.current;
    setPaymentState("loading");
    setPaymentError("");
    setManualCheckHint("");
    setReceiptFeedback(null);
    setDirectQr(null);
    setPolarCheckout(null);
    setCheckout(null);
    setPaymentOrder(null);
    setQrLoaded(false);
    setQrImageError(false);
    try {
      const response = await fetch("/api/payments/orders", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId: pkg.id, coins: pkg.coins, region: targetRegion }),
      });
      const payload = await response.json().catch(() => ({})) as {
        mode?: "direct_qr" | "gateway" | "polar_checkout";
        qr?: DirectQr | null;
        polar?: PolarCheckout | null;
        checkout?: Checkout | null;
        order?: PaymentOrder;
        error?: string;
      };
      if (seq !== orderRequestSeq.current) return;
      if (!response.ok || (!payload.qr && !payload.polar && !payload.checkout)) {
        if (payload.error === "REGION_RESTRICTED") throw new Error(p.errRegionRestricted);
        if (response.status === 403) throw new Error(p.errSignInRequired);
        if (payload.error === "PAYMENT_NOT_CONFIGURED") {
          throw new Error(targetRegion === "international" ? p.errPolarNotConfigured : p.errSepayNotConfigured);
        }
        if (payload.error === "POLAR_CHECKOUT_FAILED") throw new Error(p.errPolarFailed);
        if (payload.error === "PAYMENT_ENV_MISMATCH") throw new Error(p.errSepayMismatch);
        if (payload.error === "PAYMENT_PUBLIC_URL_REQUIRED") throw new Error(p.errPublicUrlRequired);
        throw new Error(p.errCreateOrderFailed);
      }
      setDirectQr(payload.qr ?? null);
      setPolarCheckout(payload.polar ?? null);
      setCheckout(payload.checkout ?? null);
      setPaymentOrder(payload.order ?? null);
      setClockMs(Date.now());
      setEmbedConfirmed(false);
      setPaymentState("ready");
    } catch (error) {
      if (seq !== orderRequestSeq.current) return;
      setPaymentState("error");
      setPaymentError(error instanceof Error ? error.message : p.errCreateOrderFailed);
    }
  }, [openAuth, p, user]);

  useEffect(() => {
    return () => {
      embedInstanceRef.current?.close();
      embedInstanceRef.current = null;
    };
  }, []);

  const openPolarEmbeddedCheckout = useCallback(async (url: string, orderId?: string) => {
    if (embedOpening) return;
    setEmbedOpening(true);
    setPaymentError("");
    setManualCheckHint("");
    try {
      embedInstanceRef.current?.close();
      const { PolarEmbedCheckout } = await import("@polar-sh/checkout/embed");
      const embed = await PolarEmbedCheckout.create(url, { theme: "light" });
      embedInstanceRef.current = embed;
      setEmbedOpening(false);

      embed.addEventListener("confirmed", () => {
        setEmbedConfirmed(true);
      });

      embed.addEventListener("success", (event) => {
        event.preventDefault();
        setEmbedConfirmed(true);
        embed.close();
        embedInstanceRef.current = null;
        if (orderId) {
          void (async () => {
            for (let attempt = 0; attempt < 12; attempt += 1) {
              const updated = await pollOrderOnce(orderId);
              if (updated) {
                setPaymentOrder(updated);
                if (updated.status === "paid") {
                  setEmbedConfirmed(false);
                  window.dispatchEvent(new Event("labellab-account-changed"));
                  return;
                }
              }
              await new Promise((r) => window.setTimeout(r, 1500));
            }
            setEmbedConfirmed(false);
          })();
        }
      });

      embed.addEventListener("close", () => {
        embedInstanceRef.current = null;
        setEmbedOpening(false);
      });
    } catch {
      setEmbedOpening(false);
      setPaymentError(p.errEmbedOpenFailed);
    }
  }, [embedOpening, p.errEmbedOpenFailed, pollOrderOnce]);

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

  async function saveReceiptDetails() {
    if (!paymentOrder || receiptSaving) return;
    setReceiptSaving(true);
    setReceiptFeedback(null);
    try {
      const response = await fetch(`/api/payments/orders/${encodeURIComponent(paymentOrder.id)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receipt: receiptForm }),
      });
      if (!response.ok) {
        throw new Error(p.receiptInvalid);
      }
      setReceiptFeedback({ ok: true, text: p.receiptSaved });
    } catch (error) {
      setReceiptFeedback({
        ok: false,
        text: error instanceof Error ? error.message : p.receiptSaveFailed,
      });
    } finally {
      setReceiptSaving(false);
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
          setManualCheckHint(regionId === "international" ? p.hintPendingPolar : p.hintPendingSepay);
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
  const isPolar = regionId === "international" || Boolean(polarCheckout);
  const isSandbox = Boolean(checkout?.action.includes("pay-sandbox.sepay.vn") || polarCheckout?.sandbox || (isPolar && intlSandbox));

  const statusText = isPaid
    ? p.statusPaid
    : embedConfirmed
      ? p.statusConfirming
      : isExpired
        ? p.statusExpired
        : paymentState === "loading"
          ? (isPolar ? p.statusLoadingPolar : p.statusLoadingSepay)
          : paymentState === "ready"
            ? (isPolar ? p.statusReadyPolar : p.statusReadySepay)
            : (isPolar ? p.statusIdlePolar : p.statusIdleSepay);

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
            aria-label={p.closeCheckoutAria}
            onClick={() => setCheckoutOpen(false)}
          >
            ×
          </button>
          <div className={styles.checkoutHeader}>
            <div>
              <span className={styles.eyebrow}>{isPolar ? p.eyebrowPolar : p.eyebrowSepay}</span>
              <h3 id="coin-checkout-title">{p.checkoutTitle(selectedCoinsText)}</h3>
              <p id="coin-checkout-description">
                {isPolar
                  ? p.descPolar(isSandbox)
                  : isDirectQr
                    ? p.descSepayQr
                    : p.descSepayGateway(isSandbox)}
              </p>
            </div>
            <Image src="/branding/hypermockup-coin.svg" alt="" width={46} height={46} unoptimized />
          </div>

          <div className={styles.checkoutGrid}>
            <div className={styles.qrWrap}>
              {isPolar ? (
                <>
                  <div className={styles.polarCard}>
                    <div className={styles.polarIconWrap}>
                      {isPaid ? <CheckCircle2 size={34} aria-hidden="true" /> : <CreditCard size={30} aria-hidden="true" />}
                    </div>
                    <strong className={styles.polarBrand}>{p.chooseMethod}</strong>
                    <div className={styles.polarMethodGrid} role="group" aria-label={p.paymentMethodAria}>
                      {([
                        { id: "gpay", label: p.methodGpay, Icon: Smartphone },
                        { id: "card", label: p.methodCard, Icon: CreditCard },
                        { id: "bank", label: p.methodBank, Icon: Landmark },
                      ] as const).map(({ id, label, Icon }) => (
                        <button
                          key={id}
                          type="button"
                          className={`${styles.polarMethodBtn} ${intlMethod === id ? styles.polarMethodActive : ""}`}
                          aria-pressed={intlMethod === id}
                          disabled={isPaid || paymentState === "loading" || embedOpening}
                          onClick={() => {
                            setIntlMethod(id);
                            if (polarCheckout && !isExpired && !isPaid) {
                              void openPolarEmbeddedCheckout(polarCheckout.url, paymentOrder?.id);
                            }
                          }}
                        >
                          <Icon size={16} aria-hidden="true" />
                          <span>{label}</span>
                        </button>
                      ))}
                    </div>
                    <span className={styles.polarSafe}><ShieldCheck size={13} aria-hidden="true" /> {p.polarSafe}</span>
                  </div>
                  <strong>{isPaid ? p.polarTitlePaid : isSandbox ? p.polarTitleSandbox : p.polarTitleReady}</strong>
                  <small>
                    {isPaid
                      ? p.polarSubPaid
                      : remainingMs !== null && !isExpired
                        ? p.polarSubCountdown(formatCountdown(remainingMs))
                        : p.polarSubHint}
                  </small>
                </>
              ) : directQr && !qrImageError ? (
                <>
                  <div className={styles.qrFrame}>
                    {!qrLoaded && <div className={styles.qrSkeleton} aria-hidden="true">{p.qrLoading}</div>}
                    <Image
                      src={directQr.imageUrl}
                      alt={p.qrAlt(selectedPackage.coins, directQr.bankName)}
                      width={204}
                      height={204}
                      unoptimized
                      className={`${styles.qrImage} ${qrLoaded ? styles.qrImageReady : ""}`}
                      onLoad={() => setQrLoaded(true)}
                      onError={() => setQrImageError(true)}
                    />
                    {isPaid && (
                      <div className={styles.qrOverlayPaid} aria-label={p.qrPaidAria}>
                        <CheckCircle2 size={44} aria-hidden="true" />
                        <span>{p.qrPaidLabel}</span>
                      </div>
                    )}
                    {isExpired && !isPaid && (
                      <div className={styles.qrOverlayExpired} aria-label={p.qrExpiredAria}>
                        <span>{p.qrExpiredLabel}</span>
                      </div>
                    )}
                  </div>
                  <strong>{isPaid ? p.qrSuccessTitle : `VietQR · ${directQr.bankName}`}</strong>
                  <small>
                    {isPaid
                      ? p.qrSuccessSub
                      : remainingMs !== null && !isExpired
                        ? p.qrCountdownSub(formatCountdown(remainingMs))
                        : isExpired
                          ? p.qrExpiredSub
                          : p.qrWebhookSub}
                  </small>
                </>
              ) : paymentState === "loading" ? (
                <>
                  <div className={styles.qrFrame}>
                    <div className={styles.qrSkeleton}>{p.qrCreating}</div>
                  </div>
                  <strong>{p.qrSepayTitle}</strong>
                  <small>{p.qrInitializingSub}</small>
                </>
              ) : (
                <>
                  <div className={styles.demoQr} aria-label={p.qrAreaAria}>
                    <span>VIETQR</span>
                    <b>QR</b>
                  </div>
                  <strong>{user ? p.qrSepayTitle : p.qrSignInTitle}</strong>
                  <small>{p.qrWebhookSub}</small>
                </>
              )}
            </div>

            <dl className={styles.summary}>
              <div>
                <dt>{p.summaryPack}</dt>
                <dd>
                  {selectedCoinsText} coins
                  {selectedPackage.bonusPct ? ` (+${selectedPackage.bonusPct}%)` : ""}
                </dd>
              </div>
              <div><dt>{p.summaryPrice}</dt><dd>{selectedPrice}</dd></div>
              {isPolar ? (
                <>
                  <div><dt>{p.summaryProvider}</dt><dd><Globe size={14} style={{ verticalAlign: "-2px", marginRight: 5 }} aria-hidden="true" />Polar.sh (USD)</dd></div>
                  <div><dt>{p.summaryMethods}</dt><dd>{p.summaryMethodsValue}</dd></div>
                  {paymentOrder?.orderCode && (
                    <div><dt>{p.summaryOrderId}</dt><dd className={styles.orderCode}>{paymentOrder.orderCode}</dd></div>
                  )}
                </>
              ) : directQr ? (
                <>
                  <div><dt>{p.summaryBank}</dt><dd>{directQr.bankName}</dd></div>
                  <div>
                    <dt>{p.summaryAccountNo}</dt>
                    <dd className={styles.copyCell}>
                      <span className={styles.monoValue}>{directQr.accountNumber}</span>
                      <button
                        type="button"
                        className={styles.copyBtn}
                        aria-label={p.copyAccountAria}
                        onClick={() => void copyText("account", directQr.accountNumber)}
                      >
                        {copiedKey === "account" ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                        <span>{copiedKey === "account" ? p.copied : p.copy}</span>
                      </button>
                    </dd>
                  </div>
                  {directQr.accountOwner && (
                    <div><dt>{p.summaryAccountOwner}</dt><dd>{directQr.accountOwner}</dd></div>
                  )}
                  <div>
                    <dt>{p.summaryTransferContent}</dt>
                    <dd className={styles.copyCell}>
                      <span className={styles.orderCode}>{directQr.transferContent}</span>
                      <button
                        type="button"
                        className={styles.copyBtn}
                        aria-label={p.copyContentAria}
                        onClick={() => void copyText("content", directQr.transferContent)}
                      >
                        {copiedKey === "content" ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                        <span>{copiedKey === "content" ? p.copied : p.copy}</span>
                      </button>
                    </dd>
                  </div>
                </>
              ) : (
                <>
                  <div><dt>{p.summaryMethod}</dt><dd>{p.summaryMethodQr}</dd></div>
                  {paymentOrder?.orderCode && <div><dt>{p.summaryOrderId}</dt><dd className={styles.orderCode}>{paymentOrder.orderCode}</dd></div>}
                </>
              )}
              <div><dt>{p.summaryStatus}</dt><dd><span className={statusClass}>{statusText}</span></dd></div>
            </dl>
          </div>

          {paymentState === "error" && <p className={styles.paymentError} role="alert">{paymentError}</p>}
          {manualCheckHint && !isPaid && <p className={styles.checkHint} role="status">{manualCheckHint}</p>}

          <div className={styles.paymentAction}>
            {isPaid ? (
              <button
                type="button"
                className={styles.payButtonPaid}
                onClick={() => setCheckoutOpen(false)}
              >
                <CheckCircle2 size={18} aria-hidden="true" />
                <span>{p.actionPaidClose(selectedCoinsText)}</span>
              </button>
            ) : isPolar && polarCheckout && paymentState === "ready" && !isExpired ? (
              <>
                <button
                  type="button"
                  className={styles.payButton}
                  disabled={embedOpening}
                  onClick={() => void openPolarEmbeddedCheckout(polarCheckout.url, paymentOrder?.id)}
                >
                  <CreditCard size={16} aria-hidden="true" />
                  <span>{embedOpening ? p.actionOpeningCheckout : p.actionPayNow(selectedPrice)}</span>
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => void checkPaymentNow()}
                  disabled={checkingNow}
                >
                  <RefreshCw size={15} className={checkingNow ? styles.spin : undefined} aria-hidden="true" />
                  <span>{checkingNow ? p.actionChecking : p.actionCheckStatus}</span>
                </button>
                <a
                  href={polarCheckout.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.fallbackLink}
                >
                  <span>{p.actionOpenNewTab}</span>
                  <ExternalLink size={13} aria-hidden="true" />
                </a>
              </>
            ) : isDirectQr && paymentState === "ready" && !isExpired && directQr ? (
              <>
                <a
                  href={directQr.downloadUrl}
                  download={`vietqr-${directQr.transferContent}.png`}
                  className={styles.secondaryButton}
                >
                  <Download size={16} aria-hidden="true" />
                  <span>{p.actionDownloadQr}</span>
                </a>
                <button
                  type="button"
                  className={styles.payButton}
                  onClick={() => void checkPaymentNow()}
                  disabled={checkingNow}
                >
                  <RefreshCw size={16} className={checkingNow ? styles.spin : undefined} aria-hidden="true" />
                  <span>{checkingNow ? p.actionChecking : p.actionTransferred}</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                className={styles.payButton}
                onClick={checkout && paymentState === "ready" && !isExpired ? submitCheckout : () => void createPaymentOrder(selectedPackage, regionId)}
                disabled={paymentState === "loading"}
              >
                {paymentState === "loading"
                  ? (isPolar ? p.actionPreparingCheckout : p.qrCreating)
                  : isExpired
                    ? (isPolar ? p.actionNewCheckout : p.actionNewQr)
                    : checkout && paymentState === "ready"
                      ? p.actionOpenQr
                      : user
                        ? (isPolar ? p.actionContinuePolar(selectedPrice) : p.actionCreateQr)
                        : p.actionSignInToBuy}
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

          {!isPolar && paymentOrder && (
            <details className={styles.receiptBox}>
              <summary>{p.receiptSummary}</summary>
              <div className={styles.receiptGrid}>
                <input
                  type="text"
                  placeholder={p.receiptBuyerPlaceholder}
                  value={receiptForm.buyerName}
                  onChange={(e) => { setReceiptForm((prev) => ({ ...prev, buyerName: e.target.value })); setReceiptFeedback(null); }}
                />
                <input
                  type="text"
                  placeholder={p.receiptTaxPlaceholder}
                  value={receiptForm.taxCode}
                  onChange={(e) => { setReceiptForm((prev) => ({ ...prev, taxCode: e.target.value })); setReceiptFeedback(null); }}
                />
                <input
                  type="email"
                  placeholder={p.receiptEmailPlaceholder}
                  value={receiptForm.email}
                  onChange={(e) => { setReceiptForm((prev) => ({ ...prev, email: e.target.value })); setReceiptFeedback(null); }}
                />
                <input
                  type="text"
                  placeholder={p.receiptAddressPlaceholder}
                  value={receiptForm.address}
                  onChange={(e) => { setReceiptForm((prev) => ({ ...prev, address: e.target.value })); setReceiptFeedback(null); }}
                />
              </div>
              <div className={styles.receiptActions}>
                <span className={receiptFeedback ? (receiptFeedback.ok ? styles.receiptStatus : styles.receiptError) : styles.marketCurrency}>
                  {receiptFeedback ? receiptFeedback.text : p.receiptHint}
                </span>
                <button
                  type="button"
                  className={styles.receiptSaveBtn}
                  disabled={receiptSaving}
                  onClick={() => void saveReceiptDetails()}
                >
                  {receiptSaving ? p.receiptSaving : p.receiptSave}
                </button>
              </div>
            </details>
          )}

          <div className={styles.notice}>
            <strong>{p.policyHeading}</strong>
            <p>{isPolar ? p.policyPolar : p.policySepay}</p>
            <div>
              <Link href={`/legal/terms?lang=${locale}`}>{p.linkTerms}</Link>
              <Link href={`/legal/refund?lang=${locale}`}>{p.linkRefund}</Link>
              <Link href={`/legal/privacy?lang=${locale}`}>{p.linkPrivacy}</Link>
              <Link href={`/legal/complaints?lang=${locale}`}>{p.linkComplaints}</Link>
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
          <h2 id="coin-pricing-title">{p.title}</h2>
          <p>{regionId === "international" ? p.subtitleInternational(minFiveCoinValue) : p.subtitleVietnam(minFiveCoinValue)}</p>
        </div>
        <Image className={styles.coinArt} src="/branding/hypermockup-coin.svg" alt="" width={56} height={56} />
      </div>

      {allowRegionSwitch ? (
        <div className={styles.markets} role="group" aria-label={p.regionSwitchAria}>
          {regions.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={regionId === item.id}
              onClick={() => {
                setRegionId(item.id);
                const nextPacks = getCoinPackagesByRegion(packages, item.id);
                const preferred = nextPacks.find((pack) => pack.badge === "popular") ?? nextPacks[0];
                if (preferred) setSelectedPackId(preferred.id);
              }}
            >
              <span className={styles.marketLabel}>
                {item.id === "international" ? p.regionInternational : p.regionVietnam}
              </span>
              <small className={styles.marketCurrency}>
                {item.id === "international" && !intlReady ? "USD" : item.currency}
              </small>
            </button>
          ))}
        </div>
      ) : (
        <div className={styles.marketSingle} aria-label={p.activeCurrencyAria}>
          <span>{regionId === "international" ? p.singleInternationalTitle : p.singleVietnamTitle}</span>
          {regionId === "international" && <small>{p.singleInternationalSub}</small>}
        </div>
      )}

      <div className={styles.packs} role="group" aria-label={p.packsAria(regionLabel)}>
        {visiblePackages.map((item) => {
          const price = prices.format(regionId === "vietnam" ? item.vnd : item.usd);
          const coinsText = item.coins.toLocaleString(numLocale);
          const isSelected = selectedPackage.id === item.id;
          const badgeLabel = item.badge === "popular"
            ? p.badgePopular(item.bonusPct ?? 10)
            : item.badge === "best"
              ? p.badgeBest(item.bonusPct ?? 20)
              : item.bonusPct
                ? p.badgeBonus(item.bonusPct)
                : p.badgeStarter;
          const badgeTone = item.badge === "popular"
            ? styles.badgePopular
            : item.badge === "best"
              ? styles.badgeBest
              : item.bonusPct
                ? styles.badgeBonus
                : styles.badgeStarter;
          return (
            <button
              key={item.id}
              className={`${styles.pack} ${item.badge === "popular" ? styles.packPopular : ""}`}
              type="button"
              aria-pressed={isSelected}
              aria-label={p.packAria(coinsText, item.bonusPct ?? 0, price)}
              onClick={() => {
                setSelectedPackId(item.id);
                setCheckoutOpen(true);
                if (user) {
                  void createPaymentOrder(item, regionId);
                } else {
                  orderRequestSeq.current += 1;
                  setPaymentState("idle");
                  setDirectQr(null);
                  setPolarCheckout(null);
                  setCheckout(null);
                  setPaymentOrder(null);
                  setPaymentError("");
                  setManualCheckHint("");
                }
              }}
            >
              <span className={`${styles.packBadge} ${badgeTone}`}>{badgeLabel}</span>
              <span className={styles.coinRow}>
                <Image src="/branding/hypermockup-coin.svg" alt="" width={18} height={18} />
                <strong>{coinsText}</strong>
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
