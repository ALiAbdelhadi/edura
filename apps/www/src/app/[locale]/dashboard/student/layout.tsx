"use client";

import DashboardShell from "@/components/refine/dashboard-shell";
import RoleGuard from "@/components/refine/role-guard";
import { OnboardingGate } from "@/features/onboarding/onboarding-gate";

const navGroups = [
  {
    label: "@learn",
    items: [
      { href: "/dashboard/student", icon: "home", label: "Dashboard" },
      { href: "/dashboard/student/subjects", icon: "book", label: "Subjects" },
      { href: "/dashboard/student/courses", icon: "grid", label: "Courses" },
      { href: "/dashboard/student/schedule", icon: "calendar", label: "Schedule" },
      { href: "/dashboard/student/attendance", icon: "check", label: "Attendance" },
      { href: "/dashboard/student/grades", icon: "award", label: "Grades" },
      { href: "/dashboard/student/materials", icon: "book", label: "Materials" },
      { href: "/dashboard/student/reviews", icon: "star", label: "Reviews" },
    ],
  },
  {
    label: "@money",
    items: [{ href: "/dashboard/student/wallet", icon: "wallet", label: "Wallet" }],
  },
  {
    label: "@comms",
    items: [
      { href: "/dashboard/student/messages", icon: "message", label: "Messages" },
      { href: "/dashboard/student/notifications", icon: "bell", label: "Notifications" },
      { href: "/dashboard/student/family", icon: "users", label: "Family" },
      { href: "/dashboard/student/settings", icon: "settings", label: "Settings" },
    ],
  },
];

const bottomNav = [
  "/dashboard/student",
  "/dashboard/student/schedule",
  "/dashboard/student/subjects",
  "/dashboard/student/messages",
  "/dashboard/student/wallet",
];

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard allowedRole="student">
      <OnboardingGate>
        <DashboardShell role="student" navGroups={navGroups} bottomNav={bottomNav}>
          {children}
        </DashboardShell>
      </OnboardingGate>
    </RoleGuard>
  );
}
