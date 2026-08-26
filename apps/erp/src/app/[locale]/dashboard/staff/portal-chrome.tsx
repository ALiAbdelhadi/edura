"use client";

import React from "react";
import DashboardShell from "@/components/refine/dashboard-shell";
import { plexMono, LedgerPortalScope } from "@/features/admin/ledger";
import "@/features/admin/ledger/ledger.css";

export type StaffRole = "receptionist" | "manager" | "center_accountant";

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
      // THE MISSING DOOR. `/dashboard/staff/collaborations` has existed since
      // the panel was given a staff surface, and a manager is authorised for
      // the whole set at the API — `delegatedWithCenter(..., { staffAllow:
      // MANAGER })` covers GET, POST, accept, reject and cancel. But its only
      // inbound link was the manager card grid on the portal home, and the
      // de-duplication pass deleted that grid: from then on the route had no
      // nav entry and NO link anywhere in the app, so the capability was
      // reachable only by typing the URL. A teacher's request to this centre
      // could sit unanswered with nobody able to find it.
      //
      // The bar is DERIVED from this array, so adding the row here is what
      // puts it on a phone too.
      { href: `${base}/collaborations`, icon: "clipboard", label: "Collaboration Requests", tour: "nav-collaborations" },
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

/**
 * The sub-role arrives as a PROP, resolved on the server by this portal's
 * layout. It used to be a `fetch("center/staff/me")` in a client effect behind
 * a full-screen "Loading…", so every staff navigation showed that screen before
 * showing the portal. The resolve is still live and revocation-aware — it just
 * happens one layer up, before any HTML is streamed. See ../staff/layout.tsx.
 */
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
