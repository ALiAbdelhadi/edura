"use client";

import { GuidedTour } from "@/features/tour/guided-tour";
import { useTourGate } from "@/features/tour/use-tour-gate";
import { SUPERADMIN_TOUR_STEPS } from "@/features/tour/steps";

export function SuperAdminFirstRun() {
  const tour = useTourGate();
  return (
    <GuidedTour
      steps={SUPERADMIN_TOUR_STEPS}
      namespace="tour"
      open={tour.shouldOpen}
      onClose={tour.markDone}
    />
  );
}
