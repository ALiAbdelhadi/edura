import { SiteFooter } from "@/components/chrome/site-footer";
import { SiteHeader } from "@/components/chrome/site-header";
import { MotionBootstrap } from "@/lib/motion/motion-bootstrap";
import { MotionProvider } from "@/lib/motion/motion-provider";
import { isRtlLocale, routing } from "@/i18n/routing";
import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { IBM_Plex_Mono, IBM_Plex_Sans_Arabic, Noto_Sans } from "next/font/google";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import type { Locale } from "@/lib/i18n";
import "../globals.css";

// Same three faces as the product, same subsets. next/font self-hosts them,
// which is what lets the CSP keep `font-src 'self'` with no vendor origin.
const notoSans = Noto_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-noto-sans",
  display: "swap",
});

const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-arabic",
  display: "swap",
});

// Every FIGURE on this site is set in this face, exactly as in the product —
// it is what separates "the system computed this" from "a marketer wrote
// this", which is the whole claim the showcase is making.
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6f2" },
    { media: "(prefers-color-scheme: dark)", color: "#14161c" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    title: { default: t("titleDefault"), template: `%s — ${t("siteName")}` },
    description: t("description"),
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const rtl = isRtlLocale(locale);

  return (
    <html
      lang={locale}
      dir={rtl ? "rtl" : "ltr"}
      // `data-motion` starts at "reduced" and MotionProvider relaxes it once
      // the media query has been read. Starting at "full" would show one frame
      // of motion to the users who asked for none.
      data-motion="reduced"
      suppressHydrationWarning
      className={`${notoSans.variable} ${plexArabic.variable} ${plexMono.variable}`}
    >
      <head>
        <MotionBootstrap />
      </head>
      <body>
        <NextIntlClientProvider>
          <MotionProvider isRtl={rtl}>
            <SiteHeader />
            {children}
            <SiteFooter locale={locale as Locale} />
          </MotionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
