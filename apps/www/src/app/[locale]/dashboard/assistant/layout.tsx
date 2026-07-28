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

export default function AssistantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard allowedRole="assistant">
      <DashboardShell role="assistant" navItems={navItems}>
        {children}
      </DashboardShell>
    </RoleGuard>
  );
}
