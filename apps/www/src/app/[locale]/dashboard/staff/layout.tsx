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
  const items: { href: string; icon: string; label: string }[] = [
    { href: base, icon: "grid", label: "Overview" },
  ];
  if (role === "receptionist" || role === "manager") {
    items.push(
      { href: `${base}/checkin`, icon: "check", label: "Check-in" },
      { href: `${base}/students`, icon: "users", label: "Students" },
    );
  }
  if (role === "manager") {
    items.push(
      { href: `${base}/rooms`, icon: "home", label: "Rooms" },
      { href: `${base}/reports`, icon: "report", label: "Reports" },
    );
  }
  if (role === "center_accountant") {
    items.push({ href: `${base}/finance`, icon: "dollar", label: "Finance" });
  }
  // Messaging follows the same sub-role split as the scope table in
  // chat-scope.ts: reception + manager get an inbox, center_accountant gets
  // NONE (that tier reaches nobody, so the screen would always be empty).
  if (role === "receptionist" || role === "manager") {
    items.push({ href: `${base}/messages`, icon: "message", label: "Messages" });
  }
  items.push(
    { href: `${base}/notifications`, icon: "bell", label: "Notifications" },
    { href: `${base}/settings`, icon: "settings", label: "Settings" },
  );
  return items;
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

  const navItems = navForRole(role);

  return (
    <DashboardShell
      role="center_staff"
      navItems={navItems}
      // Staff work standing at a counter, so the phone chrome is whatever
      // their sub-role can actually reach — derived from the same filtered
      // list the sidebar uses, capped at four. A receptionist gets check-in
      // and students; an accountant gets finance. Nothing is offered that the
      // API would refuse.
      bottomNavHrefs={navItems.slice(0, 4).map((i) => i.href)}
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
