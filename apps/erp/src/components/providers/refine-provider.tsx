"use client";

import { authProvider, dataProvider } from "@/lib/refine";
import { useSonnerNotificationProvider } from "@/lib/refine/notification-provider";
import { reactQueryClientConfig } from "@/lib/refine/query-client";
import { useAppRouterProvider } from "@/lib/refine/router-provider";
import { Refine } from "@refinedev/core";
import React from "react";

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

// Refine drags @tanstack/react-query in with it — together ~199 KB of client
// JS. It used to be mounted in the root layout, so /terms, /login, /register
// and 25 other public routes paid for a data layer they never call. It is
// mounted per-area instead: the dashboard layout, and the two public detail
// pages that genuinely use Refine hooks (centers/[id], courses/[id]).
// Anything rendering a Refine hook MUST sit under one of those.
export function RefineProvider({ children }: { children: React.ReactNode }) {
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
        projectId: "edura",
        reactQuery: { clientConfig: reactQueryClientConfig },
      }}
    >
      {children}
    </Refine>
  );
}
