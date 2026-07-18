"use client";

import React, { Suspense } from "react";
import { SessionProvider } from "next-auth/react";
import { useLocale } from "next-intl";
import { Refine } from "@refinedev/core";
import { DirectionProvider } from "@repo/ui/components/direction-provider";
import { Toaster } from "@repo/ui/components/sonner";
import { dataProvider, authProvider } from "@/lib/refine";
import { useAppRouterProvider } from "@/lib/refine/router-provider";
import { ThemeModeProvider } from "@/components/providers/theme-mode-provider";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { isRtlLocale } from "@/i18n/routing";

const resources = [
  { name: "students", meta: { label: "Students" } },
  { name: "teachers", meta: { label: "Teachers" } },
  { name: "courses", meta: { label: "Classes" } },
  { name: "grades", meta: { label: "Grades" } },
  { name: "payments", meta: { label: "Fees" } },
  { name: "sessions", meta: { label: "Sessions" } },
  { name: "enrollments", meta: { label: "Enrollments" } },
  { name: "expenses", meta: { label: "Expenses" } },
  { name: "rooms", meta: { label: "Rooms" } },
  { name: "reports", meta: { label: "Reports" } },
  { name: "me-children", meta: { label: "Children" } },
  { name: "me-attendance", meta: { label: "Attendance" } },
  { name: "dashboards-student", meta: { label: "Dashboard" } },
  { name: "dashboards-teacher", meta: { label: "Dashboard" } },
  { name: "dashboards-admin", meta: { label: "Dashboard" } },
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
        projectId: "edura",
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
    <SessionProvider refetchInterval={5 * 60} refetchOnWindowFocus={false}>
      <ThemeModeProvider>
        <DirectionProvider dir={dir}>
          <Suspense fallback={null}>
            <RefineProvider>{children}</RefineProvider>
          </Suspense>
          {}
          <Toaster position={dir === "rtl" ? "bottom-left" : "bottom-right"} />
          <InstallPrompt />
        </DirectionProvider>
      </ThemeModeProvider>
    </SessionProvider>
  );
}
