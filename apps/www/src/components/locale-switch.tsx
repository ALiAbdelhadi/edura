"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { otherLocale, type Locale } from "@/i18n/config";

export function LocaleSwitch({ locale, label }: { locale: Locale; label: string }) {
  const target = otherLocale(locale);
  const pathname = usePathname() ?? `/${locale}`;
  const rest = pathname.replace(new RegExp(`^/${locale}(?=/|$)`), "");
  return (
    <Link
      href={`/${target}${rest}`}
      hrefLang={target}
      lang={target}
      className="tap inline-flex h-9 items-center border border-rule px-3 text-[0.8125rem] text-ink-2 transition-colors hover:border-gold hover:text-ink"
    >
      {label}
    </Link>
  );
}
