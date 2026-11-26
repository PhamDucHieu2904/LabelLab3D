"use client";

import { useCallback, useEffect, useState } from "react";
import type { UiLocale } from "@/lib/i18n/locale";
import { LABELLAB_UPDATES } from "@/lib/labellab/updates";

export type PublicAnnouncement = {
  id: string;
  tone: "pink" | "blue" | "mint";
  category?: string;
  pinned?: boolean;
  title: string;
  body: string;
  titleEn?: string;
  bodyEn?: string;
  ctaLabel?: string;
  ctaLabelEn?: string;
  time: string;
  url: string;
  unread?: boolean;
};

export const ANNOUNCEMENTS_READ_KEY = "hypermockup.announcements.read.v1";
const READ_SYNC_EVENT = "hypermockup-announcements-read";
export const OPEN_ANNOUNCEMENT_EVENT = "hypermockup-open-announcement";

export const DEFAULT_PUBLIC_ANNOUNCEMENTS: PublicAnnouncement[] = LABELLAB_UPDATES.map((item) => ({
  id: item.id,
  tone: item.tone,
  category: item.category,
  pinned: item.pinned,
  title: item.title,
  body: item.body,
  titleEn: item.titleEn,
  bodyEn: item.bodyEn,
  ctaLabel: item.ctaLabel,
  ctaLabelEn: item.ctaLabelEn,
  time: item.time,
  url: item.url,
  unread: true,
}));

/** Stable read fingerprint — if admin edits an announcement and updates its date, it surfaces as new again. */
export function announcementReadKey(item: Pick<PublicAnnouncement, "id" | "time">): string {
  return `${item.id}:${item.time}`;
}

export function safeAnnouncementHref(rawUrl: string | undefined): string {
  const trimmed = (rawUrl ?? "").trim();
  if (/^\/(?!\/)/.test(trimmed) || /^https:\/\/[^\s]+$/i.test(trimmed)) return trimmed;
  return "/studio#workspace";
}

export function localizeAnnouncement(item: PublicAnnouncement, locale: UiLocale) {
  const isEn = locale === "en";
  const title = (isEn && item.titleEn?.trim()) ? item.titleEn.trim() : item.title;
  const body = (isEn && item.bodyEn?.trim()) ? item.bodyEn.trim() : (item.body || item.title);
  const ctaLabel = (isEn && item.ctaLabelEn?.trim())
    ? item.ctaLabelEn.trim()
    : (!isEn && item.ctaLabel?.trim())
      ? item.ctaLabel.trim()
      : undefined;
  return {
    title,
    body,
    ctaLabel,
    href: safeAnnouncementHref(item.url),
  };
}

export function localizedCategoryLabel(
  category: string | undefined,
  tone: PublicAnnouncement["tone"],
  locale: UiLocale,
): string {
  const norm = (category ?? "").trim().toLowerCase();
  if (norm.includes("ưu đãi") || norm.includes("promo") || tone === "pink") {
    return locale === "en" ? "Promo" : "Ưu đãi";
  }
  if (norm.includes("tính năng") || norm.includes("feature") || tone === "mint") {
    return locale === "en" ? "New Feature" : "Tính năng mới";
  }
  if (norm.includes("nâng cấp") || norm.includes("upgrade")) {
    return locale === "en" ? "Upgrade" : "Nâng cấp";
  }
  return locale === "en" ? "System" : "Hệ thống";
}

function readStoredIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(ANNOUNCEMENTS_READ_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string").slice(-100));
  } catch {
    return new Set();
  }
}

function writeStoredIds(ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ANNOUNCEMENTS_READ_KEY, JSON.stringify([...ids].slice(-100)));
  } catch {
    // Ignore private-browsing storage quota errors.
  }
  window.dispatchEvent(new Event(READ_SYNC_EVENT));
}

export function useAnnouncementReadState(announcements: readonly PublicAnnouncement[]) {
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const sync = () => {
      setReadIds(readStoredIds());
      setHydrated(true);
    };
    const frame = requestAnimationFrame(sync);
    window.addEventListener(READ_SYNC_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener(READ_SYNC_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const isUnread = useCallback(
    (item: PublicAnnouncement) => {
      if (!hydrated) return true;
      return !readIds.has(announcementReadKey(item));
    },
    [hydrated, readIds],
  );

  const markRead = useCallback((item: PublicAnnouncement) => {
    const key = announcementReadKey(item);
    const next = readStoredIds();
    if (next.has(key)) return;
    next.add(key);
    setReadIds(new Set(next));
    writeStoredIds(next);
  }, []);

  const markAllRead = useCallback((items: readonly PublicAnnouncement[]) => {
    const next = readStoredIds();
    let changed = false;
    for (const item of items) {
      const key = announcementReadKey(item);
      if (!next.has(key)) {
        next.add(key);
        changed = true;
      }
    }
    if (!changed) return;
    setReadIds(new Set(next));
    writeStoredIds(next);
  }, []);

  const unreadCount = announcements.reduce((acc, item) => acc + (isUnread(item) ? 1 : 0), 0);

  return {
    hydrated,
    unreadCount,
    isUnread,
    markRead,
    markAllRead,
  };
}
