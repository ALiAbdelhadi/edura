import type { TourStep } from "@/features/tour/guided-tour";

const at = (name: string): string[] => [`nav-${name}`, `bar-${name}`, "bar-more"];

export const TEACHER_TOUR_STEPS: TourStep[] = [
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
