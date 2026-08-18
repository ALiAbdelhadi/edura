"use client";

/**
 * The assistant portal's first-run gate.
 *
 * A small client wrapper, and it exists for one reason: the portal's landing
 * page (`/dashboard/assistant`) is a SERVER component that renders the chat and
 * the notes board, and the tour is a client component. Rather than turn the
 * whole page into a client component — which would drag the chat screen's
 * server boundary with it — the gate is wrapped here and the page mounts this.
 *
 * WHAT OPENS ON FIRST RUN CHANGED: the guided tour of the REAL portal, not the
 * emulator. Same choice the student, parent and teacher portals made — a tour
 * is the right thing to MEET someone with (a minute, pointing at their own
 * screen), an emulator is the right thing to CHOOSE (ten minutes, a simulated
 * world). The emulator is not lost: it keeps its permanent menu entry, now
 * labelled "Practice", and the tour's last card points at it. Both cannot open
 * on first run anyway, since both read the same `tour_completed` flag.
 */

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
