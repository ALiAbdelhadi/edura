import { ViewAsBanner } from "@/components/ui/view-as-banner";
import { routing } from "@/i18n/routing";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (hasLocale(routing.locales, locale)) setRequestLocale(locale);
  return (
    <NextIntlClientProvider messages={await getMessages()}>
      {/* Above every portal, unconditional and undismissable. It renders
          nothing at all for an ordinary session. */}
      <ViewAsBanner />
      {children}
    </NextIntlClientProvider>
  );
}
