"use client";

import DashboardShell from "@/components/refine/dashboard-shell";
import { AssistantDelegationStrip } from "@/features/assistant/assistant-delegation-strip";

/**
 * Assistant portal: assistants are the front line of teacher↔student
 * communication, so Messages IS their main workspace — it is this portal's
 * index route, not a section of it.
 *
 * That is why the comms pair sits in the UNLABELLED head group rather than
 * under a "@comms" heading further down: on every other portal the head holds
 * the home, and here the home is the inbox. A heading over the top two entries
 * would file this portal's front door away as one topic among several.
 *
 * The rest mirrors the TEACHER's grouping exactly, in the same order, because
 * an assistant acts on the teacher's behalf on those same screens — two people
 * doing one job should not learn two menus.
 */
const navGroups = [
  {
    label: "",
    items: [
      { href: "/dashboard/assistant", icon: "message", label: "Messages", tour: "nav-messages" },
      {
        href: "/dashboard/assistant/notifications",
        icon: "bell",
        label: "Notifications",
        tour: "nav-notifications",
      },
    ],
  },
  {
    label: "@teach",
    items: [
      { href: "/dashboard/assistant/classes", icon: "book", label: "My Classes", tour: "nav-classes" },
      { href: "/dashboard/assistant/attendance", icon: "check", label: "Attendance", tour: "nav-attendance" },
      { href: "/dashboard/assistant/door", icon: "check", label: "Door Check-in", tour: "nav-door" },
      { href: "/dashboard/assistant/grades", icon: "chart", label: "Gradebook", tour: "nav-grades" },
      { href: "/dashboard/assistant/materials", icon: "book", label: "Materials", tour: "nav-materials" },
    ],
  },
  {
    // No @money group, and that is the delegation boundary showing through:
    // Step 8 withholds wallet, payouts and financial settings from an
    // assistant, so this portal has no money screen to group. Absent, not
    // disabled — constitution #9.
    label: "@manage",
    items: [
      { href: "/dashboard/assistant/collaborations", icon: "users", label: "My Centers", tour: "nav-centers" },
      { href: "/dashboard/assistant/notes", icon: "clipboard", label: "Team Notes", tour: "nav-notes" },
    ],
  },
  {
    label: "@account",
    items: [
      // The practice emulator keeps a permanent entry. It is no longer what opens
      // on first run — the guided tour is — so it is labelled for what it is.
      { href: "/dashboard/assistant/tour", icon: "sparkles", label: "Practice", tour: "nav-practice" },
      { href: "/dashboard/assistant/settings", icon: "settings", label: "Settings", tour: "nav-settings" },
    ],
  },
];

/**
 * Phone bar order — the one portal where it barely reorders the sidebar,
 * because the sidebar is already ordered by what an assistant does.
 *
 * Messages keeps the first slot: it is both this portal's index route and its
 * main workspace. Door Check-in is promoted into the four, though — in
 * `counter_and_door` mode the hall-door check-in is the ASSISTANT'S job (it is
 * the teacher's account only as a fallback), and it is done standing at a door
 * holding a phone, which is precisely what this bar is for.
 *
 * The tail is the sidebar's order, so the "more" sheet and the sidebar never
 * disagree. EVERY href is listed — the bar is the phone's only navigation.
 */
const BAR_ORDER = [
  "/dashboard/assistant",
  "/dashboard/assistant/attendance",
  "/dashboard/assistant/door",
  "/dashboard/assistant/classes",
  // — the "more" sheet, in sidebar order —
  "/dashboard/assistant/notifications",
  "/dashboard/assistant/grades",
  "/dashboard/assistant/materials",
  "/dashboard/assistant/collaborations",
  "/dashboard/assistant/notes",
  "/dashboard/assistant/tour",
  "/dashboard/assistant/settings",
];

export default function PortalChrome({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardShell
      role="assistant"
      navGroups={navGroups}
      bottomNav={BAR_ORDER}
    >
      {/* In the layout, not on each screen: the delegation is true of every
          route in this portal, and a strip that appeared on some screens and
          not others would read as a state that comes and goes. */}
      <AssistantDelegationStrip />
      {children}
    </DashboardShell>
  );
}
