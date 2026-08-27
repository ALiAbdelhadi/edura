import type { TourStep } from "@/features/tour/guided-tour";

const at = (name: string): string[] => [`nav-${name}`, `bar-${name}`, "bar-more"];

export const STUDENT_TOUR_STEPS: TourStep[] = [
  { id: "welcome" },

  { id: "upNext", anchor: "student-upnext" },

  { id: "schedule", anchor: at("schedule") },
  { id: "subscribe", anchor: at("subjects") },
  { id: "payWallet", anchor: at("wallet") },
  { id: "subscriptions", anchor: at("subscriptions") },
  { id: "receipts", anchor: at("wallet") },
  { id: "card", anchor: at("id") },
  { id: "attendance", anchor: at("attendance") },
  { id: "grades", anchor: at("grades") },
  { id: "messages", anchor: at("messages") },
  { id: "unlockMessaging", anchor: at("settings") },
  { id: "pushNotifications", anchor: at("settings") },
  { id: "family", anchor: at("family") },
  { id: "practice", anchor: at("practice") },

  { id: "finish" },
];
