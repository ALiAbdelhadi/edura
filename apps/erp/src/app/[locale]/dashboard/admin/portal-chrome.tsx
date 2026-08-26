"use client";

import DashboardShell from "@/components/refine/dashboard-shell";
import { plexMono, LedgerPortalScope } from "@/features/admin/ledger";
import "@/features/admin/ledger/ledger.css";

// `label` is not display copy — DashboardShell looks it up in its NAV_KEY table
// to find the i18n key, and falls back to rendering the raw string when the
// lookup misses. "Requests" missed, so this entry shipped untranslated English
// into an Arabic-first sidebar. The table's key is "Enrollment Requests".
/**
 * Nineteen destinations — the longest menu in the product, and the one where a
 * flat column cost the most. It read: counter, students, requests, teachers,
 * off-system teachers, classes, schedule, rooms, fees, expenses, reports,
 * staff, notes, audit… which is four unrelated jobs typed out end to end.
 *
 * The groups are those four jobs, ordered by how far each sits from the front
 * desk: the counter (today, with a family standing there), operations (the
 * term — who teaches what, where and when), money (the month), and the team
 * that runs it. A center owner works outward from the desk, so the menu does.
 */
const navGroups = [
  {
    label: "",
    items: [{ href: "/dashboard/admin", icon: "grid", label: "Overview" }],
  },
  {
    label: "@counter",
    items: [
      // The board (teacher -> lesson -> roster) and the card lookup (student ->
      // their lessons) are two doors into the same room; both are listed because
      // an operator needs whichever matches what they are holding.
      { href: "/dashboard/admin/counter", icon: "users", label: "Counter", tour: "nav-counter" },
      { href: "/dashboard/admin/students", icon: "users", label: "Students", tour: "nav-students" },
      { href: "/dashboard/admin/enrollment-requests", icon: "bell", label: "Enrollment Requests", tour: "nav-requests" },
    ],
  },
  {
    label: "@ops",
    items: [
      { href: "/dashboard/admin/teachers", icon: "person", label: "Teachers", tour: "nav-teachers" },
      // Collaboration requests were a band at the top of the Teachers page — a
      // request inbox mounted inside a directory, so the teacher list started
      // below the fold and a waiting decision was something you scrolled past
      // rather than navigated to. It sits next to Teachers because that is the
      // same subject; it is its own row because it is a QUEUE, and every other
      // queue in this portal has one.
      { href: "/dashboard/admin/collaborations", icon: "clipboard", label: "Collaboration Requests" },
      // Off-system teachers shipped with a full portal (list, statement, gaps,
      // settle, convert) and NO way in: no nav entry and no link from any screen,
      // so it was reachable only by typing the URL. A capability nobody can find is
      // a capability nobody has — it sits next to Teachers because that is what an
      // operator is looking at when they realise one of theirs is off-system.
      { href: "/dashboard/admin/external-teachers", icon: "person", label: "Off-system Teachers" },
      { href: "/dashboard/admin/classes", icon: "book", label: "Classes", tour: "nav-classes" },
      { href: "/dashboard/admin/schedule", icon: "calendar", label: "Schedule", tour: "nav-schedule" },
      { href: "/dashboard/admin/rooms", icon: "home", label: "Rooms", tour: "nav-rooms" },
    ],
  },
  {
    // In, out, and the summary of both — in that order, so the group reads the
    // way a ledger does rather than alphabetically.
    label: "@money",
    items: [
      { href: "/dashboard/admin/fees", icon: "dollar", label: "Fees", tour: "nav-fees" },
      { href: "/dashboard/admin/expenses", icon: "report", label: "Expenses", tour: "nav-expenses" },
      { href: "/dashboard/admin/reports", icon: "report", label: "Reports", tour: "nav-reports" },
    ],
  },
  {
    // Audit sits with the team rather than under settings: it answers "who on
    // my staff did this", which is a question about the people directly above
    // it, not about the center's configuration.
    label: "@team",
    items: [
      { href: "/dashboard/admin/staff", icon: "users", label: "Staff", tour: "nav-staff" },
      { href: "/dashboard/admin/notes", icon: "clipboard", label: "Team Notes" },
      { href: "/dashboard/admin/audit", icon: "shield", label: "Audit log", tour: "nav-audit" },
    ],
  },
  {
    label: "@comms",
    items: [
      { href: "/dashboard/admin/messages", icon: "message", label: "Messages", tour: "nav-messages" },
      { href: "/dashboard/admin/notifications", icon: "bell", label: "Notifications" },
    ],
  },
  {
    label: "@account",
    items: [
      // The guided tour keeps a permanent entry: the first-run overlay shows once,
      // and an owner who skipped it must still be able to find it.
      { href: "/dashboard/admin/tour", icon: "sparkles", label: "Practice", tour: "nav-practice" },
      { href: "/dashboard/admin/settings", icon: "settings", label: "Settings" },
    ],
  },
];

/**
 * Phone bar order — deliberately NOT the sidebar's order.
 *
 * A center admin runs the record from a desk, but the phone is what they hold
 * while walking the floor, so the four slots are the counter loop: the day's
 * decisions (Overview), the desk itself (Check-in), who is in front of them
 * (Students), and what they owe (Fees). Reports, Expenses and Staff are desk
 * work at a keyboard and sit in "more" — they are not less important, they are
 * just never the reason a phone comes out of a pocket.
 *
 * The tail is the sidebar's order, so the "more" sheet — which is where
 * fifteen of these nineteen live on a phone — reads the same way the sidebar
 * does. EVERY href is listed; the bar is the phone's only navigation.
 */
const BAR_ORDER = [
  "/dashboard/admin",
  "/dashboard/admin/counter",
  "/dashboard/admin/students",
  "/dashboard/admin/fees",
  // — the "more" sheet, in sidebar order —
  "/dashboard/admin/enrollment-requests",
  "/dashboard/admin/teachers",
  "/dashboard/admin/collaborations",
  "/dashboard/admin/external-teachers",
  "/dashboard/admin/classes",
  "/dashboard/admin/schedule",
  "/dashboard/admin/rooms",
  "/dashboard/admin/expenses",
  "/dashboard/admin/reports",
  "/dashboard/admin/staff",
  "/dashboard/admin/notes",
  "/dashboard/admin/audit",
  "/dashboard/admin/messages",
  "/dashboard/admin/notifications",
  "/dashboard/admin/tour",
  "/dashboard/admin/settings",
];

export default function PortalChrome({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Marks <html> so ledger.css can restyle the shared chrome for these
          routes only — see portal-scope.tsx. */}
      <LedgerPortalScope />
      <DashboardShell role="admin" navGroups={navGroups} bottomNav={BAR_ORDER}>
        {/* The Ledger scope. `compact` — a center admin operates the record at
            a desk. Staff get `touch` on the same screens; see staff/layout. */}
        <div className={`led ${plexMono.variable}`} data-density="compact">
          {children}
        </div>
      </DashboardShell>
    </>
  );
}
