"use client";

import DashboardShell from "@/components/refine/dashboard-shell";
import RoleGuard from "@/components/refine/role-guard";

const navItems = [
  { href: "/dashboard/superadmin", icon: "grid", label: "Overview", group: "Oversight" },
  {
    href: "/dashboard/superadmin/registrations",
    icon: "bell",
    label: "Registrations",
    group: "Oversight",
  },
  { href: "/dashboard/superadmin/users", icon: "users", label: "Users", group: "Oversight" },
  { href: "/dashboard/superadmin/centers", icon: "home", label: "Centers", group: "Oversight" },
  { href: "/dashboard/superadmin/teachers", icon: "users", label: "Teachers", group: "Oversight" },
  { href: "/dashboard/superadmin/catalog", icon: "book", label: "Catalog", group: "Oversight" },
  {
    href: "/dashboard/superadmin/collaborations",
    icon: "users",
    label: "Collaborations",
    group: "Oversight",
  },

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
  {
    href: "/dashboard/superadmin/notifications",
    icon: "bell",
    label: "Notifications",
    group: "Comms",
  },
  { href: "/dashboard/superadmin/messaging", icon: "message", label: "Messaging", group: "Comms" },
  { href: "/dashboard/superadmin/whatsapp", icon: "bell", label: "WhatsApp", group: "Comms" },
  {
    href: "/dashboard/superadmin/contact",
    icon: "message",
    label: "Contact inbox",
    group: "Comms",
  },
  { href: "/dashboard/superadmin/audit", icon: "shield", label: "Audit log", group: "Comms" },
  { href: "/dashboard/superadmin/security", icon: "shield", label: "Security", group: "Comms" },
  {
    href: "/dashboard/superadmin/deletion-requests",
    icon: "shield",
    label: "Deletion requests",
    group: "Comms",
  },
  {
    href: "/dashboard/superadmin/feature-flags",
    icon: "settings",
    label: "Feature flags",
    group: "Comms",
  },
];

const BAR_ORDER = [
  "/dashboard/superadmin",
  "/dashboard/superadmin/registrations",
  "/dashboard/superadmin/users",
  "/dashboard/superadmin/payouts",
  "/dashboard/superadmin/notifications",
  "/dashboard/superadmin/centers",
  "/dashboard/superadmin/teachers",
  "/dashboard/superadmin/collaborations",
  "/dashboard/superadmin/payments",
  "/dashboard/superadmin/settlements",
  "/dashboard/superadmin/subscriptions",
  "/dashboard/superadmin/commission",
  "/dashboard/superadmin/wallet",
  "/dashboard/superadmin/messaging",
  "/dashboard/superadmin/whatsapp",
  "/dashboard/superadmin/audit",
  "/dashboard/superadmin/catalog",
  "/dashboard/superadmin/security",
];

export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard allowedRole="super_admin">
      <DashboardShell role="superadmin" navItems={navItems} bottomNav={BAR_ORDER}>
        {children}
      </DashboardShell>
    </RoleGuard>
  );
}
