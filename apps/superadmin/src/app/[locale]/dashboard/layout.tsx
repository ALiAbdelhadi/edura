import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ImpersonationBanner } from "@/components/ui/impersonation-banner";
import { auth } from "@/lib/auth/auth";
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

  const session = await auth.api.getSession({ headers: await headers() });
  const impersonated = !!(session?.session as { impersonatedBy?: string | null } | undefined)
    ?.impersonatedBy;
  if (
    session?.user &&
    !impersonated &&
    !(session.user as { twoFactorEnabled?: boolean }).twoFactorEnabled
  ) {
    redirect(`/${locale}/two-factor-setup`);
  }

  return (
    <NextIntlClientProvider messages={await getMessages()}>
      <ImpersonationBanner />
      {children}
    </NextIntlClientProvider>
  );
}
