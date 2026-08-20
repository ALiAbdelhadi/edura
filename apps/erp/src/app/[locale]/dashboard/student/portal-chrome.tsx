"use client";

import DashboardShell from "@/components/refine/dashboard-shell";
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
    items: [{ href: "/dashboard/student", icon: "home", label: "Student Home" }],
  },
  {
    label: "@learn",
    items: [
      // Subjects before Schedule: the schedule is a view OF the subjects, so
      // the container is named first. On a phone the bar reverses this — see
      // BAR_ORDER — because between classes the question is "where now".
      { href: "/dashboard/student/subjects", icon: "book", label: "My Subjects", tour: "nav-subjects" },
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
    // Money keeps its own heading — it is the most-scanned word in this
    // product, and folding it into a general group would bury the thing people
    // come looking for. It was a one-item group on that argument alone; it is
    // now two, because "اشتراكي خلص ولا لسه؟" is asked as often as "عندي كام"
    // and had no screen at all until this pass. Subscriptions sits ABOVE the
    // wallet: coverage is the question, the balance is what pays for it.
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
 * The FIRST FIVE are the only real decision here: `BAR_SLOTS` is 6 and one of
 * those is spent on "more", so five destinations get a thumb. They are chosen
 * by what a student actually opens between classes — where am I meant to be,
 * what do I show at the counter, what do I owe — not by nav-tree order, which
 * is why Schedule outranks Subjects here and does not in the sidebar.
 *
 * WHY بطاقتي IS IN THE BAR. It is used at the counter at EVERY physical lesson,
 * several times a week, under time pressure with a queue behind the student —
 * and it was two presses and a scroll away in the "more" sheet. Frequency under
 * pressure is exactly what a thumb slot is for.
 *
 * WHY SUBJECTS KEPT ITS SLOT ANYWAY. The first draft of this pass traded it
 * away for the card; Ali chose to widen the bar instead (2026-08-20), because
 * Subjects is where a student SPENDS and demoting the revenue surface to buy a
 * slot is the wrong trade when a sixth slot is available. See `BAR_SLOTS`.
 *
 * THE TAIL IS THE SIDEBAR'S ORDER, minus the five already placed. It is what
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
  "/dashboard/student/id",
  "/dashboard/student/subjects",
  "/dashboard/student/wallet",
  // — the "more" sheet, in sidebar order —
  "/dashboard/student/attendance",
  "/dashboard/student/grades",
  "/dashboard/student/materials",
  "/dashboard/student/reviews",
  // @money's first item; Wallet, its second, already has a slot above.
  "/dashboard/student/subscriptions",
  "/dashboard/student/messages",
  "/dashboard/student/notifications",
  "/dashboard/student/family",
  "/dashboard/student/practice",
  "/dashboard/student/settings",
];

/**
 * SIX targets in the phone bar — five destinations and "more" — where every
 * other portal draws five.
 *
 * The default is 5 and stays 5 everywhere else; this is the one portal that
 * asks for more, and it asks because it has five genuinely daily destinations
 * and the alternative was demoting the screen where students pay.
 *
 * MEASURED at 375px in both locales: six targets leave 63px each. At that
 * width "لوحة التحكم" and "المواد الدراسية" both truncated, and so did
 * "Dashboard" — so the LABELS were shortened rather than the count reduced or
 * the type made smaller: this portal now says "الرئيسية"/"Home" and "موادي",
 * which are the words its readers use anyway (see nav.studentHome /
 * nav.mySubjects). Re-measured after: nothing truncates in either locale.
 *
 * If a future student destination needs a longer label than these, THIS number
 * is the thing to reconsider — not the label's font size.
 */
const BAR_SLOTS = 6;

export default function PortalChrome({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    /* The Ledger is scoped to this wrapper, which sits ABOVE DashboardShell
       so it can re-point the tokens the shared chrome is built from
       (--sidebar*, --background, --card, --border). That converts the
       sidebar and header for the student portal without editing
       dashboard-shell.tsx, which parent, teacher, admin and assistant also
       render. See components/ledger/ledger.module.css for the full
       reasoning and for when this layer should be deleted. */
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
        bottomNavMaxVisible={BAR_SLOTS}
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
  );
}
