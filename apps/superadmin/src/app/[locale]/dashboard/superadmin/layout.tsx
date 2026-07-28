"use client";

import DashboardShell from "@/components/refine/dashboard-shell";
import RoleGuard from "@/components/refine/role-guard";

// Three labelled sections, replacing 16 flat items. The audit's finding was
// that Payments / Payouts / Room settlements / Commission / Wallet policy read
// as five indistinguishable siblings — and two of them literally rendered the
// same Arabic string. Grouping is what makes the money screens legible as a
// set; the payouts/payments rename is what makes them distinguishable within
// it. See design/DECISIONS.md.
const navItems = [
  // الإشراف / Oversight
  { href: "/dashboard/superadmin", icon: "grid", label: "Overview", group: "Oversight" },
  {
    href: "/dashboard/superadmin/registrations",
    icon: "bell",
    label: "Registrations",
    group: "Oversight",
  },
  { href: "/dashboard/superadmin/centers", icon: "home", label: "Centers", group: "Oversight" },
  { href: "/dashboard/superadmin/teachers", icon: "users", label: "Teachers", group: "Oversight" },
  { href: "/dashboard/superadmin/catalog", icon: "book", label: "Catalog", group: "Oversight" },
  {
    href: "/dashboard/superadmin/collaborations",
    icon: "users",
    label: "Collaborations",
    group: "Oversight",
  },

  // الأموال / Money
  { href: "/dashboard/superadmin/payouts", icon: "chart", label: "Payouts", group: "Money" },
  { href: "/dashboard/superadmin/payments", icon: "dollar", label: "Payments", group: "Money" },
  {
    href: "/dashboard/superadmin/settlements",
    icon: "dollar",
    label: "Room settlements",
    group: "Money",
  },
  { href: "/dashboard/superadmin/commission", icon: "settings", label: "Commission", group: "Money" },
  {
    href: "/dashboard/superadmin/subscriptions",
    icon: "book",
    label: "Subscriptions",
    group: "Money",
  },
  { href: "/dashboard/superadmin/wallet", icon: "wallet", label: "Wallet policy", group: "Money" },

  // التواصل والرقابة / Comms & oversight
  {
    href: "/dashboard/superadmin/notifications",
    icon: "bell",
    label: "Notifications",
    group: "Comms",
  },
  { href: "/dashboard/superadmin/messaging", icon: "message", label: "Messaging", group: "Comms" },
  { href: "/dashboard/superadmin/whatsapp", icon: "bell", label: "WhatsApp", group: "Comms" },
  { href: "/dashboard/superadmin/audit", icon: "shield", label: "Audit log", group: "Comms" },
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
