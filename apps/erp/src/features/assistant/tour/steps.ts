import type { TourStep } from "@/features/tour/guided-tour";

const at = (name: string): string[] => [`nav-${name}`, `bar-${name}`, "bar-more"];

export const ASSISTANT_TOUR_STEPS: TourStep[] = [
  { id: "welcome" },

  { id: "messages", anchor: at("messages") },
  { id: "attendance", anchor: at("attendance") },
  { id: "closeLesson", anchor: at("attendance") },
  { id: "door", anchor: at("door") },
  { id: "classes", anchor: at("classes") },
  { id: "grades", anchor: at("grades") },
  { id: "materials", anchor: at("materials") },
  { id: "notes", anchor: at("notes") },
  { id: "limits", anchor: at("settings") },
  { id: "practice", anchor: at("practice") },

  { id: "finish" },
];
