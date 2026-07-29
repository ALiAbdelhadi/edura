"use client";

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
 *
 * EVERY `navItems` href is listed. The bar is the phone's ONLY navigation now —
 * the sidebar toggle is desktop-only wherever a bar exists — so an href missing
 * here is a screen no parent on a phone can open. Pay and Wallet were absent
 * while the drawer still covered for them; under that rule they were two
 * unreachable money screens, which is why they are here rather than left to the
 * "four slots" argument that only governs the first four.
 */
const BAR_ORDER = [
  "/dashboard/parent",
  "/dashboard/parent/attendance",
  "/dashboard/parent/fees",
  "/dashboard/parent/messages",
  "/dashboard/parent/pay",
  "/dashboard/parent/wallet",
  "/dashboard/parent/progress",
  "/dashboard/parent/children",
  "/dashboard/parent/oversight",
  "/dashboard/parent/notifications",
  "/dashboard/parent/settings",
];

export default function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard allowedRole="parent">
      <ChildSelectorProvider>
        {/* The bar is the shell's now, not this layout's. It was a local copy
            that re-derived the active href, re-read the unread count and
            re-declared an icon and an i18n key per destination — all of which
            the shell already holds, and the third of which had drifted: Pay and
            Wallet existed in `navItems` and in neither of the local tables. One
            list, so a destination cannot exist in one navigation and not the
            other. Passing `bottomNav` is also what tells the shell to drop the
            sidebar toggle on phones. */}
        <DashboardShell
          role="parent"
          navItems={navItems}
          bottomNav={BAR_ORDER}
        >
          {children}
        </DashboardShell>
      </ChildSelectorProvider>
    </RoleGuard>
  );
}
