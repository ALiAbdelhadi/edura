"use client";

import DashboardShell from "@/components/refine/DashboardShell";
import RoleGuard from "@/components/refine/RoleGuard";

const navItems = [
  { href: "/dashboard/student", icon: "home", label: "Dashboard" },
  { href: "/dashboard/student/courses", icon: "search", label: "Browse Courses" },
  { href: "/dashboard/student/schedule", icon: "calendar", label: "Schedule" },
  { href: "/dashboard/student/assignments", icon: "clipboard", label: "Assignments" },
  { href: "/dashboard/student/grades", icon: "award", label: "Grades" },
  { href: "/dashboard/student/reviews", icon: "star", label: "Reviews" },
  { href: "/dashboard/student/attendance", icon: "check", label: "Attendance" },
  { href: "/dashboard/student/materials", icon: "book", label: "Materials" },
  { href: "/dashboard/student/family", icon: "users", label: "Family" },
  { href: "/dashboard/student/messages", icon: "message", label: "Messages" },
  { href: "/dashboard/student/notifications", icon: "bell", label: "Notifications" },
  { href: "/dashboard/student/settings", icon: "settings", label: "Settings" },
];

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard allowedRole="student">
      <DashboardShell role="student" navItems={navItems}>
        {children}
      </DashboardShell>
    </RoleGuard>
  );
}
