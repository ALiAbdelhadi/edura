import type { TourStep } from "@/features/tour/guided-tour";

const at = (name: string): string[] => [`nav-${name}`, `bar-${name}`, "bar-more"];

export const PARENT_TOUR_STEPS: TourStep[] = [
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
