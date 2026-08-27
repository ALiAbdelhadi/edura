import { AppProviders } from "@/components/providers/app-providers";
import { isRtlLocale, routing } from "@/i18n/routing";
import { baseMessages } from "@/lib/i18n/scope";
import { AnalyticsProvider } from "@/lib/observability/analytics-provider";
import { appBaseUrl } from "@repo/server-core/http/app-url";
import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import {
  Alexandria,
  Amiri,
  Cormorant_Garamond,
  IBM_Plex_Mono,
  IBM_Plex_Sans_Arabic,
  Inter,
  Lora,
  Noto_Sans,
} from "next/font/google";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import "./globals.css";

const notoSans = Noto_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-noto-sans",
});

const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-arabic",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-cormorant",
});

const lora = Lora({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-lora",
});

const amiri = Amiri({
  subsets: ["arabic"],
  weight: ["400", "700"],
  variable: "--font-amiri",
});

/* ── the portal chrome's two faces (see packages/ui/src/styles/chrome-2026.css)
 *
 * Alexandria is the whole reason the 2026 direction is affordable: ONE variable
 * face carrying BOTH Arabic and Latin at display weights, where the retired
 * system needed Amiri and Cormorant side by side and a branch to pick between
 * them. No `weight` array — that is what requests the variable axis rather than
 * a handful of static cuts.
 *
 * Inter is the chrome's body face, and loading it FIXES something: `--lat-body`
 * is Lora, a serif, so every English nav label in the product has been
 * rendering in a serif. */
const alexandria = Alexandria({
  subsets: ["arabic", "latin"],
  variable: "--font-alexandria",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  themeColor: [
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
  const t = await getTranslations({
    locale: locale as (typeof routing.locales)[number],
    namespace: "metadata",
  });
  const languages = Object.fromEntries(
    routing.locales.map((l) => [l, `/${l}`]),
  );
  return {
    metadataBase: new URL(appBaseUrl()),
    title: t("title"),
    description: t("description"),
    alternates: {
      canonical: `/${locale}`,
      languages: { ...languages, "x-default": `/${routing.defaultLocale}` },
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "Edura",
    },
    icons: {
      icon: "/edura-mark.svg",
      shortcut: "/edura-mark.svg",
      apple: "/apple-touch-icon.png",
    },
  };
}

/* THE ROOT LAYOUT READS NOTHING PER-REQUEST, AND THAT IS THE POINT.
 *
 * It used to `await getSessionUser()` here, purely to hand PostHog an identity
 * on the first render. Reading cookies in the layout that every page renders
 * under made all 122 pages server-rendered on every request — including /help,
 * /faq, /terms, /privacy, /changelog, /contact and /pricing, which declare
 * `generateStaticParams` and hold nothing per-user. apps/superadmin's root
 * layout never made that call, which is exactly why its /login and /two-factor
 * prerender and erp's did not.
 *
 * Identity moved to `AnalyticsIdentity`, mounted by the six portal layouts,
 * which read the session anyway via `requirePortal`. Nothing is fetched twice.
 *
 * Anything added here that touches cookies(), headers() or the session will
 * silently make the whole app dynamic again. The route census in
 * cleanup-plan-phase3.md is the check. */
export default async function RootLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const dir = isRtlLocale(locale) ? "rtl" : "ltr";
  const messages = baseMessages(await getMessages());

  return (
    <html
      lang={locale}
      dir={dir}
      suppressHydrationWarning
      className={`${notoSans.variable} ${plexArabic.variable} ${plexMono.variable} ${cormorant.variable} ${lora.variable} ${amiri.variable} ${alexandria.variable} ${inter.variable}`}
    >
      <body>
        <script src="/theme-init.js" async />
        <NextIntlClientProvider messages={messages}>
          <AnalyticsProvider>
            <AppProviders>{children}</AppProviders>
          </AnalyticsProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
