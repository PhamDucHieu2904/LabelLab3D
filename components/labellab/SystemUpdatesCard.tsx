"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Gift,
  Megaphone,
  Pin,
  Sparkles,
  X,
} from "lucide-react";
import {
  localizeAnnouncement,
  localizedCategoryLabel,
  OPEN_ANNOUNCEMENT_EVENT,
  type PublicAnnouncement,
} from "@/lib/client/announcements";
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setPortalTarget(document.body));
    return () => cancelAnimationFrame(frame);
  }, []);

  const activeIndex = activeId ? announcements.findIndex((item) => item.id === activeId) : -1;
  const activeItem = activeIndex >= 0 ? announcements[activeIndex] : null;

  const openNotice = (item: PublicAnnouncement) => {
    onMarkRead(item);
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

  // Allow SiteHeader bell dropdown to open any announcement directly inside this reader modal when on HomePage.
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

  const visibleItems = showAll ? announcements : announcements.slice(0, 3);
  const activeLocalized = activeItem ? localizeAnnouncement(activeItem, locale) : null;
  const ActiveIcon = activeItem ? (noticeIcons[activeItem.tone] ?? Sparkles) : Sparkles;

  return (
    <article className={`home-card home-notices-card ${styles.card}`} id="home-updates">
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h2>{t.home.updatesHeading}</h2>
          {unreadCount > 0 ? (
            <span className={styles.unreadBadge} aria-label={`${unreadCount} ${t.home.unreadLabel}`}>
              {unreadCount}
            </span>
          ) : announcements.length > 0 ? (
            <span className={styles.allReadBadge} title={t.home.allRead}>
              <CheckCheck size={13} aria-hidden="true" />
            </span>
          ) : null}
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

      {/* Accessible Announcement Detail Reader Dialog (portaled to body so backdrop-filter ancestors never offset fixed centering) */}
      {portalTarget &&
        createPortal(
          <dialog
            ref={dialogRef}
            className={styles.dialog}
            aria-labelledby="announcement-dialog-title"
            onCancel={(event) => {
              event.preventDefault();
              closeModal();
            }}
            onClick={(event) => {
              if (event.target === dialogRef.current) closeModal();
            }}
          >
            {activeItem && activeLocalized && (
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
            )}
          </dialog>,
          portalTarget,
        )}
    </article>
  );
}
