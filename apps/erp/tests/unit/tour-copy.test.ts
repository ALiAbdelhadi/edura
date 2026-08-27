import { describe, expect, it } from "vitest";
import { getMessages } from "@/lib/i18n";
import { STUDENT_TOUR_STEPS } from "@/features/student/tour/steps";
import { PARENT_TOUR_STEPS } from "@/features/parent/tour/steps";
import { TEACHER_TOUR_STEPS } from "@/features/teacher/tour/steps";
import { ASSISTANT_TOUR_STEPS } from "@/features/assistant/tour/steps";
import { CENTER_TOUR_STEPS } from "@/features/admin/tour/steps";
import { staffTourSteps } from "@/features/admin/staff-tour/steps";
import type { TourStep } from "@repo/ui/components/guided-tour";

type Tour = { name: string; namespace: string; steps: TourStep[] };

const TOURS: Tour[] = [
  { name: "student", namespace: "studentTour", steps: STUDENT_TOUR_STEPS },
  { name: "parent", namespace: "parentTour", steps: PARENT_TOUR_STEPS },
  { name: "teacher", namespace: "teacher.teacherTour", steps: TEACHER_TOUR_STEPS },
  { name: "assistant", namespace: "assistant.tour", steps: ASSISTANT_TOUR_STEPS },
  { name: "centre", namespace: "adminHome.tour", steps: CENTER_TOUR_STEPS },
  { name: "staff/receptionist", namespace: "adminHome.staffTour", steps: staffTourSteps("receptionist") },
  { name: "staff/manager", namespace: "adminHome.staffTour", steps: staffTourSteps("manager") },
  { name: "staff/accountant", namespace: "adminHome.staffTour", steps: staffTourSteps("center_accountant") },
];

const LABELS = ["title", "progress", "next", "back", "skip", "finish", "moreHint"];

function at(messages: unknown, namespace: string): Record<string, unknown> | undefined {
  let node: unknown = messages;
  for (const part of namespace.split(".")) {
    if (!node || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node && typeof node === "object" ? (node as Record<string, unknown>) : undefined;
}

describe("guided tours — copy", () => {
  for (const locale of ["ar", "en"] as const) {
    const messages = getMessages(locale);

    for (const tour of TOURS) {
      describe(`${tour.name} (${locale})`, () => {
        const block = at(messages, tour.namespace);

        it("resolves its namespace", () => {
          expect(block, `${tour.namespace} missing in ${locale}`).toBeTruthy();
        });

        it.each(LABELS)("has the %s label", (key) => {
          expect(block?.[key], `${tour.namespace}.${key} missing in ${locale}`).toBeTruthy();
        });

        it.each(tour.steps.map((s) => s.id))("step %s has title and body", (id) => {
          const steps = block?.steps as Record<string, { title?: string; body?: string }> | undefined;
          const step = steps?.[id];
          expect(step, `${tour.namespace}.steps.${id} missing in ${locale}`).toBeTruthy();
          expect(step?.title, `…${id}.title missing in ${locale}`).toBeTruthy();
          expect(step?.body, `…${id}.body missing in ${locale}`).toBeTruthy();
        });

        it("writes every `how` as a keyed object, never an array", () => {
          const steps = block?.steps as Record<string, { how?: unknown }> | undefined;
          for (const [id, step] of Object.entries(steps ?? {})) {
            if (step.how === undefined) continue;
            expect(Array.isArray(step.how), `…${id}.how is an array in ${locale}`).toBe(false);
          }
        });
      });
    }
  }

  it("only welcome and finish cards may omit a procedure", () => {
    const messages = getMessages("ar");
    for (const tour of TOURS) {
      const steps = at(messages, tour.namespace)?.steps as
        | Record<string, { how?: unknown }>
        | undefined;
      const missing = tour.steps
        .filter((s) => !steps?.[s.id]?.how)
        .map((s) => s.id)
        .filter((id) => !/^(welcome|finish)/.test(id) && !id.startsWith("welcome"));
      expect(missing, `${tour.name}: steps with no procedure`).toEqual([]);
    }
  });
});
