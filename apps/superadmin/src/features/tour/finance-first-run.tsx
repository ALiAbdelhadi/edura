"use client";

/**
 * The finance console's first-run gate.
 *
 * Separate from the super admin's because the ROLES are separate: an accountant
 * reaches a restricted portal and must be taught what that portal can do, not
 * shown a tour built around screens they will never open.
 *
 * Both gates read the same `user_prefs.tour_completed`, which is correct — an
 * account holds exactly one role here, so the two tours can never contend.
 */

import { GuidedTour } from "@/features/tour/guided-tour";
import { useTourGate } from "@/features/tour/use-tour-gate";
import { FINANCE_TOUR_STEPS } from "@/features/tour/finance-steps";

export function FinanceFirstRun() {
  const tour = useTourGate();
  return (
    <GuidedTour
      steps={FINANCE_TOUR_STEPS}
      namespace="financeTour"
      open={tour.shouldOpen}
      onClose={tour.markDone}
    />
  );
}
