/**
 * The super admin's first-run tour: welcome, twelve tasks, then "your turn".
 *
 * EVERY STEP TEACHES A PROCEDURE, NOT A LOCATION — same rule as the six www
 * portals. Each carries a `how` list in the copy (`tour.steps.<id>.how`).
 *
 * WHY THIS ORDER. The back office is not a workflow — nothing here blocks
 * anything else — so it is ordered by CONSEQUENCE instead: the things that let
 * a centre start earning come first, the things that move or reveal money next,
 * and the things that are irreversible or expose people last, where they are
 * read with the most attention.
 *
 *   approve a registration → a centre cannot trade until this happens
 *   → the users directory   → the one place an account is suspended
 *   → a centre's own books  → read-only, and the tour says why
 *   → payouts, payments, settlements, commission
 *   → messaging oversight and the audit log — the two surfaces that look at
 *     people rather than numbers, and the two whose limits matter most
 *
 * THE TOUR TELLS THE READER WHAT THEY CANNOT DO, twice and deliberately:
 * money is READ-ONLY here (`transactions`, `points_ledger`,
 * `session_settlements` and `audit_logs` are REVOKEd UPDATE/DELETE at the
 * database, for this role too), and opening a message thread WRITES AN AUDIT
 * ROW. Both are surprising, and finding either out by accident is worse than
 * being told.
 *
 * Anchors are single ids, not chains: this app has no phone bottom bar, so
 * there is no second navigation for the same destination.
 */

import type { TourStep } from "@repo/ui/components/guided-tour";

export const SUPERADMIN_TOUR_STEPS: TourStep[] = [
  { id: "welcome" },

  { id: "registrations", anchor: "nav-registrations" },
  { id: "users", anchor: "nav-users" },
  { id: "centers", anchor: "nav-centers" },
  { id: "moneyReadOnly", anchor: "nav-payments" },
  { id: "payouts", anchor: "nav-payouts" },
  { id: "settlements", anchor: "nav-settlements" },
  { id: "commission", anchor: "nav-commission" },
  { id: "catalog", anchor: "nav-catalog" },
  { id: "messaging", anchor: "nav-messaging" },
  { id: "audit", anchor: "nav-audit" },
  { id: "deletion", anchor: "nav-deletion" },
  { id: "security", anchor: "nav-security" },

  { id: "finish" },
];
