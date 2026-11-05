import type { TourStep } from "@/features/tour/guided-tour";
import { WALLET_ENABLED } from "@/lib/config/features";

const at = (name: string): string[] => [`nav-${name}`, `bar-${name}`, "bar-more"];

// Wallet-off deployments drop the wallet step and the Practice step (hidden nav item).
const WALLET_STEPS = new Set(["wallet", "practice"]);
// ...and swap steps whose copy mentions the wallet for card-only copy.
const CARD_COPY: Record<string, string> = { welcome: "welcomeCard", pay: "payCard" };

const ALL_STEPS: TourStep[] = [
  { id: "welcome" },

  { id: "linkChild", anchor: at("children") },
  { id: "progress", anchor: at("progress") },
  { id: "attendance", anchor: at("attendance") },
  { id: "fees", anchor: at("fees") },
  { id: "wallet", anchor: at("wallet") },
  { id: "pay", anchor: at("pay") },
  { id: "messages", anchor: at("messages") },
  { id: "safety", anchor: at("oversight") },
  { id: "notifications", anchor: at("notifications") },
  { id: "practice", anchor: at("practice") },

  { id: "finish" },
];

export const PARENT_TOUR_STEPS: TourStep[] = WALLET_ENABLED
  ? ALL_STEPS
  : ALL_STEPS.filter((s) => !WALLET_STEPS.has(s.id)).map((s) =>
      s.id in CARD_COPY ? { ...s, id: CARD_COPY[s.id]! } : s,
    );
