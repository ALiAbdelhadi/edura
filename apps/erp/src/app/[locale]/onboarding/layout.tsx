import { RefineProvider } from "@/components/providers/refine-provider";
import { ViewAsBanner } from "@/components/ui/view-as-banner";
import { routing } from "@/i18n/routing";
import { onboardingMessages } from "@/lib/i18n/scope";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";

// The wizards call Refine hooks (useOnboarding -> useCustom) but sit outside
// /dashboard, where the provider is mounted. Refine is scoped per-area so the
// public routes do not ship it — see components/providers/refine-provider.tsx.
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
      <RefineProvider>{children}</RefineProvider>
    </NextIntlClientProvider>
  );
}
