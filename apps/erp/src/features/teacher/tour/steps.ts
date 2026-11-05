import type { TourStep } from "@/features/tour/guided-tour";
import { WALLET_ENABLED } from "@/lib/config/features";

const at = (name: string): string[] => [`nav-${name}`, `bar-${name}`, "bar-more"];

// Wallet-off deployments drop the wallet step and the Practice step (hidden nav item).
const WALLET_STEPS = new Set(["wallet", "practice"]);
// ...and swap steps whose copy mentions the wallet for card-only copy.
const CARD_COPY: Record<string, string> = { welcome: "welcomeCard", closeLesson: "closeLessonCard" };

const ALL_STEPS: TourStep[] = [
  { id: "welcome" },

  { id: "priceClass", anchor: at("classes") },
  { id: "attendance", anchor: at("attendance") },
  { id: "closeLesson", anchor: at("attendance") },
  { id: "door", anchor: at("door") },
  { id: "wallet", anchor: at("wallet") },
  { id: "grades", anchor: at("grades") },
  { id: "materials", anchor: at("materials") },
  { id: "centers", anchor: at("centers") },
  { id: "team", anchor: at("team") },
  { id: "messages", anchor: at("messages") },
  { id: "practice", anchor: at("practice") },

  { id: "finish" },
];

export const TEACHER_TOUR_STEPS: TourStep[] = WALLET_ENABLED
  ? ALL_STEPS
  : ALL_STEPS.filter((s) => !WALLET_STEPS.has(s.id)).map((s) =>
      s.id in CARD_COPY ? { ...s, id: CARD_COPY[s.id]! } : s,
    );
