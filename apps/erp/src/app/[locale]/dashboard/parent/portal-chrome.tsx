import DashboardShell from "@/components/refine/dashboard-shell";
import {
  ChildContextBar,
  ChildSelectorProvider,
} from "@/components/ui/child-selector";

const navGroups = [
  {
    label: "",
    items: [{ href: "/dashboard/parent", icon: "home", label: "Dashboard" }],
  },
  {
    label: "@children",
    items: [
      { href: "/dashboard/parent/children", icon: "users", label: "Children", tour: "nav-children" },
      { href: "/dashboard/parent/attendance", icon: "check", label: "Attendance", tour: "nav-attendance" },
      { href: "/dashboard/parent/progress", icon: "chart", label: "Progress", tour: "nav-progress" },
      { href: "/dashboard/parent/oversight", icon: "shield", label: "Child Safety", tour: "nav-oversight" },
    ],
  },
  {
    label: "@money",
    items: [
      { href: "/dashboard/parent/subscriptions", icon: "calendar", label: "Child Subscriptions", tour: "nav-subscriptions" },
      { href: "/dashboard/parent/fees", icon: "dollar", label: "Fees", tour: "nav-fees" },
      { href: "/dashboard/parent/pay", icon: "dollar", label: "Pay for a Lesson", tour: "nav-pay" },
      { href: "/dashboard/parent/wallet", icon: "wallet", label: "My Wallet", tour: "nav-wallet" },
    ],
  },
  {
    label: "@comms",
    items: [
      { href: "/dashboard/parent/messages", icon: "message", label: "Messages", tour: "nav-messages" },
      { href: "/dashboard/parent/notifications", icon: "bell", label: "Notifications", tour: "nav-notifications" },
    ],
  },
  {
    label: "@account",
    items: [
      { href: "/dashboard/parent/tour", icon: "sparkles", label: "Practice", tour: "nav-practice" },
      { href: "/dashboard/parent/settings", icon: "settings", label: "Settings", tour: "nav-settings" },
    ],
  },
];

const BAR_ORDER = [
  "/dashboard/parent",
  "/dashboard/parent/attendance",
  "/dashboard/parent/fees",
  "/dashboard/parent/messages",
  "/dashboard/parent/children",
  "/dashboard/parent/progress",
  "/dashboard/parent/oversight",
  "/dashboard/parent/subscriptions",
  "/dashboard/parent/pay",
  "/dashboard/parent/wallet",
  "/dashboard/parent/notifications",
  "/dashboard/parent/tour",
  "/dashboard/parent/settings",
];

export default function PortalChrome({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ChildSelectorProvider>
      <DashboardShell
        role="parent"
        navGroups={navGroups}
        bottomNav={BAR_ORDER}
      >
        <ChildContextBar />
        {children}
      </DashboardShell>
    </ChildSelectorProvider>
  );
}
