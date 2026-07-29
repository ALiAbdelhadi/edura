"use client";

import DashboardShell from "@/components/refine/dashboard-shell";
import RoleGuard from "@/components/refine/role-guard";
import { OnboardingGate } from "@/features/onboarding/onboarding-gate";
import { ledgerMono, ledgerScope, ledgerShellScope } from "@/features/student/ledger";

const navItems = [
  { href: "/dashboard/student", icon: "home", label: "Dashboard" },
  {
    href: "/dashboard/student/subjects",
    icon: "book",
    label: "Subjects",
  },
  { href: "/dashboard/student/schedule", icon: "calendar", label: "Schedule" },
  { href: "/dashboard/student/wallet", icon: "wallet", label: "Wallet" },
  // No Assignments entry: there is no Assignment model. The screen invented a
  // graded/pending status from grade rows with no score. Do not reinstate it.
  // The API still derives `assignmentsDue`/`assignmentsTrend` from those rows;
  // removing that is outside this session's ownership — see design/REQUESTS.md.
  { href: "/dashboard/student/grades", icon: "award", label: "Grades" },
  { href: "/dashboard/student/reviews", icon: "star", label: "Reviews" },
  { href: "/dashboard/student/attendance", icon: "check", label: "Attendance" },
  { href: "/dashboard/student/materials", icon: "book", label: "Materials" },
  { href: "/dashboard/student/family", icon: "users", label: "Family" },
  { href: "/dashboard/student/messages", icon: "message", label: "Messages" },
  {
    href: "/dashboard/student/notifications",
    icon: "bell",
    label: "Notifications",
  },
  { href: "/dashboard/student/settings", icon: "settings", label: "Settings" },
];

/**
 * Phone bar order — deliberately NOT the sidebar's order.
 *
 * The four that get a slot are chosen by what a student actually opens between
 * classes — where am I meant to be, what do I owe — not by nav-tree order, so
 * Schedule outranks Subjects here and does not in the sidebar. The remaining
 * eight sit behind "more".
 *
 * EVERY `navItems` href is listed: the bar is the phone's only navigation, so
 * an omission here is a screen no student on a phone can open.
 */
const BAR_ORDER = [
  "/dashboard/student",
  "/dashboard/student/schedule",
  "/dashboard/student/subjects",
  "/dashboard/student/wallet",
  "/dashboard/student/grades",
  "/dashboard/student/attendance",
  "/dashboard/student/materials",
  "/dashboard/student/reviews",
  "/dashboard/student/family",
  "/dashboard/student/messages",
  "/dashboard/student/notifications",
  "/dashboard/student/settings",
];

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard allowedRole="student">
      <OnboardingGate>
        {/* The Ledger is scoped to this wrapper, which sits ABOVE DashboardShell
            so it can re-point the tokens the shared chrome is built from
            (--sidebar*, --background, --card, --border). That converts the
            sidebar and header for the student portal without editing
            dashboard-shell.tsx, which parent, teacher, admin and assistant also
            render. See components/ledger/ledger.module.css for the full
            reasoning and for when this layer should be deleted. */}
        <div className={`${ledgerMono.variable} ${ledgerShellScope} contents`}>
          {/* Phone chrome: bottom navigation, not a collapsed sidebar — and now
              the SHELL's bar rather than a second implementation beside it.
              `student-bottom-nav.tsx` said it should be replaced once the
              shared primitive landed; it has. Every destination it carried is
              in BAR_ORDER, in the same order, so nothing is lost. Passing
              `bottomNav` is also what drops the sidebar toggle on phones, which
              is what stopped this portal shipping two navigations at once. */}
          <DashboardShell
            role="student"
            navItems={navItems}
            bottomNav={BAR_ORDER}
          >
            {/* Negative margins cancel DashboardShell's own `p-4 sm:p-6 lg:p-8`
                so the paper canvas reaches the edges, then re-apply the same
                padding inside the scope. Keep these in step with the shell.
                No bottom padding for the bar: BottomNav renders its own spacer,
                and it now sits OUTSIDE this scroll container, so the container
                is already short by the bar's height. The old `pb-24` would
                double it. */}
            <div
              className={`${ledgerScope} -m-4 min-h-full p-4 sm:-m-6 sm:p-6 lg:-m-8 lg:p-8`}
            >
              {children}
            </div>
          </DashboardShell>
        </div>
      </OnboardingGate>
    </RoleGuard>
  );
}
