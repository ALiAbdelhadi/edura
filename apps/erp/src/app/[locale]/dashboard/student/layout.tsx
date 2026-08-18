"use client";

import DashboardShell from "@/components/refine/dashboard-shell";
import RoleGuard from "@/components/refine/role-guard";
import { OnboardingGate } from "@/features/onboarding/onboarding-gate";
import { ledgerMono, ledgerScope, ledgerShellScope } from "@/features/student/ledger";

/**
 * Grouped, and ordered inside each group by how often a student opens it.
 *
 * The flat fourteen it replaces mixed a subject list, a wallet, a family code
 * and a settings screen in one column, so the only way to find anything was to
 * read all fourteen labels — every time. The groups are the four questions this
 * portal answers: what am I studying, what do I owe, who is talking to me, and
 * who am I. Dashboard sits above the first heading because it is the portal
 * itself, not a member of any one of them.
 */
const navGroups = [
  {
    label: "",
    items: [{ href: "/dashboard/student", icon: "home", label: "Dashboard" }],
  },
  {
    label: "@learn",
    items: [
      // Subjects before Schedule: the schedule is a view OF the subjects, so
      // the container is named first. On a phone the bar reverses this — see
      // BAR_ORDER — because between classes the question is "where now".
      { href: "/dashboard/student/subjects", icon: "book", label: "Subjects", tour: "nav-subjects" },
      { href: "/dashboard/student/schedule", icon: "calendar", label: "Schedule", tour: "nav-schedule" },
      { href: "/dashboard/student/attendance", icon: "check", label: "Attendance", tour: "nav-attendance" },
      // No Assignments entry: there is no Assignment model. The screen invented a
      // graded/pending status from grade rows with no score. Do not reinstate it.
      // KNOWN, STILL OPEN: the API continues to derive `assignmentsDue` and
      // `assignmentsTrend` from those same scoreless grade rows. Nothing renders
      // them any more, so the lie is no longer shown — but the fields are still in
      // the payload and should be removed from the endpoint contract.
      { href: "/dashboard/student/grades", icon: "award", label: "Grades", tour: "nav-grades" },
      { href: "/dashboard/student/materials", icon: "book", label: "Materials" },
      // Reviews is the student rating a teacher — an act performed about a
      // class, so it belongs to study rather than to the account.
      { href: "/dashboard/student/reviews", icon: "star", label: "Reviews" },
    ],
  },
  {
    // One item, and it keeps its own heading anyway. Money is the most-scanned
    // word in this product; folding a wallet into a general group to avoid a
    // short list would bury the thing people come looking for.
    label: "@money",
    items: [
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
      // A practice copy of the portal for a first-time student. It sits with the
      // real screens rather than off in a help section on purpose: a student who
      // is lost is looking at THIS menu, not at a marketing page.
      {
        href: "/dashboard/student/practice",
        icon: "sparkles",
        label: "Practice",
        // The tour's last card points here. Without this id the student was the one
        // portal whose "where to rehearse" step had nothing to anchor to.
        tour: "nav-practice",
      },
      { href: "/dashboard/student/settings", icon: "settings", label: "Settings", tour: "nav-settings" },
    ],
  },
];

/**
 * Phone bar order — deliberately NOT the sidebar's order.
 *
 * The FIRST FOUR are the only real decision here: `maxVisible={5}` spends one
 * slot on "more", so four destinations get a thumb. They are chosen by what a
 * student actually opens between classes — where am I meant to be, what do I
 * owe — not by nav-tree order, which is why Schedule outranks Subjects here and
 * does not in the sidebar.
 *
 * THE TAIL IS THE SIDEBAR'S ORDER, minus the four already placed. It is what
 * the "more" sheet lists, and a sheet that ordered the same destinations
 * differently from the sidebar would be a second information architecture for
 * the same portal.
 *
 * EVERY href is listed: the bar is the phone's only navigation, so an omission
 * here is a screen no student on a phone can open.
 */
const BAR_ORDER = [
  "/dashboard/student",
  "/dashboard/student/schedule",
  "/dashboard/student/subjects",
  "/dashboard/student/wallet",
  // — the "more" sheet, in sidebar order —
  "/dashboard/student/attendance",
  "/dashboard/student/grades",
  "/dashboard/student/materials",
  "/dashboard/student/reviews",
  "/dashboard/student/messages",
  "/dashboard/student/notifications",
  "/dashboard/student/id",
  "/dashboard/student/family",
  "/dashboard/student/practice",
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
            navGroups={navGroups}
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
