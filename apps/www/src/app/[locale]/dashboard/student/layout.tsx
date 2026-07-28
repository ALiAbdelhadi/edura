"use client";

import DashboardShell from "@/components/refine/dashboard-shell";
import RoleGuard from "@/components/refine/role-guard";
import { OnboardingGate } from "@/features/onboarding/onboarding-gate";
import { ledgerMono, ledgerScope, ledgerShellScope } from "@/features/student/ledger";
import { StudentBottomNav } from "@/features/student/student-bottom-nav";

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
            render. See features/student/ledger/ledger.module.css for the full
            reasoning and for when this layer should be deleted. */}
        <div className={`${ledgerMono.variable} ${ledgerShellScope} contents`}>
          <DashboardShell role="student" navItems={navItems}>
            {/* Negative margins cancel DashboardShell's own `p-4 sm:p-6 lg:p-8`
                so the paper canvas reaches the edges, then re-apply the same
                padding inside the scope. Keep these in step with the shell.
                The bottom padding clears the phone bottom-nav bar. */}
            <div
              className={`${ledgerScope} -m-4 min-h-full p-4 pb-24 sm:-m-6 sm:p-6 lg:-m-8 lg:p-8 md:pb-6`}
            >
              {children}
            </div>
          </DashboardShell>
          {/* Phone chrome: bottom navigation, not a collapsed sidebar. */}
          <StudentBottomNav />
        </div>
      </OnboardingGate>
    </RoleGuard>
  );
}
