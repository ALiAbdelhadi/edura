"use client";

import { GuidedTour } from "@/features/tour/guided-tour";
import { useTourGate } from "@/features/tour/use-tour-gate";
import { ASSISTANT_TOUR_STEPS } from "@/features/assistant/tour/steps";

export function AssistantFirstRun() {
  const tour = useTourGate();
  return (
    <GuidedTour
      steps={ASSISTANT_TOUR_STEPS}
      namespace="assistant.tour"
      open={tour.shouldOpen}
      onClose={tour.markDone}
    />
  );
}
