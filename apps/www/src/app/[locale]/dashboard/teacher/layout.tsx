"use client";

import DashboardShell from "@/components/refine/dashboard-shell";
import RoleGuard from "@/components/refine/role-guard";

const navItems = [
  { href: "/dashboard/teacher", icon: "home", label: "Dashboard" },
  { href: "/dashboard/teacher/centers", icon: "users", label: "My Centers" },
  { href: "/dashboard/teacher/classes", icon: "book", label: "My Classes" },
  { href: "/dashboard/teacher/attendance", icon: "check", label: "Attendance" },
  { href: "/dashboard/teacher/grades", icon: "chart", label: "Gradebook" },
  { href: "/dashboard/teacher/reviews", icon: "star", label: "Reviews" },
  { href: "/dashboard/teacher/assignments", icon: "clipboard", label: "Assignments" },
  { href: "/dashboard/teacher/materials", icon: "book", label: "Materials" },
  { href: "/dashboard/teacher/messages", icon: "message", label: "Messages" },
  { href: "/dashboard/teacher/notifications", icon: "bell", label: "Notifications" },
  { href: "/dashboard/teacher/settings", icon: "settings", label: "Settings" },
];

export default function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard allowedRole="teacher">
      <DashboardShell role="teacher" navItems={navItems}>
        {children}
      </DashboardShell>
    </RoleGuard>
  );
}
