import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import type { ReactNode } from "react";
import { ViewAsBanner } from "@/components/ui/view-as-banner";
import { portalMessages } from "@/lib/i18n/scope";
import type { PortalName } from "@/lib/i18n/portal-namespaces";

// One provider per portal, carrying only that portal's namespaces. The banner
// lives here rather than in dashboard/layout.tsx because it reads `shared`, which
// is not in the base set -- it has to sit inside a provider that carries it.
export async function PortalIntl({
  portal,
  children,
}: {
  portal: PortalName;
  children: ReactNode;
}) {
  return (
    <NextIntlClientProvider messages={portalMessages(portal)(await getMessages())}>
      <ViewAsBanner />
      {children}
    </NextIntlClientProvider>
  );
}
