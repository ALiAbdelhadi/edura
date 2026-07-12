import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Noto_Sans } from "next/font/google";
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
    <html lang={lang} dir={lang === "ar" ? "rtl" : "ltr"}>
      <body className={`${notoSans.variable} ${plusJakartaSans.variable}`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
