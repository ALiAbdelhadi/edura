import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Noto_Sans, IBM_Plex_Sans_Arabic } from "next/font/google";
import type { ReactNode } from "react";
import { AppProviders } from "@/components/providers/AppProviders";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-plus-jakarta-sans",
});

const notoSans = Noto_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-noto-sans",
});

// Arabic-first product face (PRD §9.2). IBM Plex Sans Arabic is the primary UI
// font for the RTL market — neutral, high-legibility at small sizes.
const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-arabic",
});

export const metadata: Metadata = {
  title: "Edura — Educational Management System",
  description: "EduPlatform frontend",
};

export default async function RootLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const lang = locale === "ar" ? "ar" : "en";
  return (
    <html lang={lang} dir={lang === "ar" ? "rtl" : "ltr"} suppressHydrationWarning>
      <head>
        {/* Paint the correct theme before hydration to avoid a flash (FOUC). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=localStorage.getItem('edura-theme')||'system';var d=m==='dark'||(m==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);var e=document.documentElement;e.setAttribute('data-theme',d?'dark':'light');e.style.colorScheme=d?'dark':'light';}catch(_){}})();`,
          }}
        />
      </head>
      <body className={`${notoSans.variable} ${plusJakartaSans.variable} ${plexArabic.variable}`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
