"use client";

import DashboardShell from "@/components/refine/dashboard-shell";
import RoleGuard from "@/components/refine/role-guard";
import { OnboardingGate } from "@/features/onboarding/onboarding-gate";

const navItems = [
  { href: "/dashboard/teacher", icon: "home", label: "Dashboard" },
  { href: "/dashboard/teacher/centers", icon: "users", label: "My Centers" },
  { href: "/dashboard/teacher/classes", icon: "book", label: "My Classes" },
  { href: "/dashboard/teacher/attendance", icon: "check", label: "Attendance" },
  { href: "/dashboard/teacher/grades", icon: "chart", label: "Gradebook" },
  { href: "/dashboard/teacher/reviews", icon: "star", label: "Reviews" },
  { href: "/dashboard/teacher/materials", icon: "book", label: "Materials" },
  { href: "/dashboard/teacher/door", icon: "check", label: "Door Check-in" },
  { href: "/dashboard/teacher/wallet", icon: "dollar", label: "Wallet" },
  { href: "/dashboard/teacher/team", icon: "users", label: "Team" },
  { href: "/dashboard/teacher/notes", icon: "clipboard", label: "Team Notes" },
  { href: "/dashboard/teacher/messages", icon: "message", label: "Messages" },
  {
    href: "/dashboard/teacher/notifications",
    icon: "bell",
    label: "Notifications",
  },
  { href: "/dashboard/teacher/settings", icon: "settings", label: "Settings" },
];

/**
 * Phone bar order — deliberately NOT the sidebar's order.
 *
 * A teacher is on a phone while STANDING IN THE ROOM, and the four slots are
 * the loop that happens there: what am I teaching now (Dashboard), mark who
 * turned up (Attendance), open the class (Classes), enter the marks
 * (Gradebook). My Centers and Wallet are what a teacher opens once a month at
 * a desk, so they rank below Door Check-in and Messages in "more" rather than
 * taking a slot from the daily four.
 *
 * EVERY `navItems` href is listed — the bar is the phone's only navigation.
 */
const BAR_ORDER = [
  "/dashboard/teacher",
  "/dashboard/teacher/attendance",
  "/dashboard/teacher/classes",
  "/dashboard/teacher/grades",
  "/dashboard/teacher/door",
  "/dashboard/teacher/messages",
  "/dashboard/teacher/materials",
  "/dashboard/teacher/centers",
  "/dashboard/teacher/reviews",
  "/dashboard/teacher/wallet",
  "/dashboard/teacher/team",
  "/dashboard/teacher/notes",
  "/dashboard/teacher/notifications",
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
          navItems={navItems}
          bottomNav={BAR_ORDER}
        >
          {children}
        </DashboardShell>
      </OnboardingGate>
    </RoleGuard>
  );
}
