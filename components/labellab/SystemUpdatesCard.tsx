"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  ArrowRight,
  CalendarRange,
  CheckCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Gift,
  LoaderCircle,
  LogIn,
  Megaphone,
  Pin,
  ShieldCheck,
  Sparkles,
  UserPlus,
  X,
} from "lucide-react";
import {
  localizeAnnouncement,
  localizedCategoryLabel,
  OPEN_ANNOUNCEMENT_EVENT,
  type PublicAnnouncement,
} from "@/lib/client/announcements";
import {
  LAUNCH_PROMO_ANNOUNCEMENT_ID,
  LAUNCH_PROMO_COINS,
  type LaunchPromoStatusResponse,
} from "@/lib/promotions/launch-event";
import { useAuthDialog } from "./AuthDialog";
import { useLocale } from "./LocaleProvider";
import styles from "./SystemUpdatesCard.module.css";

const noticeIcons = { pink: Gift, blue: Megaphone, mint: Sparkles } as const;

interface SystemUpdatesCardProps {
  announcements: readonly PublicAnnouncement[];
  unreadCount: number;
  isUnread: (item: PublicAnnouncement) => boolean;
  onMarkRead: (item: PublicAnnouncement) => void;
  onMarkAllRead: (items: readonly PublicAnnouncement[]) => void;
}

export default function SystemUpdatesCard({
  announcements,
  unreadCount,
  isUnread,
  onMarkRead,
  onMarkAllRead,
}: SystemUpdatesCardProps) {
  const { locale, t } = useLocale();
  const isVi = locale === "vi";
  const openAuth = useAuthDialog();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [promoStatus, setPromoStatus] = useState<LaunchPromoStatusResponse | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoClaiming, setPromoClaiming] = useState(false);
  const [promoError, setPromoError] = useState("");
  const [promoJustClaimed, setPromoJustClaimed] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setPortalTarget(document.body));
    return () => cancelAnimationFrame(frame);
  }, []);

  const activeIndex = activeId ? announcements.findIndex((item) => item.id === activeId) : -1;
  const activeItem = activeIndex >= 0 ? announcements[activeIndex] : null;
  const isLaunchPromo = Boolean(
    activeItem &&
      (activeItem.id === LAUNCH_PROMO_ANNOUNCEMENT_ID || activeItem.url === "/#launch-promo"),
  );

  const loadPromoStatus = useCallback(async () => {
    setPromoLoading(true);
    setPromoError("");
    try {
      const response = await fetch("/api/account/promo/launch", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) return;
      const payload = (await response.json()) as LaunchPromoStatusResponse;
      setPromoStatus(payload);
    } catch {
      // Keep modal interactive if network fails transiently.
    } finally {
      setPromoLoading(false);
    }
  }, []);

  const openNotice = (item: PublicAnnouncement) => {
    onMarkRead(item);
    setPromoError("");
    setPromoJustClaimed(false);
    setActiveId(item.id);
  };

  const closeModal = () => {
    dialogRef.current?.close();
    setActiveId(null);
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (activeItem) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [activeItem]);

  useEffect(() => {
    if (!isLaunchPromo) return;
    const frame = requestAnimationFrame(() => {
      void loadPromoStatus();
    });
    const onAccountChanged = () => {
      void loadPromoStatus();
    };
    window.addEventListener("labellab-account-changed", onAccountChanged);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("labellab-account-changed", onAccountChanged);
    };
  }, [isLaunchPromo, loadPromoStatus]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string }>).detail;
      if (!detail?.id) return;
      const found = announcements.find((item) => item.id === detail.id);
      if (found) {
        onMarkRead(found);
        setActiveId(found.id);
      }
    };
    window.addEventListener(OPEN_ANNOUNCEMENT_EVENT, handler);
    return () => window.removeEventListener(OPEN_ANNOUNCEMENT_EVENT, handler);
  }, [announcements, onMarkRead]);

  const mapPromoError = (code: string | undefined): string => {
    switch (code) {
      case "LOGIN_REQUIRED":
        return isVi
          ? "Vui lòng đăng nhập tài khoản để nhận thưởng."
          : "Please sign in to claim your bonus.";
      case "PROMO_ALREADY_CLAIMED":
        return isVi
          ? "Tài khoản này đã nhận thưởng +100 Coin sự kiện ra mắt rồi."
          : "This account has already claimed the +100 launch bonus.";
      case "PROMO_ALREADY_CLAIMED_EMAIL":
        return isVi
          ? "Địa chỉ email tương ứng đã nhận ưu đãi sự kiện ra mắt trước đó (giới hạn 1 lần duy nhất)."
          : "This email address has already claimed the launch event bonus (strictly one per person).";
      case "NOT_ELIGIBLE_REGISTRATION_DATE":
        return isVi
          ? "Ưu đãi chỉ áp dụng cho tài khoản đăng ký mới từ 27/11/2026 đến hết 04/12/2026."
          : "This offer applies only to new accounts registered from Nov 27 to Dec 4, 2026.";
      case "EMAIL_NOT_VERIFIED":
        return isVi
          ? "Tài khoản cần xác minh email trước khi nhận thưởng."
          : "Please verify your email address before claiming.";
      case "PROMO_NOT_STARTED":
        return isVi
          ? "Sự kiện bắt đầu từ 00:00 ngày 27/11/2026 (GMT+7)."
          : "The launch event starts on Nov 27, 2026 (00:00 GMT+7).";
      case "PROMO_EXPIRED":
        return isVi
          ? "Chương trình ưu đãi ra mắt đã kết thúc sau ngày 04/12/2026."
          : "The launch event ended after Dec 4, 2026.";
      case "PROMO_IP_LIMIT":
        return isVi
          ? "Mạng/IP hiện tại đã đạt giới hạn tối đa lượt nhận ưu đãi sự kiện."
          : "This network has reached the maximum claim limit for this launch event.";
      default:
        return isVi
          ? "Không thể nhận thưởng lúc này. Vui lòng thử lại sau."
          : "Could not claim bonus right now. Please try again.";
    }
  };

  const handleClaimLaunchCoins = async () => {
    if (promoClaiming) return;
    setPromoClaiming(true);
    setPromoError("");
    try {
      const response = await fetch("/api/account/promo/launch", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        claimedAt?: string;
      } | null;

      if (response.status === 401 || payload?.error === "LOGIN_REQUIRED") {
        closeModal();
        openAuth("register");
        return;
      }

      if (!response.ok || !payload?.ok) {
        setPromoError(mapPromoError(payload?.error));
        void loadPromoStatus();
        return;
      }

      setPromoJustClaimed(true);
      setPromoStatus((prev) =>
        prev
          ? {
              ...prev,
              eligible: false,
              claimed: true,
              claimedAt: payload.claimedAt ?? new Date().toISOString(),
              reason: "ALREADY_CLAIMED",
            }
          : prev,
      );
      window.dispatchEvent(new Event("labellab-account-changed"));
    } catch {
      setPromoError(mapPromoError(undefined));
    } finally {
      setPromoClaiming(false);
    }
  };

  const visibleItems = showAll ? announcements : announcements.slice(0, 3);
  const activeLocalized = activeItem ? localizeAnnouncement(activeItem, locale) : null;
  const ActiveIcon = activeItem ? (noticeIcons[activeItem.tone] ?? Sparkles) : Sparkles;

  return (
    <article className={`home-card home-notices-card ${styles.card}`} id="home-updates">
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h2>{t.home.updatesHeading}</h2>
          {unreadCount > 0 && (
            <span className={styles.unreadBadge} aria-label={`${unreadCount} ${t.home.unreadLabel}`}>
              {unreadCount}
            </span>
          )}
        </div>

        <div className={styles.headerActions}>
          {unreadCount > 0 ? (
            <button
              type="button"
              className={styles.markAllBtn}
              onClick={() => onMarkAllRead(announcements)}
            >
              <CheckCheck size={14} aria-hidden="true" />
              <span>{t.home.markAllRead}</span>
            </button>
          ) : announcements.length > 3 ? (
            <button
              type="button"
              className={styles.markAllBtn}
              onClick={() => setShowAll((v) => !v)}
            >
              <span>{showAll ? t.home.collapseUpdates : t.home.viewAllUpdates(announcements.length)}</span>
            </button>
          ) : (
            <Link className={styles.studioLink} href="/studio#workspace">
              <span>{t.home.openStudio}</span>
              <ChevronRight size={14} aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>

      <div className={styles.list} role="list">
        {visibleItems.length > 0 ? (
          visibleItems.map((item) => {
            const Icon = noticeIcons[item.tone] ?? Sparkles;
            const unread = isUnread(item);
            const localized = localizeAnnouncement(item, locale);
            const catLabel = localizedCategoryLabel(item.category, item.tone, locale);
            return (
              <button
                key={item.id}
                type="button"
                role="listitem"
                className={`${styles.row} ${unread ? styles.rowUnread : ""}`}
                onClick={() => openNotice(item)}
              >
                <span className={`${styles.iconBox} ${styles[item.tone]}`}>
                  <Icon size={17} aria-hidden="true" />
                </span>
                <span className={styles.copy}>
                  <span className={styles.rowTop}>
                    <strong className={styles.rowTitle}>{localized.title}</strong>
                  </span>
                  <span className={styles.rowMeta}>
                    <span className={`${styles.catTag} ${styles[`tag_${item.tone}`]}`}>
                      {item.pinned && <Pin size={10} aria-hidden="true" />}
                      {catLabel}
                    </span>
                    <span className={styles.excerpt}>{localized.body}</span>
                    <small className={styles.time}>
                      <Clock3 size={11} aria-hidden="true" />
                      {item.time}
                    </small>
                  </span>
                </span>
                <span className={styles.rowEnd}>
                  {unread && <span className={styles.unreadDot} aria-label={t.home.unreadLabel} />}
                  <ChevronRight size={15} className={styles.chevron} aria-hidden="true" />
                </span>
              </button>
            );
          })
        ) : (
          <p className={styles.empty}>{t.home.noAnnouncements}</p>
        )}
      </div>

      {/* Accessible Announcement Detail Reader / Launch Welcome Promo Banner Dialog */}
      {portalTarget &&
        createPortal(
          <dialog
            ref={dialogRef}
            className={`${styles.dialog} ${isLaunchPromo ? styles.dialogLaunch : ""}`}
            aria-labelledby="announcement-dialog-title"
            onCancel={(event) => {
              event.preventDefault();
              closeModal();
            }}
            onClick={(event) => {
              if (event.target === dialogRef.current) closeModal();
            }}
          >
            {activeItem && activeLocalized && isLaunchPromo ? (
              <div>
                <div className={styles.launchBannerHero}>
                  <div className={styles.launchBannerTop}>
                    <span className={styles.launchKicker}>
                      <Gift size={13} aria-hidden="true" />
                      <span>{isVi ? "Chào mừng ra mắt HyperMockup" : "HyperMockup Launch Event"}</span>
                    </span>
                    <button
                      type="button"
                      className={styles.launchCloseBtn}
                      onClick={closeModal}
                      aria-label={t.home.closeNotice}
                    >
                      <X size={17} aria-hidden="true" />
                    </button>
                  </div>

                  <div className={styles.launchHeroMain}>
                    <div className={styles.launchHeroCopy}>
                      <h3 id="announcement-dialog-title">
                        {isVi
                          ? `Quà chào mừng ra mắt +${LAUNCH_PROMO_COINS} Coin!`
                          : `Official Launch Gift: +${LAUNCH_PROMO_COINS} Free Coins!`}
                      </h3>
                      <p>
                        {isVi
                          ? "Tặng ngay 100 Coin để thoải mái Render ảnh 3D, xuất khuôn Dieline 1:1 mm và tạo Link chia sẻ 3D."
                          : "Claim 100 free coins to render 3D mockups, export 1:1 mm dielines, and share interactive 3D links."}
                      </p>
                    </div>
                    <div className={styles.launchCoinBadge} aria-hidden="true">
                      <Image src="/branding/hypermockup-coin.svg" alt="" width={46} height={46} />
                      <strong>+{LAUNCH_PROMO_COINS}</strong>
                    </div>
                  </div>
                </div>

                <div className={styles.launchBannerBody}>
                  <ul className={styles.launchRules}>
                    <li>
                      <CalendarRange size={16} aria-hidden="true" />
                      <span>
                        {isVi ? (
                          <>
                            <strong>Thời gian áp dụng:</strong> Từ <strong>27/11/2026</strong> đến hết ngày{" "}
                            <strong>04/12/2026</strong> (GMT+7).
                          </>
                        ) : (
                          <>
                            <strong>Event window:</strong> <strong>Nov 27, 2026</strong> through{" "}
                            <strong>Dec 4, 2026</strong> (23:59 GMT+7).
                          </>
                        )}
                      </span>
                    </li>
                    <li>
                      <UserPlus size={16} aria-hidden="true" />
                      <span>
                        {isVi ? (
                          <>
                            <strong>Đối tượng:</strong> Bất kỳ ai <strong>đăng ký tài khoản mới</strong> trong thời gian diễn ra sự kiện.
                          </>
                        ) : (
                          <>
                            <strong>Eligibility:</strong> Everyone who <strong>registers a new account</strong> during the launch window.
                          </>
                        )}
                      </span>
                    </li>
                    <li>
                      <ShieldCheck size={16} aria-hidden="true" />
                      <span>
                        {isVi ? (
                          <>
                            <strong>Giới hạn:</strong> Mỗi tài khoản chỉ được nhận ưu đãi <strong>1 lần duy nhất</strong> (xác thực trực tiếp trên máy chủ).
                          </>
                        ) : (
                          <>
                            <strong>Limit:</strong> Strictly <strong>1 claim per account</strong> (enforced server-side).
                          </>
                        )}
                      </span>
                    </li>
                  </ul>

                  <div className={styles.launchActionArea}>
                    {promoLoading && !promoStatus ? (
                      <div className={`${styles.launchStatusBox} ${styles.launchStatusInfo}`}>
                        <LoaderCircle size={16} aria-hidden="true" />
                        <span>
                          {isVi ? "Đang kiểm tra trạng thái nhận thưởng…" : "Checking eligibility…"}
                        </span>
                      </div>
                    ) : promoJustClaimed || promoStatus?.claimed ? (
                      <>
                        <div className={`${styles.launchStatusBox} ${styles.launchStatusSuccess}`} role="status">
                          <CheckCircle2 size={18} aria-hidden="true" />
                          <span>
                            {promoJustClaimed
                              ? isVi
                                ? `Chúc mừng! Đã cộng thành công +${LAUNCH_PROMO_COINS} Coin vào ví của bạn.`
                                : `Success! +${LAUNCH_PROMO_COINS} coins have been added to your wallet.`
                              : isVi
                                ? `Tài khoản của bạn đã nhận thưởng +${LAUNCH_PROMO_COINS} Coin sự kiện ra mắt.`
                                : `You have already claimed your +${LAUNCH_PROMO_COINS} launch bonus coins.`}
                          </span>
                        </div>
                        <Link
                          className={`${styles.launchClaimBtn} home-sheen`}
                          href="/studio#workspace"
                          onClick={closeModal}
                        >
                          <span>{isVi ? "Mở Mockup Studio ngay" : "Open Mockup Studio"}</span>
                          <ArrowRight size={16} aria-hidden="true" />
                        </Link>
                      </>
                    ) : !promoStatus || !promoStatus.authenticated ? (
                      promoStatus?.windowState === "ended" ? (
                        <div className={`${styles.launchStatusBox} ${styles.launchStatusInfo}`}>
                          <AlertCircle size={17} aria-hidden="true" />
                          <span>{mapPromoError("PROMO_EXPIRED")}</span>
                        </div>
                      ) : promoStatus?.windowState === "upcoming" ? (
                        <div className={`${styles.launchStatusBox} ${styles.launchStatusInfo}`}>
                          <Clock3 size={17} aria-hidden="true" />
                          <span>{mapPromoError("PROMO_NOT_STARTED")}</span>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            className={`${styles.launchClaimBtn} home-sheen`}
                            onClick={() => {
                              closeModal();
                              openAuth("register");
                            }}
                          >
                            <UserPlus size={16} aria-hidden="true" />
                            <span>
                              {isVi
                                ? `Đăng ký tài khoản để nhận ${LAUNCH_PROMO_COINS} Coin`
                                : `Create account to claim ${LAUNCH_PROMO_COINS} Coins`}
                            </span>
                          </button>
                          <button
                            type="button"
                            className={styles.launchSecondaryBtn}
                            onClick={() => {
                              closeModal();
                              openAuth("login");
                            }}
                          >
                            <LogIn size={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: 6 }} aria-hidden="true" />
                            {isVi ? "Đã đăng ký trong đợt sự kiện? Đăng nhập để nhận" : "Already signed up during launch? Log in to claim"}
                          </button>
                        </>
                      )
                    ) : promoStatus.eligible ? (
                      <button
                        type="button"
                        className={`${styles.launchClaimBtn} home-sheen`}
                        disabled={promoClaiming}
                        onClick={() => void handleClaimLaunchCoins()}
                      >
                        {promoClaiming ? (
                          <LoaderCircle size={17} aria-hidden="true" />
                        ) : (
                          <Gift size={17} aria-hidden="true" />
                        )}
                        <span>
                          {promoClaiming
                            ? isVi
                              ? "Đang cộng Coin vào ví…"
                              : "Crediting coins…"
                            : isVi
                              ? `Nhận ngay +${LAUNCH_PROMO_COINS} Coin`
                              : `Claim +${LAUNCH_PROMO_COINS} Coins Now`}
                        </span>
                      </button>
                    ) : (
                      <div className={`${styles.launchStatusBox} ${styles.launchStatusInfo}`}>
                        <AlertCircle size={17} aria-hidden="true" />
                        <span>{mapPromoError(promoStatus.reason)}</span>
                      </div>
                    )}

                    {promoError && (
                      <div className={`${styles.launchStatusBox} ${styles.launchStatusError}`} role="alert">
                        <AlertCircle size={17} aria-hidden="true" />
                        <span>{promoError}</span>
                      </div>
                    )}
                  </div>

                  <div className={styles.dialogFooter}>
                    <div className={styles.navBtns}>
                      {announcements.length > 1 && (
                        <>
                          <button
                            type="button"
                            className={styles.navBtn}
                            disabled={activeIndex <= 0}
                            onClick={() => {
                              if (activeIndex > 0) openNotice(announcements[activeIndex - 1]);
                            }}
                            aria-label={t.home.prevNotice}
                          >
                            <ChevronLeft size={16} aria-hidden="true" />
                          </button>
                          <span className={styles.navCount}>
                            {activeIndex + 1} / {announcements.length}
                          </span>
                          <button
                            type="button"
                            className={styles.navBtn}
                            disabled={activeIndex >= announcements.length - 1}
                            onClick={() => {
                              if (activeIndex < announcements.length - 1) openNotice(announcements[activeIndex + 1]);
                            }}
                            aria-label={t.home.nextNotice}
                          >
                            <ChevronRight size={16} aria-hidden="true" />
                          </button>
                        </>
                      )}
                    </div>
                    <button type="button" className={styles.ghostBtn} onClick={closeModal}>
                      {t.home.closeNotice}
                    </button>
                  </div>
                </div>
              </div>
            ) : activeItem && activeLocalized ? (
              <div className={styles.dialogInner}>
                <div className={styles.dialogHeader}>
                  <div className={styles.dialogBadgeRow}>
                    <span className={`${styles.dialogIcon} ${styles[activeItem.tone]}`}>
                      <ActiveIcon size={18} aria-hidden="true" />
                    </span>
                    <span className={`${styles.catTag} ${styles[`tag_${activeItem.tone}`]}`}>
                      {activeItem.pinned && <Pin size={11} aria-hidden="true" />}
                      {localizedCategoryLabel(activeItem.category, activeItem.tone, locale)}
                    </span>
                    <span className={styles.dialogDate}>
                      <Clock3 size={12} aria-hidden="true" />
                      {activeItem.time}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={styles.closeBtn}
                    onClick={closeModal}
                    aria-label={t.home.closeNotice}
                  >
                    <X size={18} aria-hidden="true" />
                  </button>
                </div>

                <h3 id="announcement-dialog-title" className={styles.dialogTitle}>
                  {activeLocalized.title}
                </h3>

                <p className={styles.dialogBody}>{activeLocalized.body}</p>

                <div className={styles.dialogFooter}>
                  <div className={styles.navBtns}>
                    {announcements.length > 1 && (
                      <>
                        <button
                          type="button"
                          className={styles.navBtn}
                          disabled={activeIndex <= 0}
                          onClick={() => {
                            if (activeIndex > 0) openNotice(announcements[activeIndex - 1]);
                          }}
                          aria-label={t.home.prevNotice}
                        >
                          <ChevronLeft size={16} aria-hidden="true" />
                        </button>
                        <span className={styles.navCount}>
                          {activeIndex + 1} / {announcements.length}
                        </span>
                        <button
                          type="button"
                          className={styles.navBtn}
                          disabled={activeIndex >= announcements.length - 1}
                          onClick={() => {
                            if (activeIndex < announcements.length - 1) openNotice(announcements[activeIndex + 1]);
                          }}
                          aria-label={t.home.nextNotice}
                        >
                          <ChevronRight size={16} aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </div>

                  <div className={styles.dialogCtas}>
                    <button type="button" className={styles.ghostBtn} onClick={closeModal}>
                      {t.home.closeNotice}
                    </button>
                    {activeLocalized.href.startsWith("/#") ? (
                      <a
                        className={`${styles.ctaBtn} home-sheen`}
                        href={activeLocalized.href}
                        onClick={() => closeModal()}
                      >
                        <span>{activeLocalized.ctaLabel ?? t.home.openStudio}</span>
                        <ArrowRight size={15} aria-hidden="true" />
                      </a>
                    ) : activeLocalized.href.startsWith("https://") ? (
                      <a
                        className={`${styles.ctaBtn} home-sheen`}
                        href={activeLocalized.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => closeModal()}
                      >
                        <span>{activeLocalized.ctaLabel ?? t.home.openStudio}</span>
                        <ArrowRight size={15} aria-hidden="true" />
                      </a>
                    ) : (
                      <Link
                        className={`${styles.ctaBtn} home-sheen`}
                        href={activeLocalized.href}
                        onClick={() => closeModal()}
                      >
                        <span>{activeLocalized.ctaLabel ?? t.home.openStudio}</span>
                        <ArrowRight size={15} aria-hidden="true" />
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </dialog>,
          portalTarget,
        )}
    </article>
  );
}
