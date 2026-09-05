import { AppProviders } from "@/components/providers/app-providers";
import { isRtlLocale, routing } from "@/i18n/routing";
import { baseMessages } from "@/lib/i18n/scope";
import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { headers } from "next/headers";
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

export const metadata: Metadata = {
  title: "Edura — Platform Back-office",
  description: "Edura super-admin and finance staff portal",
  robots: { index: false, follow: false },
  icons: {
    icon: "/edura-mark.svg",
    shortcut: "/edura-mark.svg",
    apple: "/edura-mark.svg",
  },
};

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
  // SECURITY_AUDIT.md M-09: the per-request nonce minted in src/proxy.ts. The
  // theme script is the one author-written <script> in the app; under
  // 'strict-dynamic' a bare `src` is not enough, it needs the nonce too.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang={locale}
      dir={dir}
      suppressHydrationWarning
      className={`${notoSans.variable} ${plexArabic.variable} ${plexMono.variable} ${cormorant.variable} ${lora.variable} ${amiri.variable} ${alexandria.variable} ${inter.variable}`}
    >
      <body>
        <script src="/theme-init.js" async nonce={nonce} />
        <NextIntlClientProvider messages={messages}>
          <AppProviders>{children}</AppProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
