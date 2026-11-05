import type { TourStep } from "@/features/tour/guided-tour";
import { WALLET_ENABLED } from "@/lib/config/features";

const at = (name: string): string[] => [`nav-${name}`, `bar-${name}`, "bar-more"];

const WALLET_STEPS: TourStep[] = [
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

// Card-only deployment: no wallet or practice steps; the *Card ids carry the
// same copy without the wallet / practice mentions, and receipts live on the
// Subscriptions page.
const CARD_ONLY_STEPS: TourStep[] = [
  { id: "welcomeCard" },

  { id: "upNext", anchor: "student-upnext" },

  { id: "schedule", anchor: at("schedule") },
  { id: "subscribe", anchor: at("subjects") },
  { id: "subscriptions", anchor: at("subscriptions") },
  { id: "receiptsCard", anchor: at("subscriptions") },
  { id: "card", anchor: at("id") },
  { id: "attendance", anchor: at("attendance") },
  { id: "grades", anchor: at("grades") },
  { id: "messages", anchor: at("messages") },
  { id: "unlockMessagingCard", anchor: at("settings") },
  { id: "pushNotifications", anchor: at("settings") },
  { id: "family", anchor: at("family") },

  { id: "finishCard" },
];

export const STUDENT_TOUR_STEPS: TourStep[] = WALLET_ENABLED ? WALLET_STEPS : CARD_ONLY_STEPS;
