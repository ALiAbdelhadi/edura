import DashboardShell from "@/components/refine/dashboard-shell";
import RoleGuard from "@/components/refine/role-guard";

const navGroups = [
  {
    label: "",
    items: [{ href: "/dashboard/superadmin", icon: "grid", label: "Overview" }],
  },
  {
    label: "@oversight",
    items: [
      {
        href: "/dashboard/superadmin/registrations",
        icon: "bell",
        label: "Registrations",
        tour: "nav-registrations",
      },
      { href: "/dashboard/superadmin/users", icon: "users", label: "Users", tour: "nav-users" },
      { href: "/dashboard/superadmin/centers", icon: "home", label: "Centers", tour: "nav-centers" },
      { href: "/dashboard/superadmin/teachers", icon: "users", label: "Teachers", tour: "nav-teachers" },
      { href: "/dashboard/superadmin/students", icon: "users", label: "Students", tour: "nav-students" },
      {
        href: "/dashboard/superadmin/collaborations",
        icon: "users",
        label: "Collaborations",
        tour: "nav-collaborations",
      },
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
      { href: "/dashboard/superadmin/commission", icon: "settings", label: "Commission", tour: "nav-commission" },
      { href: "/dashboard/superadmin/points", icon: "chart", label: "Points", tour: "nav-points" },
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
      { href: "/dashboard/superadmin/notification-log", icon: "bell", label: "Notification log", tour: "nav-notification-log" },
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
      { href: "/dashboard/superadmin/blacklist", icon: "shield", label: "Blacklist", tour: "nav-blacklist" },
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

const BAR_ORDER = [
  "/dashboard/superadmin",
  "/dashboard/superadmin/registrations",
  "/dashboard/superadmin/users",
  "/dashboard/superadmin/payouts",
  "/dashboard/superadmin/centers",
  "/dashboard/superadmin/teachers",
  "/dashboard/superadmin/students",
  "/dashboard/superadmin/collaborations",
  "/dashboard/superadmin/catalog",
  "/dashboard/superadmin/payments",
  "/dashboard/superadmin/subscriptions",
  "/dashboard/superadmin/settlements",
  "/dashboard/superadmin/commission",
  "/dashboard/superadmin/points",
  "/dashboard/superadmin/wallet",
  "/dashboard/superadmin/notifications",
  "/dashboard/superadmin/notification-log",
  "/dashboard/superadmin/messaging",
  "/dashboard/superadmin/whatsapp",
  "/dashboard/superadmin/contact",
  "/dashboard/superadmin/audit",
  "/dashboard/superadmin/blacklist",
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
