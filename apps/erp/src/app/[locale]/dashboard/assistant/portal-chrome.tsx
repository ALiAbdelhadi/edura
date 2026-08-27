"use client";

import DashboardShell from "@/components/refine/dashboard-shell";
import { AssistantDelegationStrip } from "@/features/assistant/assistant-delegation-strip";

const navGroups = [
  {
    label: "",
    items: [
      { href: "/dashboard/assistant", icon: "message", label: "Messages", tour: "nav-messages" },
      {
        href: "/dashboard/assistant/notifications",
        icon: "bell",
        label: "Notifications",
        tour: "nav-notifications",
      },
    ],
  },
  {
    label: "@teach",
    items: [
      { href: "/dashboard/assistant/classes", icon: "book", label: "My Classes", tour: "nav-classes" },
      { href: "/dashboard/assistant/attendance", icon: "check", label: "Attendance", tour: "nav-attendance" },
      { href: "/dashboard/assistant/door", icon: "check", label: "Door Check-in", tour: "nav-door" },
      { href: "/dashboard/assistant/grades", icon: "chart", label: "Gradebook", tour: "nav-grades" },
      { href: "/dashboard/assistant/materials", icon: "book", label: "Teacher Materials", tour: "nav-materials" },
    ],
  },
  {
    label: "@manage",
    items: [
      { href: "/dashboard/assistant/collaborations", icon: "users", label: "My Centers", tour: "nav-centers" },
      { href: "/dashboard/assistant/notes", icon: "clipboard", label: "Team Notes", tour: "nav-notes" },
    ],
  },
  {
    label: "@account",
    items: [
      { href: "/dashboard/assistant/tour", icon: "sparkles", label: "Practice", tour: "nav-practice" },
      { href: "/dashboard/assistant/settings", icon: "settings", label: "Settings", tour: "nav-settings" },
    ],
  },
];

const BAR_ORDER = [
  "/dashboard/assistant",
  "/dashboard/assistant/attendance",
  "/dashboard/assistant/door",
  "/dashboard/assistant/classes",
  "/dashboard/assistant/grades",
  "/dashboard/assistant/notifications",
  "/dashboard/assistant/materials",
  "/dashboard/assistant/collaborations",
  "/dashboard/assistant/notes",
  "/dashboard/assistant/tour",
  "/dashboard/assistant/settings",
];

export default function PortalChrome({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardShell
      role="assistant"
      navGroups={navGroups}
      bottomNav={BAR_ORDER}
      bottomNavMaxVisible={6}
    >
      <AssistantDelegationStrip />
      {children}
    </DashboardShell>
  );
}
