/**
 * The parent's first-run tour: welcome, ten tasks, then "now it's your turn".
 *
 * EVERY STEP TEACHES A PROCEDURE, NOT A LOCATION — same rule as the student's.
 * Each carries a `how` list in the copy (`steps.<id>.how`), the ordered presses
 * that actually perform the task. Only the welcome and finish cards may omit it.
 *
 * WHY THIS ORDER. It is the order a parent is blocked:
 *
 *   LINK a child — nothing in this portal works until a link is approved, and
 *                  every screen is an empty state without one
 *   → progress → attendance → what you owe → your wallet → PAY
 *   → messaging → child safety → notifications → where to rehearse
 *
 * There is deliberately NO step for the child selector: `ChildSelectorBar`
 * renders nothing for a parent with one child, and on first run a parent has
 * none — so a step pointing at it would usually point at nothing. Switching
 * between children is taught inside the progress step's procedure instead,
 * where it is actually needed.
 *
 * Anchors are chains — sidebar row, phone bar slot, phone overflow — and the
 * engine takes the first that is really visible. See the student's steps.ts
 * for the full reasoning.
 */

import type { TourStep } from "@/features/tour/guided-tour";

/** desktop sidebar → phone bar slot → phone overflow. */
const at = (name: string): string[] => [`nav-${name}`, `bar-${name}`, "bar-more"];

export const PARENT_TOUR_STEPS: TourStep[] = [
  { id: "welcome" },

  { id: "linkChild", anchor: at("children") },
  { id: "progress", anchor: at("progress") },
  { id: "attendance", anchor: at("attendance") },
  { id: "fees", anchor: at("fees") },
  { id: "wallet", anchor: at("wallet") },
  { id: "pay", anchor: at("pay") },
  { id: "messages", anchor: at("messages") },
  { id: "safety", anchor: at("oversight") },
  { id: "notifications", anchor: at("notifications") },
  { id: "practice", anchor: at("practice") },

  { id: "finish" },
];
