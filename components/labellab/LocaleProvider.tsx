"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { LOCALE_COOKIE, LOCALE_STORAGE_KEY, normalizeUiLocale, type UiLocale } from "@/lib/i18n/locale";
import { getUiMessages, type UiMessages } from "@/lib/i18n/messages";

type LocaleContextValue = {
  locale: UiLocale;
  setLocale: (next: UiLocale) => void;
  t: UiMessages;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function writeLocalePersistence(locale: UiLocale) {
  if (typeof document !== "undefined") {
    const secureFlag = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${secureFlag}`;
    document.documentElement.lang = locale;
  }
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // Ignore storage access errors in private browsing.
    }
  }
}

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: UiLocale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<UiLocale>(initialLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: UiLocale) => {
    const valid = normalizeUiLocale(next);
    if (!valid) return;
    setLocaleState(valid);
    writeLocalePersistence(valid);
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      t: getUiMessages(locale),
    }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    // Graceful fallback if rendered outside provider (e.g. unit tests / isolated previews).
    return {
      locale: "vi",
      setLocale: () => undefined,
      t: getUiMessages("vi"),
    };
  }
  return ctx;
}
