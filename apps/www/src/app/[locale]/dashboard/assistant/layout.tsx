"use client";

import DashboardShell from "@/components/refine/dashboard-shell";
import RoleGuard from "@/components/refine/role-guard";

// Assistant portal: assistants are the front line of teacher↔student
// communication, so Messages IS their main workspace.
const navItems = [
  { href: "/dashboard/assistant", icon: "message", label: "Messages" },
  { href: "/dashboard/assistant/notes", icon: "clipboard", label: "Team Notes" },
  { href: "/dashboard/assistant/classes", icon: "book", label: "My Classes" },
  { href: "/dashboard/assistant/attendance", icon: "check", label: "Attendance" },
  { href: "/dashboard/assistant/grades", icon: "chart", label: "Gradebook" },
  { href: "/dashboard/assistant/materials", icon: "book", label: "Materials" },
  { href: "/dashboard/assistant/collaborations", icon: "users", label: "My Centers" },
  { href: "/dashboard/assistant/door", icon: "check", label: "Door Check-in" },
  {
    href: "/dashboard/assistant/notifications",
    icon: "bell",
    label: "Notifications",
  },
  { href: "/dashboard/assistant/settings", icon: "settings", label: "Settings" },
];

/**
 * Phone bar order — the one portal where it barely reorders the sidebar,
 * because the sidebar is already ordered by what an assistant does.
 *
 * Messages keeps the first slot: it is both this portal's index route and its
 * main workspace. Door Check-in is promoted into the four, though — in
 * `counter_and_door` mode the hall-door check-in is the ASSISTANT'S job (it is
 * the teacher's account only as a fallback), and it is done standing at a door
 * holding a phone, which is precisely what this bar is for.
 *
 * EVERY `navItems` href is listed — the bar is the phone's only navigation.
 */
const BAR_ORDER = [
  "/dashboard/assistant",
  "/dashboard/assistant/attendance",
  "/dashboard/assistant/door",
  "/dashboard/assistant/classes",
  "/dashboard/assistant/notes",
  "/dashboard/assistant/grades",
  "/dashboard/assistant/materials",
  "/dashboard/assistant/collaborations",
  "/dashboard/assistant/notifications",
  "/dashboard/assistant/settings",
];

export default function AssistantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard allowedRole="assistant">
      <DashboardShell
        role="assistant"
        navItems={navItems}
        bottomNav={BAR_ORDER}
      >
        {children}
      </DashboardShell>
    </RoleGuard>
  );
}
