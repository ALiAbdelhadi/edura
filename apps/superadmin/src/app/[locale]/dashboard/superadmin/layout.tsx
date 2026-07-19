"use client";

import DashboardShell from "@/components/refine/dashboard-shell";
import RoleGuard from "@/components/refine/role-guard";

const navItems = [
  { href: "/dashboard/superadmin", icon: "grid", label: "Overview" },
  {
    href: "/dashboard/superadmin/registrations",
    icon: "bell",
    label: "Registrations",
  },
  { href: "/dashboard/superadmin/catalog", icon: "book", label: "Catalog" },
  { href: "/dashboard/superadmin/payments", icon: "dollar", label: "Payments" },
  { href: "/dashboard/superadmin/subscriptions", icon: "book", label: "Subscriptions" },
];

export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard allowedRole="super_admin">
      <DashboardShell role="superadmin" navItems={navItems}>
        {children}
      </DashboardShell>
    </RoleGuard>
  );
}
