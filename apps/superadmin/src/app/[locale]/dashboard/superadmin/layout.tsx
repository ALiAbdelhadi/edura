"use client";

import DashboardShell from "@/components/refine/dashboard-shell";
import RoleGuard from "@/components/refine/role-guard";

/**
 * These groups were already WRITTEN — every entry carried a `group: "Oversight"
 * | "Money" | "Comms"` field, and `navGroup.*` had translations in ar and en —
 * but the shell's `NavItem` type never declared the field and its render was a
 * flat `navItems.map`. So the field was inert and twenty-one destinations
 * shipped as one unbroken column. The shell now takes `navGroups`, which makes
 * the grouping a structure the compiler can see instead of a property nothing
 * reads.
 *
 * ONE TAXONOMY CHANGE while wiring it up: "Comms" held Audit log, Security,
 * Deletion requests and Feature flags. None of those is communication — they
 * are what the platform does to ITSELF, and filing an audit trail beside a
 * WhatsApp log is how an operator stops trusting the headings. They are now
 * @governance, which is also the group whose entries a regulator would ask for.
 *
 * Each group runs in the direction its work runs: oversight from the newest
 * arrivals inward, money from cash in to cash out and then to the rates that
 * govern both.
 */
const navGroups = [
  {
    label: "",
    items: [{ href: "/dashboard/superadmin", icon: "grid", label: "Overview" }],
  },
  {
    label: "@oversight",
    items: [
      // Registrations first: it is the only queue here with people waiting on
      // the other end of it.
      {
        href: "/dashboard/superadmin/registrations",
        icon: "bell",
        label: "Registrations",
        tour: "nav-registrations",
      },
      { href: "/dashboard/superadmin/users", icon: "users", label: "Users", tour: "nav-users" },
      { href: "/dashboard/superadmin/centers", icon: "home", label: "Centers", tour: "nav-centers" },
      { href: "/dashboard/superadmin/teachers", icon: "users", label: "Teachers", tour: "nav-teachers" },
      {
        href: "/dashboard/superadmin/collaborations",
        icon: "users",
        label: "Collaborations",
        tour: "nav-collaborations",
      },
      // Catalog is reference data, not a party — last in the group, and moved
      // off the middle of the list where it interrupted centers → teachers →
      // collaborations, which are one chain.
      { href: "/dashboard/superadmin/catalog", icon: "book", label: "Catalog", tour: "nav-catalog" },
    ],
  },
  {
    label: "@money",
    items: [
      { href: "/dashboard/superadmin/payments", icon: "dollar", label: "Payments", tour: "nav-payments" },
      {
        href: "/dashboard/superadmin/subscriptions",
        icon: "book",
        label: "Subscriptions",
        tour: "nav-subscriptions",
      },
      { href: "/dashboard/superadmin/payouts", icon: "chart", label: "Payouts", tour: "nav-payouts" },
      {
        href: "/dashboard/superadmin/settlements",
        icon: "dollar",
        label: "Room settlements",
        tour: "nav-settlements",
      },
      // The two rate/policy screens last: they CONFIGURE the four ledgers above
      // rather than reporting them, and a setting listed among records reads as
      // another record.
      { href: "/dashboard/superadmin/commission", icon: "settings", label: "Commission", tour: "nav-commission" },
      { href: "/dashboard/superadmin/wallet", icon: "wallet", label: "Wallet policy", tour: "nav-wallet" },
    ],
  },
  {
    label: "@comms",
    items: [
      {
        href: "/dashboard/superadmin/notifications",
        icon: "bell",
        label: "Notifications",
        tour: "nav-notifications",
      },
      { href: "/dashboard/superadmin/messaging", icon: "message", label: "Messaging", tour: "nav-messaging" },
      { href: "/dashboard/superadmin/whatsapp", icon: "bell", label: "WhatsApp", tour: "nav-whatsapp" },
      {
        href: "/dashboard/superadmin/contact",
        icon: "message",
        label: "Contact inbox",
        tour: "nav-contact",
      },
    ],
  },
  {
    label: "@governance",
    items: [
      { href: "/dashboard/superadmin/audit", icon: "shield", label: "Audit log", tour: "nav-audit" },
      { href: "/dashboard/superadmin/security", icon: "shield", label: "Security", tour: "nav-security" },
      {
        href: "/dashboard/superadmin/deletion-requests",
        icon: "shield",
        label: "Deletion requests",
        tour: "nav-deletion",
      },
      {
        href: "/dashboard/superadmin/feature-flags",
        icon: "settings",
        label: "Feature flags",
        tour: "nav-flags",
      },
    ],
  },
];

/**
 * First four = the thumb slots. The tail is the sidebar's order, so the "more"
 * sheet — which holds seventeen of these twenty-one on a phone — does not
 * present a second ordering of the same menu. EVERY href is listed.
 */
const BAR_ORDER = [
  "/dashboard/superadmin",
  "/dashboard/superadmin/registrations",
  "/dashboard/superadmin/users",
  "/dashboard/superadmin/payouts",
  // — the "more" sheet, in sidebar order —
  "/dashboard/superadmin/centers",
  "/dashboard/superadmin/teachers",
  "/dashboard/superadmin/collaborations",
  "/dashboard/superadmin/catalog",
  "/dashboard/superadmin/payments",
  "/dashboard/superadmin/subscriptions",
  "/dashboard/superadmin/settlements",
  "/dashboard/superadmin/commission",
  "/dashboard/superadmin/wallet",
  "/dashboard/superadmin/notifications",
  "/dashboard/superadmin/messaging",
  "/dashboard/superadmin/whatsapp",
  "/dashboard/superadmin/contact",
  "/dashboard/superadmin/audit",
  "/dashboard/superadmin/security",
  "/dashboard/superadmin/deletion-requests",
  "/dashboard/superadmin/feature-flags",
];

export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard allowedRole="super_admin">
      <DashboardShell role="superadmin" navGroups={navGroups} bottomNav={BAR_ORDER}>
        {children}
      </DashboardShell>
    </RoleGuard>
  );
}
