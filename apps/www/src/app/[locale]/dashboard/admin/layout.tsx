"use client";

import DashboardShell from "@/components/refine/dashboard-shell";
import RoleGuard from "@/components/refine/role-guard";
import { OnboardingGate } from "@/features/onboarding/onboarding-gate";
import { plexMono, LedgerPortalScope } from "@/features/admin/ledger";
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
  { href: "/dashboard/admin/external-teachers", icon: "person", label: "Off-system Teachers" },
  { href: "/dashboard/admin/classes", icon: "book", label: "Classes" },
  { href: "/dashboard/admin/rooms", icon: "home", label: "Rooms" },
  { href: "/dashboard/admin/fees", icon: "dollar", label: "Fees" },
  { href: "/dashboard/admin/expenses", icon: "report", label: "Expenses" },
  { href: "/dashboard/admin/reports", icon: "report", label: "Reports" },
  { href: "/dashboard/admin/staff", icon: "users", label: "Staff" },
  { href: "/dashboard/admin/notes", icon: "clipboard", label: "Team Notes" },
  { href: "/dashboard/admin/audit", icon: "shield", label: "Audit log" },
  { href: "/dashboard/admin/messages", icon: "message", label: "Messages" },
  { href: "/dashboard/admin/notifications", icon: "bell", label: "Notifications" },
  { href: "/dashboard/admin/settings", icon: "settings", label: "Settings" },
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
 * EVERY `navItems` href is listed — the bar is the phone's only navigation.
 */
const BAR_ORDER = [
  "/dashboard/admin",
  "/dashboard/admin/checkin",
  "/dashboard/admin/students",
  "/dashboard/admin/fees",
  "/dashboard/admin/enrollment-requests",
  "/dashboard/admin/classes",
  "/dashboard/admin/teachers",
  "/dashboard/admin/external-teachers",
  "/dashboard/admin/rooms",
  "/dashboard/admin/messages",
  "/dashboard/admin/notes",
  "/dashboard/admin/expenses",
  "/dashboard/admin/reports",
  "/dashboard/admin/staff",
  // Desk work, like Staff above it: the audit log is something a center admin
  // goes looking for at a keyboard, never mid-floor. Late in "more" — but
  // listed, because an unlisted href is a screen no phone can open at all.
  "/dashboard/admin/audit",
  "/dashboard/admin/notifications",
  "/dashboard/admin/settings",
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard allowedRole="center_admin">
      <OnboardingGate>
        {/* Marks <html> so ledger.css can restyle the shared chrome for these
            routes only — see portal-scope.tsx. */}
        <LedgerPortalScope />
        <DashboardShell role="admin" navItems={navItems} bottomNav={BAR_ORDER}>
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
