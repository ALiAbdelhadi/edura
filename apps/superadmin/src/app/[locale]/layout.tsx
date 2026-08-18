import { AppProviders } from "@/components/providers/app-providers";
import { isRtlLocale, routing } from "@/i18n/routing";
import { baseMessages } from "@/lib/i18n/scope";
import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
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

// The display pair. Loaded here because the shared token sheet reads
// --font-cormorant / --font-lora / --font-amiri unconditionally: an app that
// imports the sheet without defining them would lose the whole font-family
// declaration, not fall through to the next name. Subsets are per-script, so
// neither locale downloads the other's display face.
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
    // --paper, both themes. Literals because the browser chrome reads this
    // before any stylesheet exists. The previous pair (#5b76fe / #0b1020) was
    // the retired EduConnect violet and matched nothing the app renders.
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
  // Base namespaces only; /dashboard mounts the full dictionary. Omitting
  // `messages` would serialize all 56KB (en) / 73KB (ar) into the login screen.
  const messages = baseMessages(await getMessages());
  return (
    <html
      lang={locale}
      dir={dir}
      suppressHydrationWarning
      className={`${notoSans.variable} ${plexArabic.variable} ${plexMono.variable} ${cormorant.variable} ${lora.variable} ${amiri.variable} ${alexandria.variable} ${inter.variable}`}
    >
      <body>
        {/* Anti-FOUC theme init — `async` keeps it a React 19 hoistable
            resource (no "script tag while rendering" error on client
            re-renders); see apps/www root layout for the full rationale. */}
        <script src="/theme-init.js" async />
        <NextIntlClientProvider messages={messages}>
          <AppProviders>{children}</AppProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
