"use client";

import DashboardShell from "@/components/refine/dashboard-shell";
import RoleGuard from "@/components/refine/role-guard";

const navItems = [
  { href: "/dashboard/finance", icon: "grid", label: "Overview" },
  { href: "/dashboard/finance/payments", icon: "dollar", label: "Payments" },
  { href: "/dashboard/finance/subscriptions", icon: "book", label: "Subscriptions" },
  { href: "/dashboard/finance/payouts", icon: "chart", label: "Payouts" },
  { href: "/dashboard/finance/commission", icon: "settings", label: "Commission" },
  { href: "/dashboard/finance/notifications", icon: "bell", label: "Notifications" },
  { href: "/dashboard/finance/security", icon: "shield", label: "Security" },
];

const BAR_ORDER = [
  "/dashboard/finance",
  "/dashboard/finance/payments",
  "/dashboard/finance/payouts",
  "/dashboard/finance/subscriptions",
  "/dashboard/finance/notifications",
  "/dashboard/finance/commission",
  "/dashboard/finance/security",
];

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRole="accountant">
      <DashboardShell role="finance" navItems={navItems} bottomNav={BAR_ORDER}>
        {children}
      </DashboardShell>
    </RoleGuard>
  );
}
