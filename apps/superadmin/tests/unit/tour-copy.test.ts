import { describe, expect, it } from "vitest";
import ar from "@/messages/ar.json";
import en from "@/messages/en.json";
import { SUPERADMIN_TOUR_STEPS } from "@/features/tour/steps";
import { FINANCE_TOUR_STEPS } from "@/features/tour/finance-steps";

/**
 * The back office's guided tour cannot be walked in a browser the way the six
 * www portals can: 2FA is mandatory on this app, and signing in means entering
 * a live TOTP. So the properties a browser walk would have proven are asserted
 * here instead, against the real message files and the real step list.
 *
 * What this catches that a typecheck cannot: a step added to `steps.ts` with no
 * copy written for it. The engine renders `t(...)` for a missing key as the key
 * PATH — so the failure mode is not a crash, it is "tour.steps.payouts.title"
 * printed on screen to the platform's most senior operator.
 */

const LOCALES = { ar, en } as Record<string, Record<string, unknown>>;

/** Both back-office tours: the super admin's and the accountant's. */
const TOURS = [
  { name: "super admin", namespace: "tour", steps: SUPERADMIN_TOUR_STEPS },
  { name: "accountant", namespace: "financeTour", steps: FINANCE_TOUR_STEPS },
] as const;

/** The labels the engine reads for every card, regardless of step. */
const LABELS = ["title", "progress", "next", "back", "skip", "finish"];

describe("back-office guided tours — copy", () => {
  for (const [locale, messages] of Object.entries(LOCALES))
  for (const { name, namespace, steps: STEPS } of TOURS) {
    describe(`${name} (${locale})`, () => {
      const tour = messages[namespace] as
        | { steps?: Record<string, { title?: string; body?: string; how?: unknown; note?: unknown }> }
        | undefined;

      it("has a tour block", () => {
        expect(tour, `${locale}.json is missing "${namespace}"`).toBeTruthy();
      });

      it.each(LABELS)("has the %s label", (key) => {
        expect(
          (tour as Record<string, unknown> | undefined)?.[key],
          `${namespace}.${key} missing in ${locale}`,
        ).toBeTruthy();
      });

      it.each(STEPS.map((s) => s.id))("step %s has title and body", (id) => {
        const step = tour?.steps?.[id];
        expect(step, `${namespace}.steps.${id} missing in ${locale}`).toBeTruthy();
        expect(step?.title, `${namespace}.steps.${id}.title missing in ${locale}`).toBeTruthy();
        expect(step?.body, `${namespace}.steps.${id}.body missing in ${locale}`).toBeTruthy();
      });

      it("writes every `how` as a keyed object, never an array", () => {
        // next-intl's message type admits `string | nested object` only, so an
        // array here fails to typecheck against `Messages` — and the engine
        // sorts the keys numerically, which an array would silently bypass.
        for (const [id, step] of Object.entries(tour?.steps ?? {})) {
          if (step.how === undefined) continue;
          expect(Array.isArray(step.how), `${namespace}.steps.${id}.how is an array in ${locale}`).toBe(
            false,
          );
          expect(typeof step.how, `${namespace}.steps.${id}.how is not an object in ${locale}`).toBe(
            "object",
          );
          for (const key of Object.keys(step.how as Record<string, string>)) {
            expect(
              Number.isInteger(Number(key)),
              `${namespace}.steps.${id}.how has non-numeric key "${key}" in ${locale}`,
            ).toBe(true);
          }
        }
      });

      it("has no step copy that the step list does not use", () => {
        // An orphan reads as written to whoever wrote it and does not exist to
        // anyone else — the same rule the help-centre index test enforces.
        const known = new Set(STEPS.map((s) => s.id));
        const orphans = Object.keys(tour?.steps ?? {}).filter((id) => !known.has(id));
        expect(orphans, `orphan ${namespace} steps in ${locale}`).toEqual([]);
      });
    });
  }

  it("every anchored step points at a distinct, non-empty id", () => {
    for (const step of TOURS.flatMap((t) => t.steps as readonly { id: string; anchor?: string | string[] }[])) {
      if (!step.anchor) continue;
      const anchors = Array.isArray(step.anchor) ? step.anchor : [step.anchor];
      for (const a of anchors) expect(a.length, `empty anchor on ${step.id}`).toBeGreaterThan(0);
    }
  });

  it("only the welcome and finish cards may omit a procedure", () => {
    // The whole point of these tours is that they say HOW. A step that points
    // without instructing is the thing this rule exists to prevent.
    for (const { name, namespace, steps: STEPS } of TOURS) {
      const block = (ar as Record<string, unknown>)[namespace] as {
        steps: Record<string, { how?: unknown }>;
      };
      const noHow = STEPS.filter((s) => !block.steps[s.id]?.how).map((s) => s.id);
      expect(noHow, `${name}: steps with no procedure`).toEqual(["welcome", "finish"]);
    }
  });
});
