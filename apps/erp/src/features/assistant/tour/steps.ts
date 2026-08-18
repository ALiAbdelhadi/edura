/**
 * The assistant's first-run tour: welcome, ten tasks, then "now it's your turn".
 *
 * IT IS NOT THE TEACHER'S TOUR WITH A DIFFERENT NAME, and that is the point.
 * Step 8 delegation gives an assistant everything the teacher can do EXCEPT
 * wallet, payouts, financial settings and managing other assistants — so three
 * of the teacher's steps would teach this reader things they will be refused:
 *
 *   pricing a group  — `POST /api/v1/courses` is deliberately NOT `delegated()`;
 *                      its own comment says "plan prices are financial
 *                      settings, which Step 8 excludes from assistant
 *                      delegation"
 *   the wallet       — `/api/v1/teacher/wallet` is `requireRole("teacher")`
 *   adding assistants— managing assistants is excluded by the same rule
 *
 * A tour that walks someone to a locked door is worse than no tour, so those
 * three are absent rather than present-and-caveated.
 *
 * WHAT IS HERE INSTEAD, in the order an assistant's day runs: messages (their
 * portal OPENS on it — it is their main workspace, not a side feature), then
 * the class work — attendance, closing the lesson, the door — then the rest.
 *
 * CLOSING A LESSON *IS* DELEGATED (`sessions/[id]/complete` uses
 * `delegatedWithCenter`), which surprises people: it moves money. It is
 * included, with the caveat that it is recorded against them on behalf of their
 * teacher and cannot be undone.
 */

import type { TourStep } from "@/features/tour/guided-tour";

/** desktop sidebar → phone bar slot → phone overflow. */
const at = (name: string): string[] => [`nav-${name}`, `bar-${name}`, "bar-more"];

export const ASSISTANT_TOUR_STEPS: TourStep[] = [
  { id: "welcome" },

  { id: "messages", anchor: at("messages") },
  { id: "attendance", anchor: at("attendance") },
  { id: "closeLesson", anchor: at("attendance") },
  { id: "door", anchor: at("door") },
  { id: "classes", anchor: at("classes") },
  { id: "grades", anchor: at("grades") },
  { id: "materials", anchor: at("materials") },
  { id: "notes", anchor: at("notes") },
  { id: "limits", anchor: at("settings") },
  { id: "practice", anchor: at("practice") },

  { id: "finish" },
];
