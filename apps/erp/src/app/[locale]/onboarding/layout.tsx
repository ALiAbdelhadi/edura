import { ViewAsBanner } from "@/components/ui/view-as-banner";
import { routing } from "@/i18n/routing";
import { onboardingMessages } from "@/lib/i18n/scope";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";

export default async function OnboardingLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (hasLocale(routing.locales, locale)) setRequestLocale(locale);
  return (
    <NextIntlClientProvider messages={onboardingMessages(await getMessages())}>
      <ViewAsBanner />
      {children}
    </NextIntlClientProvider>
  );
}
