"use client";

/**
 * THE ONCE-ONLY GATE.
 *
 * Opens the role's emulator by itself the FIRST time someone reaches their
 * portal, and never again.
 *
 * WHERE "NEVER AGAIN" IS STORED, AND WHY THERE. `user_prefs.tour_completed`
 * already existed in the schema with a working `GET/PATCH /api/v1/me/prefs`
 * route and — until now — no consumer at all. So this needed NO migration, and
 * the flag is per USER rather than per browser: a teacher who signs in on the
 * centre's desktop after doing the tour on their phone is not shown it twice,
 * which localStorage could not have prevented. (The emulator's own step index
 * IS localStorage, deliberately — where you stopped is a device preference, not
 * a fact about the account.)
 *
 * THREE RULES THIS GATE OBEYS
 *
 *  1. IT NEVER BLOCKS THE PORTAL. Skipping, closing, or finishing all mark the
 *     tour done and hand the portal over. A first-run overlay you cannot get out
 *     of is the single most resented pattern in onboarding, and a teacher whose
 *     first minute is a locked overlay learns to distrust the product.
 *  2. IT FAILS SILENT, NOT LOUD. If the preference cannot be read, nothing
 *     opens. The cost of a missed tour is small; the cost of an overlay
 *     ambushing someone mid-task on every page load is not.
 *  3. IT MARKS DONE OPTIMISTICALLY. The dialog closes at once and the PATCH
 *     follows; if the write fails the worst case is the tour offering itself one
 *     more time, which is strictly better than a spinner between a teacher and
 *     their day.
 *
 * WHAT IS NOT LOST BY "ONCE": the same emulator stays reachable for good from
 * the portal's own menu, so this gate decides when it OPENS ITSELF — never
 * whether it exists.
 */

import { useEffect, useState, type ReactNode } from "react";
import { useCustom, useCustomMutation } from "@refinedev/core";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@repo/ui/components/dialog";
import { LedgerButton } from "@/components/ledger";
import { asKey } from "@/lib/i18n/keys";

type PrefsShape = { tourCompleted?: boolean };

export function FirstRunTour({
  /** The role's emulator. `done` ends the tour for good — pass it to `onDone`. */
  render,
  /**
   * Where the offer's own copy lives. Each role words this differently — what a
   * teacher is promised is not what a parent is promised — so the namespace is
   * a parameter rather than a constant. It defaults to the teacher's, which is
   * the only caller that predates the parameter, so that call site is unchanged.
   */
  namespace = "teacher.teacherEmulator.firstRun",
}: {
  render: (done: () => void) => ReactNode;
  namespace?: string;
}) {
  // The namespace is a runtime parameter, so it cannot be one of next-intl's
  // literal keys — `asKey` is the repo's existing seam for exactly that.
  const t = useTranslations(asKey(namespace));
  const { query, result } = useCustom<PrefsShape>({ url: "me/prefs", method: "get" });
  const { mutateAsync: savePrefs } = useCustomMutation();

  const [open, setOpen] = useState(false);
  const [started, setStarted] = useState(false);

  /* refine returns a frozen placeholder while a query is idle, so narrow on the
     VALUE rather than trusting the generic — the `exports.find is not a
     function` class of first-paint crash this repo has already paid for once. */
  const payload = (result as { data?: PrefsShape } | undefined)?.data ?? (result as PrefsShape);
  const completed = typeof payload?.tourCompleted === "boolean" ? payload.tourCompleted : null;

  useEffect(() => {
    if (query.isSuccess && completed === false) setOpen(true);
  }, [query.isSuccess, completed]);

  const done = () => {
    setOpen(false);
    setStarted(false);
    void savePrefs({ url: "me/prefs", method: "patch", values: { tourCompleted: true } }).catch(
      () => {
        /* Rule 3: the tour may offer itself once more; nothing else breaks. */
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Closing by ✕, Esc or the backdrop is a decision too — treat it as done
        // rather than re-ambushing them on the next page load.
        if (!next) done();
      }}
    >
      <DialogContent
        className={started ? "max-h-[92vh] max-w-5xl overflow-y-auto" : "max-w-lg"}
        // The tour is an offer, not an alert: focus goes to the primary action
        // rather than trapping the reader at the top of a long simulation.
      >
        {started ? (
          render(done)
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("title")}</DialogTitle>
            </DialogHeader>
            <p className="text-sm" style={{ color: "var(--ink-2)" }}>
              {t("body")}
            </p>
            <p className="text-xs" style={{ color: "var(--ink-3)" }}>
              {t("reopenHint")}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <LedgerButton variant="primary" onClick={() => setStarted(true)}>
                {t("start")}
              </LedgerButton>
              <LedgerButton onClick={done}>{t("later")}</LedgerButton>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
