/**
 * The teacher's first-run tour: welcome, eleven tasks, then "now it's your turn".
 *
 * EVERY STEP TEACHES A PROCEDURE, NOT A LOCATION — same rule as the student's
 * and the parent's. Each carries a `how` list in the copy
 * (`steps.<id>.how`), the ordered presses that actually perform the task.
 *
 * WHY THIS ORDER — it is the order in which a teacher LOSES MONEY by not
 * knowing, which is the same reasoning the teacher emulator's script records:
 *
 *   price the class   — an unpriced class blocks everything below it, and a
 *                       lesson that will not settle cannot be un-taught
 *   → take attendance — including the counter-only state, which silently
 *                       excludes a student who paid
 *   → CLOSE the lesson— the step that actually credits the wallet, and the one
 *                       no screen forces on anybody
 *   → the door        — where the second check-in happens, if they use it
 *   → the wallet      — where "available" ≠ "balance" is met once, here,
 *                       instead of as a support ticket
 *   then the rest of the week: gradebook, materials, centres, assistants,
 *   messages, and where to rehearse.
 *
 * Anchors are chains — sidebar row, phone bar slot, phone overflow — and the
 * engine takes the first that is really visible. See the student's steps.ts.
 */

import type { TourStep } from "@/features/tour/guided-tour";

/** desktop sidebar → phone bar slot → phone overflow. */
const at = (name: string): string[] => [`nav-${name}`, `bar-${name}`, "bar-more"];

export const TEACHER_TOUR_STEPS: TourStep[] = [
  { id: "welcome" },

  { id: "priceClass", anchor: at("classes") },
  { id: "attendance", anchor: at("attendance") },
  { id: "closeLesson", anchor: at("attendance") },
  { id: "door", anchor: at("door") },
  { id: "wallet", anchor: at("wallet") },
  { id: "grades", anchor: at("grades") },
  { id: "materials", anchor: at("materials") },
  { id: "centers", anchor: at("centers") },
  { id: "team", anchor: at("team") },
  { id: "messages", anchor: at("messages") },
  { id: "practice", anchor: at("practice") },

  { id: "finish" },
];
