import { SiteFooter } from "@/components/chrome/site-footer";
import { SiteHeader } from "@/components/chrome/site-header";
import { isRtlLocale, routing } from "@/i18n/routing";
import type { Locale } from "@/lib/i18n";
import { MotionBootstrap } from "@/lib/motion/motion-bootstrap";
import { MotionProvider } from "@/lib/motion/motion-provider";
import { ThemeModeProvider } from "@repo/ui/components/theme-mode-provider";
import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  Amiri,
  Cormorant_Garamond,
  IBM_Plex_Mono,
  IBM_Plex_Sans_Arabic,
  Lora,
  Noto_Sans,
} from "next/font/google";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import "../globals.css";

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

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

// ── The display pair ────────────────────────────────────────────────────────
// Subsets are per-script, not per-app: Cormorant and Lora ship no Arabic and
// Amiri is loaded for Arabic only, so neither locale downloads the other's
// display face. Both variables are still DECLARED in every locale, because the
// token sheet reads them unconditionally.
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-cormorant",
  display: "swap",
});

const lora = Lora({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-lora",
  display: "swap",
});

const amiri = Amiri({
  subsets: ["arabic"],
  weight: ["400", "700"],
  variable: "--font-amiri",
  display: "swap",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  themeColor: [
    // --paper, both themes. Literals because the browser chrome reads this
    // before any stylesheet exists.
    { media: "(prefers-color-scheme: light)", color: "#f3f2f2" },
    { media: "(prefers-color-scheme: dark)", color: "#191817" },
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
      data-motion="reduced"
      suppressHydrationWarning
      className={`${notoSans.variable} ${plexArabic.variable} ${plexMono.variable} ${cormorant.variable} ${lora.variable} ${amiri.variable}`}
    >
      <head>
        <MotionBootstrap />
      </head>
      <body>
        {/* Runs before first paint — the provider sets `data-theme` in an effect,
            which is one frame too late and shows a white flash on the way to a
            dark page. Inlined rather than fetched from /theme-init.js (as the two
            portals do) because a separate request can resolve AFTER the first
            paint, which defeats the whole point; inline is also what
            `@next/next/no-sync-scripts` is steering toward.

            Same storage key as the portals — `edura-theme` — so a theme chosen
            in the app carries to the marketing site and back. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=localStorage.getItem("edura-theme")||"system";var d=m==="dark"||(m==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.setAttribute("data-theme",d?"dark":"light");e.style.colorScheme=d?"dark":"light"}catch(_){}})()`,
          }}
        />
        <NextIntlClientProvider>
          <ThemeModeProvider>
            <MotionProvider isRtl={rtl}>
              <SiteHeader />
              {children}
              <SiteFooter locale={locale as Locale} />
            </MotionProvider>
          </ThemeModeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
