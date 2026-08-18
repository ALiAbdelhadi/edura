"use client";

import { useEffect } from "react";

/**
 * Marks <html> while a Ledger portal route is mounted.
 *
 * WHY THIS EXISTS
 * ---------------
 * The chrome — sidebar and header — is rendered by
 * `components/refine/dashboard-shell.tsx`, which student, parent, teacher and
 * this portal all share. It is owned by no session, so restyling it in place
 * would change three other portals' appearance and conflict with three other
 * branches.
 *
 * But the shell's sidebar takes every one of its colours from `--sidebar*`
 * custom properties. So the near-black slab can be replaced by re-pointing
 * those tokens — no markup change at all — as long as the override can be
 * scoped to this portal's routes. The `.led` wrapper cannot do that: it sits
 * inside the shell's content area, and the sidebar is its sibling further up.
 * Hence a marker on the root element, which ledger.css keys off.
 *
 * Scoped by mount, not by pathname: the attribute is removed on unmount, so
 * navigating from /dashboard/admin to /dashboard/student restores the shared
 * chrome exactly as the other portals expect it.
 *
 * DELETE THIS when the foundation session lands the Ledger sidebar in the
 * shared shell (Handoff §3.1) — at that point the tokens are correct globally
 * and the scoping is dead weight.
 */
export function LedgerPortalScope() {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute("data-portal");
    root.setAttribute("data-portal", "ledger");
    return () => {
      if (previous === null) root.removeAttribute("data-portal");
      else root.setAttribute("data-portal", previous);
    };
  }, []);

  return null;
}
