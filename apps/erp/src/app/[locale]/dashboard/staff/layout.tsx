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

/**
 * Nav is FILTERED by the staff member's preset sub-role. The API is the real
 * security gate (default-closed center-actor); this filtering is UX only.
 *
 * THIS PORTAL STAYS FLAT while every other one is grouped, and the threshold is
 * the reason: group a menu once it outgrows about eight entries, because that
 * is where scanning a column stops being cheaper than scanning headings. The
 * sub-role filter means nobody here sees more than eight — a receptionist sees
 * six, an accountant five — and five entries under four headings is more
 * furniture than list.
 *
 * The ORDER still mirrors the center-admin portal's groups exactly (counter →
 * operations → money → team → comms → account), so a manager later given the
 * owner's portal finds the same sequence with headings added, rather than a
 * different menu. That is the benefit of grouping, bought without drawing it.
 */
function navForRole(role: StaffRole) {
  const base = "/dashboard/staff";
  const items: { href: string; icon: string; label: string; tour?: string }[] = [
    { href: base, icon: "grid", label: "Overview", tour: "nav-overview" },
  ];
  // — counter —
  if (role === "receptionist" || role === "manager") {
    items.push(
      { href: `${base}/students`, icon: "users", label: "Students", tour: "nav-students" },
    );
  }
  // — operations —
  if (role === "manager") {
    items.push(
      { href: `${base}/rooms`, icon: "home", label: "Rooms", tour: "nav-rooms" },
      { href: `${base}/reports`, icon: "report", label: "Reports", tour: "nav-reports" },
    );
  }
  // — money —
  if (role === "center_accountant") {
    items.push({ href: `${base}/finance`, icon: "dollar", label: "Finance", tour: "nav-finance" });
  }
  // — team —
  // Team notes are for EVERY sub-role by design (2026-07-27): the read-only
  // center_accountant still reads the board (receipts-on-GET counts them).
  // The page existed but had no nav entry, so it was reachable only by URL.
  items.push({ href: `${base}/notes`, icon: "clipboard", label: "Team Notes", tour: "nav-notes" });
  // — comms —
  // Messaging follows the same sub-role split as the scope table in
  // chat-scope.ts: reception + manager get an inbox, center_accountant gets
  // NONE (that tier reaches nobody, so the screen would always be empty).
  // Messages used to sit two entries away from Notifications; adjacency is the
  // one thing a flat list can still do to say "these two are the same job".
  if (role === "receptionist" || role === "manager") {
    items.push({ href: `${base}/messages`, icon: "message", label: "Messages", tour: "nav-messages" });
  }
  items.push(
    { href: `${base}/notifications`, icon: "bell", label: "Notifications", tour: "nav-notifications" },
    // — account —
    { href: `${base}/settings`, icon: "settings", label: "Settings", tour: "nav-settings" },
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
