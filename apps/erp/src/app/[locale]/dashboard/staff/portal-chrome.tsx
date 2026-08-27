"use client";

import React from "react";
import DashboardShell from "@/components/refine/dashboard-shell";
import { plexMono, LedgerPortalScope } from "@/features/admin/ledger";
import "@/features/admin/ledger/ledger.css";

export type StaffRole = "receptionist" | "manager" | "center_accountant";

function navForRole(role: StaffRole) {
  const base = "/dashboard/staff";
  const items: { href: string; icon: string; label: string; tour?: string }[] = [
    { href: base, icon: "grid", label: "Overview", tour: "nav-overview" },
  ];
  if (role === "receptionist" || role === "manager") {
    items.push(
      { href: `${base}/students`, icon: "users", label: "Students", tour: "nav-students" },
    );
  }
  if (role === "manager") {
    items.push(
      { href: `${base}/collaborations`, icon: "clipboard", label: "Collaboration Requests", tour: "nav-collaborations" },
      { href: `${base}/rooms`, icon: "home", label: "Rooms", tour: "nav-rooms" },
      { href: `${base}/reports`, icon: "report", label: "Reports", tour: "nav-reports" },
    );
  }
  if (role === "center_accountant") {
    items.push({ href: `${base}/finance`, icon: "dollar", label: "Finance", tour: "nav-finance" });
  }
  items.push({ href: `${base}/notes`, icon: "clipboard", label: "Team Notes", tour: "nav-notes" });
  if (role === "receptionist" || role === "manager") {
    items.push({ href: `${base}/messages`, icon: "message", label: "Messages", tour: "nav-messages" });
  }
  items.push(
    { href: `${base}/notifications`, icon: "bell", label: "Notifications", tour: "nav-notifications" },
    { href: `${base}/settings`, icon: "settings", label: "Settings", tour: "nav-settings" },
  );
  return items;
}

function barForItems(items: { href: string }[]) {
  const base = "/dashboard/staff";
  const priority = [
    base,
    `${base}/students`,
    `${base}/messages`,
    `${base}/finance`,
    `${base}/rooms`,
    `${base}/reports`,
  ];
  const present = new Set(items.map((i) => i.href));
  const ordered = priority.filter((href) => present.has(href));
  const rest = items.map((i) => i.href).filter((h) => !ordered.includes(h));
  return [...ordered, ...rest];
}

export default function PortalChrome({
  staffRole,
  children,
}: {
  staffRole: StaffRole;
  children: React.ReactNode;
}) {
  const navItems = navForRole(staffRole);

  return (
    <>
      <LedgerPortalScope />
      <DashboardShell
        role="center_staff"
        navItems={navItems}
        bottomNav={barForItems(navItems)}
      >
        <div className={`led ${plexMono.variable}`} data-density="touch">
          {children}
        </div>
      </DashboardShell>
    </>
  );
}
