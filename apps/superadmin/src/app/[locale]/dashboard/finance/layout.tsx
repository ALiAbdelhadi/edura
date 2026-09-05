"use client";

import DashboardShell from "@/components/refine/dashboard-shell";
import RoleGuard from "@/components/refine/role-guard";

const navItems = [
  { href: "/dashboard/finance", icon: "grid", label: "Overview" },
  { href: "/dashboard/finance/payments", icon: "dollar", label: "Payments", tour: "fin-payments" },
  { href: "/dashboard/finance/subscriptions", icon: "book", label: "Subscriptions", tour: "fin-subscriptions" },
  { href: "/dashboard/finance/payouts", icon: "chart", label: "Payouts", tour: "fin-payouts" },
  { href: "/dashboard/finance/transactions", icon: "dollar", label: "Transactions", tour: "fin-transactions" },
  { href: "/dashboard/finance/invoices", icon: "book", label: "Invoices", tour: "fin-invoices" },
  { href: "/dashboard/finance/reports", icon: "chart", label: "Reports", tour: "fin-reports" },
  { href: "/dashboard/finance/commission", icon: "settings", label: "Commission", tour: "fin-commission" },
  { href: "/dashboard/finance/notifications", icon: "bell", label: "Notifications", tour: "fin-notifications" },
  { href: "/dashboard/finance/security", icon: "shield", label: "Security", tour: "fin-security" },
];

const BAR_ORDER = [
  "/dashboard/finance",
  "/dashboard/finance/payments",
  "/dashboard/finance/payouts",
  "/dashboard/finance/subscriptions",
  "/dashboard/finance/transactions",
  "/dashboard/finance/invoices",
  "/dashboard/finance/reports",
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
