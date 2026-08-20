"use client";

import DashboardShell from "@/components/refine/dashboard-shell";
import { ChildSelectorProvider } from "@/components/ui/child-selector";

// Labels are lookup keys into DashboardShell's NAV_KEY table, not display
// text. Three of these were prose ("Child Progress", "My Children", "Fees &
// Payments"), missed the table, and rendered raw English to the one audience
// least likely to read it. They now use the canonical keys — whose child is
// established by the child selector, not by repeating it in every label.
//
/**
 * A parent asks this product two questions — is my child all right, and what
 * do I owe — and the flat twelve it replaces alternated between them: Progress,
 * Attendance, Children, then Fees, Pay, Wallet, then back to Child Safety. The
 * two groups are those two questions, so an answer is one heading away.
 *
 * Children leads @children because the child selector governs every screen
 * below it: establishing WHOSE record you are reading comes before reading it.
 */
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
      // Oversight is protective transparency over a minor's adult threads. It
      // is about the child, not about the account, so it sits here rather than
      // in @account where a settings-shaped label would bury it.
      { href: "/dashboard/parent/oversight", icon: "shield", label: "Child Safety", tour: "nav-oversight" },
    ],
  },
  {
    // Read the money group as a sentence: what is owed, how to pay it, what
    // the balance behind it is.
    label: "@money",
    items: [
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
      // A practice copy of the portal. It sits with the real screens rather than
      // in a help section on purpose: a parent who is lost is looking at THIS
      // menu, not at a marketing page.
      { href: "/dashboard/parent/tour", icon: "sparkles", label: "Practice", tour: "nav-practice" },
      { href: "/dashboard/parent/settings", icon: "settings", label: "Settings", tour: "nav-settings" },
    ],
  },
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
 * EVERY href is listed. The bar is the phone's ONLY navigation now — the
 * sidebar toggle is desktop-only wherever a bar exists — so an href missing
 * here is a screen no parent on a phone can open. Pay and Wallet were absent
 * while the drawer still covered for them; under that rule they were two
 * unreachable money screens, which is why they are here rather than left to the
 * "four slots" argument that only governs the first four.
 *
 * The tail is the sidebar's order, so the "more" sheet and the sidebar never
 * disagree.
 */
const BAR_ORDER = [
  "/dashboard/parent",
  "/dashboard/parent/attendance",
  "/dashboard/parent/fees",
  "/dashboard/parent/messages",
  // — the "more" sheet, in sidebar order —
  "/dashboard/parent/children",
  "/dashboard/parent/progress",
  "/dashboard/parent/oversight",
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
        navGroups={navGroups}
        bottomNav={BAR_ORDER}
      >
        {children}
      </DashboardShell>
    </ChildSelectorProvider>
  );
}
