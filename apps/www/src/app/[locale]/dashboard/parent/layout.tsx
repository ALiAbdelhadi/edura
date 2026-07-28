"use client";

import DashboardShell from "@/components/refine/dashboard-shell";
import RoleGuard from "@/components/refine/role-guard";
import { ChildSelectorProvider } from "@/components/ui/child-selector";

const navItems = [
  { href: "/dashboard/parent", icon: "home", label: "Dashboard" },
  { href: "/dashboard/parent/progress", icon: "chart", label: "Child Progress" },
  { href: "/dashboard/parent/attendance", icon: "check", label: "Attendance" },
  { href: "/dashboard/parent/children", icon: "users", label: "My Children" },
  { href: "/dashboard/parent/fees", icon: "dollar", label: "Fees & Payments" },
  { href: "/dashboard/parent/messages", icon: "message", label: "Messages" },
  { href: "/dashboard/parent/oversight", icon: "shield", label: "Child Safety" },
  { href: "/dashboard/parent/notifications", icon: "bell", label: "Notifications" },
  { href: "/dashboard/parent/settings", icon: "settings", label: "Settings" },
];

export default function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard allowedRole="parent">
      <ChildSelectorProvider>
        <DashboardShell
          role="parent"
          navItems={navItems}
          // A parent reads a record they do not control, so the phone chrome
          // is the four read surfaces — not actions.
          bottomNavHrefs={[
            "/dashboard/parent",
            "/dashboard/parent/progress",
            "/dashboard/parent/attendance",
            "/dashboard/parent/messages",
          ]}
        >
          {children}
        </DashboardShell>
      </ChildSelectorProvider>
    </RoleGuard>
  );
}
