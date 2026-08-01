"use client";

import React, { Suspense } from "react";
import { useLocale } from "next-intl";
import { Refine } from "@refinedev/core";
import { DirectionProvider } from "@repo/ui/components/direction-provider";
import { Toaster } from "@repo/ui/components/sonner";
import { dataProvider, authProvider } from "@/lib/refine";
import { useAppRouterProvider } from "@/lib/refine/router-provider";
import { ThemeModeProvider } from "@/components/providers/theme-mode-provider";
import { isRtlLocale } from "@/i18n/routing";

const resources = [
  { name: "admin-centers", meta: { label: "Centers" } },
  { name: "admin-teachers", meta: { label: "Teachers" } },
  { name: "admin-students", meta: { label: "Students" } },
  { name: "admin-registrations", meta: { label: "Registrations" } },
  { name: "notifications", meta: { label: "Notifications" } },
];

function RefineProvider({ children }: { children: React.ReactNode }) {
  const routerProvider = useAppRouterProvider();

  return (
    <Refine
      dataProvider={dataProvider}
      authProvider={authProvider}
      routerProvider={routerProvider}
      resources={resources}
      options={{
        syncWithLocation: true,
        warnWhenUnsavedChanges: true,
        disableTelemetry: true,
        projectId: "edura-superadmin",
      }}
    >
      {children}
    </Refine>
  );
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const locale = useLocale();
  const dir = isRtlLocale(locale) ? "rtl" : "ltr";
  // No SessionProvider needed: better-auth's useSession (lib/auth/client) is
  // a self-contained nanostore — no React context wrapper.
  return (
    <ThemeModeProvider>
      <DirectionProvider dir={dir}>
        <Suspense fallback={null}>
          <RefineProvider>{children}</RefineProvider>
        </Suspense>
        <Toaster
          dir={dir}
          position={dir === "rtl" ? "bottom-left" : "bottom-right"}
        />
      </DirectionProvider>
    </ThemeModeProvider>
  );
}
