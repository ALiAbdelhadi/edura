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
      className="nav-pill"
    >
      {label}
    </Link>
  );
}
