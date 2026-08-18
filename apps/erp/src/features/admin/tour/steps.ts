/**
 * The centre owner's first-run tour: welcome, thirteen tasks, then "your turn".
 *
 * EVERY STEP TEACHES A PROCEDURE, NOT A LOCATION — same rule as the other
 * portals. Each carries a `how` list in the copy (`steps.<id>.how`).
 *
 * WHY THIS ORDER. It is the order a centre becomes operational, which is also
 * the order in which skipping one blocks the next:
 *
 *   teachers → rooms → classes (a class needs a teacher AND a room)
 *   → PRICING (an unpriced class cannot be subscribed to or settled — and on a
 *     centre's class the CENTRE is who prices it, which teachers cannot)
 *   → the counter (cash + check-in, the daily loop)
 *   → students and enrolment requests
 *   → reports and expenses (what the money did)
 *   → staff (who else may work the counter) → the audit log → practice
 *
 * The activation checklist on the owner's own dashboard covers the first five
 * as a persistent to-do; this tour is the one-time walk-through that explains
 * WHY the order is what it is, which a checklist cannot.
 *
 * Anchors are chains — sidebar row, phone bar slot, phone overflow — and the
 * engine takes the first that is really visible.
 */

import type { TourStep } from "@/features/tour/guided-tour";

/** desktop sidebar → phone bar slot → phone overflow. */
const at = (name: string): string[] => [`nav-${name}`, `bar-${name}`, "bar-more"];

export const CENTER_TOUR_STEPS: TourStep[] = [
  { id: "welcome" },

  { id: "teachers", anchor: at("teachers") },
  { id: "rooms", anchor: at("rooms") },
  { id: "classes", anchor: at("classes") },
  { id: "pricing", anchor: at("classes") },
  { id: "counter", anchor: at("counter") },
  { id: "students", anchor: at("students") },
  { id: "requests", anchor: at("requests") },
  { id: "schedule", anchor: at("schedule") },
  // `cash` before `reports`, because the copy numbers them ٩ then ١٠ and the
  // array is what decides the order the reader meets them in — they were the
  // other way round, so the tour counted "…٨, ١٠, ٩, ١١…" out loud. The order
  // is also the true dependency: the reports read the money the payments make.
  { id: "cash", anchor: at("fees") },
  { id: "reports", anchor: at("reports") },
  { id: "expenses", anchor: at("expenses") },
  { id: "staff", anchor: at("staff") },
  { id: "audit", anchor: at("audit") },
  { id: "practice", anchor: at("practice") },

  { id: "finish" },
];
