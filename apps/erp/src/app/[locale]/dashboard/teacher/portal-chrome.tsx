import DashboardShell from "@/components/refine/dashboard-shell";
import { WALLET_ENABLED } from "@/lib/config/features";

// Wallet-off deployments hide the wallet and the Practice emulator (fake wallet screens).
const WALLET_HREFS = new Set(["/dashboard/teacher/wallet", "/dashboard/teacher/tour"]);
const shown = <T extends { href: string }>(items: T[]): T[] =>
  WALLET_ENABLED ? items : items.filter((i) => !WALLET_HREFS.has(i.href));

const allNavGroups = [
  {
    label: "",
    items: [{ href: "/dashboard/teacher", icon: "home", label: "Dashboard" }],
  },
  {
    label: "@teach",
    items: [
      { href: "/dashboard/teacher/classes", icon: "book", label: "My Classes", tour: "nav-classes" },
      { href: "/dashboard/teacher/attendance", icon: "check", label: "Attendance", tour: "nav-attendance" },
      { href: "/dashboard/teacher/door", icon: "check", label: "Door Check-in", tour: "nav-door" },
      { href: "/dashboard/teacher/grades", icon: "chart", label: "Gradebook", tour: "nav-grades" },
      { href: "/dashboard/teacher/materials", icon: "book", label: "Teacher Materials", tour: "nav-materials" },
      { href: "/dashboard/teacher/reviews", icon: "star", label: "Reviews" },
    ],
  },
  {
    label: "@manage",
    items: [
      { href: "/dashboard/teacher/centers", icon: "users", label: "My Centers", tour: "nav-centers" },
      { href: "/dashboard/teacher/team", icon: "users", label: "Team", tour: "nav-team" },
      { href: "/dashboard/teacher/notes", icon: "clipboard", label: "Team Notes" },
    ],
  },
  {
    label: "@money",
    items: [
      { href: "/dashboard/teacher/wallet", icon: "dollar", label: "Wallet", tour: "nav-wallet" },
    ],
  },
  {
    label: "@comms",
    items: [
      { href: "/dashboard/teacher/messages", icon: "message", label: "Messages", tour: "nav-messages" },
      {
        href: "/dashboard/teacher/notifications",
        icon: "bell",
        label: "Notifications",
        tour: "nav-notifications",
      },
    ],
  },
  {
    label: "@account",
    items: [
      { href: "/dashboard/teacher/tour", icon: "sparkles", label: "Practice", tour: "nav-practice" },
      { href: "/dashboard/teacher/settings", icon: "settings", label: "Settings", tour: "nav-settings" },
    ],
  },
];

// The "@money" group holds only the wallet, so it disappears with it.
const navGroups = allNavGroups
  .map((g) => ({ ...g, items: shown(g.items) }))
  .filter((g) => g.items.length > 0);

const BAR_ORDER = [
  "/dashboard/teacher",
  "/dashboard/teacher/attendance",
  "/dashboard/teacher/classes",
  "/dashboard/teacher/door",
  "/dashboard/teacher/wallet",
  "/dashboard/teacher/grades",
  "/dashboard/teacher/materials",
  "/dashboard/teacher/reviews",
  "/dashboard/teacher/centers",
  "/dashboard/teacher/team",
  "/dashboard/teacher/notes",
  "/dashboard/teacher/messages",
  "/dashboard/teacher/notifications",
  "/dashboard/teacher/tour",
  "/dashboard/teacher/settings",
].filter((href) => WALLET_ENABLED || !WALLET_HREFS.has(href));

export default function PortalChrome({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardShell
      role="teacher"
      navGroups={navGroups}
      bottomNav={BAR_ORDER}
      bottomNavMaxVisible={6}
    >
      {children}
    </DashboardShell>
  );
}
