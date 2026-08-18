"use client";

import DashboardShell from "@/components/refine/dashboard-shell";
import RoleGuard from "@/components/refine/role-guard";

/**
 * FLAT ON PURPOSE, and it is the same threshold the center-staff portal uses:
 * group a menu once it outgrows about eight entries. This one has seven, and a
 * seven-item list under four headings is more furniture than list.
 *
 * The ORDER is the super-admin portal's @money group verbatim — payments in,
 * what they bought, payouts out, then the rate that governs both — followed by
 * comms and then the account screen. An accountant and a super admin read the
 * same ledgers, so the two menus put them in the same sequence; the accountant
 * simply has fewer. Keep this list in step with that group if either moves.
 */
const navItems = [
  { href: "/dashboard/finance", icon: "grid", label: "Overview" },
  { href: "/dashboard/finance/payments", icon: "dollar", label: "Payments", tour: "fin-payments" },
  { href: "/dashboard/finance/subscriptions", icon: "book", label: "Subscriptions", tour: "fin-subscriptions" },
  { href: "/dashboard/finance/payouts", icon: "chart", label: "Payouts", tour: "fin-payouts" },
  { href: "/dashboard/finance/commission", icon: "settings", label: "Commission", tour: "fin-commission" },
  { href: "/dashboard/finance/notifications", icon: "bell", label: "Notifications", tour: "fin-notifications" },
  { href: "/dashboard/finance/security", icon: "shield", label: "Security", tour: "fin-security" },
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
