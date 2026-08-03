import { Cta } from "@/components/scene/cta";
import { StudentsPage } from "@/features/roles/students-page";
import { routing } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/lib/i18n";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata(locale as Locale, "students");
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <main id="content">
      <StudentsPage />
      <Cta locale={locale as Locale} />
    </main>
  );
}
