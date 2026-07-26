import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import type { ReactNode } from "react";
import { onboardingMessages } from "@/lib/i18n/scope";

/**
 * The root layout ships only the base namespaces, so the onboarding wizard
 * mounts its own provider to add `onboarding`. Nested providers REPLACE
 * messages rather than merging them (use-intl reads
 * `messages === undefined ? prevContext.messages : messages`), which is why
 * this passes base + onboarding rather than the namespace alone.
 *
 * Server component: no data, no session — it only selects which static message
 * namespaces cross the wire, so the route still prerenders.
 */
export default async function OnboardingLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // Next's generated LayoutProps types `locale` as string; narrow with
  // next-intl's own guard rather than casting. An invalid locale is already
  // notFound()-ed by the root layout, so the else branch is unreachable.
  if (hasLocale(routing.locales, locale)) setRequestLocale(locale);
  return (
    <NextIntlClientProvider messages={onboardingMessages(await getMessages())}>
      {children}
    </NextIntlClientProvider>
  );
}
