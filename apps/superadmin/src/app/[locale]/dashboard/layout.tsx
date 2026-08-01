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

  // 2FA is REQUIRED for back-office accounts (super_admin/accountant): a
  // signed-in account that has not enrolled cannot render ANY dashboard
  // screen — it is sent to the enrollment gate. (Unauthenticated visitors are
  // handled by the client-side refine guard exactly as before.)
  const session = await auth.api.getSession({ headers: await headers() });
  // NOT while impersonating. Enrollment binds a TOTP secret to an account, so
  // sending an impersonator through this gate would let them enrol a factor
  // THEY hold on someone else's login — and it would trap them in a setup
  // screen they must not complete. The impersonated account still has to
  // enrol on its own next real sign-in; nothing is waived, only deferred to
  // the person it belongs to.
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
      {/* An impersonated session is indistinguishable from a real one by design,
          so the state is declared above every dashboard screen rather than
          inferred from one. It renders nothing when nobody is impersonating. */}
      <ImpersonationBanner />
      {children}
    </NextIntlClientProvider>
  );
}
