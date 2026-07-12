"use client";

import React, { createContext, useContext, useMemo } from "react";
import { useParams } from "next/navigation";
import { ConfigProvider } from "antd";
import arEG from "antd/locale/ar_EG";
import enUS from "antd/locale/en_US";
import { eduraTheme } from "@/lib/theme/eduraTheme";
import {
  DEFAULT_LOCALE,
  getMessages,
  isLocale,
  translate,
  type Locale,
} from "@/lib/i18n";
import {
  formatEGP,
  formatShortEGP,
  formatNumber,
  formatPercent,
  formatDate,
} from "@/lib/i18n/format";

type I18nContextValue = {
  locale: Locale;
  dir: "rtl" | "ltr";
  t: (key: string) => string;
  formatEGP: (piasters: number | null | undefined, opts?: { decimals?: boolean }) => string;
  formatShortEGP: (piasters: number | null | undefined) => string;
  formatNumber: (n: number | null | undefined) => string;
  formatPercent: (n: number | null | undefined) => string;
  formatDate: (v: string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // The URL locale is the source of truth (kept in sync by proxy.ts).
  const params = useParams();
  const raw = Array.isArray(params?.locale) ? params.locale[0] : params?.locale;
  const locale: Locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const dir = locale === "ar" ? "rtl" : "ltr";

  const value = useMemo<I18nContextValue>(() => {
    const messages = getMessages(locale);
    return {
      locale,
      dir,
      t: (key) => translate(messages, key),
      formatEGP: (p, opts) => formatEGP(p, locale, opts),
      formatShortEGP: (p) => formatShortEGP(p, locale),
      formatNumber: (n) => formatNumber(n, locale),
      formatPercent: (n) => formatPercent(n, locale),
      formatDate: (v, opts) => formatDate(v, locale, opts),
    };
  }, [locale, dir]);

  return (
    <I18nContext.Provider value={value}>
      <ConfigProvider theme={eduraTheme} direction={dir} locale={locale === "ar" ? arEG : enUS}>
        {children}
      </ConfigProvider>
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
