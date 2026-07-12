"use client";

import DashboardShell from "@/components/refine/DashboardShell";
import RoleGuard from "@/components/refine/RoleGuard";

const navItems = [
  { href: "/dashboard/finance", icon: "grid", label: "Overview" },
];

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRole="accountant">
      <DashboardShell role="finance" navItems={navItems}>
        {children}
      </DashboardShell>
    </RoleGuard>
  );
}
