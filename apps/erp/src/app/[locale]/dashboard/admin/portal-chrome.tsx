"use client";

import DashboardShell from "@/components/refine/dashboard-shell";
import { plexMono, LedgerPortalScope } from "@/features/admin/ledger";
import "@/features/admin/ledger/ledger.css";

const navGroups = [
  {
    label: "",
    items: [{ href: "/dashboard/admin", icon: "grid", label: "Overview" }],
  },
  {
    label: "@counter",
    items: [
      { href: "/dashboard/admin/counter", icon: "users", label: "Counter", tour: "nav-counter" },
      { href: "/dashboard/admin/students", icon: "users", label: "Students", tour: "nav-students" },
      { href: "/dashboard/admin/enrollment-requests", icon: "bell", label: "Enrollment Requests", tour: "nav-requests" },
    ],
  },
  {
    label: "@ops",
    items: [
      { href: "/dashboard/admin/teachers", icon: "person", label: "Teachers", tour: "nav-teachers" },
      { href: "/dashboard/admin/collaborations", icon: "clipboard", label: "Collaboration Requests" },
      { href: "/dashboard/admin/external-teachers", icon: "person", label: "Off-system Teachers" },
      { href: "/dashboard/admin/classes", icon: "book", label: "Classes", tour: "nav-classes" },
      { href: "/dashboard/admin/schedule", icon: "calendar", label: "Schedule", tour: "nav-schedule" },
      { href: "/dashboard/admin/rooms", icon: "home", label: "Rooms", tour: "nav-rooms" },
    ],
  },
  {
    label: "@money",
    items: [
      { href: "/dashboard/admin/fees", icon: "dollar", label: "Fees", tour: "nav-fees" },
      { href: "/dashboard/admin/expenses", icon: "report", label: "Expenses", tour: "nav-expenses" },
      { href: "/dashboard/admin/reports", icon: "report", label: "Reports", tour: "nav-reports" },
    ],
  },
  {
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
      { href: "/dashboard/admin/tour", icon: "sparkles", label: "Practice", tour: "nav-practice" },
      { href: "/dashboard/admin/settings", icon: "settings", label: "Settings" },
    ],
  },
];

const BAR_ORDER = [
  "/dashboard/admin",
  "/dashboard/admin/counter",
  "/dashboard/admin/students",
  "/dashboard/admin/fees",
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
      <LedgerPortalScope />
      <DashboardShell role="admin" navGroups={navGroups} bottomNav={BAR_ORDER}>
        <div className={`led ${plexMono.variable}`} data-density="compact">
          {children}
        </div>
      </DashboardShell>
    </>
  );
}
