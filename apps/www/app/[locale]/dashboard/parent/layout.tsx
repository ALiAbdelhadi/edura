"use client";

import DashboardShell from "@/components/refine/DashboardShell";
import RoleGuard from "@/components/refine/RoleGuard";
import { ChildSelectorProvider } from "@/components/shared/ChildSelector";

const navItems = [
  { href: "/dashboard/parent", icon: "home", label: "Dashboard" },
  { href: "/dashboard/parent/progress", icon: "chart", label: "Child Progress" },
  { href: "/dashboard/parent/attendance", icon: "check", label: "Attendance" },
  { href: "/dashboard/parent/children", icon: "users", label: "My Children" },
  { href: "/dashboard/parent/fees", icon: "dollar", label: "Fees & Payments" },
  { href: "/dashboard/parent/messages", icon: "message", label: "Messages" },
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
        <DashboardShell role="parent" navItems={navItems}>
          {children}
        </DashboardShell>
      </ChildSelectorProvider>
    </RoleGuard>
  );
}
