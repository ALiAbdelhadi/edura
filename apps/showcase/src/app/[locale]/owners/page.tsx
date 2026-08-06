import { Cta } from "@/components/scene/cta";
import { OwnersPage } from "@/features/roles/owners-page";
import { routing } from "@/i18n/routing";
import type { Locale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata(locale as Locale, "owners");
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
      <OwnersPage />
      <Cta locale={locale as Locale} />
    </main>
  );
}
