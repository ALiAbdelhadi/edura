import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ImpersonationBanner } from "@/components/ui/impersonation-banner";
import { ssrSession } from "@/lib/server/ssr-session";
import { routing } from "@/i18n/routing";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (hasLocale(routing.locales, locale)) setRequestLocale(locale);

  const { user, impersonated } = await ssrSession();
  if (user && !impersonated && !user.twoFactorEnabled) {
    redirect(`/${locale}/two-factor-setup`);
  }

  return (
    <NextIntlClientProvider messages={await getMessages()}>
      <ImpersonationBanner />
      {children}
    </NextIntlClientProvider>
  );
}
