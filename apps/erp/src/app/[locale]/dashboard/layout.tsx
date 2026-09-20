import { routing } from "@/i18n/routing";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";

// No message provider here on purpose. This layout used to pass the WHOLE
// dictionary to every dashboard page; each portal layout now mounts <PortalIntl>,
// which carries only that portal's namespaces (src/lib/i18n/portal-namespaces.ts).
export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (hasLocale(routing.locales, locale)) setRequestLocale(locale);
  return children;
}
