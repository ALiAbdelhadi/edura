import type { Metadata, Viewport } from "next";
import {
  Noto_Sans,
  IBM_Plex_Sans_Arabic,
  IBM_Plex_Mono,
} from "next/font/google";
import type { ReactNode } from "react";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing, isRtlLocale } from "@/i18n/routing";
import { appBaseUrl } from "@repo/server-core/http/app-url";
import { AppProviders } from "@/components/providers/app-providers";
import { baseMessages } from "@/lib/i18n/scope";
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

// Every FIGURE in the product is set in this face — money, IDs, dates, transaction
// refs, codes, counts. It is what separates "the system computed this" from "a human
// wrote this", and it is what makes Latin-inside-Arabic systematic rather than
// incidental. It carries no Arabic glyphs, which is deliberate: Arabic-Indic digits
// in prose must NOT resolve here (see the `num-prose` utility).
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#5b76fe" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1020" },
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
      apple: "/edura-mark.svg",
    },
  };
}

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
  // Only the app-wide chrome + public-page namespaces cross the wire here.
  // Route groups that need more mount their own provider: dashboard/layout.tsx
  // (full dictionary) and onboarding/layout.tsx. Omitting `messages` would
  // serialize all 72KB (en) / 94KB (ar) into every page, login included.
  const messages = baseMessages(await getMessages());
  return (
    <html
      lang={locale}
      dir={dir}
      suppressHydrationWarning
      // next/font declares the --font-* custom properties on whichever element
      // carries these classes. They belong on <html> (= :root) because the
      // Tailwind @theme block resolves --font-sans / --font-mono there; on
      // <body> the var() is invalid at computed-value time and `font-mono`
      // silently falls back to the sans face.
      className={`${notoSans.variable} ${plexArabic.variable} ${plexMono.variable}`}
    >
      <body>
        {/* Anti-FOUC theme init. External file (not inline) so React 19 treats
            it as a hoistable resource and never warns about client-rendered
            inline scripts; same-origin + blocking so it runs before paint. */}
        <script src="/theme-init.js" />
        <NextIntlClientProvider messages={messages}>
          <AppProviders>{children}</AppProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
