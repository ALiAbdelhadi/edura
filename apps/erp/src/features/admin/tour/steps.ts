import type { TourStep } from "@/features/tour/guided-tour";

const at = (name: string): string[] => [`nav-${name}`, `bar-${name}`, "bar-more"];

export const CENTER_TOUR_STEPS: TourStep[] = [
  { id: "welcome" },

  { id: "teachers", anchor: at("teachers") },
  { id: "rooms", anchor: at("rooms") },
  { id: "classes", anchor: at("classes") },
  { id: "pricing", anchor: at("classes") },
  { id: "counter", anchor: at("counter") },
  { id: "students", anchor: at("students") },
  { id: "requests", anchor: at("requests") },
  { id: "schedule", anchor: at("schedule") },
  { id: "cash", anchor: at("fees") },
  { id: "reports", anchor: at("reports") },
  { id: "expenses", anchor: at("expenses") },
  { id: "staff", anchor: at("staff") },
  { id: "audit", anchor: at("audit") },
  { id: "practice", anchor: at("practice") },
  { id: "finish" },
];
