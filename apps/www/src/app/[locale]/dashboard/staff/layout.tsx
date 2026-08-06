"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import DashboardShell from "@/components/refine/dashboard-shell";
import RoleGuard from "@/components/refine/role-guard";
import { api } from "@/lib/api/client";
import { plexMono, LedgerPortalScope } from "@/features/admin/ledger";
import "@/features/admin/ledger/ledger.css";

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
    // Team notes are for EVERY sub-role by design (2026-07-27): the read-only
    // center_accountant still reads the board (receipts-on-GET counts them).
    // The page existed but had no nav entry, so it was reachable only by URL.
    { href: `${base}/notes`, icon: "clipboard", label: "Team Notes" },
    { href: `${base}/notifications`, icon: "bell", label: "Notifications" },
    { href: `${base}/settings`, icon: "settings", label: "Settings" },
  );
  return items;
}

/**
 * Phone bar order, DERIVED from whatever `navForRole` returned.
 *
 * This portal is the one that most needs a bar — the layout below already says
 * staff "work standing, one-handed, on a phone, with a parent in front of them
 * and a queue behind" — and the one where a hand-written bar list would be
 * wrong. There are three sub-role nav lists, not one, so a literal array would
 * either omit a manager's screens or offer a receptionist screens their tier
 * does not have. Deriving makes it exhaustive BY CONSTRUCTION: the tail sweeps
 * up anything not named in the priority list, so a nav entry added later shows
 * up in the bar instead of becoming unreachable.
 *
 * The priority list only REORDERS. Messages is pulled ahead of Rooms/Reports so
 * a manager's four slots stay the counter loop rather than filling with the
 * screens only a manager happens to also have.
 */
function barForItems(items: { href: string }[]) {
  const base = "/dashboard/staff";
  const priority = [
    base,
    `${base}/checkin`,
    `${base}/students`,
    `${base}/messages`,
    `${base}/finance`,
    `${base}/rooms`,
    `${base}/reports`,
  ];
  const present = new Set(items.map((i) => i.href));
  const ordered = priority.filter((href) => present.has(href));
  // Everything the priority list does not name, in nav order. Notifications and
  // Settings land here, which is where they belong anyway.
  const rest = items.map((i) => i.href).filter((h) => !ordered.includes(h));
  return [...ordered, ...rest];
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
    <>
      {/* Marks <html> so ledger.css can restyle the shared chrome for these
          routes only — see portal-scope.tsx. */}
      <LedgerPortalScope />
      <DashboardShell
        role="center_staff"
        navItems={navItems}
        bottomNav={barForItems(navItems)}
      >
        {/* `touch` — staff work standing, one-handed, on a phone, with a parent
            in front of them and a queue behind. 48px targets, 16px type, 12px
            gaps; nothing actionable at 12px. Same components as admin, one prop
            apart. */}
        <div className={`led ${plexMono.variable}`} data-density="touch">
          {children}
        </div>
      </DashboardShell>
    </>
  );
}

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRole="center_staff">
      <StaffShell>{children}</StaffShell>
    </RoleGuard>
  );
}
