"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Bell,
  CalendarCheck2,
  Check,
  Gift,
  RefreshCw,
  Send,
  Sparkles,
  Users,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { formatDate, formatMoney, formatNumber } from "@/lib/admin/commerce";
import {
  DEFAULT_TOPUP_MULTIPLIER,
  resolveTopupCoins,
  TOPUP_MULTIPLIER_MAX,
  TOPUP_MULTIPLIER_MIN,
  type TopupMultiplierConfig,
} from "@/lib/promotions/topup-multiplier";
import ManagementPanel from "./ManagementPanel";
import { CoinValue } from "./OverviewPanel";
import s from "./AdminWorkspace.module.css";

type GiftEventRow = {
  id: string;
  actorName: string;
  actorEmail: string;
  title: string;
  body: string;
  coinsPerUser: number;
  recipientCount: number;
  totalCoinsDistributed: number;
  createdAt: string;
};

type LivePack = {
  id: string;
  region?: "vietnam" | "international";
  coins: number;
  vnd: number;
  usd: number;
  enabled: boolean;
};

type LaunchPromoMeta = {
  coins: number;
  startDate: string;
  endDate: string;
  maxClaimsPerIp: number | null;
};

type PromotionsTab = "multiplier" | "gift" | "checkin";

const QUICK_GIFT_AMOUNTS = [20, 50, 100, 200, 500];
const QUICK_MULTIPLIERS = [2, 3];

function ConfirmDialog({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
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
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const b = e.currentTarget.getBoundingClientRect();
          if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) {
            close();
          }
        }
      }}
    >
      <div className={s.modalHeader}>
        <h2 id={titleId}>{title}</h2>
        <button type="button" className={s.iconButton} aria-label="Đóng" onClick={close}>
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export default function PromotionsEventsPanel() {
  const [activeTab, setActiveTab] = useState<PromotionsTab>("multiplier");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [topupConfig, setTopupConfig] = useState<TopupMultiplierConfig>(DEFAULT_TOPUP_MULTIPLIER);
  const [draftEnabled, setDraftEnabled] = useState(false);
  const [draftMultiplier, setDraftMultiplier] = useState(2);
  const [draftLabel, setDraftLabel] = useState("");

  const [giftEvents, setGiftEvents] = useState<GiftEventRow[]>([]);
  const [activeUserCount, setActiveUserCount] = useState(0);
  const [coinPackages, setCoinPackages] = useState<LivePack[]>([]);
  const [launchPromo, setLaunchPromo] = useState<LaunchPromoMeta>({
    coins: 100,
    startDate: "2026-11-27",
    endDate: "2026-12-04",
    maxClaimsPerIp: null,
  });

  // Mass gift form state
  const [giftCoins, setGiftCoins] = useState("100");
  const [giftTitle, setGiftTitle] = useState("");
  const [giftBody, setGiftBody] = useState("");
  const [pendingGiftConfirm, setPendingGiftConfirm] = useState<{
    coins: number;
    title: string;
    body: string;
    idempotencyKey: string;
  } | null>(null);

  const announce = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice((curr) => (curr === msg ? "" : curr)), 5000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/promotions", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Không thể tải dữ liệu sự kiện từ Cloudflare D1.");
      const payload = (await response.json()) as {
        topupMultiplier?: TopupMultiplierConfig;
        giftEvents?: GiftEventRow[];
        activeUserCount?: number;
        coinPackages?: LivePack[];
        launchPromo?: LaunchPromoMeta;
      };
      if (payload.topupMultiplier) {
        setTopupConfig(payload.topupMultiplier);
        setDraftEnabled(payload.topupMultiplier.enabled);
        setDraftMultiplier(payload.topupMultiplier.multiplier);
        setDraftLabel(payload.topupMultiplier.label);
      }
      setGiftEvents(payload.giftEvents ?? []);
      setActiveUserCount(Number(payload.activeUserCount ?? 0));
      setCoinPackages(payload.coinPackages ?? []);
      if (payload.launchPromo) setLaunchPromo(payload.launchPromo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể tải dữ liệu sự kiện.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void load();
    });
    return () => cancelAnimationFrame(frame);
  }, [load]);

  async function saveMultiplier(nextEnabled: boolean, nextMultiplier: number, nextLabel: string) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/admin/promotions", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_topup_multiplier",
          enabled: nextEnabled,
          multiplier: nextMultiplier,
          label: nextLabel.trim(),
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        topupMultiplier?: TopupMultiplierConfig;
      } | null;
      if (!response.ok || !payload?.ok || !payload.topupMultiplier) {
        throw new Error(payload?.error ?? "Không thể lưu cấu hình nhân coin nạp.");
      }
      setTopupConfig(payload.topupMultiplier);
      setDraftEnabled(payload.topupMultiplier.enabled);
      setDraftMultiplier(payload.topupMultiplier.multiplier);
      setDraftLabel(payload.topupMultiplier.label);
      announce(
        payload.topupMultiplier.enabled
          ? `Đã BẬT sự kiện ×${payload.topupMultiplier.multiplier} Coin nạp trên toàn hệ thống!`
          : "Đã TẮT sự kiện nhân Coin nạp (các gói quay về 1× mặc định).",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể lưu cấu hình.");
    } finally {
      setSaving(false);
    }
  }

  function submitMultiplierForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const mult = Number(draftMultiplier);
    if (!Number.isSafeInteger(mult) || mult < TOPUP_MULTIPLIER_MIN || mult > TOPUP_MULTIPLIER_MAX) {
      setError(`Hệ số nhân phải là số nguyên từ ${TOPUP_MULTIPLIER_MIN} đến ${TOPUP_MULTIPLIER_MAX}.`);
      return;
    }
    void saveMultiplier(draftEnabled, mult, draftLabel);
  }

  function openGiftConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const coins = Number(giftCoins);
    const trimmedBody = giftBody.trim();
    const resolvedTitle =
      giftTitle.trim() ||
      `Quà tặng sự kiện +${Number.isSafeInteger(coins) && coins > 0 ? formatNumber(coins) : 0} Coin từ HyperMockup`;

    if (!Number.isSafeInteger(coins) || coins < 1 || coins > 100_000) {
      setError("Nhập số coin tặng là số nguyên dương từ 1 đến 100.000.");
      return;
    }
    if (trimmedBody.length < 2) {
      setError("Vui lòng nhập nội dung tặng xu hiển thị trong thông báo của người dùng.");
      return;
    }
    setPendingGiftConfirm({
      coins,
      title: resolvedTitle,
      body: trimmedBody,
      idempotencyKey: `evtgift_${crypto.randomUUID().replaceAll("-", "")}`,
    });
  }

  async function confirmSendMassGift() {
    if (!pendingGiftConfirm || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/admin/promotions", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "mass_coin_gift",
          coins: pendingGiftConfirm.coins,
          title: pendingGiftConfirm.title,
          body: pendingGiftConfirm.body,
          idempotencyKey: pendingGiftConfirm.idempotencyKey,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        event?: {
          recipientCount: number;
          coinsPerUser: number;
          totalCoinsDistributed: number;
        };
      } | null;
      if (!response.ok || !payload?.ok || !payload.event) {
        throw new Error(payload?.error ?? "Không thể thực hiện sự kiện tặng xu.");
      }
      setPendingGiftConfirm(null);
      setGiftTitle("");
      setGiftBody("");
      await load();
      announce(
        `Đã tặng +${formatNumber(payload.event.coinsPerUser)} Coin kèm thông báo Admin cho ${formatNumber(payload.event.recipientCount)} tài khoản (tổng ${formatNumber(payload.event.totalCoinsDistributed)} Coin).`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể thực hiện tặng xu.");
    } finally {
      setSaving(false);
    }
  }

  const parsedGiftCoins = Number(giftCoins);
  const estimatedGiftTotal =
    Number.isSafeInteger(parsedGiftCoins) && parsedGiftCoins > 0
      ? parsedGiftCoins * activeUserCount
      : 0;
  const totalDistributedAllTime = giftEvents.reduce(
    (sum, item) => sum + Number(item.totalCoinsDistributed ?? 0),
    0,
  );
  const previewConfig: TopupMultiplierConfig = {
    enabled: draftEnabled,
    multiplier: draftMultiplier,
    label: draftLabel,
    updatedAt: topupConfig.updatedAt,
  };

  return (
    <section style={{ display: "grid", gap: 18 }} aria-label="Quản lý sự kiện và ưu đãi">
      <div className={s.stats}>
        <article className={s.stat}>
          <div className={s.statTop}>
            <span>Nhân coin nạp</span>
            <Zap size={17} aria-hidden="true" />
          </div>
          <div className={s.statValue}>
            {topupConfig.enabled ? `Đang bật ×${topupConfig.multiplier}` : "Đang tắt (1×)"}
          </div>
          <span className={s.subtle}>
            {topupConfig.enabled
              ? topupConfig.label || "Áp dụng tự động cho SePay & Polar"
              : "Bật lên bất cứ khi nào chạy khuyến mãi"}
          </span>
        </article>

        <article className={s.stat}>
          <div className={s.statTop}>
            <span>Tài khoản nhận quà</span>
            <Users size={17} aria-hidden="true" />
          </div>
          <div className={s.statValue}>{formatNumber(activeUserCount)}</div>
          <span className={s.subtle}>Tài khoản đang hoạt động trên D1</span>
        </article>

        <article className={s.stat}>
          <div className={s.statTop}>
            <span>Đợt tặng xu đã phát</span>
            <Gift size={17} aria-hidden="true" />
          </div>
          <div className={s.statValue}>{formatNumber(giftEvents.length)}</div>
          <span className={s.subtle}>Tổng {formatNumber(totalDistributedAllTime)} Coin đã tặng</span>
        </article>

        <article className={s.stat}>
          <div className={s.statTop}>
            <span>Sự kiện ra mắt +{launchPromo.coins} Coin</span>
            <Sparkles size={17} aria-hidden="true" />
          </div>
          <div className={s.statValue}>
            {launchPromo.maxClaimsPerIp ? `${launchPromo.maxClaimsPerIp} acc / IP` : "1 lần / email"}
          </div>
          <span className={s.subtle}>
            {launchPromo.startDate} → {launchPromo.endDate} · Banner ở Nội dung → Thông báo
          </span>
        </article>
      </div>

      <div className={s.toolbar}>
        <div className={s.actions} role="tablist" aria-label="Nhóm sự kiện">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "multiplier"}
            className={activeTab === "multiplier" ? s.primary : s.secondary}
            onClick={() => {
              setActiveTab("multiplier");
              setError("");
            }}
          >
            <Zap size={15} aria-hidden="true" />
            Nhân coin nạp (×2 / ×3)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "gift"}
            className={activeTab === "gift" ? s.primary : s.secondary}
            onClick={() => {
              setActiveTab("gift");
              setError("");
            }}
          >
            <Gift size={15} aria-hidden="true" />
            Tặng xu toàn hệ thống
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "checkin"}
            className={activeTab === "checkin" ? s.primary : s.secondary}
            onClick={() => {
              setActiveTab("checkin");
              setError("");
            }}
          >
            <CalendarCheck2 size={15} aria-hidden="true" />
            Điểm danh hằng ngày
          </button>
        </div>
        <button type="button" className={s.secondary} onClick={() => void load()} disabled={loading}>
          <RefreshCw size={15} aria-hidden="true" />
          Làm mới
        </button>
      </div>

      {error && (
        <p role="alert" className={s.formError}>
          {error}
        </p>
      )}

      {activeTab === "multiplier" && (
        <div style={{ display: "grid", gap: 18 }}>
          <section className={s.panel} style={{ padding: 20 }}>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 16,
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: 18 }}>Sự kiện Nhân Coin Nạp (×2 / ×3)</h2>
                <p className={s.subtle} style={{ margin: "4px 0 0" }}>
                  Khi bật, tất cả đơn nạp mới (SePay VietQR & Polar USD) tự động cộng gấp{" "}
                  <strong>×{draftMultiplier}</strong> số Coin và hiển thị banner khuyến mãi ngay trên bảng giá.
                </p>
              </div>
              <div className={s.actions}>
                {topupConfig.enabled ? (
                  <button
                    type="button"
                    className={s.secondary}
                    disabled={saving}
                    onClick={() => void saveMultiplier(false, draftMultiplier, draftLabel)}
                  >
                    Tắt sự kiện ngay
                  </button>
                ) : (
                  <button
                    type="button"
                    className={s.primary}
                    disabled={saving}
                    onClick={() => void saveMultiplier(true, draftMultiplier, draftLabel)}
                  >
                    <Zap size={15} aria-hidden="true" />
                    Bật ngay ×{draftMultiplier} Coin nạp
                  </button>
                )}
              </div>
            </div>

            <form onSubmit={submitMultiplierForm} style={{ display: "grid", gap: 16 }}>
              <div className={s.formGrid}>
                <label className={s.field}>
                  Trạng thái sự kiện
                  <select
                    className={s.select}
                    value={draftEnabled ? "on" : "off"}
                    onChange={(e) => setDraftEnabled(e.target.value === "on")}
                    disabled={saving}
                  >
                    <option value="off">Tắt (1× bình thường)</option>
                    <option value="on">Bật (Đang áp dụng khuyến mãi)</option>
                  </select>
                </label>

                <div className={s.field}>
                  <span>Hệ số nhân coin nạp (2× – {TOPUP_MULTIPLIER_MAX}×)</span>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    {QUICK_MULTIPLIERS.map((mult) => (
                      <button
                        key={mult}
                        type="button"
                        className={draftMultiplier === mult ? s.primary : s.secondary}
                        disabled={saving}
                        onClick={() => setDraftMultiplier(mult)}
                      >
                        ×{mult} Coin
                      </button>
                    ))}
                    <input
                      type="number"
                      className={s.input}
                      style={{ width: 92 }}
                      min={TOPUP_MULTIPLIER_MIN}
                      max={TOPUP_MULTIPLIER_MAX}
                      step={1}
                      aria-label="Hệ số nhân tùy chỉnh"
                      value={draftMultiplier}
                      onChange={(e) => setDraftMultiplier(Number(e.target.value))}
                      disabled={saving}
                    />
                  </div>
                </div>

                <label className={`${s.field} ${s.fullWidth}`}>
                  Tên sự kiện hiển thị trên bảng giá (tùy chọn)
                  <input
                    type="text"
                    className={s.input}
                    maxLength={120}
                    placeholder={`Ví dụ: Khuyến mãi cuối tuần ×${draftMultiplier} Coin nạp`}
                    value={draftLabel}
                    onChange={(e) => setDraftLabel(e.target.value)}
                    disabled={saving}
                  />
                </label>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <span className={s.subtle}>
                  {topupConfig.updatedAt
                    ? `Cập nhật gần nhất: ${formatDate(topupConfig.updatedAt)}`
                    : "Chưa từng bật sự kiện nhân coin nạp."}
                </span>
                <button type="submit" className={s.primary} disabled={saving}>
                  <Check size={15} aria-hidden="true" />
                  {saving ? "Đang lưu…" : "Lưu cấu hình lên D1"}
                </button>
              </div>
            </form>
          </section>

          <section className={s.panel}>
            <div style={{ padding: "16px 20px 8px" }}>
              <h3 style={{ margin: 0, fontSize: 15 }}>
                Xem trước số Coin người dùng nhận được ({draftEnabled ? `Đang bật ×${draftMultiplier}` : "Đang tắt · 1×"})
              </h3>
            </div>
            <div className={s.tableScroll}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>Gói nạp</th>
                    <th>Khu vực</th>
                    <th>Giá</th>
                    <th>Coin gốc</th>
                    <th>Coin thực nhận</th>
                  </tr>
                </thead>
                <tbody>
                  {coinPackages.map((pack) => {
                    const quote = resolveTopupCoins(pack.coins, previewConfig);
                    const isIntl = pack.region === "international";
                    return (
                      <tr key={pack.id}>
                        <td><strong>{pack.id}</strong></td>
                        <td>{isIntl ? "Quốc tế (USD)" : "Việt Nam (VNĐ)"}</td>
                        <td>
                          {isIntl
                            ? `$${pack.usd.toFixed(2)}`
                            : formatMoney(pack.vnd, "vn")}
                        </td>
                        <td>{formatNumber(pack.coins)} coin</td>
                        <td>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                            <CoinValue value={quote.coins} />
                            {quote.bonusApplied && (
                              <span className={s.status} data-status="paid">
                                ×{quote.multiplier}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {activeTab === "gift" && (
        <div style={{ display: "grid", gap: 18 }}>
          <section className={s.panel} style={{ padding: 20 }}>
            <div style={{ marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Sự kiện Tặng Xu cho Tất cả Người dùng</h2>
              <p className={s.subtle} style={{ margin: "4px 0 0" }}>
                Cộng trực tiếp coin vào ví của tất cả{" "}
                <strong>{formatNumber(activeUserCount)} tài khoản đang hoạt động</strong> (ghi sổ cái{" "}
                <code>coin_ledger</code> an toàn) đồng thời gửi <strong>thông báo chuông từ Admin</strong>{" "}
                hiển thị nội dung bạn nhập bên dưới.
              </p>
            </div>

            <form onSubmit={openGiftConfirm} style={{ display: "grid", gap: 16 }}>
              <div className={s.formGrid}>
                <div className={s.field}>
                  <span>Số coin tặng cho mỗi người dùng *</span>
                  <input
                    type="number"
                    required
                    min={1}
                    max={100000}
                    step={1}
                    className={s.input}
                    value={giftCoins}
                    onChange={(e) => setGiftCoins(e.target.value)}
                    disabled={saving}
                  />
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                    {QUICK_GIFT_AMOUNTS.map((val) => (
                      <button
                        key={val}
                        type="button"
                        className={Number(giftCoins) === val ? s.primary : s.secondary}
                        style={{ padding: "4px 10px", fontSize: 12 }}
                        onClick={() => setGiftCoins(String(val))}
                        disabled={saving}
                      >
                        +{formatNumber(val)}
                      </button>
                    ))}
                  </div>
                </div>

                <label className={s.field}>
                  Tiêu đề thông báo Admin (để trống sẽ tự đặt)
                  <input
                    type="text"
                    className={s.input}
                    maxLength={160}
                    placeholder={`Quà tặng sự kiện +${Number.isSafeInteger(parsedGiftCoins) && parsedGiftCoins > 0 ? formatNumber(parsedGiftCoins) : 100} Coin từ HyperMockup`}
                    value={giftTitle}
                    onChange={(e) => setGiftTitle(e.target.value)}
                    disabled={saving}
                  />
                </label>

                <label className={`${s.field} ${s.fullWidth}`}>
                  Nội dung tặng xu (hiển thị trong thông báo chuông của tất cả người dùng) *
                  <textarea
                    required
                    minLength={2}
                    maxLength={2000}
                    rows={4}
                    className={s.textarea}
                    placeholder="Ví dụ: Nhân dịp lễ 30/4 - 1/5, HyperMockup gửi tặng toàn thể người dùng +100 Coin vào ví để thoải mái Render 3D và xuất khuôn Dieline. Chúc bạn kỳ nghỉ vui vẻ!"
                    value={giftBody}
                    onChange={(e) => setGiftBody(e.target.value)}
                    disabled={saving}
                  />
                </label>
              </div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "12px 14px",
                  borderRadius: 12,
                  background: "rgba(184, 61, 97, 0.06)",
                  border: "1px solid rgba(184, 61, 97, 0.16)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <Wallet size={16} aria-hidden="true" />
                  <span>
                    Dự kiến phát: <strong>{formatNumber(activeUserCount)} tài khoản</strong> ×{" "}
                    <strong>{formatNumber(Math.max(0, parsedGiftCoins || 0))} Coin</strong> ={" "}
                    <strong>{formatNumber(estimatedGiftTotal)} Coin</strong>
                  </span>
                </div>
                <button
                  type="submit"
                  className={s.primary}
                  disabled={saving || activeUserCount === 0}
                >
                  <Send size={15} aria-hidden="true" />
                  Tặng xu & gửi thông báo
                </button>
              </div>
            </form>
          </section>

          <section className={s.panel}>
            <div style={{ padding: "16px 20px 8px" }}>
              <h3 style={{ margin: 0, fontSize: 15 }}>Lịch sử các đợt tặng xu toàn hệ thống</h3>
            </div>
            <div className={s.tableScroll}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Sự kiện & nội dung thông báo</th>
                    <th>Xu / người</th>
                    <th>Số người nhận</th>
                    <th>Tổng xu đã phát</th>
                    <th>Người thực hiện</th>
                  </tr>
                </thead>
                <tbody>
                  {giftEvents.map((evt) => (
                    <tr key={evt.id}>
                      <td>{formatDate(evt.createdAt)}</td>
                      <td>
                        <div className={s.userName}>
                          <strong>{evt.title}</strong>
                          <small style={{ whiteSpace: "pre-wrap" }}>{evt.body}</small>
                        </div>
                      </td>
                      <td><CoinValue value={Number(evt.coinsPerUser)} /></td>
                      <td>{formatNumber(evt.recipientCount)} tài khoản</td>
                      <td><strong>{formatNumber(evt.totalCoinsDistributed)} coin</strong></td>
                      <td>{evt.actorName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && giftEvents.length === 0 && (
                <div className={s.empty}>Chưa có đợt tặng xu toàn hệ thống nào.</div>
              )}
            </div>
          </section>
        </div>
      )}

      {activeTab === "checkin" && <ManagementPanel section="promotions" />}

      {pendingGiftConfirm && (
        <ConfirmDialog
          title="Xác nhận tặng xu toàn hệ thống"
          close={() => {
            if (!saving) setPendingGiftConfirm(null);
          }}
        >
          <div className={s.modalBody}>
            <p style={{ marginTop: 0 }}>
              Bạn sắp cộng <strong>+{formatNumber(pendingGiftConfirm.coins)} Coin</strong> vào ví và gửi
              thông báo chuông từ Admin cho tất cả{" "}
              <strong>{formatNumber(activeUserCount)} tài khoản đang hoạt động</strong> (tổng cộng{" "}
              <strong>{formatNumber(pendingGiftConfirm.coins * activeUserCount)} Coin</strong>).
            </p>
            <div
              style={{
                padding: 12,
                borderRadius: 12,
                background: "rgba(15, 23, 42, 0.04)",
                border: "1px solid rgba(15, 23, 42, 0.1)",
                display: "grid",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700 }}>
                <Bell size={14} aria-hidden="true" />
                <span>{pendingGiftConfirm.title}</span>
              </div>
              <p style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 13.5 }}>
                {pendingGiftConfirm.body}
              </p>
            </div>
            <p className={s.subtle} style={{ marginBottom: 0 }}>
              Thao tác này có khóa chống trùng lặp và ghi đầy đủ vào sổ <code>coin_ledger</code> &{" "}
              <code>audit_events</code>.
            </p>
          </div>
          <div className={s.modalFooter}>
            <button
              type="button"
              className={s.secondary}
              disabled={saving}
              onClick={() => setPendingGiftConfirm(null)}
            >
              Hủy
            </button>
            <button
              type="button"
              className={s.primary}
              disabled={saving}
              onClick={() => void confirmSendMassGift()}
            >
              <Gift size={15} aria-hidden="true" />
              {saving ? "Đang tặng xu…" : `Xác nhận tặng +${formatNumber(pendingGiftConfirm.coins)} Coin`}
            </button>
          </div>
        </ConfirmDialog>
      )}

      {notice && (
        <div className={s.toast} role="status">
          {notice}
        </div>
      )}
    </section>
  );
}
