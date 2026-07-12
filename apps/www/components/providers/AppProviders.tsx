"use client";

import React, { Suspense } from "react";
import { SessionProvider } from "next-auth/react";
import { Refine } from "@refinedev/core";
import { dataProvider, authProvider } from "@/lib/refine";
import { useAppRouterProvider } from "@/lib/refine/routerProvider";
import { I18nProvider } from "@/components/providers/I18nProvider";
import "@refinedev/antd/dist/reset.css";

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
  return (
    <SessionProvider refetchInterval={5 * 60} refetchOnWindowFocus={false}>
      <I18nProvider>
        <Suspense fallback={null}>
          <RefineProvider>{children}</RefineProvider>
        </Suspense>
      </I18nProvider>
    </SessionProvider>
  );
}
