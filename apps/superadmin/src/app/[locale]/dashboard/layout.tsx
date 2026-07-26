import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { routing } from "@/i18n/routing";

/**
 * Mounts the FULL message dictionary for the back-office. The root layout ships
 * only the base namespaces so the unauthenticated login screen stops carrying
 * every back-office block; everything under /dashboard keeps the complete set,
 * so no screen's translations change.
 *
 * Nested providers REPLACE messages rather than merging them, so this passes the
 * whole dictionary, not a delta. Server component with no data or session — it
 * only selects which static namespaces cross the wire.
 */
export default async function DashboardLayout({
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
    <NextIntlClientProvider messages={await getMessages()}>
      {children}
    </NextIntlClientProvider>
  );
}
