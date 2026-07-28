"use client";

import DashboardShell from "@/components/refine/dashboard-shell";
import RoleGuard from "@/components/refine/role-guard";
import { ChildSelectorProvider } from "@/components/ui/child-selector";

const navGroups = [
  {
    label: "@oversight",
    items: [
      { href: "/dashboard/parent", icon: "home", label: "Dashboard" },
      { href: "/dashboard/parent/children", icon: "users", label: "My Children" },
      { href: "/dashboard/parent/progress", icon: "chart", label: "Child Progress" },
      { href: "/dashboard/parent/attendance", icon: "check", label: "Attendance" },
      { href: "/dashboard/parent/oversight", icon: "shield", label: "Child Safety" },
    ],
  },
  {
    label: "@money",
    items: [
      { href: "/dashboard/parent/pay", icon: "book", label: "Pay for a Lesson" },
      { href: "/dashboard/parent/wallet", icon: "wallet", label: "My Wallet" },
      { href: "/dashboard/parent/fees", icon: "dollar", label: "Fees & Payments" },
    ],
  },
  {
    label: "@comms",
    items: [
      { href: "/dashboard/parent/messages", icon: "message", label: "Messages" },
      { href: "/dashboard/parent/notifications", icon: "bell", label: "Notifications" },
      { href: "/dashboard/parent/settings", icon: "settings", label: "Settings" },
    ],
  },
];

const bottomNav = [
  "/dashboard/parent",
  "/dashboard/parent/children",
  "/dashboard/parent/fees",
  "/dashboard/parent/messages",
  "/dashboard/parent/oversight",
];

export default function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard allowedRole="parent">
      <ChildSelectorProvider>
        <DashboardShell role="parent" navGroups={navGroups} bottomNav={bottomNav}>
          {children}
        </DashboardShell>
      </ChildSelectorProvider>
    </RoleGuard>
  );
}
