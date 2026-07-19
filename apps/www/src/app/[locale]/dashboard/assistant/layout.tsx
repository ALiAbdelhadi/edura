"use client";

import DashboardShell from "@/components/refine/dashboard-shell";
import RoleGuard from "@/components/refine/role-guard";

// Assistant portal: assistants are the front line of teacher↔student
// communication, so Messages IS their main workspace.
const navItems = [
  { href: "/dashboard/assistant", icon: "message", label: "Messages" },
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
