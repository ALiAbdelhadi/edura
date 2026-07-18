"use client";

import DashboardShell from "@/components/refine/dashboard-shell";
import RoleGuard from "@/components/refine/role-guard";
import { OnboardingGate } from "@/features/onboarding/onboarding-gate";

const navItems = [
  { href: "/dashboard/admin", icon: "grid", label: "Overview" },
  { href: "/dashboard/admin/students", icon: "users", label: "Students" },
  { href: "/dashboard/admin/enrollment-requests", icon: "bell", label: "Requests" },
  { href: "/dashboard/admin/teachers", icon: "person", label: "Teachers" },
  { href: "/dashboard/admin/classes", icon: "book", label: "Classes" },
  { href: "/dashboard/admin/rooms", icon: "home", label: "Rooms" },
  { href: "/dashboard/admin/fees", icon: "dollar", label: "Fees" },
  { href: "/dashboard/admin/expenses", icon: "report", label: "Expenses" },
  { href: "/dashboard/admin/reports", icon: "report", label: "Reports" },
  { href: "/dashboard/admin/messages", icon: "message", label: "Messages" },
  { href: "/dashboard/admin/notifications", icon: "bell", label: "Notifications" },
  { href: "/dashboard/admin/settings", icon: "settings", label: "Settings" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard allowedRole="center_admin">
      <OnboardingGate>
      <DashboardShell role="admin" navItems={navItems}>
        {children}
      </DashboardShell>
    </OnboardingGate>
    </RoleGuard>
  );
}
