"use client";

import { useLayoutEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { Arrow } from "@/components/arrow";
import { PageFrame } from "@/components/page-frame";
import { THEME_STORAGE_KEY, applyStoredTheme } from "@/components/theme-toggle";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getPages } from "@/i18n/pages";

// not-found.tsx gets no props, and reading headers() here would make every
// page dynamic; the client params hook still knows the locale segment.
export default function NotFound() {
  const params = useParams<{ locale?: string }>();
  useLayoutEffect(() => applyStoredTheme(THEME_STORAGE_KEY), []);
  const segment = params?.locale ?? "";
  const locale = isLocale(segment) ? segment : DEFAULT_LOCALE;
  const t = getMessages(locale);
  const n = getPages(locale).notFound;

  return (
    <PageFrame locale={locale} t={t} bootScript={false}>
      <title>{n.meta}</title>
      <section className="wrap py-24 lg:py-36">
        <h1 data-rise="" className="t-display text-ink">
          {n.title}
        </h1>
        <p data-rise="" className="t-lede mt-5">
          {n.body}
        </p>
        <div data-rise="" className="mt-8">
          <Link href={`/${locale}`} className="btn btn-pen">
            {n.home}
            <Arrow />
          </Link>
        </div>
      </section>
    </PageFrame>
  );
}
