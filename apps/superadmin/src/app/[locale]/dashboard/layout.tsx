import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
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

  // 2FA is REQUIRED for back-office accounts (super_admin/accountant): a
  // signed-in account that has not enrolled cannot render ANY dashboard
  // screen — it is sent to the enrollment gate. (Unauthenticated visitors are
  // handled by the client-side refine guard exactly as before.)
  const session = await auth.api.getSession({ headers: await headers() });
  if (
    session?.user &&
    !(session.user as { twoFactorEnabled?: boolean }).twoFactorEnabled
  ) {
    redirect(`/${locale}/two-factor-setup`);
  }

  return (
    <NextIntlClientProvider messages={await getMessages()}>
      {children}
    </NextIntlClientProvider>
  );
}
