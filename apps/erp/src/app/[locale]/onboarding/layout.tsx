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
      {/* The same bar the portals carry.
          A half-onboarded account is precisely where a view-as session lands —
          `requirePortal` sends an incomplete profile here before it ever
          reaches a portal — and it is the screen where the operator is typing
          the account's REAL details. Mounting the bar only on /dashboard left
          the one place it was most needed uncovered, which nothing but opening
          a centre owner's session would have shown. */}
      <ViewAsBanner />
      {children}
    </NextIntlClientProvider>
  );
}
