import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Readex_Pro } from "next/font/google";

import "../globals.css";
import { DEFAULT_LOCALE, LOCALES, dirOf, isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { siteOrigin } from "@/lib/site-origin";
import { THEME_BOOTSTRAP } from "@/components/theme-toggle";

const readex = Readex_Pro({
  subsets: ["arabic", "latin"],
  weight: "variable",
  variable: "--font-readex",
  display: "swap",
});

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getMessages(isLocale(locale) ? locale : DEFAULT_LOCALE);

  return {
    metadataBase: new URL(siteOrigin()),
    title: t.meta.title,
    description: t.meta.description,
    alternates: {
      canonical: `/${locale}`,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}`])),
    },
    openGraph: {
      title: t.meta.title,
      description: t.meta.description,
      locale,
      type: "website",
      // Rendered by tools/brand-assets.ts; no page overrides openGraph, so every
      // page shares its locale's card.
      images: [{ url: `/og/${locale}.png`, width: 1200, height: 630, alt: t.meta.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: t.meta.title,
      description: t.meta.description,
      images: [`/og/${locale}.png`],
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return (
    <html
      lang={locale}
      dir={dirOf(locale)}
      className={readex.variable}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
