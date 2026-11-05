import DashboardShell from "@/components/refine/dashboard-shell";
import { ledgerMono, ledgerScope, ledgerShellScope } from "@/features/student/ledger";
import { WALLET_ENABLED } from "@/lib/config/features";

const WALLET_HREFS = new Set([
  "/dashboard/student/wallet",
  "/dashboard/student/practice",
]);

const allNavGroups = [
  {
    label: "",
    items: [{ href: "/dashboard/student", icon: "home", label: "Student Home" }],
  },
  {
    label: "@learn",
    items: [
      { href: "/dashboard/student/subjects", icon: "book", label: "My Subjects", tour: "nav-subjects" },
      { href: "/dashboard/student/teachers", icon: "users", label: "Find a Teacher" },
      { href: "/dashboard/student/schedule", icon: "calendar", label: "Schedule", tour: "nav-schedule" },
      { href: "/dashboard/student/attendance", icon: "check", label: "Attendance", tour: "nav-attendance" },
      { href: "/dashboard/student/grades", icon: "award", label: "Grades", tour: "nav-grades" },
      { href: "/dashboard/student/materials", icon: "book", label: "Materials" },
      { href: "/dashboard/student/reviews", icon: "star", label: "Reviews" },
    ],
  },
  {
    label: "@money",
    items: [
      {
        href: "/dashboard/student/subscriptions",
        icon: "calendar",
        label: "Subscriptions",
        tour: "nav-subscriptions",
      },
      { href: "/dashboard/student/wallet", icon: "wallet", label: "Wallet", tour: "nav-wallet" },
    ],
  },
  {
    label: "@comms",
    items: [
      { href: "/dashboard/student/messages", icon: "message", label: "Messages", tour: "nav-messages" },
      {
        href: "/dashboard/student/notifications",
        icon: "bell",
        label: "Notifications",
        tour: "nav-notifications",
      },
    ],
  },
  {
    label: "@account",
    items: [
      { href: "/dashboard/student/id", icon: "id-card", label: "Student ID", tour: "nav-id" },
      { href: "/dashboard/student/family", icon: "users", label: "Family", tour: "nav-family" },
      {
        href: "/dashboard/student/practice",
        icon: "sparkles",
        label: "Practice",
        tour: "nav-practice",
      },
      { href: "/dashboard/student/settings", icon: "settings", label: "Settings", tour: "nav-settings" },
    ],
  },
];

const navGroups = allNavGroups
  .map((g) => ({
    ...g,
    items: g.items.filter((i) => WALLET_ENABLED || !WALLET_HREFS.has(i.href)),
  }))
  .filter((g) => g.items.length > 0);

const ALL_BAR_ORDER = [
  "/dashboard/student",
  "/dashboard/student/schedule",
  "/dashboard/student/id",
  "/dashboard/student/subjects",
  "/dashboard/student/teachers",
  "/dashboard/student/wallet",
  "/dashboard/student/attendance",
  "/dashboard/student/grades",
  "/dashboard/student/materials",
  "/dashboard/student/reviews",
  "/dashboard/student/subscriptions",
  "/dashboard/student/messages",
  "/dashboard/student/notifications",
  "/dashboard/student/family",
  "/dashboard/student/practice",
  "/dashboard/student/settings",
];

const BAR_ORDER = ALL_BAR_ORDER.filter(
  (h) => WALLET_ENABLED || !WALLET_HREFS.has(h),
);

const BAR_SLOTS = 6;

export default function PortalChrome({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${ledgerMono.variable} ${ledgerShellScope} contents`}>
      <DashboardShell
        role="student"
        navGroups={navGroups}
        bottomNav={BAR_ORDER}
        bottomNavMaxVisible={BAR_SLOTS}
      >
        <div
          className={`${ledgerScope} -m-4 min-h-full p-4 sm:-m-6 sm:p-6 lg:-m-8 lg:p-8`}
        >
          {children}
        </div>
      </DashboardShell>
    </div>
  );
}