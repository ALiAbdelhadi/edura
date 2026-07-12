"use client";

import DashboardShell from "@/components/refine/DashboardShell";
import RoleGuard from "@/components/refine/RoleGuard";

const navItems = [
  { href: "/dashboard/superadmin", icon: "grid", label: "Overview" },
  { href: "/dashboard/superadmin/registrations", icon: "bell", label: "Registrations" },
];

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRole="super_admin">
      <DashboardShell role="superadmin" navItems={navItems}>
        {children}
      </DashboardShell>
    </RoleGuard>
  );
}
