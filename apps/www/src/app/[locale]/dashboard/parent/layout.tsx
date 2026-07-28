"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useList } from "@refinedev/core";
import {
  BarChart3,
  Bell,
  CheckCircle2,
  DollarSign,
  Home,
  MessageSquare,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { BottomNav, type BottomNavItem } from "@repo/ui/components/bottom-nav";
import DashboardShell from "@/components/refine/dashboard-shell";
import RoleGuard from "@/components/refine/role-guard";
import { ChildSelectorProvider } from "@/components/ui/child-selector";

// Labels are lookup keys into DashboardShell's NAV_KEY table, not display
// text. Three of these were prose ("Child Progress", "My Children", "Fees &
// Payments"), missed the table, and rendered raw English to the one audience
// least likely to read it. They now use the canonical keys — whose child is
// established by the child selector, not by repeating it in every label.
const navItems = [
  { href: "/dashboard/parent", icon: "home", label: "Dashboard" },
  { href: "/dashboard/parent/progress", icon: "chart", label: "Progress" },
  { href: "/dashboard/parent/attendance", icon: "check", label: "Attendance" },
  { href: "/dashboard/parent/children", icon: "users", label: "Children" },
  { href: "/dashboard/parent/fees", icon: "dollar", label: "Fees" },
  { href: "/dashboard/parent/pay", icon: "dollar", label: "Pay for a Lesson" },
  { href: "/dashboard/parent/wallet", icon: "wallet", label: "My Wallet" },
  { href: "/dashboard/parent/messages", icon: "message", label: "Messages" },
  { href: "/dashboard/parent/oversight", icon: "shield", label: "Child Safety" },
  { href: "/dashboard/parent/notifications", icon: "bell", label: "Notifications" },
  { href: "/dashboard/parent/settings", icon: "settings", label: "Settings" },
];

/**
 * Phone bar order — deliberately NOT the sidebar's order.
 *
 * The sidebar reads as a logical grouping; the bar is four thumb-reachable
 * slots and has to be ordered by what an Egyptian K-12 parent actually opens.
 * Attendance ("did my child turn up today") and Fees ("what do I owe") are the
 * two daily questions and outrank Progress, which is checked when grades post.
 * Everything else lives behind "more", which carries the rolled-up unread
 * count so nothing hidden goes unnoticed.
 */
const BAR_ORDER = [
  "/dashboard/parent",
  "/dashboard/parent/attendance",
  "/dashboard/parent/fees",
  "/dashboard/parent/messages",
  "/dashboard/parent/progress",
  "/dashboard/parent/children",
  "/dashboard/parent/oversight",
  "/dashboard/parent/notifications",
  "/dashboard/parent/settings",
] as const;

const ICONS: Record<string, React.ReactNode> = {
  "/dashboard/parent": <Home className="size-5" />,
  "/dashboard/parent/attendance": <CheckCircle2 className="size-5" />,
  "/dashboard/parent/fees": <DollarSign className="size-5" />,
  "/dashboard/parent/messages": <MessageSquare className="size-5" />,
  "/dashboard/parent/progress": <BarChart3 className="size-5" />,
  "/dashboard/parent/children": <Users className="size-5" />,
  "/dashboard/parent/oversight": <ShieldCheck className="size-5" />,
  "/dashboard/parent/notifications": <Bell className="size-5" />,
  "/dashboard/parent/settings": <Settings className="size-5" />,
};

const NAV_KEY: Record<string, string> = {
  "/dashboard/parent": "nav.dashboard",
  "/dashboard/parent/attendance": "nav.attendance",
  "/dashboard/parent/fees": "nav.fees",
  "/dashboard/parent/messages": "nav.messages",
  "/dashboard/parent/progress": "nav.progress",
  "/dashboard/parent/children": "nav.children",
  "/dashboard/parent/oversight": "nav.childSafety",
  "/dashboard/parent/notifications": "nav.notifications",
  "/dashboard/parent/settings": "nav.settings",
};

function ParentBottomNav() {
  const t = useTranslations();
  const pathname = usePathname();

  // Same params as DashboardShell's bell, so react-query serves both from one
  // cache entry rather than issuing a second request.
  const { result } = useList({
    resource: "notifications",
    filters: [{ field: "read", operator: "eq" as const, value: false }],
    pagination: { pageSize: 1, currentPage: 1 },
  });
  const unread = (result?.total ?? 0) as number;

  const path = (pathname ?? "").replace(/^\/(ar|en)(?=\/|$)/, "") || "/";
  // Longest-prefix wins, so /fees/123 still lights Fees rather than Dashboard.
  const activeKey =
    [...BAR_ORDER]
      .filter((href) => path === href || path.startsWith(href + "/"))
      .sort((a, b) => b.length - a.length)[0] ?? BAR_ORDER[0];

  const items: BottomNavItem[] = BAR_ORDER.map((href) => ({
    key: href,
    href,
    label: t(NAV_KEY[href] as Parameters<typeof t>[0]),
    icon: ICONS[href],
    ...(href.endsWith("/notifications") && unread > 0
      ? {
          badge: unread,
          badgeLabel: `${t("nav.notifications")} (${unread})`,
        }
      : {}),
  }));

  return (
    <BottomNav
      items={items}
      activeKey={activeKey}
      maxVisible={5}
      linkAs={Link}
      navLabel={t("nav.dashboard")}
      moreLabel={t("nav.more")}
      moreTitle={t("nav.allSections")}
    />
  );
}

export default function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard allowedRole="parent">
      <ChildSelectorProvider>
        <DashboardShell role="parent" navItems={navItems}>
          {children}
          {/* Inside the shell's content flow on purpose: BottomNav renders its
              own spacer, which only clears the fixed bar if it sits in the
              same scroll container as the content. */}
          <ParentBottomNav />
        </DashboardShell>
      </ChildSelectorProvider>
    </RoleGuard>
  );
}
