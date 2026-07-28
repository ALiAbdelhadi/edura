"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import DashboardShell from "@/components/refine/dashboard-shell";
import RoleGuard from "@/components/refine/role-guard";
import { api } from "@/lib/api/client";

type StaffRole = "receptionist" | "manager" | "center_accountant";

// Nav is FILTERED by the staff member's preset sub-role. The API is the real
// security gate (default-closed center-actor); this filtering is UX only.
function navForRole(role: StaffRole) {
  const base = "/dashboard/staff";
  const counter: { href: string; icon: string; label: string }[] = [
    { href: base, icon: "grid", label: "Overview" },
  ];
  const manage: { href: string; icon: string; label: string }[] = [];
  const comms: { href: string; icon: string; label: string }[] = [
    // Every sub-role is on the team board — center_accountant included
    // (read-only: the center-actor gate rejects their mutations).
    { href: `${base}/notes`, icon: "clipboard", label: "Team Notes" },
  ];

  if (role === "receptionist" || role === "manager") {
    counter.push(
      { href: `${base}/checkin`, icon: "check", label: "Check-in" },
      { href: `${base}/students`, icon: "users", label: "Students" },
    );
  }
  if (role === "manager") {
    manage.push(
      { href: `${base}/rooms`, icon: "home", label: "Rooms" },
      { href: `${base}/reports`, icon: "report", label: "Reports" },
    );
  }
  if (role === "center_accountant") {
    manage.push({ href: `${base}/finance`, icon: "dollar", label: "Finance" });
  }
  // Messaging follows the same sub-role split as the scope table in
  // chat-scope.ts: reception + manager get an inbox, center_accountant gets
  // NONE (that tier reaches nobody, so the screen would always be empty).
  if (role === "receptionist" || role === "manager") {
    comms.push({ href: `${base}/messages`, icon: "message", label: "Messages" });
  }
  comms.push(
    { href: `${base}/notifications`, icon: "bell", label: "Notifications" },
    { href: `${base}/settings`, icon: "settings", label: "Settings" },
  );

  // A group with no items is OMITTED, not rendered empty: a sub-role difference is an
  // ABSENCE, never a disabled control. A disabled item teaches a receptionist that the
  // capability exists and is being withheld from them.
  return [
    { label: "@counter", items: counter },
    { label: "@manage", items: manage },
    { label: "@comms", items: comms },
  ].filter((g) => g.items.length > 0);
}

/** Phone chrome, sub-role aware for the same reason the sidebar is. */
function bottomNavForRole(role: StaffRole) {
  const base = "/dashboard/staff";
  if (role === "center_accountant") {
    return [base, `${base}/finance`, `${base}/notes`, `${base}/notifications`];
  }
  // Check-in is FIRST for reception: it is the whole job, and it is done standing up.
  return [
    `${base}/checkin`,
    base,
    `${base}/students`,
    `${base}/notes`,
    `${base}/messages`,
  ];
}

function StaffShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  const router = useRouter();
  const [role, setRole] = useState<StaffRole | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Live, revocation-aware resolve of the caller's own delegation. A
    // deactivated staff member gets 403 here and is bounced to login on the
    // NEXT navigation — access is cut without waiting for the JWT to expire.
    api
      .get("center/staff/me")
      .json<{ data: { role: StaffRole } }>()
      .then((res) => {
        if (!cancelled) setRole(res.data.role);
      })
      .catch(() => {
        if (!cancelled) router.replace("/login");
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!role) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-sm text-muted-foreground">{t("centerStaff.loading")}</div>
      </div>
    );
  }

  return (
    <DashboardShell
      role="center_staff"
      navGroups={navForRole(role)}
      bottomNav={bottomNavForRole(role)}
    >
      {children}
    </DashboardShell>
  );
}

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRole="center_staff">
      <StaffShell>{children}</StaffShell>
    </RoleGuard>
  );
}
