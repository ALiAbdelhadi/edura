"use client";

import DashboardShell from "@/components/refine/dashboard-shell";
import RoleGuard from "@/components/refine/role-guard";
import { OnboardingGate } from "@/features/onboarding/onboarding-gate";
import { plexMono } from "@/features/admin/ledger";
import "@/features/admin/ledger/ledger.css";

// `label` is not display copy — DashboardShell looks it up in its NAV_KEY table
// to find the i18n key, and falls back to rendering the raw string when the
// lookup misses. "Requests" missed, so this entry shipped untranslated English
// into an Arabic-first sidebar. The table's key is "Enrollment Requests".
const navItems = [
  { href: "/dashboard/admin", icon: "grid", label: "Overview" },
  { href: "/dashboard/admin/checkin", icon: "check", label: "Check-in" },
  { href: "/dashboard/admin/students", icon: "users", label: "Students" },
  { href: "/dashboard/admin/enrollment-requests", icon: "bell", label: "Enrollment Requests" },
  { href: "/dashboard/admin/teachers", icon: "person", label: "Teachers" },
  { href: "/dashboard/admin/classes", icon: "book", label: "Classes" },
  { href: "/dashboard/admin/rooms", icon: "home", label: "Rooms" },
  { href: "/dashboard/admin/fees", icon: "dollar", label: "Fees" },
  { href: "/dashboard/admin/expenses", icon: "report", label: "Expenses" },
  { href: "/dashboard/admin/reports", icon: "report", label: "Reports" },
  { href: "/dashboard/admin/staff", icon: "users", label: "Staff" },
  { href: "/dashboard/admin/messages", icon: "message", label: "Messages" },
  { href: "/dashboard/admin/notifications", icon: "bell", label: "Notifications" },
  { href: "/dashboard/admin/settings", icon: "settings", label: "Settings" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard allowedRole="center_admin">
      <OnboardingGate>
        <DashboardShell role="admin" navItems={navItems}>
          {/* The Ledger scope. `compact` — a center admin operates the record at
              a desk. Staff get `touch` on the same screens; see staff/layout. */}
          <div className={`led ${plexMono.variable}`} data-density="compact">
            {children}
          </div>
        </DashboardShell>
      </OnboardingGate>
    </RoleGuard>
  );
}
