"use client";

import DashboardShell from "@/components/refine/dashboard-shell";
import RoleGuard from "@/components/refine/role-guard";
import { OnboardingGate } from "@/features/onboarding/onboarding-gate";

/**
 * A teacher runs two different jobs out of one portal, and the flat fifteen it
 * replaces interleaved them: the hall (a class, a register, a grade) and the
 * business (which centers they work with, who assists them, what they are
 * owed). The groups separate those, so the column a teacher scans during a
 * lesson is not the column they scan at the end of the month.
 *
 * The order inside @teach is the shape of a lesson: open the class, take the
 * register, check the door, enter the marks, hand out the material.
 */
const navGroups = [
  {
    label: "",
    items: [{ href: "/dashboard/teacher", icon: "home", label: "Dashboard" }],
  },
  {
    label: "@teach",
    items: [
      { href: "/dashboard/teacher/classes", icon: "book", label: "My Classes", tour: "nav-classes" },
      { href: "/dashboard/teacher/attendance", icon: "check", label: "Attendance", tour: "nav-attendance" },
      { href: "/dashboard/teacher/door", icon: "check", label: "Door Check-in", tour: "nav-door" },
      { href: "/dashboard/teacher/grades", icon: "chart", label: "Gradebook", tour: "nav-grades" },
      { href: "/dashboard/teacher/materials", icon: "book", label: "Materials", tour: "nav-materials" },
      // Reviews are what students wrote about these lessons — the teaching
      // group is where a teacher is already looking when they wonder.
      { href: "/dashboard/teacher/reviews", icon: "star", label: "Reviews" },
    ],
  },
  {
    label: "@manage",
    items: [
      { href: "/dashboard/teacher/centers", icon: "users", label: "My Centers", tour: "nav-centers" },
      { href: "/dashboard/teacher/team", icon: "users", label: "Team", tour: "nav-team" },
      { href: "/dashboard/teacher/notes", icon: "clipboard", label: "Team Notes" },
    ],
  },
  {
    // Its own heading at one item, on purpose — see the student layout.
    label: "@money",
    items: [
      { href: "/dashboard/teacher/wallet", icon: "dollar", label: "Wallet", tour: "nav-wallet" },
    ],
  },
  {
    label: "@comms",
    items: [
      { href: "/dashboard/teacher/messages", icon: "message", label: "Messages", tour: "nav-messages" },
      {
        href: "/dashboard/teacher/notifications",
        icon: "bell",
        label: "Notifications",
        tour: "nav-notifications",
      },
    ],
  },
  {
    label: "@account",
    items: [
      // The practice emulator keeps a permanent entry. It is no longer what opens
      // on first run — the guided tour is — so it is labelled for what it actually
      // is: a simulated copy to rehearse on, not a tour.
      { href: "/dashboard/teacher/tour", icon: "sparkles", label: "Practice", tour: "nav-practice" },
      { href: "/dashboard/teacher/settings", icon: "settings", label: "Settings", tour: "nav-settings" },
    ],
  },
];

/**
 * First four = the thumb slots, chosen by what a teacher opens while standing
 * in a hall. The tail is the sidebar's order, so the "more" sheet and the
 * sidebar never disagree. Every href is listed — the bar is the phone's only
 * navigation.
 */
const BAR_ORDER = [
  "/dashboard/teacher",
  "/dashboard/teacher/attendance",
  "/dashboard/teacher/classes",
  "/dashboard/teacher/door",
  // — the "more" sheet, in sidebar order —
  "/dashboard/teacher/grades",
  "/dashboard/teacher/materials",
  "/dashboard/teacher/reviews",
  "/dashboard/teacher/centers",
  "/dashboard/teacher/team",
  "/dashboard/teacher/notes",
  "/dashboard/teacher/wallet",
  "/dashboard/teacher/messages",
  "/dashboard/teacher/notifications",
  "/dashboard/teacher/tour",
  "/dashboard/teacher/settings",
];

export default function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard allowedRole="teacher">
      <OnboardingGate>
        <DashboardShell
          role="teacher"
          navGroups={navGroups}
          bottomNav={BAR_ORDER}
        >
          {children}
        </DashboardShell>
      </OnboardingGate>
    </RoleGuard>
  );
}
