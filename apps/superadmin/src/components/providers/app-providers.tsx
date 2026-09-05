"use client";

import React, { Suspense } from "react";
import { useLocale } from "next-intl";
import { Refine } from "@refinedev/core";
import { DirectionProvider } from "@repo/ui/components/direction-provider";
import { Toaster } from "@repo/ui/components/sonner";
import { dataProvider, authProvider } from "@/lib/refine";
import { useSonnerNotificationProvider } from "@/lib/refine/notification-provider";
import { reactQueryClientConfig } from "@/lib/refine/query-client";
import { useAppRouterProvider } from "@/lib/refine/router-provider";
import { SessionIntegrityGuard } from "@/components/providers/session-integrity-guard";
import { ThemeModeProvider } from "@/components/providers/theme-mode-provider";
import { isRtlLocale } from "@/i18n/routing";

const resources = [{ name: "notifications", meta: { label: "Notifications" } }];

function RefineProvider({ children }: { children: React.ReactNode }) {
  const routerProvider = useAppRouterProvider();

  return (
    <Refine
      dataProvider={dataProvider}
      authProvider={authProvider}
      notificationProvider={useSonnerNotificationProvider}
      routerProvider={routerProvider}
      resources={resources}
      options={{
        syncWithLocation: true,
        warnWhenUnsavedChanges: true,
        disableTelemetry: true,
        projectId: "edura-superadmin",
        reactQuery: { clientConfig: reactQueryClientConfig },
      }}
    >
      {children}
    </Refine>
  );
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const locale = useLocale();
  const dir = isRtlLocale(locale) ? "rtl" : "ltr";
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
        <SessionIntegrityGuard />
      </DirectionProvider>
    </ThemeModeProvider>
  );
}
