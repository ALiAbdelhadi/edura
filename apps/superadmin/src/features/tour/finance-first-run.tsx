"use client";

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
