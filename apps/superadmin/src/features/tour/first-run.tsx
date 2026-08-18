"use client";

/**
 * The back office's first-run gate.
 *
 * Mounted on the overview PAGE rather than inside `SuperAdminDashboard`,
 * deliberately: that component has three early returns (loading, load error,
 * and an empty decision queue), so a tour mounted inside its success branch
 * would never open for an operator whose first visit happens to be slow or
 * whose queue is empty — which is most first visits.
 *
 * The page is a server component and this is a client one, which is the same
 * shape the assistant portal's first-run wrapper uses for the same reason.
 */

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
